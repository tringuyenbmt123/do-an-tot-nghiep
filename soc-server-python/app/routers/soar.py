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


import uuid
import time
from app.grpc_server.connection_manager import global_conn_manager
from app.services.alert_service import AlertService


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

    # Nếu action là can thiệp (Active Response), đẩy lệnh xuống Agent qua gRPC
    if audit_action in ["kill_process", "block_ip", "block_url"]:
        alert_service = AlertService(db)
        alert = await alert_service.get_alert_by_id(payload.alert_id)
        if alert and alert.agent_id:
            cmd_type = 0
            if audit_action == "kill_process":
                cmd_type = 1  # KILL_PROCESS
            elif audit_action == "block_ip":
                cmd_type = 3  # BLOCK_IP
            elif audit_action == "block_url":
                cmd_type = 4  # BLOCK_URL

            cmd = {
                "command_id": str(uuid.uuid4()),
                "command_type": cmd_type,
                "target": target or "",
                "timestamp": int(time.time() * 1000),
                "parameters": {
                    "reason": payload.ai_reason or "SOAR Automated Action",
                    "alert_id": payload.alert_id,
                    "issued_by": payload.human_approved_by or "n8n_soar_automation",
                },
            }
            success = await global_conn_manager.send_command(alert.agent_id, cmd)
            if success:
                logger.info(f"[SOAR HANDLER] ⚡ Đã ra lệnh {audit_action} xuống Agent '{alert.agent_id}' thành công")
            else:
                logger.warning(f"[SOAR HANDLER] ⚠️ Không thể gửi lệnh xuống Agent '{alert.agent_id}' (Agent offline)")

    # Ghi nhận thành công
    return {
        "message": "Callback processed successfully",
        "action_taken": audit_action,
        "target": target,
    }
