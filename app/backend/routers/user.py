from typing import Optional

from dependencies.auth import get_current_user
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from schemas.auth import UserResponse

router = APIRouter(prefix="/api/v1/users", tags=["users"])


class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None


@router.get("/profile", response_model=UserResponse)
async def get_profile(current_user: UserResponse = Depends(get_current_user)):
    """Return the Supabase-authenticated user profile context."""
    return current_user


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UpdateProfileRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """Profile writes belong in Supabase; echo merged context for compatibility."""
    return current_user.model_copy(
        update={
            "first_name": profile_data.first_name if profile_data.first_name is not None else current_user.first_name,
            "last_name": profile_data.last_name if profile_data.last_name is not None else current_user.last_name,
            "phone": profile_data.phone if profile_data.phone is not None else current_user.phone,
        }
    )
