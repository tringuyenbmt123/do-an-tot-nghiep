# ==============================================================================
# app/services/setting_service.py - Setting Service
# Tương đương: internal/services/setting_service.go
# ==============================================================================

import logging
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.setting import SystemSetting

logger = logging.getLogger(__name__)


class SettingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_global_settings(self) -> SystemSetting:
        """Lấy cấu hình chung (FirstOrCreate id='global_config')"""
        stmt = select(SystemSetting).where(SystemSetting.id == "global_config")
        res = await self.db.execute(stmt)
        setting = res.scalar_one_or_none()

        if not setting:
            setting = SystemSetting(
                id="global_config",
                n8n_webhook_url="http://localhost:5678/webhook/soc-callback",
                auto_response_enabled=False,
                telegram_hitl_enabled=True,
                ai_analysis_enabled=True,
                updated_at=datetime.utcnow(),
            )
            self.db.add(setting)
            await self.db.commit()
            await self.db.refresh(setting)

        return setting

    async def update_global_settings(self, new_settings: dict) -> SystemSetting:
        """Cập nhật cấu hình chung"""
        setting = await self.get_global_settings()

        if "n8n_webhook_url" in new_settings and new_settings["n8n_webhook_url"] is not None:
            setting.n8n_webhook_url = new_settings["n8n_webhook_url"]
        if "auto_response_enabled" in new_settings and new_settings["auto_response_enabled"] is not None:
            setting.auto_response_enabled = new_settings["auto_response_enabled"]
        if "telegram_hitl_enabled" in new_settings and new_settings["telegram_hitl_enabled"] is not None:
            setting.telegram_hitl_enabled = new_settings["telegram_hitl_enabled"]
        if "ai_analysis_enabled" in new_settings and new_settings["ai_analysis_enabled"] is not None:
            setting.ai_analysis_enabled = new_settings["ai_analysis_enabled"]

        setting.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(setting)
        return setting
