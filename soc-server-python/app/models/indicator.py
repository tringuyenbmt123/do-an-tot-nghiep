# app/models/indicator.py — IOC indicators (Threat Intelligence)
# Tương đương: internal/models/indicator.go
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Indicator(Base):
    __tablename__ = "indicators"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)  # ip-src, ip-dst, domain, sha256, url, email
    value: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)  # malware, phishing, c2_server, ransomware
    source: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # internal, osint, misp_feed, analyst
    mitre_tactic: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    mitre_technique_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    risk_score: Mapped[int] = mapped_column(Integer, default=50)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)

    # Backward compatibility properties if frontend expects ioc_type or threat_type
    @property
    def ioc_type(self) -> str:
        return self.type

    @property
    def threat_type(self) -> Optional[str]:
        return self.category
