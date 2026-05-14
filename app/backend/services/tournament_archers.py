import logging
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.tournament_archers import Tournament_archers

logger = logging.getLogger(__name__)


# ------------------ Service Layer ------------------
class Tournament_archersService:
    """Service layer for Tournament_archers operations"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Tournament_archers]:
        """Create a new tournament_archers"""
        try:
            if user_id:
                data['user_id'] = user_id
            obj = Tournament_archers(**data)
            self.db.add(obj)
            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Created tournament_archers with id: {obj.id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error creating tournament_archers: {str(e)}")
            raise

    async def check_ownership(self, obj_id: int, user_id: str) -> bool:
        """Check if user owns this record"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            return obj is not None
        except Exception as e:
            logger.error(f"Error checking ownership for tournament_archers {obj_id}: {str(e)}")
            return False

    async def get_by_id(self, obj_id: int, user_id: Optional[str] = None) -> Optional[Tournament_archers]:
        """Get tournament_archers by ID (user can only see their own records)"""
        try:
            query = select(Tournament_archers).where(Tournament_archers.id == obj_id)
            if user_id:
                query = query.where(Tournament_archers.user_id == user_id)
            result = await self.db.execute(query)
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching tournament_archers {obj_id}: {str(e)}")
            raise

    async def get_list(
        self, 
        skip: int = 0, 
        limit: int = 20, 
        user_id: Optional[str] = None,
        query_dict: Optional[Dict[str, Any]] = None,
        sort: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get paginated list of tournament_archerss (user can only see their own records)"""
        try:
            query = select(Tournament_archers)
            count_query = select(func.count(Tournament_archers.id))
            
            if user_id:
                query = query.where(Tournament_archers.user_id == user_id)
                count_query = count_query.where(Tournament_archers.user_id == user_id)
            
            if query_dict:
                for field, value in query_dict.items():
                    if hasattr(Tournament_archers, field):
                        query = query.where(getattr(Tournament_archers, field) == value)
                        count_query = count_query.where(getattr(Tournament_archers, field) == value)
            
            count_result = await self.db.execute(count_query)
            total = count_result.scalar()

            if sort:
                if sort.startswith('-'):
                    field_name = sort[1:]
                    if hasattr(Tournament_archers, field_name):
                        query = query.order_by(getattr(Tournament_archers, field_name).desc())
                else:
                    if hasattr(Tournament_archers, sort):
                        query = query.order_by(getattr(Tournament_archers, sort))
            else:
                query = query.order_by(Tournament_archers.id.desc())

            result = await self.db.execute(query.offset(skip).limit(limit))
            items = result.scalars().all()

            return {
                "items": items,
                "total": total,
                "skip": skip,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error fetching tournament_archers list: {str(e)}")
            raise

    async def update(self, obj_id: int, update_data: Dict[str, Any], user_id: Optional[str] = None) -> Optional[Tournament_archers]:
        """Update tournament_archers (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Tournament_archers {obj_id} not found for update")
                return None
            for key, value in update_data.items():
                if hasattr(obj, key) and key != 'user_id':
                    setattr(obj, key, value)

            await self.db.commit()
            await self.db.refresh(obj)
            logger.info(f"Updated tournament_archers {obj_id}")
            return obj
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating tournament_archers {obj_id}: {str(e)}")
            raise

    async def delete(self, obj_id: int, user_id: Optional[str] = None) -> bool:
        """Delete tournament_archers (requires ownership)"""
        try:
            obj = await self.get_by_id(obj_id, user_id=user_id)
            if not obj:
                logger.warning(f"Tournament_archers {obj_id} not found for deletion")
                return False
            await self.db.delete(obj)
            await self.db.commit()
            logger.info(f"Deleted tournament_archers {obj_id}")
            return True
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error deleting tournament_archers {obj_id}: {str(e)}")
            raise

    async def get_by_field(self, field_name: str, field_value: Any) -> Optional[Tournament_archers]:
        """Get tournament_archers by any field"""
        try:
            if not hasattr(Tournament_archers, field_name):
                raise ValueError(f"Field {field_name} does not exist on Tournament_archers")
            result = await self.db.execute(
                select(Tournament_archers).where(getattr(Tournament_archers, field_name) == field_value)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching tournament_archers by {field_name}: {str(e)}")
            raise

    async def list_by_field(
        self, field_name: str, field_value: Any, skip: int = 0, limit: int = 20
    ) -> List[Tournament_archers]:
        """Get list of tournament_archerss filtered by field"""
        try:
            if not hasattr(Tournament_archers, field_name):
                raise ValueError(f"Field {field_name} does not exist on Tournament_archers")
            result = await self.db.execute(
                select(Tournament_archers)
                .where(getattr(Tournament_archers, field_name) == field_value)
                .offset(skip)
                .limit(limit)
                .order_by(Tournament_archers.id.desc())
            )
            return result.scalars().all()
        except Exception as e:
            logger.error(f"Error fetching tournament_archerss by {field_name}: {str(e)}")
            raise