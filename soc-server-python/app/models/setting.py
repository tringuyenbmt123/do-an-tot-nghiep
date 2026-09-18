# ==============================================================================
# app/models/setting.py - SQLAlchemy Model: SystemSetting
# Tương đương: internal/models/setting.go
# ==============================================================================

from datetime import datetime
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id: Mapped[str] = mapped_column(String(50), primary_key=True, default="global_config")
    n8n_webhook_url: Mapped[str] = mapped_column(String(255), default="http://localhost:5678/webhook/soc-callback")
    auto_response_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    telegram_hitl_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_analysis_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
