from sqlalchemy import Column, BigInteger, String, Enum, DateTime, Boolean, JSON, Integer
from app.database import Base
from datetime import datetime, UTC

class Playbook(Base):
    __tablename__ = "playbooks"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    trigger = Column(String(64), nullable=False)
    enabled = Column(Boolean, nullable=False, default=True)

class PlaybookStep(Base):
    __tablename__ = "playbook_steps"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    playbook_id = Column(BigInteger, nullable=False, index=True)
    type = Column(String(64), nullable=False)
    label = Column(String(255), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    config = Column(JSON, nullable=True)

class PlaybookRun(Base):
    __tablename__ = "playbook_runs"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    playbook_id = Column(BigInteger, nullable=False, index=True)
    status = Column(Enum("running", "success", "failed", name="pb_status"), nullable=False)
    started_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
    completed_at = Column(DateTime, nullable=True)
    logs = Column(JSON, nullable=True)
