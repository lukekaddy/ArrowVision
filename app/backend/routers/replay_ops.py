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
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Find replay video object_key for a specific archer/target (POST version)."""
    service = ReplayOpsService(db)
    try:
        logger.info(
            f"[REPLAY FIND] user={current_user.id} tournament={data.tournament_id} "
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