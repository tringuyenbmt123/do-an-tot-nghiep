# ==============================================================================
# app/services/soar_service.py - SOAR Service (n8n Webhook & Callback)
# Tương đương: internal/services/soar_service.go
# ==============================================================================

import asyncio
import logging
from typing import Optional, Tuple, Dict, Any
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.alert import Alert
from app.models.case import Case
from app.services.case_service import CaseService
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)


class SOARService:
    def __init__(
        self,
        db: AsyncSession,
        case_service: Optional[CaseService] = None,
        audit_service: Optional[AuditService] = None,
    ):
        self.db = db
        self.case_service = case_service or CaseService(db)
        self.audit_service = audit_service or AuditService(db)

    def should_dispatch_to_n8n(self, alert: Alert) -> bool:
        """Chỉ đưa alert cần orchestration sang n8n"""
        event_type = (alert.event_type or "").lower()
        if event_type in [
            "ddos_detected", "phishing_detected", "brute_force",
            "brute_force_detected", "file_integrity", "fim", "fim_detected"
        ]:
            return True
        return (alert.severity or "").lower() == "critical"

    def get_webhook_url(self, alert: Alert) -> str:
        """Chọn đúng webhook URL theo event_type"""
        event_type = (alert.event_type or "").lower()
        if event_type == "ddos_detected" and settings.n8n_webhook_url_ddos:
            return settings.n8n_webhook_url_ddos
        if event_type == "phishing_detected" and settings.n8n_webhook_url_phishing:
            return settings.n8n_webhook_url_phishing
        if event_type in ["file_integrity", "fim", "fim_detected", "brute_force", "brute_force_detected", "wazuh_alert"]:
            if settings.n8n_webhook_url_wazuh:
                return settings.n8n_webhook_url_wazuh
        return settings.n8n_webhook_url

    def dispatch_to_n8n(self, alert: Alert):
        """Bắn Webhook sang n8n non-blocking (asyncio background task)"""
        if not settings.soar_enabled or not self.should_dispatch_to_n8n(alert):
            return

        webhook_url = self.get_webhook_url(alert)
        if not webhook_url:
            return

        payload = {
            "alert_id": alert.id,
            "agent_id": alert.agent_id,
            "event_type": alert.event_type,
            "severity": alert.severity,
            "title": alert.title or "",
            "description": alert.description or "",
            "raw_payload": alert.raw_payload or "{}",
            "timestamp": alert.created_at.isoformat() if alert.created_at else datetime.utcnow().isoformat(),
        }

        asyncio.create_task(self._send_webhook_with_retry(webhook_url, payload, alert.id, alert.event_type, alert.agent_id))

    async def _send_webhook_with_retry(self, url: str, payload: dict, alert_id: str, event_type: str, agent_id: str):
        max_retries = settings.soar_max_retries
        timeout = settings.soar_webhook_timeout_secs

        async with httpx.AsyncClient(timeout=timeout) as client:
            for i in range(1, max_retries + 1):
                try:
                    headers = {
                        "Content-Type": "application/json",
                        "X-SOC-Source": "SOC-Server-Python",
                    }
                    resp = await client.post(url, json=payload, headers=headers)
                    if 200 <= resp.status_code < 300:
                        logger.info(f"[SOAR] ✅ Đã dispatch Alert '{alert_id}' (type: {event_type}) sang n8n thành công")
                        return
                    else:
                        logger.warning(f"[SOAR] ⚠️ Webhook trả về status code: {resp.status_code}")
                except Exception as e:
                    logger.warning(f"[SOAR] ⚠️ Lỗi gọi webhook n8n (lần {i}/{max_retries}): {e}")

                if i < max_retries:
                    backoff = min(2 ** i, 30)
                    await asyncio.sleep(backoff)

        logger.error(f"[SOAR] ❌ Đã thử {max_retries} lần nhưng không thể dispatch Alert '{alert_id}' sang n8n")

    async def handle_callback(self, payload: Dict[str, Any]) -> Tuple[str, str]:
        """
        Xử lý kết quả callback từ n8n SOAR
        Trả về (audit_action, target)
        """
        alert_id = payload.get("alert_id", "")
        action = payload.get("action", "log_only")
        target = payload.get("target", "")
        ai_reason = payload.get("ai_reason", "")
        confidence = float(payload.get("confidence", 0.0))
        human_approved_by = payload.get("human_approved_by", "")

        logger.info(f"[SOAR] 📥 Nhận Callback từ n8n cho Alert '{alert_id}'. Action: {action}")

        # Lấy AgentID từ alert
        agent_id = ""
        stmt = select(Alert.agent_id).where(Alert.id == alert_id)
        res = await self.db.execute(stmt)
        row = res.first()
        if row:
            agent_id = row[0]

        # 1. Tự động tạo Case nếu n8n quyết định đây là sự cố thực sự
        case_id = ""
        if action != "ignore":
            title = f"SOAR Escalated Alert: {alert_id}"
            desc = (
                f"## AI Analysis Reason\n{ai_reason}\n\n"
                f"**Confidence**: {confidence:.2f}\n"
                f"**Approved By**: {human_approved_by or 'AI Auto'}"
            )
            try:
                new_case = await self.case_service.create_case_from_alert(
                    alert_id=alert_id,
                    title=title,
                    description=desc,
                    assigned_to="soar_automation",
                )
                case_id = new_case.id

                # Cập nhật thêm SOAR context vào Case
                stmt_case = select(Case).where(Case.id == case_id)
                res_case = await self.db.execute(stmt_case)
                c = res_case.scalar_one_or_none()
                if c:
                    c.soar_status = "completed"
                    c.ai_reason = ai_reason
                    c.human_approved_by = human_approved_by
                    c.confidence = confidence
                    c.updated_at = datetime.utcnow()
                    await self.db.commit()
            except Exception as e:
                logger.warning(f"[SOAR] Không thể tạo Case từ callback: {e}")

        # 2. Map action
        action_map = {
            "kill_process": "kill_process",
            "block_ip": "block_ip",
            "block_url": "block_url",
            "create_case": "create_case",
        }
        audit_action = action_map.get(action, "log_only")

        # 3. Ghi Audit Log
        source = "Human-HITL" if human_approved_by else "AI"
        await self.audit_service.log_action(
            event_type="soar_callback_received",
            source=source,
            action=audit_action,
            actor="n8n_soar_engine",
            payload_summary=f"n8n decided: {action}. Target: {target}. Reason: {ai_reason}",
            case_id=case_id,
            alert_id=alert_id,
            agent_id=agent_id,
            confidence=confidence,
        )

        return audit_action, target
