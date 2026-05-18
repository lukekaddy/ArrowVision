import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


class ReplayOpsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def save_replay(
        self,
        user_id: str,
        tournament_id: int,
        archer_id: int,
        course_number: int,
        target_number: int,
        object_key: str,
        visibility: str = "public",
    ) -> dict:
        """Save a replay video record to the database."""
        # Check if a replay already exists for this combination
        check_query = text(
            "SELECT id FROM replay_videos "
            "WHERE tournament_id = :tournament_id AND archer_id = :archer_id "
            "AND course_number = :course_number AND target_number = :target_number"
        )
        result = await self.db.execute(
            check_query,
            {
                "tournament_id": tournament_id,
                "archer_id": archer_id,
                "course_number": course_number,
                "target_number": target_number,
            },
        )
        existing = result.fetchone()

        if existing:
            # Update existing record
            update_query = text(
                "UPDATE replay_videos SET object_key = :object_key, "
                "user_id = :user_id, visibility = :visibility, "
                "updated_at = NOW() "
                "WHERE id = :id"
            )
            await self.db.execute(
                update_query,
                {
                    "object_key": object_key,
                    "user_id": user_id,
                    "visibility": visibility,
                    "id": existing[0],
                },
            )
            await self.db.commit()
            return {"id": existing[0], "object_key": object_key, "updated": True}
        else:
            # Insert new record
            insert_query = text(
                "INSERT INTO replay_videos (user_id, tournament_id, archer_id, "
                "course_number, target_number, object_key, visibility) "
                "VALUES (:user_id, :tournament_id, :archer_id, :course_number, "
                ":target_number, :object_key, :visibility) "
                "RETURNING id"
            )
            result = await self.db.execute(
                insert_query,
                {
                    "user_id": user_id,
                    "tournament_id": tournament_id,
                    "archer_id": archer_id,
                    "course_number": course_number,
                    "target_number": target_number,
                    "object_key": object_key,
                    "visibility": visibility,
                },
            )
            await self.db.commit()
            row = result.fetchone()
            return {"id": row[0] if row else None, "object_key": object_key, "updated": False}

    async def get_replay(
        self,
        tournament_id: int,
        archer_id: int,
        course_number: int,
        target_number: int,
    ) -> Optional[str]:
        """Get the object_key for a replay video matching the given parameters."""
        query = text(
            "SELECT object_key FROM replay_videos "
            "WHERE tournament_id = :tournament_id AND archer_id = :archer_id "
            "AND course_number = :course_number AND target_number = :target_number "
            "ORDER BY updated_at DESC LIMIT 1"
        )
        result = await self.db.execute(
            query,
            {
                "tournament_id": tournament_id,
                "archer_id": archer_id,
                "course_number": course_number,
                "target_number": target_number,
            },
        )
        row = result.fetchone()
        return row[0] if row else None