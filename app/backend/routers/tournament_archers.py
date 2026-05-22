import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.tournament_archers import Tournament_archersService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/tournament_archers", tags=["tournament_archers"])


# ---------- Pydantic Schemas ----------
class Tournament_archersData(BaseModel):
    """Entity data schema (for create/update)"""
    tournament_id: int
    archer_name: str = None
    first_name: str = None
    last_name: str = None
    phone: str = None
    division: str = None
    group_number: int = None
    group_name: str = None
    target_number: int = None
    role: str = None
    purchased_mulligans: str = None


class Tournament_archersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    tournament_id: Optional[int] = None
    archer_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    division: Optional[str] = None
    group_number: Optional[int] = None
    group_name: Optional[str] = None
    target_number: Optional[int] = None
    role: Optional[str] = None
    purchased_mulligans: Optional[str] = None


class Tournament_archersResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    tournament_id: int
    archer_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    division: Optional[str] = None
    group_number: Optional[int] = None
    group_name: Optional[str] = None
    target_number: Optional[int] = None
    role: Optional[str] = None
    purchased_mulligans: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Tournament_archersListResponse(BaseModel):
    """List response schema"""
    items: List[Tournament_archersResponse]
    total: int
    skip: int
    limit: int


class Tournament_archersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Tournament_archersData]


class Tournament_archersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Tournament_archersUpdateData


class Tournament_archersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Tournament_archersBatchUpdateItem]


class Tournament_archersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Tournament_archersListResponse)
async def query_tournament_archerss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query tournament_archerss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying tournament_archerss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Tournament_archersService(db)
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
        logger.debug(f"Found {result['total']} tournament_archerss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying tournament_archerss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Tournament_archersListResponse)
async def query_tournament_archerss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query tournament_archerss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying tournament_archerss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Tournament_archersService(db)
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
        logger.debug(f"Found {result['total']} tournament_archerss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying tournament_archerss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Tournament_archersResponse)
async def get_tournament_archers(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single tournament_archers by ID (user can only see their own records)"""
    logger.debug(f"Fetching tournament_archers with id: {id}, fields={fields}")
    
    service = Tournament_archersService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Tournament_archers with id {id} not found")
            raise HTTPException(status_code=404, detail="Tournament_archers not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tournament_archers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Tournament_archersResponse, status_code=201)
async def create_tournament_archers(
    data: Tournament_archersData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tournament_archers"""
    logger.debug(f"Creating new tournament_archers with data: {data}")
    
    service = Tournament_archersService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create tournament_archers")
        
        logger.info(f"Tournament_archers created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating tournament_archers: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating tournament_archers: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Tournament_archersResponse], status_code=201)
async def create_tournament_archerss_batch(
    request: Tournament_archersBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple tournament_archerss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} tournament_archerss")
    
    service = Tournament_archersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} tournament_archerss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Tournament_archersResponse])
async def update_tournament_archerss_batch(
    request: Tournament_archersBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple tournament_archerss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} tournament_archerss")
    
    service = Tournament_archersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} tournament_archerss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Tournament_archersResponse)
async def update_tournament_archers(
    id: int,
    data: Tournament_archersUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing tournament_archers (requires ownership)"""
    logger.debug(f"Updating tournament_archers {id} with data: {data}")

    service = Tournament_archersService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Tournament_archers with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Tournament_archers not found")
        
        logger.info(f"Tournament_archers {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating tournament_archers {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating tournament_archers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_tournament_archerss_batch(
    request: Tournament_archersBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple tournament_archerss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} tournament_archerss")
    
    service = Tournament_archersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} tournament_archerss successfully")
        return {"message": f"Successfully deleted {deleted_count} tournament_archerss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_tournament_archers(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single tournament_archers by ID (requires ownership)"""
    logger.debug(f"Deleting tournament_archers with id: {id}")
    
    service = Tournament_archersService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Tournament_archers with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Tournament_archers not found")
        
        logger.info(f"Tournament_archers {id} deleted successfully")
        return {"message": "Tournament_archers deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tournament_archers {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")