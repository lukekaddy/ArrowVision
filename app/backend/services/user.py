import logging
import time
from typing import Optional

from models.custom_users import Custom_users
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class UserService:
    @staticmethod
    async def get_user_profile(db: AsyncSession, user_id: int) -> Optional[Custom_users]:
        """Get auth user profile by user ID."""
        start_time = time.time()
        logger.debug(f"[DB_OP] Starting get_user_profile - user_id: {user_id}")
        result = await db.execute(select(Custom_users).where(Custom_users.id == user_id))
        user = result.scalar_one_or_none()
        logger.debug(
            f"[DB_OP] Get user profile completed in {time.time() - start_time:.4f}s - found: {user is not None}"
        )
        return user

    @staticmethod
    async def update_user_profile(
        db: AsyncSession,
        user_id: int,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        phone: Optional[str] = None,
    ) -> Optional[Custom_users]:
        """Update auth user profile fields."""
        start_time = time.time()
        logger.debug(f"[DB_OP] Starting update_user_profile - user_id: {user_id}")
        result = await db.execute(select(Custom_users).where(Custom_users.id == user_id))
        user = result.scalar_one_or_none()
        logger.debug(f"[DB_OP] User lookup completed in {time.time() - start_time:.4f}s - found: {user is not None}")

        if user:
            if first_name is not None:
                user.first_name = first_name
            if last_name is not None:
                user.last_name = last_name
            if phone is not None:
                user.phone = phone
            await db.commit()
            await db.refresh(user)

        return user
