import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.replay_videos import Replay_videosService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/replay_videos", tags=["replay_videos"])


# ---------- Pydantic Schemas ----------
class Replay_videosData(BaseModel):
    """Entity data schema (for create/update)"""
    tournament_id: int
    archer_id: int
    course_number: int
    target_number: int
    object_key: str
    visibility: str = None


class Replay_videosUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    tournament_id: Optional[int] = None
    archer_id: Optional[int] = None
    course_number: Optional[int] = None
    target_number: Optional[int] = None
    object_key: Optional[str] = None
    visibility: Optional[str] = None


class Replay_videosResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    tournament_id: int
    archer_id: int
    course_number: int
    target_number: int
    object_key: str
    visibility: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Replay_videosListResponse(BaseModel):
    """List response schema"""
    items: List[Replay_videosResponse]
    total: int
    skip: int
    limit: int


class Replay_videosBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Replay_videosData]


class Replay_videosBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Replay_videosUpdateData


class Replay_videosBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Replay_videosBatchUpdateItem]


class Replay_videosBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Replay_videosListResponse)
async def query_replay_videoss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query replay_videoss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying replay_videoss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Replay_videosService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} replay_videoss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying replay_videoss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Replay_videosListResponse)
async def query_replay_videoss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query replay_videoss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying replay_videoss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Replay_videosService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} replay_videoss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying replay_videoss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Replay_videosResponse)
async def get_replay_videos(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single replay_videos by ID (user can only see their own records)"""
    logger.debug(f"Fetching replay_videos with id: {id}, fields={fields}")
    
    service = Replay_videosService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Replay_videos with id {id} not found")
            raise HTTPException(status_code=404, detail="Replay_videos not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching replay_videos {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Replay_videosResponse, status_code=201)
async def create_replay_videos(
    data: Replay_videosData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new replay_videos"""
    logger.debug(f"Creating new replay_videos with data: {data}")
    
    service = Replay_videosService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create replay_videos")
        
        logger.info(f"Replay_videos created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating replay_videos: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating replay_videos: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Replay_videosResponse], status_code=201)
async def create_replay_videoss_batch(
    request: Replay_videosBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple replay_videoss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} replay_videoss")
    
    service = Replay_videosService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} replay_videoss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Replay_videosResponse])
async def update_replay_videoss_batch(
    request: Replay_videosBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple replay_videoss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} replay_videoss")
    
    service = Replay_videosService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} replay_videoss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Replay_videosResponse)
async def update_replay_videos(
    id: int,
    data: Replay_videosUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing replay_videos (requires ownership)"""
    logger.debug(f"Updating replay_videos {id} with data: {data}")

    service = Replay_videosService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Replay_videos with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Replay_videos not found")
        
        logger.info(f"Replay_videos {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating replay_videos {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating replay_videos {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_replay_videoss_batch(
    request: Replay_videosBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple replay_videoss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} replay_videoss")
    
    service = Replay_videosService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} replay_videoss successfully")
        return {"message": f"Successfully deleted {deleted_count} replay_videoss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_replay_videos(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single replay_videos by ID (requires ownership)"""
    logger.debug(f"Deleting replay_videos with id: {id}")
    
    service = Replay_videosService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Replay_videos with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Replay_videos not found")
        
        logger.info(f"Replay_videos {id} deleted successfully")
        return {"message": "Replay_videos deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting replay_videos {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")