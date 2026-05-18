import logging
from typing import Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class RoleOpsService:
    """Service for user role operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_role(self, user_id: str) -> Optional[str]:
        """Get the role for a user. Returns role string or None if not set."""
        query = text("SELECT role FROM user_roles WHERE user_id = :uid LIMIT 1")
        result = await self.db.execute(query, {"uid": user_id})
        row = result.scalar_one_or_none()
        return row

    async def set_user_role(self, user_id: str, email: str, role: str) -> bool:
        """Set role for a user. Only inserts if no existing role. Returns True if inserted."""
        # Check if role already exists
        existing = await self.get_user_role(user_id)
        if existing is not None:
            return False

        insert_query = text(
            "INSERT INTO user_roles (user_id, email, role) VALUES (:uid, :email, :role)"
        )
        await self.db.execute(insert_query, {"uid": user_id, "email": email, "role": role})
        await self.db.commit()
        return True

    async def check_is_admin(self, user_id: str) -> bool:
        """Check if the user has admin role."""
        role = await self.get_user_role(user_id)
        return role == "admin"