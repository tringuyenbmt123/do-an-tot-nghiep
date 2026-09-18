# ==============================================================================
# app/models/agent.py - SQLAlchemy Model: Agent
# Tương đương: internal/models/agent.go
# ==============================================================================

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    # ID UUID (tự sinh)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Hostname máy endpoint
    hostname: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Địa chỉ IP
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)

    # Hệ điều hành: windows, linux, macos
    os_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Trạng thái: online, offline
    status: Mapped[str] = mapped_column(String(20), default="offline", index=True)

    # Thời điểm nhận heartbeat gần nhất
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # SHA256 fingerprint chứng chỉ mTLS
    # Ghi chú: Go GORM đặt tên cột là m_tls_cert_fingerprint (từ MTLSCertFingerprint)
    mtls_cert_fingerprint: Mapped[Optional[str]] = mapped_column(
        String(255), name="m_tls_cert_fingerprint", unique=True, nullable=True
    )

    # Phiên bản Agent
    agent_version: Mapped[str] = mapped_column(String(50), default="")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)

    # Relations
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="agent", lazy="select")  # type: ignore
