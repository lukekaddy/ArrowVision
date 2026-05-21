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
        """Save a replay video record to the database.

        Uses INSERT ... ON CONFLICT DO UPDATE (true upsert) to ensure exactly
        one row exists per (tournament_id, archer_id, course_number, target_number).
        Falls back to DELETE-then-INSERT if the unique constraint doesn't exist yet.
        """
        logger.info(
            f"[REPLAY_OPS] save_replay called: user_id={user_id} "
            f"tournament_id={tournament_id} archer_id={archer_id} "
            f"course={course_number} target={target_number} "
            f"object_key={object_key}"
        )

        # First, ensure the unique constraint exists (idempotent)
        try:
            await self.db.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_replay_videos_target "
                "ON replay_videos (tournament_id, archer_id, course_number, target_number)"
            ))
            await self.db.commit()
        except Exception as e:
            # If constraint creation fails (e.g., duplicates exist), log and continue
            logger.warning(f"[REPLAY_OPS] Could not create unique index (may already exist or duplicates present): {e}")
            await self.db.rollback()
            # Clean up duplicates before proceeding
            await self._cleanup_duplicates(tournament_id, archer_id, course_number, target_number)

        # Try upsert with ON CONFLICT
        try:
            upsert_query = text(
                "INSERT INTO replay_videos (user_id, tournament_id, archer_id, "
                "course_number, target_number, object_key, visibility, "
                "created_at, updated_at) "
                "VALUES (:user_id, :tournament_id, :archer_id, :course_number, "
                ":target_number, :object_key, :visibility, NOW(), NOW()) "
                "ON CONFLICT (tournament_id, archer_id, course_number, target_number) "
                "DO UPDATE SET object_key = EXCLUDED.object_key, "
                "user_id = EXCLUDED.user_id, "
                "visibility = EXCLUDED.visibility, "
                "updated_at = NOW() "
                "RETURNING id, (xmax = 0) AS was_insert"
            )
            result = await self.db.execute(
                upsert_query,
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
            if row:
                was_insert = row[1] if len(row) > 1 else True
                action = "INSERT" if was_insert else "UPDATE"
                logger.info(
                    f"[REPLAY_OPS] Upsert success: id={row[0]} action={action} "
                    f"object_key={object_key}"
                )
                return {"id": row[0], "object_key": object_key, "updated": not was_insert}
            else:
                logger.error("[REPLAY_OPS] Upsert returned no row!")
                return {"id": None, "object_key": object_key, "updated": False}

        except Exception as upsert_err:
            logger.warning(
                f"[REPLAY_OPS] Upsert failed (falling back to DELETE+INSERT): {upsert_err}"
            )
            await self.db.rollback()

            # Fallback: DELETE-then-INSERT
            return await self._delete_and_insert(
                user_id, tournament_id, archer_id, course_number,
                target_number, object_key, visibility
            )

    async def _cleanup_duplicates(
        self, tournament_id: int, archer_id: int, course_number: int, target_number: int
    ):
        """Remove duplicate rows, keeping only the most recent one."""
        try:
            # Delete all but the most recent row for this combination
            cleanup_query = text(
                "DELETE FROM replay_videos "
                "WHERE id NOT IN ("
                "  SELECT id FROM replay_videos "
                "  WHERE tournament_id = :tournament_id AND archer_id = :archer_id "
                "  AND course_number = :course_number AND target_number = :target_number "
                "  ORDER BY updated_at DESC LIMIT 1"
                ") "
                "AND tournament_id = :tournament_id AND archer_id = :archer_id "
                "AND course_number = :course_number AND target_number = :target_number"
            )
            result = await self.db.execute(
                cleanup_query,
                {
                    "tournament_id": tournament_id,
                    "archer_id": archer_id,
                    "course_number": course_number,
                    "target_number": target_number,
                },
            )
            await self.db.commit()
            if result.rowcount > 0:
                logger.info(
                    f"[REPLAY_OPS] Cleaned up {result.rowcount} duplicate rows for "
                    f"tournament={tournament_id} archer={archer_id} "
                    f"course={course_number} target={target_number}"
                )
        except Exception as e:
            logger.error(f"[REPLAY_OPS] Duplicate cleanup failed: {e}")
            await self.db.rollback()

    async def _delete_and_insert(
        self,
        user_id: str,
        tournament_id: int,
        archer_id: int,
        course_number: int,
        target_number: int,
        object_key: str,
        visibility: str,
    ) -> dict:
        """Fallback: DELETE all existing rows then INSERT a fresh one."""
        logger.info("[REPLAY_OPS] Using DELETE+INSERT fallback")

        # Delete ALL existing rows for this combination
        delete_query = text(
            "DELETE FROM replay_videos "
            "WHERE tournament_id = :tournament_id AND archer_id = :archer_id "
            "AND course_number = :course_number AND target_number = :target_number"
        )
        delete_result = await self.db.execute(
            delete_query,
            {
                "tournament_id": tournament_id,
                "archer_id": archer_id,
                "course_number": course_number,
                "target_number": target_number,
            },
        )
        was_update = delete_result.rowcount > 0
        logger.info(f"[REPLAY_OPS] DELETE removed {delete_result.rowcount} rows")

        # Insert fresh record
        insert_query = text(
            "INSERT INTO replay_videos (user_id, tournament_id, archer_id, "
            "course_number, target_number, object_key, visibility, "
            "created_at, updated_at) "
            "VALUES (:user_id, :tournament_id, :archer_id, :course_number, "
            ":target_number, :object_key, :visibility, NOW(), NOW()) "
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
        new_id = row[0] if row else None
        logger.info(f"[REPLAY_OPS] INSERT success: id={new_id} object_key={object_key}")
        return {"id": new_id, "object_key": object_key, "updated": was_update}

    async def get_replay(
        self,
        tournament_id: int,
        archer_id: int,
        course_number: int,
        target_number: int,
    ) -> Optional[str]:
        """Get the object_key for a replay video matching the given parameters."""
        query = text(
            "SELECT id, object_key, updated_at FROM replay_videos "
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
        if row:
            logger.info(
                f"[REPLAY_OPS] get_replay found: id={row[0]} object_key={row[1]} "
                f"updated_at={row[2]} for tournament={tournament_id} "
                f"archer={archer_id} course={course_number} target={target_number}"
            )
            return row[1]
        else:
            logger.info(
                f"[REPLAY_OPS] get_replay: NO record found for "
                f"tournament={tournament_id} archer={archer_id} "
                f"course={course_number} target={target_number}"
            )
            return None