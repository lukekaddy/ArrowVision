import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.scores import ScoresService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/scores", tags=["scores"])


# ---------- Pydantic Schemas ----------
class ScoresData(BaseModel):
    """Entity data schema (for create/update)"""
    tournament_id: int
    archer_id: int
    target_number: int
    score_value: int
    confirmed: bool = None


class ScoresUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    tournament_id: Optional[int] = None
    archer_id: Optional[int] = None
    target_number: Optional[int] = None
    score_value: Optional[int] = None
    confirmed: Optional[bool] = None


class ScoresResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    tournament_id: int
    archer_id: int
    target_number: int
    score_value: int
    confirmed: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ScoresListResponse(BaseModel):
    """List response schema"""
    items: List[ScoresResponse]
    total: int
    skip: int
    limit: int


class ScoresBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[ScoresData]


class ScoresBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: ScoresUpdateData


class ScoresBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[ScoresBatchUpdateItem]


class ScoresBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=ScoresListResponse)
async def query_scoress(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query scoress with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying scoress: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = ScoresService(db)
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
        logger.debug(f"Found {result['total']} scoress")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying scoress: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=ScoresListResponse)
async def query_scoress_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query scoress with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying scoress: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = ScoresService(db)
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
        logger.debug(f"Found {result['total']} scoress")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying scoress: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=ScoresResponse)
async def get_scores(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single scores by ID (user can only see their own records)"""
    logger.debug(f"Fetching scores with id: {id}, fields={fields}")
    
    service = ScoresService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Scores with id {id} not found")
            raise HTTPException(status_code=404, detail="Scores not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching scores {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=ScoresResponse, status_code=201)
async def create_scores(
    data: ScoresData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new scores"""
    logger.debug(f"Creating new scores with data: {data}")
    
    service = ScoresService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create scores")
        
        logger.info(f"Scores created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating scores: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating scores: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[ScoresResponse], status_code=201)
async def create_scoress_batch(
    request: ScoresBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple scoress in a single request"""
    logger.debug(f"Batch creating {len(request.items)} scoress")
    
    service = ScoresService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} scoress successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[ScoresResponse])
async def update_scoress_batch(
    request: ScoresBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple scoress in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} scoress")
    
    service = ScoresService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} scoress successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=ScoresResponse)
async def update_scores(
    id: int,
    data: ScoresUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing scores (requires ownership)"""
    logger.debug(f"Updating scores {id} with data: {data}")

    service = ScoresService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Scores with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Scores not found")
        
        logger.info(f"Scores {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating scores {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating scores {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_scoress_batch(
    request: ScoresBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple scoress by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} scoress")
    
    service = ScoresService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} scoress successfully")
        return {"message": f"Successfully deleted {deleted_count} scoress", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_scores(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single scores by ID (requires ownership)"""
    logger.debug(f"Deleting scores with id: {id}")
    
    service = ScoresService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Scores with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Scores not found")
        
        logger.info(f"Scores {id} deleted successfully")
        return {"message": "Scores deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting scores {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")