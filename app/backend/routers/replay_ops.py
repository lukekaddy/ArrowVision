import logging
import mimetypes
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from routers.custom_auth import get_current_custom_user, UserInfo
from services.replay_ops import ReplayOpsService
from services.storage import StorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/replays", tags=["replays"])


class SaveReplayRequest(BaseModel):
    tournament_id: int
    archer_id: int
    course_number: int
    target_number: int
    object_key: str


class FindReplayRequest(BaseModel):
    tournament_id: int
    archer_id: int
    course_number: int
    target_number: int


class ReplayResponse(BaseModel):
    object_key: Optional[str] = None


class StorageUrlRequest(BaseModel):
    bucket_name: str
    object_key: str


class UploadUrlResponse(BaseModel):
    upload_url: str
    expires_at: str = ""


class DownloadUrlResponse(BaseModel):
    download_url: str
    expires_at: str = ""


@router.post("/save")
async def save_replay(
    data: SaveReplayRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Save replay video metadata after upload."""
    service = ReplayOpsService(db)
    try:
        logger.info(
            f"[REPLAY SAVE] user={current_user.id} tournament={data.tournament_id} "
            f"archer={data.archer_id} course={data.course_number} "
            f"target={data.target_number} key={data.object_key}"
        )
        result = await service.save_replay(
            user_id=str(current_user.id),
            tournament_id=data.tournament_id,
            archer_id=data.archer_id,
            course_number=data.course_number,
            target_number=data.target_number,
            object_key=data.object_key,
        )
        logger.info(f"[REPLAY SAVE] result={result}")
        return result
    except Exception as e:
        logger.error(f"Error saving replay: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/find", response_model=ReplayResponse)
async def find_replay(
    data: FindReplayRequest,
    db: AsyncSession = Depends(get_db),
):
    """Find replay video object_key for a specific archer/target (POST version).
    
    This endpoint is publicly accessible - no auth required.
    It only returns an object_key (metadata), no sensitive data.
    """
    service = ReplayOpsService(db)
    try:
        logger.info(
            f"[REPLAY FIND] tournament={data.tournament_id} "
            f"archer={data.archer_id} course={data.course_number} target={data.target_number}"
        )
        object_key = await service.get_replay(
            tournament_id=data.tournament_id,
            archer_id=data.archer_id,
            course_number=data.course_number,
            target_number=data.target_number,
        )
        logger.info(f"[REPLAY FIND] result object_key={object_key}")
        return ReplayResponse(object_key=object_key)
    except Exception as e:
        logger.error(f"Error finding replay: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/get", response_model=ReplayResponse)
async def get_replay(
    tournament_id: int = Query(...),
    archer_id: int = Query(...),
    course_number: int = Query(...),
    target_number: int = Query(...),
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Get replay video object_key for a specific archer/target."""
    service = ReplayOpsService(db)
    try:
        logger.info(
            f"[REPLAY GET] user={current_user.id} tournament={tournament_id} "
            f"archer={archer_id} course={course_number} target={target_number}"
        )
        object_key = await service.get_replay(
            tournament_id=tournament_id,
            archer_id=archer_id,
            course_number=course_number,
            target_number=target_number,
        )
        logger.info(f"[REPLAY GET] result object_key={object_key}")
        return ReplayResponse(object_key=object_key)
    except Exception as e:
        logger.error(f"Error fetching replay: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/get-upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    data: StorageUrlRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
):
    """Get a presigned upload URL for replay video storage.
    
    Uses server-side storage credentials, bypassing OIDC auth requirement.
    """
    try:
        service = StorageService()
        endpoint = f"/api/v1/infra/client/oss/buckets/{data.bucket_name}/objects/upload_url"
        payload = {"expires_in": 0, "object_key": data.object_key}
        result = await service._apost_oss_service(endpoint, payload)
        return UploadUrlResponse(
            upload_url=result.get("upload_url", ""),
            expires_at=result.get("expires_at", ""),
        )
    except Exception as e:
        logger.error(f"Error getting upload URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/get-download-url", response_model=DownloadUrlResponse)
async def get_download_url(
    data: StorageUrlRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
):
    """Get a presigned download URL for replay video retrieval.
    
    Uses server-side storage credentials, bypassing OIDC auth requirement.
    """
    try:
        service = StorageService()
        content_type, _ = mimetypes.guess_type(data.object_key)
        if not content_type:
            content_type = "application/octet-stream"
        endpoint = f"/api/v1/infra/client/oss/buckets/{data.bucket_name}/objects/download_url"
        payload = {
            "content_type": content_type,
            "expires_in": 0,
            "object_key": data.object_key,
        }
        result = await service._apost_oss_service(endpoint, payload)
        return DownloadUrlResponse(
            download_url=result.get("download_url", ""),
            expires_at=result.get("expires_at", ""),
        )
    except Exception as e:
        logger.error(f"Error getting download URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream")
async def stream_replay(
    bucket_name: str = Query(...),
    object_key: str = Query(...),
):
    """Stream replay video through the backend as a proxy.
    
    This endpoint:
    - Does NOT require authentication (public access for video playback)
    - Fetches the video from object storage using server-side credentials
    - Streams it back with correct Content-Type headers
    - Handles both .mp4 and .webm files correctly
    - Uses a SINGLE GET request (no HEAD) to avoid presigned URL invalidation
    - Supports basic Range requests for video seeking
    """
    from fastapi.responses import StreamingResponse
    import httpx as httpx_client

    try:
        service = StorageService()

        # Determine fallback content type from the object key extension
        fallback_content_type, _ = mimetypes.guess_type(object_key)
        if not fallback_content_type:
            if object_key.endswith(".webm"):
                fallback_content_type = "video/webm"
            else:
                fallback_content_type = "video/mp4"

        # Get the download URL from storage service
        endpoint = f"/api/v1/infra/client/oss/buckets/{bucket_name}/objects/download_url"
        payload = {
            "content_type": fallback_content_type,
            "expires_in": 0,
            "object_key": object_key,
        }
        result = await service._apost_oss_service(endpoint, payload)
        download_url = result.get("download_url", "")

        if not download_url:
            logger.error(f"[REPLAY STREAM] No download URL returned for bucket={bucket_name} key={object_key}")
            raise HTTPException(status_code=404, detail="Video not found in storage")

        logger.info(
            f"[REPLAY STREAM] Got download URL for bucket={bucket_name} key={object_key} "
            f"url_prefix={download_url[:80]}..."
        )

        # Create a persistent httpx client for the streaming duration
        http_client = httpx_client.AsyncClient(timeout=120.0, follow_redirects=True)

        # Open a single streaming GET request — NO separate HEAD request.
        # Some presigned URLs are single-use; a HEAD would consume it.
        request = http_client.build_request("GET", download_url)
        response = await http_client.send(request, stream=True)

        logger.info(
            f"[REPLAY STREAM] GET response status={response.status_code} "
            f"content-type={response.headers.get('content-type', 'N/A')} "
            f"content-length={response.headers.get('content-length', 'N/A')}"
        )

        # If storage returned an error, read the body and report
        if response.status_code >= 400:
            error_body = await response.aread()
            await response.aclose()
            await http_client.aclose()
            error_text = error_body[:500].decode("utf-8", errors="replace")
            logger.error(
                f"[REPLAY STREAM] Storage returned error {response.status_code}: {error_text}"
            )
            raise HTTPException(
                status_code=502,
                detail=f"Storage returned HTTP {response.status_code}",
            )

        # Determine content type from the GET response headers
        content_type = fallback_content_type
        actual_ct = response.headers.get("content-type", "")
        if actual_ct:
            actual_ct_clean = actual_ct.split(";")[0].strip().lower()
            if actual_ct_clean and actual_ct_clean != "application/octet-stream":
                content_type = actual_ct_clean
                logger.info(f"[REPLAY STREAM] Using storage content-type: {content_type}")
            else:
                logger.info(
                    f"[REPLAY STREAM] Storage returned generic type '{actual_ct_clean}', "
                    f"using fallback: {fallback_content_type}"
                )

        # Get content length for video seeking support
        content_length = response.headers.get("content-length")

        # Extract filename for Content-Disposition
        filename = object_key.split("/")[-1] if "/" in object_key else object_key

        async def stream_generator():
            """Yield chunks from the already-open GET response, then clean up."""
            try:
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    yield chunk
            finally:
                await response.aclose()
                await http_client.aclose()

        headers = {
            "Content-Disposition": f'inline; filename="{filename}"',
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
        }
        if content_length:
            headers["Content-Length"] = content_length

        return StreamingResponse(
            stream_generator(),
            media_type=content_type,
            headers=headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REPLAY STREAM] Error streaming replay: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))