import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.custom_users import Custom_usersService

logger = logging.getLogger(__name__)

# JWT Configuration
SECRET_KEY = "bullseye-labs-secret-key-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# Bearer token scheme
bearer_scheme = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/api/v1/custom-auth", tags=["custom-auth"])


## ---------- Pydantic Schemas ----------
from pydantic import BaseModel
from typing import Optional


class RegisterBase(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str
    phone: Optional[str] = None


class AdminRegisterRequest(RegisterBase):
    pass


class ArcherRegisterRequest(RegisterBase):
    pass


class LoginRequest(BaseModel):
    email: str
    password: str


class UserInfo(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    role: str


class AuthResponse(BaseModel):
    token: str
    user: UserInfo


# ---------- Helper Functions ----------
def hash_password(password: str) -> str:
    """Hash a password using bcrypt directly (compatible with bcrypt>=5.0).
    
    bcrypt only uses the first 72 bytes of a password, so we truncate explicitly.
    """
    password_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash."""
    password_bytes = plain_password.encode("utf-8")[:72]
    hashed_bytes = hashed_password.encode("utf-8")
    try:
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, email: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# ---------- Dependency for other routers ----------
async def get_current_custom_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> "UserInfo":
    """Reusable dependency: extract and validate the custom JWT, return UserInfo.

    Import this in other routers that need custom-auth-based authentication:
        from routers.custom_auth import get_current_custom_user
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
        )

    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    service = Custom_usersService(db)
    user = await service.get_by_id(int(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return UserInfo(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        role=user.role,
    )


# ---------- Routes ----------

@router.post("/register-admin", response_model=AuthResponse, status_code=201)
async def register_admin(
    data: AdminRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register ADMIN user (role is enforced server-side)."""
    service = Custom_usersService(db)

    existing_user = await service.get_by_field("email", data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    hashed = hash_password(data.password)

    user_data = {
        "email": data.email,
        "password_hash": hashed,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "phone": data.phone or "",
        "role": "admin",  # locked
    }

    try:
        user = await service.create(user_data)
    except Exception as e:
        logger.error(f"Error creating admin user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create admin user",
        )

    token = create_access_token(user.id, user.email, user.role)

    return AuthResponse(
        token=token,
        user=UserInfo(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            role=user.role,
        ),
    )


@router.post("/register-archer", response_model=AuthResponse, status_code=201)
async def register_archer(
    data: ArcherRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register ARCHER user (role is enforced server-side)."""
    service = Custom_usersService(db)

    existing_user = await service.get_by_field("email", data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    hashed = hash_password(data.password)

    user_data = {
        "email": data.email,
        "password_hash": hashed,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "phone": data.phone or "",
        "role": "archer",  # locked
    }

    try:
        user = await service.create(user_data)
    except Exception as e:
        logger.error(f"Error creating archer user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create archer user",
        )

    token = create_access_token(user.id, user.email, user.role)

    return AuthResponse(
        token=token,
        user=UserInfo(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            role=user.role,
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login with email and password."""
    service = Custom_usersService(db)

    user = await service.get_by_field("email", data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user.id, user.email, user.role)

    return AuthResponse(
        token=token,
        user=UserInfo(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            role=user.role,
        ),
    )