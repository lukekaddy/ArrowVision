import logging

import bcrypt
from core.database import get_db
from dependencies.auth import create_access_token, get_current_user, normalize_role
from fastapi import APIRouter, Depends, HTTPException, status
from schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse, UserRole
from services.custom_users import Custom_usersService
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])


def hash_password(password: str) -> str:
    """Hash a password using bcrypt while respecting bcrypt's 72-byte limit."""
    password_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8"))
    except (TypeError, ValueError):
        return False


def build_auth_response(user) -> AuthResponse:
    role = normalize_role(user.role)
    user_response = UserResponse(
        id=user.id,
        email=user.email,
        role=role,
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        phone=user.phone,
    )
    return AuthResponse(
        access_token=create_access_token(user.id, user.email, role),
        user=user_response,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a user with an admin or archer role and return a JWT."""
    service = Custom_usersService(db)
    existing_user = await service.get_by_field("email", data.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user_data = {
        "email": data.email,
        "password_hash": hash_password(data.password),
        "first_name": data.first_name or "",
        "last_name": data.last_name or "",
        "phone": data.phone or "",
        "role": data.role.value,
    }

    try:
        user = await service.create(user_data)
    except Exception as exc:
        logger.error("Error creating user: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create user") from exc

    return build_auth_response(user)


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with email and password and return a JWT."""
    service = Custom_usersService(db)
    user = await service.get_by_field("email", data.email)
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if normalize_role(user.role) not in (UserRole.admin, UserRole.archer):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user role")

    return build_auth_response(user)


@router.get("/me", response_model=UserResponse)
async def me(current_user: UserResponse = Depends(get_current_user)):
    """Return the current JWT-authenticated user."""
    return current_user
