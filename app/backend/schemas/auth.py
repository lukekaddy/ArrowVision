from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: str = "archer"
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True
