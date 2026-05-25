from datetime import datetime
from enum import Enum as PyEnum

from core.database import Base
from sqlalchemy import Column, DateTime, Enum, Integer, String


class UserRole(str, PyEnum):
    admin = "admin"
    archer = "archer"


class User(Base):
    __tablename__ = "custom_users"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    email = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    first_name = Column(String, nullable=False, default="")
    last_name = Column(String, nullable=False, default="")
    phone = Column(String, nullable=True)
    role = Column(
        Enum(
            UserRole,
            values_callable=lambda roles: [role.value for role in roles],
            native_enum=False,
            validate_strings=True,
        ),
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)


# Backward-compatible alias for existing services and generated entity routes.
Custom_users = User
