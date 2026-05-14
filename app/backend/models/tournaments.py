from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Tournaments(Base):
    __tablename__ = "tournaments"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    date = Column(String, nullable=True)
    num_targets = Column(Integer, nullable=True)
    divisions = Column(String, nullable=True)
    status = Column(String, nullable=True)
    courses = Column(String, nullable=True)
    mulligans = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)