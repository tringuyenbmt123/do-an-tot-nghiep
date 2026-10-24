# ==============================================================================
# app/services/case_service.py - Case Service (Incident Response)
# Tương đương: internal/services/case_service.go
# ==============================================================================

import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple, List, Dict, Any

from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case, CaseStatus
from app.models.alert import Alert, AlertStatus
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)


class CaseService:
    def __init__(self, db: AsyncSession, audit_service: Optional[AuditService] = None):
        self.db = db
        self.audit_service = audit_service or AuditService(db)

    async def get_all_cases(
        self,
        page: int = 1,
        page_size: int = 20,
        filters: Optional[Dict[str, str]] = None,
    ) -> Tuple[List[Case], int]:
        """Lấy danh sách cases với phân trang, filter và eager load alert"""
        filters = filters or {}
        stmt = select(Case).options(joinedload(Case.alert).joinedload(Alert.agent))
        count_stmt = select(func.count(Case.id))

        if filters.get("status"):
            stmt = stmt.where(Case.status == filters["status"])
            count_stmt = count_stmt.where(Case.status == filters["status"])
        if filters.get("assigned_to"):
            stmt = stmt.where(Case.assigned_to == filters["assigned_to"])
            count_stmt = count_stmt.where(Case.assigned_to == filters["assigned_to"])

        total_res = await self.db.execute(count_stmt)
        total = total_res.scalar() or 0

        offset = (page - 1) * page_size
        stmt = stmt.order_by(desc(Case.created_at)).offset(offset).limit(page_size)

        result = await self.db.execute(stmt)
        cases = list(result.scalars().all())
        return cases, total

    async def get_case_by_id(self, case_id: str) -> Optional[Case]:
        """Lấy case chi tiết theo ID (load alert và agent)"""
        stmt = (
            select(Case)
            .options(joinedload(Case.alert).joinedload(Alert.agent))
            .where(Case.id == case_id)
        )
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def create_case_from_alert(
        self,
        alert_id: str,
        title: str,
        description: str,
        assigned_to: str,
    ) -> Case:
        """Tạo Case mới từ một Alert, cập nhật status Alert thành escalated, ghi Audit Log"""
        stmt = select(Alert).where(Alert.id == alert_id)
        res = await self.db.execute(stmt)
        alert = res.scalar_one_or_none()
        if not alert:
            raise ValueError(f"Không tìm thấy Alert '{alert_id}'")

        severity_num_map = {
            "critical": 1,
            "high": 2,
            "medium": 3,
            "low": 4,
        }
        severity_num = severity_num_map.get((alert.severity or "").lower(), 3)

        new_case = Case(
            id=str(uuid.uuid4()),
            alert_id=alert_id,
            title=title,
            description=description,
            severity_num=severity_num,
            status=CaseStatus.NEW.value,
            assigned_to=assigned_to,
            tags='["escalated"]',
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.db.add(new_case)

        # Cập nhật Alert status
        alert.status = AlertStatus.ESCALATED.value
        alert.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(new_case)

        # Ghi Audit Log
        await self.audit_service.log_action(
            event_type="case_created",
            source="Manual",
            action="create_case",
            actor=assigned_to or "soc_analyst",
            case_id=new_case.id,
            alert_id=alert_id,
            payload_summary=f"Escalated case created from alert {alert_id}",
        )

        logger.info(f"[CASE SERVICE] Đã tạo Case '{new_case.id}' từ Alert '{alert_id}'")
        return new_case

    async def create_manual_case(
        self,
        title: str,
        description: str,
        assigned_to: str,
        severity_num: int = 3,
    ) -> Case:
        """Tạo Case thủ công không cần Alert gốc"""
        new_case = Case(
            id=str(uuid.uuid4()),
            title=title,
            description=description,
            severity_num=severity_num,
            status=CaseStatus.NEW.value,
            assigned_to=assigned_to,
            tags='["manual"]',
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.db.add(new_case)
        await self.db.commit()
        await self.db.refresh(new_case)

        await self.audit_service.log_action(
            event_type="case_created",
            source="Manual",
            action="create_case",
            actor=assigned_to or "soc_analyst",
            payload_summary="Tạo Case thủ công",
            case_id=new_case.id,
        )
        return new_case

    async def assign_case(self, case_id: str, assigned_to: str, actor: str):
        """Gán Case cho Analyst. Tự động đổi trạng thái sang progress nếu đang là new"""
        stmt = select(Case).where(Case.id == case_id)
        res = await self.db.execute(stmt)
        c = res.scalar_one_or_none()
        if not c:
            return None

        c.assigned_to = assigned_to
        if (c.status or "").lower() != "closed":
            c.status = "progress"
        c.updated_at = datetime.utcnow()
        await self.db.commit()

        await self.audit_service.log_action(
            event_type="case_assigned",
            source="Manual",
            action="update_case",
            actor=actor,
            payload_summary=f"Gán case cho {assigned_to} (trạng thái: {c.status})",
            case_id=case_id,
        )
        return c

    async def add_case_note(self, case_id: str, note: str, actor: str) -> bool:
        """Thêm ghi chú vào Case description"""
        stmt = select(Case).where(Case.id == case_id)
        res = await self.db.execute(stmt)
        c = res.scalar_one_or_none()
        if not c:
            return False

        ts = (datetime.utcnow() + timedelta(hours=7)).strftime("%Y-%m-%d %H:%M:%S")
        new_note = f"\n\n---\n**[{ts}] {actor}**: {note}"
        c.description = (c.description or "") + new_note
        c.updated_at = datetime.utcnow()
        await self.db.commit()

        await self.audit_service.log_action(
            event_type="case_note_added",
            source="Manual",
            action="update_case",
            actor=actor,
            payload_summary="Đã thêm ghi chú điều tra",
            case_id=case_id,
        )
        return True

    async def update_case_status(self, case_id: str, status: str, actor: str) -> bool:
        """Cập nhật trạng thái của Case. Chưa assign thì không được đổi sang closed"""
        stmt = select(Case).where(Case.id == case_id)
        res = await self.db.execute(stmt)
        c = res.scalar_one_or_none()
        if not c:
            return False

        if status == "closed":
            is_unassigned = not c.assigned_to or c.assigned_to in ("soar_automation", "unassigned")
            if is_unassigned:
                raise ValueError("Không thể đóng case khi chưa phân công người phụ trách")

        c.status = status
        c.updated_at = datetime.utcnow()
        await self.db.commit()

        await self.audit_service.log_action(
            event_type="case_updated",
            source="Manual",
            action="update_case",
            actor=actor,
            payload_summary=f"Chuyển trạng thái thành {status}",
            case_id=case_id,
        )
        return True
