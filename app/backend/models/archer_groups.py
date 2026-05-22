from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Archer_groups(Base):
    __tablename__ = "archer_groups"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    tournament_id = Column(Integer, nullable=False)
    group_name = Column(String, nullable=False)
    group_number = Column(Integer, nullable=False)
    shooting_order_mode = Column(String, nullable=True)
    creator_id = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)