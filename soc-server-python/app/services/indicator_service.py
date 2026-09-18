# ==============================================================================
# app/services/indicator_service.py - Indicator Service (IOCs)
# Tương đương: internal/services/indicator_service.go
# ==============================================================================

import uuid
import logging
from datetime import datetime
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy import select, func, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.indicator import Indicator

logger = logging.getLogger(__name__)


def default_indicators() -> List[dict]:
    return [
        {
            "id": str(uuid.uuid4()),
            "type": "ip-src",
            "value": "185.220.101.182",
            "category": "c2_server",
            "source": "osint",
            "mitre_tactic": "Command and Control",
            "risk_score": 88,
            "description": "Known malicious IP used in phishing and command-and-control activity.",
            "is_active": True,
        },
        {
            "id": str(uuid.uuid4()),
            "type": "domain",
            "value": "login-secure-update.com",
            "category": "phishing",
            "source": "analyst",
            "mitre_tactic": "Phishing",
            "risk_score": 91,
            "description": "Phishing domain used in credential harvesting campaigns.",
            "is_active": True,
        },
        {
            "id": str(uuid.uuid4()),
            "type": "sha256",
            "value": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
            "category": "malware",
            "source": "internal",
            "mitre_tactic": "Execution",
            "risk_score": 94,
            "description": "Known malicious payload hash observed in test environment.",
            "is_active": True,
        },
    ]


class IndicatorService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_indicators(
        self,
        page: int = 1,
        page_size: int = 50,
        ioc_type: str = "",
    ) -> Tuple[List[Indicator], int]:
        """Lấy danh sách IOCs với phân trang và filter"""
        stmt = select(Indicator)
        count_stmt = select(func.count(Indicator.id))

        if ioc_type:
            stmt = stmt.where(Indicator.type == ioc_type)
            count_stmt = count_stmt.where(Indicator.type == ioc_type)

        total_res = await self.db.execute(count_stmt)
        total = total_res.scalar() or 0

        offset = (page - 1) * page_size
        stmt = stmt.order_by(desc(Indicator.created_at)).offset(offset).limit(page_size)

        result = await self.db.execute(stmt)
        indicators = list(result.scalars().all())
        return indicators, total

    async def search_indicators_compat(
        self,
        ioc_type: str = "",
        value: str = "",
        limit: int = 50,
    ) -> List[Indicator]:
        """Tìm IOCs tương thích với node MISP của n8n"""
        limit = max(1, min(limit, 1000))
        stmt = select(Indicator).where(Indicator.is_active.is_(True))

        if ioc_type:
            stmt = stmt.where(Indicator.type == ioc_type)
        if value:
            stmt = stmt.where(Indicator.value == value)

        stmt = stmt.order_by(desc(Indicator.created_at)).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_indicator(self, data: Dict[str, Any]) -> Indicator:
        """Thêm IOC mới"""
        indicator = Indicator(
            id=data.get("id") or str(uuid.uuid4()),
            type=data["type"],
            value=data["value"],
            category=data.get("category", "malware"),
            source=data.get("source", "analyst"),
            mitre_tactic=data.get("mitre_tactic"),
            mitre_technique_id=data.get("mitre_technique_id"),
            risk_score=data.get("risk_score", 50),
            description=data.get("description", ""),
            is_active=data.get("is_active", True),
            expires_at=data.get("expires_at"),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.db.add(indicator)
        await self.db.commit()
        await self.db.refresh(indicator)
        return indicator

    async def update_indicator(self, indicator_id: str, data: Dict[str, Any]) -> Optional[Indicator]:
        """Cập nhật IOC"""
        stmt = select(Indicator).where(Indicator.id == indicator_id)
        res = await self.db.execute(stmt)
        indicator = res.scalar_one_or_none()
        if not indicator:
            return None

        for field in [
            "type", "value", "category", "source", "mitre_tactic",
            "mitre_technique_id", "risk_score", "description", "is_active"
        ]:
            if field in data and data[field] is not None:
                setattr(indicator, field, data[field])

        indicator.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(indicator)
        return indicator

    async def delete_indicator(self, indicator_id: str) -> bool:
        """Xóa IOC"""
        stmt = delete(Indicator).where(Indicator.id == indicator_id)
        res = await self.db.execute(stmt)
        await self.db.commit()
        return (res.rowcount or 0) > 0

    async def search_indicator_value(self, value: str) -> Optional[Indicator]:
        """Tra cứu nhanh xem 1 giá trị (IP/Hash) có phải là IOC không"""
        stmt = select(Indicator).where(
            Indicator.value == value,
            Indicator.is_active.is_(True)
        )
        res = await self.db.execute(stmt)
        indicator = res.scalar_one_or_none()

        if not indicator:
            return None

        # Kiểm tra hết hạn nếu có expires_at
        if indicator.expires_at and datetime.utcnow() > indicator.expires_at:
            indicator.is_active = False
            await self.db.commit()
            return None

        return indicator
