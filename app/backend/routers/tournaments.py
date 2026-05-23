import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.tournaments import TournamentsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/tournaments", tags=["tournaments"])


# ---------- Pydantic Schemas ----------
class TournamentsData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    date: str = None
    end_date: str = None
    num_targets: int = None
    divisions: str = None
    status: str = None
    courses: str = None
    mulligans: str = None
    location: str = None
    scoring_template_id: int = None
    course_map_url: str = None


class TournamentsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    date: Optional[str] = None
    end_date: Optional[str] = None
    num_targets: Optional[int] = None
    divisions: Optional[str] = None
    status: Optional[str] = None
    courses: Optional[str] = None
    mulligans: Optional[str] = None
    location: Optional[str] = None
    scoring_template_id: Optional[int] = None
    course_map_url: Optional[str] = None


class TournamentsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    name: str
    date: Optional[str] = None
    end_date: Optional[str] = None
    num_targets: Optional[int] = None
    divisions: Optional[str] = None
    status: Optional[str] = None
    courses: Optional[str] = None
    mulligans: Optional[str] = None
    location: Optional[str] = None
    scoring_template_id: Optional[int] = None
    course_map_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TournamentsListResponse(BaseModel):
    """List response schema"""
    items: List[TournamentsResponse]
    total: int
    skip: int
    limit: int


class TournamentsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[TournamentsData]


class TournamentsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: TournamentsUpdateData


class TournamentsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[TournamentsBatchUpdateItem]


class TournamentsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=TournamentsListResponse)
async def query_tournamentss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query tournamentss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying tournamentss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = TournamentsService(db)
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
        logger.debug(f"Found {result['total']} tournamentss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying tournamentss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=TournamentsListResponse)
async def query_tournamentss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query tournamentss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying tournamentss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = TournamentsService(db)
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
        logger.debug(f"Found {result['total']} tournamentss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying tournamentss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=TournamentsResponse)
async def get_tournaments(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single tournaments by ID (user can only see their own records)"""
    logger.debug(f"Fetching tournaments with id: {id}, fields={fields}")
    
    service = TournamentsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Tournaments with id {id} not found")
            raise HTTPException(status_code=404, detail="Tournaments not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tournaments {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=TournamentsResponse, status_code=201)
async def create_tournaments(
    data: TournamentsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tournaments"""
    logger.debug(f"Creating new tournaments with data: {data}")
    
    service = TournamentsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create tournaments")
        
        logger.info(f"Tournaments created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating tournaments: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating tournaments: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[TournamentsResponse], status_code=201)
async def create_tournamentss_batch(
    request: TournamentsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple tournamentss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} tournamentss")
    
    service = TournamentsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} tournamentss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[TournamentsResponse])
async def update_tournamentss_batch(
    request: TournamentsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple tournamentss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} tournamentss")
    
    service = TournamentsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} tournamentss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=TournamentsResponse)
async def update_tournaments(
    id: int,
    data: TournamentsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing tournaments (requires ownership)"""
    logger.debug(f"Updating tournaments {id} with data: {data}")

    service = TournamentsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Tournaments with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Tournaments not found")
        
        logger.info(f"Tournaments {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating tournaments {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating tournaments {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_tournamentss_batch(
    request: TournamentsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple tournamentss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} tournamentss")
    
    service = TournamentsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} tournamentss successfully")
        return {"message": f"Successfully deleted {deleted_count} tournamentss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_tournaments(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single tournaments by ID (requires ownership)"""
    logger.debug(f"Deleting tournaments with id: {id}")
    
    service = TournamentsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Tournaments with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Tournaments not found")
        
        logger.info(f"Tournaments {id} deleted successfully")
        return {"message": "Tournaments deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tournaments {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")