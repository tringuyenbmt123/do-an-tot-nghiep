# ==============================================================================
# app/models/case.py - SQLAlchemy Model: Case
# Tương đương: internal/models/case.go
# ==============================================================================

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, List

from sqlalchemy import String, DateTime, Text, Integer, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CaseStatus(str, Enum):
    NEW         = "New"
    IN_PROGRESS = "InProgress"
    CLOSED      = "Closed"
    REJECTED    = "Rejected"


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # FK → Alert
    alert_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("alerts.id"), index=True, nullable=True)

    # Tiêu đề vụ việc
    title: Mapped[str] = mapped_column(String(500), nullable=False)

    # Mô tả (hỗ trợ Markdown)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Mức nghiêm trọng: 1=Critical, 2=High, 3=Medium, 4=Low
    severity_num: Mapped[int] = mapped_column(Integer, default=3, index=True)

    # Trạng thái vòng đời
    status: Mapped[str] = mapped_column(String(30), default="New", index=True)

    # Analyst được giao
    assigned_to: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Tags dạng JSON array
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # SOAR processing
    soar_status: Mapped[str] = mapped_column(String(50), default="pending")
    ai_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    human_approved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)

    # Relations
    alert: Mapped[Optional["Alert"]] = relationship("Alert", foreign_keys=[alert_id], lazy="select")  # type: ignore
    notes: Mapped[List["CaseNote"]] = relationship("CaseNote", back_populates="case", cascade="all, delete-orphan", lazy="selectin", order_by="CaseNote.created_at.asc()")


class CaseNote(Base):
    __tablename__ = "case_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id: Mapped[str] = mapped_column(String(36), ForeignKey("cases.id", ondelete="CASCADE"), index=True, nullable=False)
    author: Mapped[str] = mapped_column(String(255), default="soc_analyst")
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relation back to Case
    case: Mapped["Case"] = relationship("Case", back_populates="notes")
