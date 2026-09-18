# app/models/audit_log.py
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False)     # analyst, ai, soar, system, human_hitl
    action: Mapped[str] = mapped_column(String(50), nullable=False)     # kill_process, block_ip, create_case, log_only
    actor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    case_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    alert_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    agent_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
