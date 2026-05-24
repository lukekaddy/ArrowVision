import logging
import random
import string
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from models.archer_groups import Archer_groups
from models.tournament_archers import Tournament_archers
from models.tournaments import Tournaments
from models.scores import Scores

logger = logging.getLogger(__name__)


class GroupOpsService:
    """Service for archer group management operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ---------- Helper Methods ----------

    async def _generate_invite_code(self) -> str:
        """Generate a unique 6-character uppercase alphanumeric invite code."""
        chars = string.ascii_uppercase + string.digits
        for _ in range(100):  # max attempts to find unique code
            code = ''.join(random.choices(chars, k=6))
            existing = await self.db.execute(
                select(Archer_groups).where(Archer_groups.invite_code == code)
            )
            if not existing.scalar_one_or_none():
                return code
        # Fallback: extremely unlikely to reach here
        return ''.join(random.choices(chars, k=8))

    async def _check_tournament_locked(self, tournament_id: int) -> bool:
        """Check if a tournament has already started (time-locked).
        Returns True if the tournament is locked (past start time).
        """
        tournament = await self._get_tournament(tournament_id)
        if not tournament:
            return False  # Let other validation handle missing tournament

        if not tournament.date:
            return False

        try:
            # Parse date (expected format: YYYY-MM-DD)
            tournament_date = datetime.strptime(tournament.date, "%Y-%m-%d")

            # Parse start_time if available (expected format: HH:MM)
            if tournament.start_time:
                try:
                    parts = tournament.start_time.split(":")
                    tournament_date = tournament_date.replace(
                        hour=int(parts[0]), minute=int(parts[1])
                    )
                except (ValueError, IndexError):
                    pass

            # Make timezone-aware (UTC)
            tournament_date = tournament_date.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            return now > tournament_date
        except (ValueError, TypeError):
            return False

    async def _get_tournament(self, tournament_id: int) -> Optional[Tournaments]:
        """Load a tournament by ID."""
        result = await self.db.execute(
            select(Tournaments).where(Tournaments.id == tournament_id)
        )
        return result.scalar_one_or_none()

    async def _get_max_group_size(self, tournament_id: int) -> int:
        """Get the max group size for a tournament (default 4)."""
        tournament = await self._get_tournament(tournament_id)
        if tournament and tournament.max_group_size:
            return tournament.max_group_size
        return 4

    async def _get_group_member_count(self, tournament_id: int, group_number: int) -> int:
        """Count current members in a group."""
        result = await self.db.execute(
            select(func.count(Tournament_archers.id)).where(
                Tournament_archers.tournament_id == tournament_id,
                Tournament_archers.group_number == group_number,
            )
        )
        return result.scalar() or 0

    # ---------- Main Methods ----------

    async def create_group(
        self,
        tournament_id: int,
        creator_id: str,
        member_ids: List[int],
        group_name: Optional[str] = None,
        shooting_order_mode: str = "round_robin",
        visibility: str = "public",
    ) -> Dict[str, Any]:
        """Create a new archer group for a tournament."""
        # Check time-lock
        if await self._check_tournament_locked(tournament_id):
            return {"success": False, "message": "Tournament has already started. Cannot create groups."}

        # Get max group size
        max_size = await self._get_max_group_size(tournament_id)

        # Get next available group_number for this tournament
        max_query = select(func.max(Archer_groups.group_number)).where(
            Archer_groups.tournament_id == tournament_id
        )
        result = await self.db.execute(max_query)
        max_num = result.scalar()
        group_number = (max_num or 0) + 1

        # Default group name
        if not group_name:
            group_name = f"Group #{group_number}"

        # Generate unique invite code
        invite_code = await self._generate_invite_code()

        # Create the archer_groups record
        group = Archer_groups(
            tournament_id=tournament_id,
            group_name=group_name,
            group_number=group_number,
            shooting_order_mode=shooting_order_mode,
            creator_id=creator_id,
            visibility=visibility,
            invite_code=invite_code,
        )
        self.db.add(group)
        await self.db.flush()

        # Find creator's registration and include it
        creator_reg_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.user_id == creator_id,
        )
        creator_reg_result = await self.db.execute(creator_reg_query)
        creator_reg = creator_reg_result.scalar_one_or_none()

        # Collect all member IDs to update (creator + selected members)
        all_member_ids = list(set(member_ids))
        if creator_reg and creator_reg.id not in all_member_ids:
            all_member_ids.append(creator_reg.id)

        # Enforce max group size on initial members
        if len(all_member_ids) > max_size:
            all_member_ids = all_member_ids[:max_size]

        # Update tournament_archers rows for all members
        members = []
        if all_member_ids:
            members_query = select(Tournament_archers).where(
                Tournament_archers.id.in_(all_member_ids),
                Tournament_archers.tournament_id == tournament_id,
            )
            members_result = await self.db.execute(members_query)
            member_rows = members_result.scalars().all()

            for member in member_rows:
                member.group_number = group_number
                member.group_name = group_name
                members.append(self._archer_to_dict(member))

        await self.db.commit()
        await self.db.refresh(group)

        return {
            "success": True,
            "group": self._group_to_dict(group),
            "members": members,
        }

    async def get_my_groups(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all groups the current user belongs to across all tournaments."""
        # Find all tournament_archers registrations for this user that have a group_number
        reg_query = select(Tournament_archers).where(
            Tournament_archers.user_id == user_id,
            Tournament_archers.group_number.isnot(None),
        )
        reg_result = await self.db.execute(reg_query)
        registrations = reg_result.scalars().all()

        result = []
        for reg in registrations:
            # Get the group record
            group_query = select(Archer_groups).where(
                Archer_groups.tournament_id == reg.tournament_id,
                Archer_groups.group_number == reg.group_number,
            )
            group_result = await self.db.execute(group_query)
            group = group_result.scalar_one_or_none()

            if not group:
                continue

            # Get tournament info
            tournament_query = select(Tournaments).where(Tournaments.id == reg.tournament_id)
            tournament_result = await self.db.execute(tournament_query)
            tournament = tournament_result.scalar_one_or_none()

            # Get all members of this group
            members_query = select(Tournament_archers).where(
                Tournament_archers.tournament_id == reg.tournament_id,
                Tournament_archers.group_number == reg.group_number,
            ).order_by(Tournament_archers.id)
            members_result = await self.db.execute(members_query)
            members = members_result.scalars().all()

            result.append({
                "group": self._group_to_dict(group),
                "members": [self._archer_to_dict(m) for m in members],
                "tournament": {
                    "id": tournament.id,
                    "name": tournament.name,
                    "date": tournament.date,
                    "location": tournament.location,
                } if tournament else {"id": reg.tournament_id, "name": "Unknown Tournament", "date": None, "location": None},
            })

        return result

    async def join_group(
        self,
        tournament_id: int,
        group_id: int,
        user_id: str,
    ) -> Dict[str, Any]:
        """Join an existing group in a tournament."""
        # Check time-lock
        if await self._check_tournament_locked(tournament_id):
            return {"success": False, "message": "Tournament has already started. Cannot join groups."}

        # Validate user is registered for the tournament
        reg_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.user_id == user_id,
        )
        reg_result = await self.db.execute(reg_query)
        registration = reg_result.scalar_one_or_none()

        if not registration:
            return {"success": False, "message": "Not registered for this tournament"}

        # Validate user is not already in a group
        if registration.group_number is not None:
            return {"success": False, "message": "Already in a group for this tournament"}

        # Validate the target group exists
        group_query = select(Archer_groups).where(
            Archer_groups.id == group_id,
            Archer_groups.tournament_id == tournament_id,
        )
        group_result = await self.db.execute(group_query)
        group = group_result.scalar_one_or_none()

        if not group:
            return {"success": False, "message": "Group not found"}

        # Check max group size
        max_size = await self._get_max_group_size(tournament_id)
        current_count = await self._get_group_member_count(tournament_id, group.group_number)
        if current_count >= max_size:
            return {"success": False, "message": f"Group is full (max {max_size} members)"}

        # Update the user's registration with the group info
        registration.group_number = group.group_number
        registration.group_name = group.group_name

        await self.db.commit()
        await self.db.refresh(registration)

        # Get all members of the group
        members_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.group_number == group.group_number,
        ).order_by(Tournament_archers.id)
        members_result = await self.db.execute(members_query)
        members = members_result.scalars().all()

        return {
            "success": True,
            "group": self._group_to_dict(group),
            "members": [self._archer_to_dict(m) for m in members],
        }

    async def join_by_code(
        self,
        tournament_id: int,
        invite_code: str,
        user_id: str,
    ) -> Dict[str, Any]:
        """Join a group using an invite code."""
        # Check time-lock
        if await self._check_tournament_locked(tournament_id):
            return {"success": False, "message": "Tournament has already started. Cannot join groups."}

        # Find the group by invite_code and tournament_id
        group_query = select(Archer_groups).where(
            Archer_groups.tournament_id == tournament_id,
            Archer_groups.invite_code == invite_code.upper(),
        )
        group_result = await self.db.execute(group_query)
        group = group_result.scalar_one_or_none()

        if not group:
            return {"success": False, "message": "Invalid invite code for this tournament"}

        # Validate user is registered for the tournament
        reg_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.user_id == user_id,
        )
        reg_result = await self.db.execute(reg_query)
        registration = reg_result.scalar_one_or_none()

        if not registration:
            return {"success": False, "message": "Not registered for this tournament"}

        # Validate user is not already in a group
        if registration.group_number is not None:
            return {"success": False, "message": "Already in a group for this tournament"}

        # Check max group size
        max_size = await self._get_max_group_size(tournament_id)
        current_count = await self._get_group_member_count(tournament_id, group.group_number)
        if current_count >= max_size:
            return {"success": False, "message": f"Group is full (max {max_size} members)"}

        # Assign user to the group
        registration.group_number = group.group_number
        registration.group_name = group.group_name

        await self.db.commit()
        await self.db.refresh(registration)

        # Get all members of the group
        members_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.group_number == group.group_number,
        ).order_by(Tournament_archers.id)
        members_result = await self.db.execute(members_query)
        members = members_result.scalars().all()

        return {
            "success": True,
            "group": self._group_to_dict(group),
            "members": [self._archer_to_dict(m) for m in members],
        }

    async def dissolve_group(
        self,
        tournament_id: int,
        group_id: int,
        user_id: str,
    ) -> Dict[str, Any]:
        """Dissolve a group (owner only). Clears all members and deletes the group record."""
        # Check time-lock
        if await self._check_tournament_locked(tournament_id):
            return {"success": False, "message": "Tournament has already started. Cannot dissolve groups."}

        # Validate the group exists and user is the creator
        group_query = select(Archer_groups).where(
            Archer_groups.id == group_id,
            Archer_groups.tournament_id == tournament_id,
        )
        group_result = await self.db.execute(group_query)
        group = group_result.scalar_one_or_none()

        if not group:
            return {"success": False, "message": "Group not found"}

        if group.creator_id != user_id:
            return {"success": False, "message": "Only the group creator can dissolve the group"}

        # Clear all members' group fields
        members_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.group_number == group.group_number,
        )
        members_result = await self.db.execute(members_query)
        member_rows = members_result.scalars().all()

        for member in member_rows:
            member.group_number = None
            member.group_name = None

        # Delete the archer_groups record
        await self.db.delete(group)
        await self.db.commit()

        return {"success": True, "message": "Group dissolved successfully"}

    async def find_public_groups(self, tournament_id: int) -> List[Dict[str, Any]]:
        """Find public groups for a tournament that have available space."""
        max_size = await self._get_max_group_size(tournament_id)

        # Get all public groups for this tournament
        groups_query = select(Archer_groups).where(
            Archer_groups.tournament_id == tournament_id,
            Archer_groups.visibility == "public",
        ).order_by(Archer_groups.group_number)
        groups_result = await self.db.execute(groups_query)
        groups = groups_result.scalars().all()

        result = []
        for group in groups:
            # Count members
            member_count = await self._get_group_member_count(tournament_id, group.group_number)

            # Only include groups with available space
            if member_count < max_size:
                # Get members
                members_query = select(Tournament_archers).where(
                    Tournament_archers.tournament_id == tournament_id,
                    Tournament_archers.group_number == group.group_number,
                ).order_by(Tournament_archers.id)
                members_result = await self.db.execute(members_query)
                members = members_result.scalars().all()

                result.append({
                    "group": self._group_to_dict(group),
                    "members": [self._archer_to_dict(m) for m in members],
                    "member_count": member_count,
                    "max_size": max_size,
                    "available_spots": max_size - member_count,
                })

        return result

    async def get_tournament_groups(self, tournament_id: int) -> List[Dict[str, Any]]:
        """Get all groups for a tournament with their members."""
        groups_query = select(Archer_groups).where(
            Archer_groups.tournament_id == tournament_id
        ).order_by(Archer_groups.group_number)
        groups_result = await self.db.execute(groups_query)
        groups = groups_result.scalars().all()

        result = []
        for group in groups:
            # Get members of this group
            members_query = select(Tournament_archers).where(
                Tournament_archers.tournament_id == tournament_id,
                Tournament_archers.group_number == group.group_number,
            ).order_by(Tournament_archers.id)
            members_result = await self.db.execute(members_query)
            members = members_result.scalars().all()

            result.append({
                "group": self._group_to_dict(group),
                "members": [self._archer_to_dict(m) for m in members],
            })

        return result

    async def get_ungrouped_archers(self, tournament_id: int) -> List[Dict[str, Any]]:
        """Get archers in a tournament who are not assigned to any group."""
        query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.group_number.is_(None),
        ).order_by(Tournament_archers.id)
        result = await self.db.execute(query)
        archers = result.scalars().all()
        return [self._archer_to_dict(a) for a in archers]

    async def leave_group(self, tournament_id: int, user_id: str) -> Dict[str, Any]:
        """Remove a user from their group in a tournament."""
        # Check time-lock
        if await self._check_tournament_locked(tournament_id):
            return {"success": False, "message": "Tournament has already started. Cannot leave groups."}

        # Find user's registration
        reg_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.user_id == user_id,
        )
        reg_result = await self.db.execute(reg_query)
        registration = reg_result.scalar_one_or_none()

        if not registration:
            return {"success": False, "message": "Registration not found"}

        if registration.group_number is None:
            return {"success": False, "message": "Not in a group"}

        group_number = registration.group_number

        # Clear group assignment
        registration.group_number = None
        registration.group_name = None

        # Check remaining members in the group
        remaining_query = select(func.count(Tournament_archers.id)).where(
            Tournament_archers.tournament_id == tournament_id,
            Tournament_archers.group_number == group_number,
            Tournament_archers.id != registration.id,
        )
        remaining_result = await self.db.execute(remaining_query)
        remaining_count = remaining_result.scalar() or 0

        # If no members remain, delete the archer_groups record
        if remaining_count == 0:
            delete_query = delete(Archer_groups).where(
                Archer_groups.tournament_id == tournament_id,
                Archer_groups.group_number == group_number,
            )
            await self.db.execute(delete_query)

        await self.db.commit()
        return {"success": True, "message": "Left group successfully"}

    async def get_shooting_order(
        self, group_id: int, target_number: int = 1
    ) -> Dict[str, Any]:
        """Get the shooting order for a group at a specific target."""
        # Get the group
        group_query = select(Archer_groups).where(Archer_groups.id == group_id)
        group_result = await self.db.execute(group_query)
        group = group_result.scalar_one_or_none()

        if not group:
            return {"error": "Group not found", "order": []}

        # Get members ordered by registration id
        members_query = select(Tournament_archers).where(
            Tournament_archers.tournament_id == group.tournament_id,
            Tournament_archers.group_number == group.group_number,
        ).order_by(Tournament_archers.id)
        members_result = await self.db.execute(members_query)
        members = members_result.scalars().all()

        if not members:
            return {"shooting_order_mode": group.shooting_order_mode, "order": []}

        mode = group.shooting_order_mode or "sequential"
        # Normalize legacy "round_robin" to "sequential"
        if mode == "round_robin":
            mode = "sequential"
        ordered_members = []

        if mode == "sequential":
            # Fixed order every target - same order (by registration id)
            ordered_members = list(members)

        elif mode == "random":
            # Deterministic random based on group_id + target_number
            # Uses a consistent seed so all group members see the same order
            seed = group_id * 10000 + target_number * 7
            ordered_members = list(members)
            rng = random.Random(seed)
            rng.shuffle(ordered_members)

        else:
            # Default to sequential (fixed order)
            ordered_members = list(members)

        return {
            "shooting_order_mode": mode,
            "target_number": target_number,
            "order": [
                {
                    "position": i + 1,
                    "archer_id": m.id,
                    "archer_name": m.archer_name,
                    "first_name": m.first_name,
                    "last_name": m.last_name,
                }
                for i, m in enumerate(ordered_members)
            ],
        }

    async def update_shooting_order_mode(
        self, group_id: int, shooting_order_mode: str, user_id: str
    ) -> Dict[str, Any]:
        """Update the shooting order mode for a group (creator only)."""
        group_query = select(Archer_groups).where(Archer_groups.id == group_id)
        group_result = await self.db.execute(group_query)
        group = group_result.scalar_one_or_none()

        if not group:
            return {"success": False, "message": "Group not found"}

        if group.creator_id != user_id:
            return {"success": False, "message": "Only the group creator can update shooting order mode"}

        group.shooting_order_mode = shooting_order_mode
        await self.db.commit()
        await self.db.refresh(group)

        return {"success": True, "group": self._group_to_dict(group)}

    # ---------- Dict Helpers ----------

    def _group_to_dict(self, g: Archer_groups) -> Dict:
        return {
            "id": g.id,
            "tournament_id": g.tournament_id,
            "group_name": g.group_name,
            "group_number": g.group_number,
            "shooting_order_mode": g.shooting_order_mode,
            "creator_id": g.creator_id,
            "visibility": g.visibility,
            "invite_code": g.invite_code,
            "created_at": g.created_at.isoformat() if g.created_at else None,
            "updated_at": g.updated_at.isoformat() if g.updated_at else None,
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
            "group_name": a.group_name,
            "target_number": a.target_number,
            "role": a.role,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }