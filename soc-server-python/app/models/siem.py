from sqlalchemy import Column, BigInteger, String, DateTime, Text, JSON
from app.database import Base
from datetime import datetime, UTC

class LogEvent(Base):
    __tablename__ = "log_events"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    occurred_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC), index=True)
    host = Column(String(128), nullable=True)
    source = Column(String(64), nullable=False, index=True)
    level = Column(String(32), nullable=False, index=True)
    user = Column(String(64), nullable=True)
    ip = Column(String(45), nullable=True)
    message = Column(Text, nullable=False)
    raw = Column(JSON, nullable=True)
