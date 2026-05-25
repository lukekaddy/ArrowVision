from core.database import get_db
from fastapi import APIRouter, Depends
from routers.custom_auth import (
    AdminRegisterRequest,
    ArcherRegisterRequest,
    AuthResponse,
    LoginRequest,
    UserInfo,
    get_current_custom_user,
    login as custom_login,
    register_admin as custom_register_admin,
    register_archer as custom_register_archer,
)
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


@router.post("/register-admin", response_model=AuthResponse, status_code=201)
async def register_admin(data: AdminRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register an admin account and return a FastAPI-issued JWT."""
    return await custom_register_admin(data=data, db=db)


@router.post("/register-archer", response_model=AuthResponse, status_code=201)
async def register_archer(data: ArcherRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register an archer account and return a FastAPI-issued JWT."""
    return await custom_register_archer(data=data, db=db)


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with email and password and return a FastAPI-issued JWT."""
    return await custom_login(data=data, db=db)


@router.get("/me", response_model=UserInfo)
async def get_current_user_info(current_user: UserInfo = Depends(get_current_custom_user)):
    """Get the current JWT-authenticated user."""
    return current_user


@router.post("/logout")
async def logout():
    """JWT logout is handled client-side by deleting the stored token."""
    return {"success": True}
