# ==============================================================================
# app/routers/soar.py - SOAR Callback Router
# Tương đương: internal/api/handlers/soar_handler.go
# ==============================================================================

import logging
from typing import Optional, Any
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.soar_service import SOARService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/soar", tags=["SOAR"])


class SOARCallbackPayload(BaseModel):
    alert_id: str
    action: str
    target: Optional[str] = ""
    ai_reason: Optional[str] = ""
    confidence: Optional[float] = 0.0
    human_approved_by: Optional[str] = ""


@router.post("/callback")
async def handle_n8n_callback(
    payload: SOARCallbackPayload,
    x_soc_callback_secret: Optional[str] = Header(None, alias="X-SOC-Callback-Secret"),
    db: AsyncSession = Depends(get_db),
):
    # Xác thực shared secret nếu cấu hình
    if settings.soar_callback_secret:
        if x_soc_callback_secret != settings.soar_callback_secret:
            logger.warning("[SOAR HANDLER] 🚫 Callback bị từ chối: Secret không hợp lệ")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    soar_service = SOARService(db)
    audit_action, target = await soar_service.handle_callback(payload.dict())

    # Ghi nhận thành công
    return {
        "message": "Callback processed successfully",
        "action_taken": audit_action,
        "target": target,
    }
