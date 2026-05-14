from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Scores(Base):
    __tablename__ = "scores"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    tournament_id = Column(Integer, nullable=False)
    archer_id = Column(Integer, nullable=False)
    target_number = Column(Integer, nullable=False)
    course_number = Column(Integer, nullable=True)
    score_value = Column(Integer, nullable=False)
    confirmed = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)