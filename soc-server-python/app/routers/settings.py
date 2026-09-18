# ==============================================================================
# app/routers/settings.py - Settings Router
# Tương đương: internal/api/handlers/setting_handler.go
# ==============================================================================

from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.setting_service import SettingService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/settings", tags=["Settings"])


class SaveSettingsRequest(BaseModel):
    n8n_webhook_url: Optional[str] = None
    auto_response_enabled: Optional[bool] = None
    telegram_hitl_enabled: Optional[bool] = None
    ai_analysis_enabled: Optional[bool] = None


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    setting_service = SettingService(db)
    settings = await setting_service.get_global_settings()
    return settings


@router.put("")
async def save_settings(
    req: SaveSettingsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    setting_service = SettingService(db)
    updated = await setting_service.update_global_settings(req.dict(exclude_unset=True))
    return updated
