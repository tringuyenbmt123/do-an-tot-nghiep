# app/models/indicator.py — IOC indicators (Threat Intelligence)
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Indicator(Base):
    __tablename__ = "indicators"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ioc_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # ip, domain, hash, url
    value: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    threat_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    confidence: Mapped[int] = mapped_column(Integer, default=50)
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
