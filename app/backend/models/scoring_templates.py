from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Scoring_templates(Base):
    __tablename__ = "scoring_templates"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    tournament_id = Column(Integer, nullable=False)
    template_name = Column(String, nullable=False)
    score_values = Column(String, nullable=False)
    is_custom = Column(Boolean, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)