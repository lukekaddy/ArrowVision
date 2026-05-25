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
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    division: str = ""
    role: str = "archer"
    group_number: Optional[int] = None
    target_number: Optional[int] = None
    purchased_mulligans: Optional[str] = None


class CreateScorecardRequest(BaseModel):
    tournament_id: Optional[int] = None
    template_name: str
    score_values: List[int]
    is_custom: bool = False


class UpdateScorecardRequest(BaseModel):
    tournament_id: Optional[int] = None
    template_name: Optional[str] = None
    score_values: Optional[List[int]] = None
    is_custom: Optional[bool] = None


class UpdateTournamentRequest(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    location: Optional[str] = None
    num_targets: Optional[int] = None
    divisions: Optional[str] = None
    status: Optional[str] = None
    courses: Optional[str] = None
    mulligans: Optional[str] = None
    scoring_template_id: Optional[int] = None
    course_map_url: Optional[str] = None


class CreateTournamentRequest(BaseModel):
    name: str
    date: str
    start_time: Optional[str] = None
    location: Optional[str] = None
    num_targets: Optional[int] = None
    divisions: Optional[str] = None
    status: Optional[str] = "auto"
    courses: Optional[str] = None
    mulligans: Optional[str] = None
    scoring_template_id: Optional[int] = None
    course_map_url: Optional[str] = None
    max_group_size: Optional[int] = 4


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
@router.get("/public-tournaments")
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


@router.get("/leaderboard")
async def get_leaderboard_query(
    tournament_id: int = Query(...),
    division: Optional[str] = Query(None),
    course_number: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get leaderboard for a tournament via query param (public)"""
    service = TournamentOpsService(db)
    try:
        return await service.get_leaderboard(tournament_id, division=division, course_number=course_number)
    except Exception as e:
        logger.error(f"Error fetching leaderboard: {e}", exc_info=True)
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
@router.post("/create")
async def create_tournament(
    data: CreateTournamentRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tournament using Supabase session context"""
    service = TournamentOpsService(db)
    try:
        result = await service.create_tournament(data.model_dump(), user_id=str(current_user.id))
        return {"id": result["id"], "data": result}
    except Exception as e:
        logger.error(f"Error creating tournament: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{tournament_id}")
async def delete_tournament(
    tournament_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a tournament (owner only)"""
    service = TournamentOpsService(db)
    try:
        success = await service.delete_tournament(tournament_id, user_id=str(current_user.id))
        if not success:
            raise HTTPException(status_code=404, detail="Tournament not found or not owned by user")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting tournament: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/update/{tournament_id}")
async def update_tournament(
    tournament_id: int,
    data: UpdateTournamentRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a tournament (owner only)"""
    service = TournamentOpsService(db)
    try:
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update_tournament(tournament_id, update_data, user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=404, detail="Tournament not found or not owned by user")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating tournament: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-tournaments")
async def get_my_tournaments(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all tournaments the current authenticated user is registered for,
    along with registration details and score summaries."""
    service = TournamentOpsService(db)
    try:
        return await service.get_my_tournaments(user_id=str(current_user.id))
    except Exception as e:
        logger.error(f"Error fetching user's tournaments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/archers/{tournament_id}")
async def get_tournament_archers(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get all archers for a tournament (public - needed for scorecard viewing)"""
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
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
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


@router.get("/scores")
async def get_scores_by_query(
    tournament_id: int = Query(...),
    archer_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get scores for a tournament, optionally filtered by archer name (public)"""
    service = TournamentOpsService(db)
    try:
        scores = await service.get_tournament_scores_filtered(tournament_id, archer_name=archer_name)
        return {"items": scores}
    except Exception as e:
        logger.error(f"Error fetching scores: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scores/{tournament_id}")
async def get_tournament_scores(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get all scores for a tournament (public - needed for scorecard/leaderboard viewing)"""
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


# ---------- Scorecard Template Routes ----------
@router.post("/create-scorecard")
async def create_scorecard(
    data: CreateScorecardRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a scoring template for a tournament"""
    service = TournamentOpsService(db)
    try:
        import json
        template_data = {
            "tournament_id": data.tournament_id,
            "template_name": data.template_name,
            "score_values": json.dumps(data.score_values),
            "is_custom": data.is_custom,
        }
        return await service.create_scoring_template(template_data, user_id=str(current_user.id))
    except Exception as e:
        logger.error(f"Error creating scorecard template: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scoring-templates")
async def get_scoring_templates(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all scoring templates for the current user"""
    service = TournamentOpsService(db)
    try:
        return await service.get_scoring_templates_by_user(user_id=str(current_user.id))
    except Exception as e:
        logger.error(f"Error fetching scoring templates: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/update-scorecard/{template_id}")
async def update_scorecard(
    template_id: int,
    data: UpdateScorecardRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a scoring template"""
    service = TournamentOpsService(db)
    try:
        import json
        update_data = {}
        if data.template_name is not None:
            update_data["template_name"] = data.template_name
        if data.score_values is not None:
            update_data["score_values"] = json.dumps(data.score_values)
        if data.is_custom is not None:
            update_data["is_custom"] = data.is_custom
        if data.tournament_id is not None:
            update_data["tournament_id"] = data.tournament_id

        result = await service.update_scoring_template(template_id, update_data, user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=404, detail="Scorecard template not found or not owned by user")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating scorecard template: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete-scorecard/{template_id}")
async def delete_scorecard(
    template_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a scoring template"""
    service = TournamentOpsService(db)
    try:
        success = await service.delete_scoring_template(template_id, user_id=str(current_user.id))
        if not success:
            raise HTTPException(status_code=404, detail="Scorecard template not found or not owned by user")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting scorecard template: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scorecard-template/{tournament_id}")
async def get_scorecard_template(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get the scoring template for a tournament (public). Returns null if none exists."""
    service = TournamentOpsService(db)
    try:
        result = await service.get_scoring_template_by_tournament(tournament_id)
        # Return null instead of 404 to avoid SDK error notifications in the frontend
        return result
    except Exception as e:
        logger.error(f"Error fetching scorecard template: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))