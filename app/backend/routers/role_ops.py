import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.role_ops import RoleOpsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/roles", tags=["roles"])


class SetRoleRequest(BaseModel):
    role: str


class RoleResponse(BaseModel):
    role: str | None = None


class AdminCheckResponse(BaseModel):
    is_admin: bool


@router.get("/me", response_model=RoleResponse)
async def get_my_role(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's role"""
    service = RoleOpsService(db)
    try:
        role = await service.get_user_role(str(current_user.id))
        return RoleResponse(role=role)
    except Exception as e:
        logger.error(f"Error fetching user role: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/set", response_model=RoleResponse)
async def set_my_role(
    data: SetRoleRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set role for the current user (only if not already set)"""
    if data.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    service = RoleOpsService(db)
    try:
        email = getattr(current_user, "email", "") or ""
        inserted = await service.set_user_role(str(current_user.id), email, data.role)
        if not inserted:
            # Role already exists, return existing role
            existing_role = await service.get_user_role(str(current_user.id))
            return RoleResponse(role=existing_role)
        return RoleResponse(role=data.role)
    except Exception as e:
        logger.error(f"Error setting user role: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check-admin", response_model=AdminCheckResponse)
async def check_admin(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if the current user is an admin"""
    service = RoleOpsService(db)
    try:
        is_admin = await service.check_is_admin(str(current_user.id))
        return AdminCheckResponse(is_admin=is_admin)
    except Exception as e:
        logger.error(f"Error checking admin status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))