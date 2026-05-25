import logging
import mimetypes
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import text

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.replay_ops import ReplayOpsService
from services.storage import StorageService
from schemas.storage import ObjectRequest

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
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save replay video metadata after upload.
    
    If a previous replay exists for the same target, deletes the old storage
    object (if the key changed) before updating the DB record.
    """
    service = ReplayOpsService(db)
    try:
        logger.info(
            f"[REPLAY SAVE] user={current_user.id} tournament={data.tournament_id} "
            f"archer={data.archer_id} course={data.course_number} "
            f"target={data.target_number} key={data.object_key}"
        )

        # Step 1: Check if there's an existing object_key for this target
        old_object_key = await service.get_existing_object_key(
            tournament_id=data.tournament_id,
            archer_id=data.archer_id,
            course_number=data.course_number,
            target_number=data.target_number,
        )

        # Step 2: If old key differs from new key, delete old file from storage
        if old_object_key and old_object_key != data.object_key:
            logger.info(
                f"[REPLAY SAVE] Deleting old storage object: {old_object_key} "
                f"(replacing with {data.object_key})"
            )
            try:
                storage_service = StorageService()
                delete_request = ObjectRequest(
                    bucket_name="arrow-replays",
                    object_key=old_object_key,
                )
                await storage_service.delete_object(delete_request)
                logger.info(f"[REPLAY SAVE] Successfully deleted old object: {old_object_key}")
            except Exception as del_err:
                # Don't fail the whole upload if old file deletion fails
                logger.warning(
                    f"[REPLAY SAVE] Failed to delete old object {old_object_key}: {del_err}. "
                    f"Continuing with save..."
                )
        elif old_object_key:
            logger.info(
                f"[REPLAY SAVE] Same object_key as existing ({old_object_key}), "
                f"storage file was already overwritten by presigned URL PUT."
            )

        # Step 3: Save/update the DB record
        logger.info(f"[REPLAY SAVE] Upserting DB record with new key: {data.object_key}")
        result = await service.save_replay(
            user_id=str(current_user.id),
            tournament_id=data.tournament_id,
            archer_id=data.archer_id,
            course_number=data.course_number,
            target_number=data.target_number,
            object_key=data.object_key,
        )
        logger.info(f"[REPLAY SAVE] DB upsert result={result}")
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
    current_user: UserResponse = Depends(get_current_user),
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
    current_user: UserResponse = Depends(get_current_user),
):
    """Get a presigned upload URL for replay video storage.
    
    Uses server-side storage credentials, using the unified FastAPI JWT auth flow.
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
    current_user: UserResponse = Depends(get_current_user),
):
    """Get a presigned download URL for replay video retrieval.
    
    Uses server-side storage credentials, using the unified FastAPI JWT auth flow.
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


@router.head("/stream")
async def stream_replay_head(
    bucket_name: str = Query(...),
    object_key: str = Query(...),
):
    """HEAD request for stream endpoint — returns headers without body.
    
    Used by frontend preflight checks to verify the video exists and
    get content-type before attempting to load the full video.
    """
    from fastapi.responses import Response
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
            logger.error(f"[REPLAY STREAM HEAD] No download URL for bucket={bucket_name} key={object_key}")
            raise HTTPException(status_code=404, detail="Video not found in storage")

        # Do a HEAD request to the storage URL to get metadata
        async with httpx_client.AsyncClient(timeout=30.0, follow_redirects=True) as http_client:
            head_resp = await http_client.head(download_url)

        logger.info(
            f"[REPLAY STREAM HEAD] Storage HEAD status={head_resp.status_code} "
            f"content-type={head_resp.headers.get('content-type', 'N/A')} "
            f"content-length={head_resp.headers.get('content-length', 'N/A')}"
        )

        if head_resp.status_code >= 400:
            logger.error(f"[REPLAY STREAM HEAD] Storage returned {head_resp.status_code}")
            raise HTTPException(status_code=502, detail=f"Storage returned HTTP {head_resp.status_code}")

        # Determine content type
        content_type = fallback_content_type
        actual_ct = head_resp.headers.get("content-type", "")
        if actual_ct:
            actual_ct_clean = actual_ct.split(";")[0].strip().lower()
            if actual_ct_clean and actual_ct_clean != "application/octet-stream":
                content_type = actual_ct_clean

        content_length = head_resp.headers.get("content-length", "0")
        filename = object_key.split("/")[-1] if "/" in object_key else object_key

        return Response(
            content=b"",
            status_code=200,
            headers={
                "Content-Type": content_type,
                "Content-Length": content_length,
                "Content-Disposition": f'inline; filename="{filename}"',
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REPLAY STREAM HEAD] Error: {e}", exc_info=True)
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
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
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


@router.delete("/clear-all")
async def clear_all_replays(
    db: AsyncSession = Depends(get_db),
):
    """Debug: Delete ALL replay_videos records from the database.
    
    This is a destructive debug endpoint for clearing stale data.
    """
    try:
        result = await db.execute(text("DELETE FROM replay_videos"))
        await db.commit()
        deleted_count = result.rowcount
        logger.info(f"[REPLAY CLEAR-ALL] Deleted {deleted_count} records from replay_videos")
        return {"deleted": deleted_count, "message": f"Cleared {deleted_count} replay records"}
    except Exception as e:
        await db.rollback()
        logger.error(f"[REPLAY CLEAR-ALL] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug")
async def debug_replays(
    tournament_id: int = Query(...),
    archer_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Debug: list all replay records for a tournament/archer combo."""
    query = text(
        "SELECT id, course_number, target_number, object_key, created_at, updated_at "
        "FROM replay_videos WHERE tournament_id = :tournament_id AND archer_id = :archer_id "
        "ORDER BY course_number, target_number"
    )
    result = await db.execute(query, {"tournament_id": tournament_id, "archer_id": archer_id})
    rows = result.fetchall()
    logger.info(
        f"[REPLAY DEBUG] tournament={tournament_id} archer={archer_id} found {len(rows)} rows"
    )
    return [
        {
            "id": r[0], "course_number": r[1], "target_number": r[2],
            "object_key": r[3], "created_at": str(r[4]), "updated_at": str(r[5])
        }
        for r in rows
    ]