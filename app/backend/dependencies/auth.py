import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.database import get_db
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from schemas.auth import UserResponse, UserRole
from services.custom_users import Custom_usersService
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "bullseye-labs-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7
bearer_scheme = HTTPBearer(auto_error=False)


def normalize_role(role: object) -> UserRole:
    value = getattr(role, "value", role)
    if value not in {UserRole.admin.value, UserRole.archer.value}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user role")
    return UserRole(value)


def create_access_token(user_id: int, email: str, role: UserRole | str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    role_value = normalize_role(role).value
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role_value,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        logger.warning("Token validation failed: %s", type(exc).__name__)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


async def get_bearer_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> str:
    """Extract bearer token from Authorization header."""
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials

    logger.debug("Authentication required for request %s %s", request.method, request.url.path)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication credentials were not provided")


async def get_current_user(
    token: str = Depends(get_bearer_token),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Return the current user for the single FastAPI JWT auth system."""
    payload = decode_access_token(token)
    raw_user_id = payload.get("sub")
    if not raw_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")

    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token") from exc

    service = Custom_usersService(db)
    user = await service.get_by_id(user_id)
    if not user:
        user_hash = hashlib.sha256(str(user_id).encode()).hexdigest()[:8]
        logger.debug("Authenticated user hash not found: %s", user_hash)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return UserResponse(
        id=user.id,
        email=user.email,
        role=normalize_role(user.role),
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        phone=user.phone,
    )


async def get_admin_user(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Dependency to ensure current user has admin role."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
