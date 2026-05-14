import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.tournament_ops import TournamentOpsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tournament", tags=["tournament-ops"])


# ---------- Pydantic Schemas ----------
class RegisterArcherRequest(BaseModel):
    tournament_id: int
    archer_name: str
    division: str = ""
    role: str = "archer"
    group_number: Optional[int] = None
    target_number: Optional[int] = None


class SubmitScoreRequest(BaseModel):
    tournament_id: int
    archer_id: int
    target_number: int
    score_value: int
    confirmed: bool = False
    course_number: Optional[int] = None


class UpdateScoreRequest(BaseModel):
    score_value: Optional[int] = None
    confirmed: Optional[bool] = None


# ---------- Public Routes (no auth) ----------
@router.get("/public-list")
async def get_public_tournaments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List all active/completed tournaments (public)"""
    service = TournamentOpsService(db)
    try:
        return await service.get_public_tournaments(skip=skip, limit=limit)
    except Exception as e:
        logger.error(f"Error fetching public tournaments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/{tournament_id}")
async def get_tournament_public(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get public tournament details"""
    service = TournamentOpsService(db)
    try:
        result = await service.get_tournament_public(tournament_id)
        if not result:
            raise HTTPException(status_code=404, detail="Tournament not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching tournament: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/leaderboard/{tournament_id}")
async def get_leaderboard(
    tournament_id: int,
    division: Optional[str] = Query(None),
    course_number: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get leaderboard for a tournament (public)"""
    service = TournamentOpsService(db)
    try:
        return await service.get_leaderboard(tournament_id, division=division, course_number=course_number)
    except Exception as e:
        logger.error(f"Error fetching leaderboard: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Authenticated Routes ----------
@router.get("/archers/{tournament_id}")
async def get_tournament_archers(
    tournament_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all archers for a tournament"""
    service = TournamentOpsService(db)
    try:
        return await service.get_tournament_archers(tournament_id)
    except Exception as e:
        logger.error(f"Error fetching archers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/register-archer")
async def register_archer(
    data: RegisterArcherRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register an archer to a tournament"""
    service = TournamentOpsService(db)
    try:
        return await service.register_archer(data.model_dump(), user_id=str(current_user.id))
    except Exception as e:
        logger.error(f"Error registering archer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/submit-score")
async def submit_score(
    data: SubmitScoreRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a score for an archer"""
    service = TournamentOpsService(db)
    try:
        return await service.submit_score(data.model_dump(), user_id=str(current_user.id))
    except Exception as e:
        logger.error(f"Error submitting score: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scores/{tournament_id}")
async def get_tournament_scores(
    tournament_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all scores for a tournament"""
    service = TournamentOpsService(db)
    try:
        return await service.get_tournament_scores(tournament_id)
    except Exception as e:
        logger.error(f"Error fetching scores: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/update-score/{score_id}")
async def update_score(
    score_id: int,
    data: UpdateScoreRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a score (organizer dispute resolution)"""
    service = TournamentOpsService(db)
    try:
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update_score(score_id, update_data)
        if not result:
            raise HTTPException(status_code=404, detail="Score not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating score: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export-results/{tournament_id}")
async def export_results(
    tournament_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export tournament results"""
    service = TournamentOpsService(db)
    try:
        result = await service.export_results(tournament_id)
        if not result:
            raise HTTPException(status_code=404, detail="Tournament not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting results: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))