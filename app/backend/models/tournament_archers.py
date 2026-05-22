from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Tournament_archers(Base):
    __tablename__ = "tournament_archers"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    tournament_id = Column(Integer, nullable=False)
    archer_name = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    division = Column(String, nullable=True)
    group_number = Column(Integer, nullable=True)
    group_name = Column(String, nullable=True)
    target_number = Column(Integer, nullable=True)
    role = Column(String, nullable=True)
    purchased_mulligans = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)