import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.scoring_templates import Scoring_templatesService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/scoring_templates", tags=["scoring_templates"])


# ---------- Pydantic Schemas ----------
class Scoring_templatesData(BaseModel):
    """Entity data schema (for create/update)"""
    tournament_id: int = None
    template_name: str
    score_values: str
    is_custom: bool = None


class Scoring_templatesUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    tournament_id: Optional[int] = None
    template_name: Optional[str] = None
    score_values: Optional[str] = None
    is_custom: Optional[bool] = None


class Scoring_templatesResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    tournament_id: Optional[int] = None
    template_name: str
    score_values: str
    is_custom: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Scoring_templatesListResponse(BaseModel):
    """List response schema"""
    items: List[Scoring_templatesResponse]
    total: int
    skip: int
    limit: int


class Scoring_templatesBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Scoring_templatesData]


class Scoring_templatesBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Scoring_templatesUpdateData


class Scoring_templatesBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Scoring_templatesBatchUpdateItem]


class Scoring_templatesBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Scoring_templatesListResponse)
async def query_scoring_templatess(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query scoring_templatess with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying scoring_templatess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Scoring_templatesService(db)
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
        logger.debug(f"Found {result['total']} scoring_templatess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying scoring_templatess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Scoring_templatesListResponse)
async def query_scoring_templatess_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query scoring_templatess with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying scoring_templatess: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Scoring_templatesService(db)
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
        logger.debug(f"Found {result['total']} scoring_templatess")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying scoring_templatess: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Scoring_templatesResponse)
async def get_scoring_templates(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single scoring_templates by ID (user can only see their own records)"""
    logger.debug(f"Fetching scoring_templates with id: {id}, fields={fields}")
    
    service = Scoring_templatesService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Scoring_templates with id {id} not found")
            raise HTTPException(status_code=404, detail="Scoring_templates not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching scoring_templates {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Scoring_templatesResponse, status_code=201)
async def create_scoring_templates(
    data: Scoring_templatesData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new scoring_templates"""
    logger.debug(f"Creating new scoring_templates with data: {data}")
    
    service = Scoring_templatesService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create scoring_templates")
        
        logger.info(f"Scoring_templates created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating scoring_templates: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating scoring_templates: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Scoring_templatesResponse], status_code=201)
async def create_scoring_templatess_batch(
    request: Scoring_templatesBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple scoring_templatess in a single request"""
    logger.debug(f"Batch creating {len(request.items)} scoring_templatess")
    
    service = Scoring_templatesService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} scoring_templatess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Scoring_templatesResponse])
async def update_scoring_templatess_batch(
    request: Scoring_templatesBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple scoring_templatess in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} scoring_templatess")
    
    service = Scoring_templatesService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} scoring_templatess successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Scoring_templatesResponse)
async def update_scoring_templates(
    id: int,
    data: Scoring_templatesUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing scoring_templates (requires ownership)"""
    logger.debug(f"Updating scoring_templates {id} with data: {data}")

    service = Scoring_templatesService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Scoring_templates with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Scoring_templates not found")
        
        logger.info(f"Scoring_templates {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating scoring_templates {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating scoring_templates {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_scoring_templatess_batch(
    request: Scoring_templatesBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple scoring_templatess by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} scoring_templatess")
    
    service = Scoring_templatesService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} scoring_templatess successfully")
        return {"message": f"Successfully deleted {deleted_count} scoring_templatess", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_scoring_templates(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single scoring_templates by ID (requires ownership)"""
    logger.debug(f"Deleting scoring_templates with id: {id}")
    
    service = Scoring_templatesService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Scoring_templates with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Scoring_templates not found")
        
        logger.info(f"Scoring_templates {id} deleted successfully")
        return {"message": "Scoring_templates deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting scoring_templates {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")