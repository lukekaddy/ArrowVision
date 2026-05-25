from enum import Enum
from typing import Optional

from pydantic import BaseModel


class UserRole(str, Enum):
    admin = "admin"
    archer = "archer"


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: UserRole
    first_name: str = ""
    last_name: str = ""
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    role: UserRole
    first_name: str = ""
    last_name: str = ""
    phone: Optional[str] = None

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    access_token: str
    user: UserResponse
    token_type: str = "bearer"
