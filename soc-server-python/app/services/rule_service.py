# ==============================================================================
# app/services/rule_service.py - Detection Rule Service
# Tương đương: internal/services/rule_service.go
# ==============================================================================

import json
import logging
import time
from typing import List, Optional, Dict, Any
from datetime import datetime

from sqlalchemy import select, delete, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rule import Rule
from app.rules.engine import global_rule_engine, RuleEngine

logger = logging.getLogger(__name__)


def default_rules() -> List[dict]:
    return [
        {
            "id": "RULE-POWERSHELL-ENCODED",
            "name": "PowerShell Encoded Command Execution",
            "severity": "high",
            "event_type": "process_creation",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "equals", "value": "powershell.exe"},
                {"field": "command_line", "operator": "contains", "value": "-EncodedCommand"}
            ]),
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1059.001",
            "description": "Detects PowerShell commands executed with encoded payloads, often used for script obfuscation.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "RULE-RANSOMWARE-VSS",
            "name": "Ransomware VSS Shadow Delete Activity",
            "severity": "critical",
            "event_type": "command_execution",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "vssadmin.exe"},
                {"field": "command_line", "operator": "contains", "value": "shadow delete"}
            ]),
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1490",
            "description": "Flags attempts to delete volume shadow copies, a common ransomware behavior.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "RULE-NETWORK-C2",
            "name": "Outbound C2 Communication Pattern",
            "severity": "medium",
            "event_type": "network_connection",
            "conditions": json.dumps([
                {"field": "dst_ip", "operator": "not_equals", "value": "10.0.0.0/8"},
                {"field": "protocol", "operator": "equals", "value": "tcp"}
            ]),
            "mitre_tactic": "Command and Control",
            "mitre_technique_id": "T1071",
            "description": "Looks for suspicious outbound connections outside the internal network segmentation.",
            "is_active": True,
            "source": "database",
        },
    ]


class RuleService:
    def __init__(self, db: AsyncSession, engine: RuleEngine = global_rule_engine):
        self.db = db
        self.engine = engine

    async def get_all_rules(self) -> List[Rule]:
        """Lấy toàn bộ danh sách rules chưa bị xóa từ Database"""
        stmt = select(Rule).where(Rule.deleted_at.is_(None)).order_by(desc(Rule.created_at))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_rule(self, data: Dict[str, Any]) -> Rule:
        """Thêm Rule mới vào database và Hot-reload Engine"""
        raw_id = (data.get("id") or "").strip()
        rule_id = raw_id if raw_id else f"RULE-{int(time.time() * 1000)}"
        rule_name = (data.get("name") or "Unnamed Rule").strip()

        # Validate JSON conditions
        conditions_str = data.get("conditions", "[]")
        if not isinstance(conditions_str, str):
            conditions_str = json.dumps(conditions_str)
        else:
            try:
                json.loads(conditions_str)
            except Exception:
                raise ValueError("conditions không phải là JSON hợp lệ")

        rule = Rule(
            id=rule_id,
            name=rule_name,
            severity=data.get("severity", "medium"),
            event_type=data.get("event_type", "process_creation"),
            conditions=conditions_str,
            mitre_tactic=data.get("mitre_tactic", ""),
            mitre_technique_id=data.get("mitre_technique_id", ""),
            description=data.get("description", ""),
            is_active=data.get("is_active", True),
            source=data.get("source", "database"),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)

        logger.info(f"[RULE SERVICE] Đã tạo Rule mới '{rule.id}'. Kích hoạt hot-reload...")
        await self.engine.load_all_rules(self.db)
        return rule

    async def _find_rule(self, rule_id: str) -> Optional[Rule]:
        """Tìm rule theo id chính xác, hoặc trim whitespace, hoặc theo name"""
        clean_id = rule_id.strip()
        stmt = select(Rule).where(
            (Rule.id == rule_id) |
            (func.trim(Rule.id) == clean_id) |
            (Rule.name == rule_id) |
            (func.trim(Rule.name) == clean_id)
        )
        res = await self.db.execute(stmt)
        return res.scalars().first()

    async def update_rule(self, rule_id: str, data: Dict[str, Any]) -> Rule:
        """Cập nhật Rule trong DB và hot-reload"""
        rule = await self._find_rule(rule_id)

        conditions_str = data.get("conditions")
        if conditions_str is not None:
            if not isinstance(conditions_str, str):
                conditions_str = json.dumps(conditions_str)
            else:
                try:
                    json.loads(conditions_str)
                except Exception:
                    raise ValueError("conditions không phải là JSON hợp lệ")

        if not rule:
            clean_id = (rule_id or "").strip() or f"RULE-{int(time.time() * 1000)}"
            rule = Rule(
                id=clean_id,
                name=(data.get("name") or "Unnamed Rule").strip(),
                severity=data.get("severity", "medium"),
                event_type=data.get("event_type", "process_creation"),
                conditions=conditions_str or "[]",
                mitre_tactic=data.get("mitre_tactic", ""),
                mitre_technique_id=data.get("mitre_technique_id", ""),
                description=data.get("description", ""),
                is_active=data.get("is_active", True),
                source=data.get("source", "database"),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            self.db.add(rule)
        else:
            for field in ["name", "severity", "event_type", "mitre_tactic", "mitre_technique_id", "description", "is_active", "source"]:
                if field in data and data[field] is not None:
                    val = data[field]
                    if field in ["name", "id"] and isinstance(val, str):
                        val = val.strip()
                    setattr(rule, field, val)
            if conditions_str is not None:
                rule.conditions = conditions_str
            rule.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(rule)
        logger.info(f"[RULE SERVICE] Đã cập nhật Rule '{rule.id}'. Kích hoạt hot-reload...")
        await self.engine.load_all_rules(self.db)
        return rule

    async def toggle_rule(self, rule_id: str, is_active: bool) -> bool:
        """Bật/tắt 1 Rule trong DB và hot-reload"""
        rule = await self._find_rule(rule_id)
        if not rule:
            return False

        rule.is_active = is_active
        rule.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.engine.load_all_rules(self.db)
        return True

    async def delete_rule(self, rule_id: str) -> bool:
        """Xóa 1 Rule khỏi DB và hot-reload (hỗ trợ cả tìm kiếm khoảng trắng)"""
        rule = await self._find_rule(rule_id)
        if not rule:
            return False

        await self.db.delete(rule)
        await self.db.commit()
        logger.info(f"[RULE SERVICE] Đã xóa vĩnh viễn Rule '{rule.id}'. Kích hoạt hot-reload...")
        await self.engine.load_all_rules(self.db)
        return True
