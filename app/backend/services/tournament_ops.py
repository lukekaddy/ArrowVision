import logging
from datetime import date as date_type, datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import select, func, case, desc, text
from sqlalchemy.ext.asyncio import AsyncSession
from models.tournaments import Tournaments
from models.tournament_archers import Tournament_archers
from models.scores import Scores
from models.scoring_templates import Scoring_templates

logger = logging.getLogger(__name__)

# Safe columns that are guaranteed to exist in the tournaments table.
# We use raw SQL for tournament queries to avoid SQLAlchemy including
# columns that may not exist in the actual database schema.
_TOURNAMENT_SAFE_COLS = [
    "id", "user_id", "name", "date", "num_targets",
    "divisions", "status", "courses", "mulligans",
    "scoring_template_id", "course_map_url",
    "created_at", "updated_at"
]

# Check if location column is available (set on first successful query)
_location_available: Optional[bool] = None


class TournamentOpsService:
    """Service for cross-user tournament operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _check_location_column(self) -> bool:
        """Check if the location column exists in the tournaments table"""
        global _location_available
        if _location_available is not None:
            return _location_available
        try:
            check_query = text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'tournaments' AND column_name = 'location'"
            )
            result = await self.db.execute(check_query)
            row = result.scalar_one_or_none()
            _location_available = row is not None
        except Exception:
            _location_available = False
        return _location_available

    async def _get_tournament_columns(self) -> List[str]:
        """Get the list of columns to select, including location if available"""
        has_location = await self._check_location_column()
        cols = list(_TOURNAMENT_SAFE_COLS)
        if has_location:
            cols.insert(4, "location")  # After "date"
        return cols

    async def get_public_tournaments(self, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        """Get all tournaments (public) with computed status based on date"""
        cols = await self._get_tournament_columns()
        col_str = ", ".join(cols)
        query = text(
            f"SELECT {col_str} FROM tournaments ORDER BY created_at DESC OFFSET :skip LIMIT :lim"
        )
        result = await self.db.execute(query, {"skip": skip, "lim": limit})
        rows = result.mappings().all()

        count_query = text("SELECT COUNT(*) FROM tournaments")
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        tournament_list = []
        for row in rows:
            raw_date = dict(row).get("date") or ""
            t_dict = self._row_to_dict(dict(row))
            t_dict["status"] = self._compute_status(raw_date)
            tournament_list.append(t_dict)

        return {
            "items": tournament_list,
            "total": total
        }

    async def get_tournament_public(self, tournament_id: int) -> Optional[Dict]:
        """Get public tournament details"""
        cols = await self._get_tournament_columns()
        col_str = ", ".join(cols)
        query = text(f"SELECT {col_str} FROM tournaments WHERE id = :tid")
        result = await self.db.execute(query, {"tid": tournament_id})
        row = result.mappings().first()
        if not row:
            return None
        return self._row_to_dict(dict(row))

    async def get_leaderboard(self, tournament_id: int, division: Optional[str] = None, course_number: Optional[int] = None) -> List[Dict]:
        """Get leaderboard for a tournament"""
        # Get all archers for this tournament
        archer_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id
        )
        if division:
            archer_query = archer_query.where(Tournament_archers.division == division)
        
        archer_result = await self.db.execute(archer_query)
        archers = archer_result.scalars().all()

        leaderboard = []
        for archer in archers:
            # Get scores for this archer in this tournament
            score_query = select(
                func.coalesce(func.sum(Scores.score_value), 0).label("total_score"),
                func.count(Scores.id).label("targets_completed")
            ).where(
                Scores.tournament_id == tournament_id,
                Scores.archer_id == archer.id
            )
            if course_number is not None:
                score_query = score_query.where(Scores.course_number == course_number)
            score_result = await self.db.execute(score_query)
            score_row = score_result.one()

            leaderboard.append({
                "archer_id": archer.id,
                "archer_name": archer.archer_name,
                "division": archer.division or "",
                "group_number": archer.group_number,
                "target_number": archer.target_number,
                "total_score": int(score_row.total_score),
                "targets_completed": int(score_row.targets_completed),
            })

        # Sort by total_score descending
        leaderboard.sort(key=lambda x: x["total_score"], reverse=True)

        # Add rank
        for i, entry in enumerate(leaderboard):
            entry["rank"] = i + 1

        return leaderboard

    async def get_tournament_archers(self, tournament_id: int) -> List[Dict]:
        """Get all archers for a tournament"""
        query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id
        ).order_by(Tournament_archers.group_number, Tournament_archers.target_number)
        result = await self.db.execute(query)
        archers = result.scalars().all()
        return [self._archer_to_dict(a) for a in archers]

    async def register_archer(self, data: Dict[str, Any], user_id: str) -> Dict:
        """Register an archer to a tournament"""
        # Check for duplicate registration
        existing_query = select(Tournament_archers).where(
            Tournament_archers.user_id == user_id,
            Tournament_archers.tournament_id == data["tournament_id"],
        )
        existing_result = await self.db.execute(existing_query)
        existing = existing_result.scalar_one_or_none()
        if existing:
            raise ValueError("You are already registered for this tournament")

        archer = Tournament_archers(
            user_id=user_id,
            tournament_id=data["tournament_id"],
            archer_name=data["archer_name"],
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
            phone=data.get("phone"),
            division=data.get("division", ""),
            group_number=data.get("group_number"),
            target_number=data.get("target_number"),
            role=data.get("role", "archer"),
            purchased_mulligans=data.get("purchased_mulligans"),
        )
        self.db.add(archer)
        await self.db.commit()
        await self.db.refresh(archer)
        return self._archer_to_dict(archer)

    async def submit_score(self, data: Dict[str, Any], user_id: str) -> Dict:
        """Submit a score"""
        # Check if score already exists for this archer at this target (and course)
        existing_query = select(Scores).where(
            Scores.tournament_id == data["tournament_id"],
            Scores.archer_id == data["archer_id"],
            Scores.target_number == data["target_number"],
            Scores.course_number == data.get("course_number"),
        )
        existing_result = await self.db.execute(existing_query)
        existing = existing_result.scalar_one_or_none()

        if existing:
            existing.score_value = data["score_value"]
            existing.confirmed = data.get("confirmed", False)
            await self.db.commit()
            await self.db.refresh(existing)
            return self._score_to_dict(existing)

        score = Scores(
            user_id=user_id,
            tournament_id=data["tournament_id"],
            archer_id=data["archer_id"],
            target_number=data["target_number"],
            course_number=data.get("course_number"),
            score_value=data["score_value"],
            confirmed=data.get("confirmed", False),
        )
        self.db.add(score)
        await self.db.commit()
        await self.db.refresh(score)
        return self._score_to_dict(score)

    async def get_tournament_scores(self, tournament_id: int) -> List[Dict]:
        """Get all scores for a tournament"""
        query = select(Scores).where(
            Scores.tournament_id == tournament_id
        ).order_by(Scores.target_number, Scores.archer_id)
        result = await self.db.execute(query)
        scores = result.scalars().all()
        return [self._score_to_dict(s) for s in scores]

    async def update_score(self, score_id: int, data: Dict[str, Any]) -> Optional[Dict]:
        """Update a score (organizer)"""
        query = select(Scores).where(Scores.id == score_id)
        result = await self.db.execute(query)
        score = result.scalar_one_or_none()
        if not score:
            return None
        if "score_value" in data:
            score.score_value = data["score_value"]
        if "confirmed" in data:
            score.confirmed = data["confirmed"]
        await self.db.commit()
        await self.db.refresh(score)
        return self._score_to_dict(score)

    async def export_results(self, tournament_id: int) -> Dict:
        """Export tournament results"""
        tournament = await self.get_tournament_public(tournament_id)
        if not tournament:
            return None
        leaderboard = await self.get_leaderboard(tournament_id)
        scores = await self.get_tournament_scores(tournament_id)
        return {
            "tournament": tournament,
            "leaderboard": leaderboard,
            "scores": scores,
        }

    def _compute_status(self, date_str: str) -> str:
        """Compute tournament status based on date field.
        The date field may contain a pipe-separated range: 'start|end'.
        If no pipe, it's a single-day tournament (end = start)."""
        try:
            if not date_str:
                return "unknown"
            if "|" in date_str:
                parts = date_str.split("|")
                start_date = datetime.strptime(parts[0], "%Y-%m-%d").date()
                end_date = datetime.strptime(parts[1], "%Y-%m-%d").date()
            else:
                start_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                end_date = start_date
            today = date_type.today()
            if today >= start_date and today <= end_date:
                return "active"
            elif today < start_date:
                return "upcoming"
            else:
                return "completed"
        except (ValueError, TypeError):
            return "unknown"

    def _row_to_dict(self, row: Dict) -> Dict:
        """Convert a raw SQL row dict to a tournament response dict.
        The date field may contain 'start|end' for multi-day tournaments.
        We expose both 'date' (raw) and parsed 'start_date'/'end_date' for convenience."""
        created_at = row.get("created_at")
        updated_at = row.get("updated_at")
        date_raw = row.get("date") or ""
        if "|" in date_raw:
            parts = date_raw.split("|")
            start_date = parts[0]
            end_date = parts[1]
        else:
            start_date = date_raw
            end_date = date_raw
        return {
            "id": row.get("id"),
            "user_id": row.get("user_id"),
            "name": row.get("name"),
            "date": start_date,
            "end_date": end_date,
            "location": row.get("location", ""),
            "num_targets": row.get("num_targets"),
            "divisions": row.get("divisions"),
            "courses": row.get("courses"),
            "mulligans": row.get("mulligans"),
            "scoring_template_id": row.get("scoring_template_id"),
            "course_map_url": row.get("course_map_url"),
            "status": row.get("status"),
            "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at) if created_at else None,
            "updated_at": updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at) if updated_at else None,
        }

    def _tournament_to_dict(self, t: Tournaments) -> Dict:
        """Convert an ORM Tournament object to dict (used by non-raw queries).
        The date field may contain 'start|end' for multi-day tournaments."""
        date_raw = t.date or ""
        if "|" in date_raw:
            parts = date_raw.split("|")
            start_date = parts[0]
            end_date = parts[1]
        else:
            start_date = date_raw
            end_date = date_raw
        return {
            "id": t.id,
            "user_id": t.user_id,
            "name": t.name,
            "date": start_date,
            "end_date": end_date,
            "location": getattr(t, "location", None) or "",
            "num_targets": t.num_targets,
            "divisions": t.divisions,
            "courses": t.courses,
            "mulligans": t.mulligans,
            "scoring_template_id": getattr(t, "scoring_template_id", None),
            "course_map_url": getattr(t, "course_map_url", None),
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }

    def _archer_to_dict(self, a: Tournament_archers) -> Dict:
        return {
            "id": a.id,
            "user_id": a.user_id,
            "tournament_id": a.tournament_id,
            "archer_name": a.archer_name,
            "first_name": a.first_name,
            "last_name": a.last_name,
            "phone": a.phone,
            "division": a.division,
            "group_number": a.group_number,
            "target_number": a.target_number,
            "role": a.role,
            "purchased_mulligans": a.purchased_mulligans,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }

    def _score_to_dict(self, s: Scores) -> Dict:
        return {
            "id": s.id,
            "user_id": s.user_id,
            "tournament_id": s.tournament_id,
            "archer_id": s.archer_id,
            "target_number": s.target_number,
            "course_number": s.course_number,
            "score_value": s.score_value,
            "confirmed": s.confirmed,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }

    # ---------- My Tournaments (Archer) ----------

    async def get_my_tournaments(self, user_id: str) -> List[Dict]:
        """Get all tournaments the current user is registered for, with registration and score info."""
        # Get all registrations for this user
        archer_query = select(Tournament_archers).where(
            Tournament_archers.user_id == user_id
        ).order_by(Tournament_archers.created_at.desc())
        archer_result = await self.db.execute(archer_query)
        registrations = archer_result.scalars().all()

        results = []
        for reg in registrations:
            # Get tournament details
            cols = await self._get_tournament_columns()
            col_str = ", ".join(cols)
            t_query = text(f"SELECT {col_str} FROM tournaments WHERE id = :tid")
            t_result = await self.db.execute(t_query, {"tid": reg.tournament_id})
            t_row = t_result.mappings().first()

            if not t_row:
                continue

            tournament_dict = self._row_to_dict(dict(t_row))
            # _compute_status needs the raw date field (with pipe separator if multi-day)
            raw_date = dict(t_row).get("date") or ""
            tournament_dict["status"] = self._compute_status(raw_date)

            # Get score summary for this archer in this tournament
            score_query = select(
                func.coalesce(func.sum(Scores.score_value), 0).label("total_score"),
                func.count(Scores.id).label("targets_scored"),
            ).where(
                Scores.tournament_id == reg.tournament_id,
                Scores.archer_id == reg.id,
            )
            score_result = await self.db.execute(score_query)
            score_row = score_result.one()

            results.append({
                "tournament": tournament_dict,
                "registration": self._archer_to_dict(reg),
                "score_summary": {
                    "total_score": int(score_row.total_score),
                    "targets_scored": int(score_row.targets_scored),
                },
            })

        return results

    # ---------- Scoring Template Methods ----------

    async def create_scoring_template(self, data: Dict[str, Any], user_id: str) -> Dict:
        """Create a scoring template, optionally linked to a tournament"""
        template = Scoring_templates(
            user_id=user_id,
            tournament_id=data.get("tournament_id"),
            template_name=data["template_name"],
            score_values=data["score_values"],
            is_custom=data.get("is_custom", False),
        )
        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)
        return self._scoring_template_to_dict(template)

    async def get_scoring_templates_by_user(self, user_id: str) -> List[Dict]:
        """Get all scoring templates created by a user"""
        query = select(Scoring_templates).where(
            Scoring_templates.user_id == user_id
        ).order_by(Scoring_templates.created_at.desc())
        result = await self.db.execute(query)
        templates = result.scalars().all()
        return [self._scoring_template_to_dict(t) for t in templates]

    async def get_scoring_template_by_tournament(self, tournament_id: int) -> Optional[Dict]:
        """Get the scoring template for a tournament (returns the latest one)"""
        query = select(Scoring_templates).where(
            Scoring_templates.tournament_id == tournament_id
        ).order_by(Scoring_templates.created_at.desc())
        result = await self.db.execute(query)
        template = result.scalars().first()
        if not template:
            return None
        return self._scoring_template_to_dict(template)

    async def update_scoring_template(self, template_id: int, data: Dict[str, Any], user_id: str) -> Optional[Dict]:
        """Update a scoring template owned by the user"""
        query = select(Scoring_templates).where(
            Scoring_templates.id == template_id,
            Scoring_templates.user_id == user_id,
        )
        result = await self.db.execute(query)
        template = result.scalar_one_or_none()
        if not template:
            return None
        if "template_name" in data:
            template.template_name = data["template_name"]
        if "score_values" in data:
            template.score_values = data["score_values"]
        if "is_custom" in data:
            template.is_custom = data["is_custom"]
        if "tournament_id" in data:
            template.tournament_id = data["tournament_id"]
        await self.db.commit()
        await self.db.refresh(template)
        return self._scoring_template_to_dict(template)

    async def delete_scoring_template(self, template_id: int, user_id: str) -> bool:
        """Delete a scoring template owned by the user"""
        query = select(Scoring_templates).where(
            Scoring_templates.id == template_id,
            Scoring_templates.user_id == user_id,
        )
        result = await self.db.execute(query)
        template = result.scalar_one_or_none()
        if not template:
            return False
        await self.db.delete(template)
        await self.db.commit()
        return True

    async def delete_tournament(self, tournament_id: int, user_id: str) -> bool:
        """Delete a tournament owned by the user"""
        query = text("DELETE FROM tournaments WHERE id = :tid AND user_id = :uid")
        result = await self.db.execute(query, {"tid": tournament_id, "uid": user_id})
        await self.db.commit()
        return result.rowcount > 0

    async def update_tournament(self, tournament_id: int, data: Dict[str, Any], user_id: str) -> Optional[Dict]:
        """Update a tournament owned by the user"""
        has_location = await self._check_location_column()
        allowed_fields = ["name", "date", "num_targets", "divisions", "status", "courses", "mulligans", "scoring_template_id", "course_map_url"]
        if has_location:
            allowed_fields.append("location")
        set_parts = []
        params: Dict[str, Any] = {"tid": tournament_id, "uid": user_id}
        for field in allowed_fields:
            if field in data and data[field] is not None:
                set_parts.append(f"{field} = :{field}")
                params[field] = data[field]
        if not set_parts:
            return await self.get_tournament_public(tournament_id)
        set_parts.append("updated_at = NOW()")
        set_clause = ", ".join(set_parts)
        query = text(f"UPDATE tournaments SET {set_clause} WHERE id = :tid AND user_id = :uid")
        await self.db.execute(query, params)
        await self.db.commit()
        return await self.get_tournament_public(tournament_id)

    def _scoring_template_to_dict(self, t: Scoring_templates) -> Dict:
        return {
            "id": t.id,
            "user_id": t.user_id,
            "tournament_id": t.tournament_id,
            "template_name": t.template_name,
            "score_values": t.score_values,
            "is_custom": t.is_custom,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }