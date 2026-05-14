import logging
from datetime import date as date_type, datetime
from typing import Optional, Dict, Any, List
from sqlalchemy import select, func, case, desc
from sqlalchemy.ext.asyncio import AsyncSession
from models.tournaments import Tournaments
from models.tournament_archers import Tournament_archers
from models.scores import Scores

logger = logging.getLogger(__name__)


class TournamentOpsService:
    """Service for cross-user tournament operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_public_tournaments(self, skip: int = 0, limit: int = 50) -> Dict[str, Any]:
        """Get all tournaments (public) with computed status based on date"""
        query = select(Tournaments).order_by(desc(Tournaments.created_at)).offset(skip).limit(limit)
        result = await self.db.execute(query)
        items = result.scalars().all()

        count_query = select(func.count()).select_from(Tournaments)
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        tournament_list = []
        for t in items:
            t_dict = self._tournament_to_dict(t)
            t_dict["status"] = self._compute_status(t.date)
            tournament_list.append(t_dict)

        return {
            "items": tournament_list,
            "total": total
        }

    async def get_tournament_public(self, tournament_id: int) -> Optional[Dict]:
        """Get public tournament details"""
        query = select(Tournaments).where(Tournaments.id == tournament_id)
        result = await self.db.execute(query)
        tournament = result.scalar_one_or_none()
        if not tournament:
            return None
        return self._tournament_to_dict(tournament)

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
        """Compute tournament status based on date comparison to today"""
        try:
            tournament_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            today = date_type.today()
            if tournament_date == today:
                return "active"
            elif tournament_date > today:
                return "upcoming"
            else:
                return "completed"
        except (ValueError, TypeError):
            return "unknown"

    def _tournament_to_dict(self, t: Tournaments) -> Dict:
        return {
            "id": t.id,
            "user_id": t.user_id,
            "name": t.name,
            "date": t.date,
            "num_targets": t.num_targets,
            "divisions": t.divisions,
            "courses": t.courses,
            "mulligans": t.mulligans,
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