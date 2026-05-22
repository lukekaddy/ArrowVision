import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from routers.custom_auth import get_current_custom_user, UserInfo
from services.group_ops import GroupOpsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/groups", tags=["group-ops"])


# ---------- Pydantic Schemas ----------
class CreateGroupRequest(BaseModel):
    tournament_id: int
    group_name: Optional[str] = None
    member_ids: List[int] = []
    shooting_order_mode: str = "round_robin"


class LeaveGroupRequest(BaseModel):
    tournament_id: int


class UpdateShootingOrderModeRequest(BaseModel):
    shooting_order_mode: str


# ---------- Public Routes (no auth) ----------
@router.get("/tournament/{tournament_id}")
async def get_tournament_groups(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get all groups for a tournament with their members (public)"""
    service = GroupOpsService(db)
    try:
        return await service.get_tournament_groups(tournament_id)
    except Exception as e:
        logger.error(f"Error fetching tournament groups: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ungrouped/{tournament_id}")
async def get_ungrouped_archers(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get archers not assigned to any group in a tournament (public)"""
    service = GroupOpsService(db)
    try:
        return await service.get_ungrouped_archers(tournament_id)
    except Exception as e:
        logger.error(f"Error fetching ungrouped archers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{group_id}/shooting-order")
async def get_shooting_order(
    group_id: int,
    target_number: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    """Get the shooting order for a group at a specific target (public)"""
    service = GroupOpsService(db)
    try:
        result = await service.get_shooting_order(group_id, target_number)
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching shooting order: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Authenticated Routes ----------
@router.post("/create")
async def create_group(
    data: CreateGroupRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new archer group for a tournament (authenticated)"""
    service = GroupOpsService(db)
    try:
        return await service.create_group(
            tournament_id=data.tournament_id,
            creator_id=str(current_user.id),
            member_ids=data.member_ids,
            group_name=data.group_name,
            shooting_order_mode=data.shooting_order_mode,
        )
    except Exception as e:
        logger.error(f"Error creating group: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/leave")
async def leave_group(
    data: LeaveGroupRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Leave the current group in a tournament (authenticated)"""
    service = GroupOpsService(db)
    try:
        result = await service.leave_group(
            tournament_id=data.tournament_id,
            user_id=str(current_user.id),
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Failed to leave group"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error leaving group: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{group_id}/shooting-order-mode")
async def update_shooting_order_mode(
    group_id: int,
    data: UpdateShootingOrderModeRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the shooting order mode for a group (creator only)"""
    service = GroupOpsService(db)
    try:
        result = await service.update_shooting_order_mode(
            group_id=group_id,
            shooting_order_mode=data.shooting_order_mode,
            user_id=str(current_user.id),
        )
        if not result.get("success"):
            raise HTTPException(status_code=403, detail=result.get("message", "Permission denied"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating shooting order mode: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))