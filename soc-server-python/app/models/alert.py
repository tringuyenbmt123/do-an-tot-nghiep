# ==============================================================================
# app/models/alert.py - SQLAlchemy Model: Alert
# Tương đương: internal/models/alert.go
# ==============================================================================

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# Enums — tương đương Go const blocks
class AlertEventType(str, Enum):
    DDOS_DETECTED       = "ddos_detected"
    PHISHING_DETECTED   = "phishing_detected"
    WAZUH_ALERT         = "wazuh_alert"
    MALWARE_EDR         = "malware_edr"
    SUSPICIOUS_PROCESS  = "suspicious_process"
    NETWORK_ANOMALY     = "network_anomaly"
    FILE_INTEGRITY      = "file_integrity"
    SYSTEM_METRIC       = "system_metric"


class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH     = "high"
    MEDIUM   = "medium"
    LOW      = "low"


class AlertStatus(str, Enum):
    NEW            = "new"
    IN_PROGRESS    = "in_progress"
    RESOLVED       = "resolved"
    FALSE_POSITIVE = "false_positive"
    ESCALATED      = "escalated"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # FK → Agent
    agent_id: Mapped[str] = mapped_column(String(36), ForeignKey("agents.id"), nullable=False, index=True)

    # FK → Rule (nullable)
    rule_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)

    # Loại sự kiện
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Mức độ nghiêm trọng
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # Log gốc dạng JSON
    raw_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Trạng thái xử lý
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)

    # Tiêu đề
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Mô tả chi tiết
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # MITRE ATT&CK
    mitre_tactic: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    mitre_technique_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)

    # Relations
    agent: Mapped[Optional["Agent"]] = relationship("Agent", back_populates="alerts", lazy="select")  # type: ignore
