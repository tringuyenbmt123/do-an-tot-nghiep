# ==============================================================================
# app/models/audit_log.py - SQLAlchemy Model: AuditLog
# Tương đương: internal/models/audit_log.go
# ==============================================================================

import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, DateTime, Text, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, index=True)     # analyst, ai, soar, system, human_hitl
    action_taken: Mapped[str] = mapped_column(String(50), nullable=False)           # kill_process, block_ip, create_case, log_only
    confidence: Mapped[float] = mapped_column(Numeric(5, 4), default=0.0)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    payload_summary: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)     # JSON payload
    related_alert_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    related_case_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    related_agent_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Backward compatibility properties
    @property
    def action(self) -> str:
        return self.action_taken

    @property
    def alert_id(self) -> Optional[str]:
        return self.related_alert_id

    @property
    def case_id(self) -> Optional[str]:
        return self.related_case_id

    @property
    def agent_id(self) -> Optional[str]:
        return self.related_agent_id

    @property
    def details(self) -> Optional[str]:
        import json
        if self.payload_summary:
            return json.dumps(self.payload_summary, ensure_ascii=False)
        return ""
