import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.archer_groups import Archer_groupsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/archer_groups", tags=["archer_groups"])


# ---------- Pydantic Schemas ----------
class Archer_groupsData(BaseModel):
    """Entity data schema (for create/update)"""
    tournament_id: int
    group_name: str
    group_number: int
    shooting_order_mode: str = None
    creator_id: str


class Archer_groupsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    tournament_id: Optional[int] = None
    group_name: Optional[str] = None
    group_number: Optional[int] = None
    shooting_order_mode: Optional[str] = None
    creator_id: Optional[str] = None


class Archer_groupsResponse(BaseModel):
    """Entity response schema"""
    id: int
    tournament_id: int
    group_name: str
    group_number: int
    shooting_order_mode: Optional[str] = None
    creator_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Archer_groupsListResponse(BaseModel):
    """List response schema"""
    items: List[Archer_groupsResponse]
    total: int
    skip: int
    limit: int


class Archer_groupsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Archer_groupsData]


class Archer_groupsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Archer_groupsUpdateData


class Archer_groupsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Archer_groupsBatchUpdateItem]


class Archer_groupsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Archer_groupsListResponse)
async def query_archer_groupss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query archer_groupss with filtering, sorting, and pagination"""
    logger.debug(f"Querying archer_groupss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Archer_groupsService(db)
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
        )
        logger.debug(f"Found {result['total']} archer_groupss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying archer_groupss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Archer_groupsListResponse)
async def query_archer_groupss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query archer_groupss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying archer_groupss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Archer_groupsService(db)
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
        logger.debug(f"Found {result['total']} archer_groupss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying archer_groupss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Archer_groupsResponse)
async def get_archer_groups(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single archer_groups by ID"""
    logger.debug(f"Fetching archer_groups with id: {id}, fields={fields}")
    
    service = Archer_groupsService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Archer_groups with id {id} not found")
            raise HTTPException(status_code=404, detail="Archer_groups not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching archer_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Archer_groupsResponse, status_code=201)
async def create_archer_groups(
    data: Archer_groupsData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new archer_groups"""
    logger.debug(f"Creating new archer_groups with data: {data}")
    
    service = Archer_groupsService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create archer_groups")
        
        logger.info(f"Archer_groups created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating archer_groups: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating archer_groups: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Archer_groupsResponse], status_code=201)
async def create_archer_groupss_batch(
    request: Archer_groupsBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple archer_groupss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} archer_groupss")
    
    service = Archer_groupsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} archer_groupss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Archer_groupsResponse])
async def update_archer_groupss_batch(
    request: Archer_groupsBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple archer_groupss in a single request"""
    logger.debug(f"Batch updating {len(request.items)} archer_groupss")
    
    service = Archer_groupsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} archer_groupss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Archer_groupsResponse)
async def update_archer_groups(
    id: int,
    data: Archer_groupsUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing archer_groups"""
    logger.debug(f"Updating archer_groups {id} with data: {data}")

    service = Archer_groupsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Archer_groups with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Archer_groups not found")
        
        logger.info(f"Archer_groups {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating archer_groups {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating archer_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_archer_groupss_batch(
    request: Archer_groupsBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple archer_groupss by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} archer_groupss")
    
    service = Archer_groupsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} archer_groupss successfully")
        return {"message": f"Successfully deleted {deleted_count} archer_groupss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_archer_groups(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single archer_groups by ID"""
    logger.debug(f"Deleting archer_groups with id: {id}")
    
    service = Archer_groupsService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Archer_groups with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Archer_groups not found")
        
        logger.info(f"Archer_groups {id} deleted successfully")
        return {"message": "Archer_groups deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting archer_groups {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")