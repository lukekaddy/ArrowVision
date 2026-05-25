from enum import Enum
from typing import Optional

from pydantic import BaseModel


class UserRole(str, Enum):
    admin = "admin"
    archer = "archer"


class UserResponse(BaseModel):
    id: str
    email: str = ""
    role: UserRole = UserRole.archer
    first_name: str = ""
    last_name: str = ""
    phone: Optional[str] = None

    class Config:
        from_attributes = True
