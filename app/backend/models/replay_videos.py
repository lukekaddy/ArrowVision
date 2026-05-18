from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Replay_videos(Base):
    __tablename__ = "replay_videos"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    tournament_id = Column(Integer, nullable=False)
    archer_id = Column(Integer, nullable=False)
    course_number = Column(Integer, nullable=False)
    target_number = Column(Integer, nullable=False)
    object_key = Column(String, nullable=False)
    visibility = Column(String, nullable=True, default='public', server_default='public')
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)