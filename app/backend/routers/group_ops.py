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
    visibility: str = "public"


class JoinGroupRequest(BaseModel):
    tournament_id: int
    group_id: int


class JoinByCodeRequest(BaseModel):
    tournament_id: int
    invite_code: str


class DissolveGroupRequest(BaseModel):
    tournament_id: int
    group_id: int


class LeaveGroupRequest(BaseModel):
    tournament_id: int


class UpdateShootingOrderModeRequest(BaseModel):
    shooting_order_mode: str


# ---------- Authenticated Routes (placed before path params to avoid conflicts) ----------
@router.get("/my-groups")
async def get_my_groups(
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all groups the current user belongs to across all tournaments"""
    service = GroupOpsService(db)
    try:
        return await service.get_my_groups(user_id=str(current_user.id))
    except Exception as e:
        logger.error(f"Error fetching user groups: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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


@router.get("/find/{tournament_id}")
async def find_public_groups(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Find public groups with available space in a tournament (public, no auth needed)"""
    service = GroupOpsService(db)
    try:
        return await service.find_public_groups(tournament_id)
    except Exception as e:
        logger.error(f"Error finding public groups: {e}", exc_info=True)
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
        result = await service.create_group(
            tournament_id=data.tournament_id,
            creator_id=str(current_user.id),
            member_ids=data.member_ids,
            group_name=data.group_name,
            shooting_order_mode=data.shooting_order_mode,
            visibility=data.visibility,
        )
        if not result.get("success", True):
            raise HTTPException(status_code=400, detail=result.get("message", "Failed to create group"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating group: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/join")
async def join_group(
    data: JoinGroupRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Join an existing group in a tournament (authenticated)"""
    service = GroupOpsService(db)
    try:
        result = await service.join_group(
            tournament_id=data.tournament_id,
            group_id=data.group_id,
            user_id=str(current_user.id),
        )
        if not result.get("success"):
            msg = result.get("message", "Failed to join group")
            status_code = 404 if msg == "Group not found" else 400
            raise HTTPException(status_code=status_code, detail=msg)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining group: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/join-by-code")
async def join_by_code(
    data: JoinByCodeRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Join a group using an invite code (authenticated)"""
    service = GroupOpsService(db)
    try:
        result = await service.join_by_code(
            tournament_id=data.tournament_id,
            invite_code=data.invite_code,
            user_id=str(current_user.id),
        )
        if not result.get("success"):
            msg = result.get("message", "Failed to join group")
            status_code = 404 if "Invalid invite code" in msg else 400
            raise HTTPException(status_code=status_code, detail=msg)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining group by code: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dissolve")
async def dissolve_group(
    data: DissolveGroupRequest,
    current_user: UserInfo = Depends(get_current_custom_user),
    db: AsyncSession = Depends(get_db),
):
    """Dissolve a group (creator only, before tournament starts)"""
    service = GroupOpsService(db)
    try:
        result = await service.dissolve_group(
            tournament_id=data.tournament_id,
            group_id=data.group_id,
            user_id=str(current_user.id),
        )
        if not result.get("success"):
            msg = result.get("message", "Failed to dissolve group")
            status_code = 403 if "Only the group creator" in msg else 400
            raise HTTPException(status_code=status_code, detail=msg)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error dissolving group: {e}", exc_info=True)
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