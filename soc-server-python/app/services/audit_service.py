# ==============================================================================
# app/services/audit_service.py - Audit Service
# Tương đương: internal/services/audit_service.go
# ==============================================================================

import uuid
import logging
from datetime import datetime
from typing import Optional, Tuple, List
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_action(
        self,
        event_type: str,
        source: str,
        action: str,
        actor: str,
        payload_summary: str = "",
        case_id: str = "",
        alert_id: str = "",
        agent_id: str = "",
        confidence: float = 0.0,
    ) -> Optional[AuditLog]:
        """Ghi nhận một hành động vào bảng audit_logs"""
        try:
            audit_log = AuditLog(
                id=str(uuid.uuid4()),
                event_type=event_type,
                source=source,
                action_taken=action,
                actor=actor,
                payload_summary=payload_summary,
                related_case_id=case_id or None,
                related_alert_id=alert_id or None,
                related_agent_id=agent_id or None,
                confidence=confidence,
                created_at=datetime.utcnow(),
            )
            self.db.add(audit_log)
            await self.db.commit()
            await self.db.refresh(audit_log)
            return audit_log
        except Exception as e:
            logger.error(f"[AUDIT SERVICE] ❌ Lỗi ghi audit log: {e}")
            await self.db.rollback()
            return None

    async def get_audit_logs(
        self,
        page: int = 1,
        page_size: int = 50,
        source: str = "",
        action: str = "",
    ) -> Tuple[List[AuditLog], int]:
        """Lấy danh sách audit logs với phân trang và filter"""
        stmt = select(AuditLog)
        count_stmt = select(func.count(AuditLog.id))

        if source:
            stmt = stmt.where(AuditLog.source == source)
            count_stmt = count_stmt.where(AuditLog.source == source)
        if action:
            stmt = stmt.where(AuditLog.action_taken == action)
            count_stmt = count_stmt.where(AuditLog.action_taken == action)

        total_res = await self.db.execute(count_stmt)
        total = total_res.scalar() or 0

        offset = (page - 1) * page_size
        stmt = stmt.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size)

        result = await self.db.execute(stmt)
        logs = list(result.scalars().all())
        return logs, total
