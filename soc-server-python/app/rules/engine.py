# ==============================================================================
# app/rules/engine.py - Detection Rule Engine
# Tương đương: internal/rules/engine.go
# ==============================================================================

import json
import re
import logging
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rule import Rule
from app.models.alert import Alert

logger = logging.getLogger(__name__)


class RuleEngine:
    """Detection Rule Engine trong bộ nhớ, hỗ trợ hot-reload và evaluate log."""

    def __init__(self):
        self._rules: List[Rule] = []
        self._lock = asyncio.Lock()

    async def load_all_rules(self, db: AsyncSession):
        """Tải toàn bộ active rules từ Database vào memory."""
        async with self._lock:
            stmt = select(Rule).where(Rule.is_active.is_(True))
            res = await db.execute(stmt)
            self._rules = list(res.scalars().all())
            logger.info(f"[RULE ENGINE] ✅ Đã nạp {len(self._rules)} rules từ Database vào memory")

    def get_active_rules(self) -> List[Rule]:
        return list(self._rules)

    def get_rule_count(self) -> int:
        return len(self._rules)

    def evaluate_log(self, raw_log: Dict[str, Any], agent_id: str) -> Tuple[List[Dict[str, Any]], bool]:
        """
        Đối chiếu raw log với tất cả active detection rules.
        Trả về danh sách alert dicts và bool (có match hay không).
        """
        matched_rules: List[Rule] = []

        for rule in self._rules:
            if not rule.is_active:
                continue

            # Kiểm tra event_type
            if rule.event_type and rule.event_type != "*":
                log_event_type = str(raw_log.get("event_type", ""))
                if log_event_type != rule.event_type:
                    continue

            # Parse conditions JSON
            try:
                conditions = json.loads(rule.conditions) if isinstance(rule.conditions, str) else rule.conditions
            except Exception:
                continue

            if not isinstance(conditions, list) or len(conditions) == 0:
                continue

            if self._match_all_conditions(raw_log, conditions):
                logger.info(f"[RULE ENGINE] 🚨 MATCH! Rule '{rule.id}' ({rule.name}) khớp event từ Agent '{agent_id}'")
                matched_rules.append(rule)

        if not matched_rules:
            return [], False

        raw_payload_json = json.dumps(raw_log)
        alerts_data = []

        for rule in matched_rules:
            event_type = rule.event_type or "suspicious_process"
            alert_dict = {
                "agent_id": agent_id,
                "rule_id": rule.id,
                "event_type": event_type,
                "severity": (rule.severity or "medium").lower(),
                "raw_payload": raw_payload_json,
                "status": "new",
                "title": f"[{rule.severity.upper()}] {rule.name}",
                "description": rule.description or "",
                "mitre_tactic": rule.mitre_tactic or "",
                "mitre_technique_id": rule.mitre_technique_id or "",
            }
            alerts_data.append(alert_dict)

        return alerts_data, True

    def _match_all_conditions(self, raw_log: Dict[str, Any], conditions: List[Dict[str, Any]]) -> bool:
        """AND logic cho tất cả condition"""
        for cond in conditions:
            if not self._match_condition(raw_log, cond):
                return False
        return len(conditions) > 0

    def _match_condition(self, raw_log: Dict[str, Any], cond: Dict[str, Any]) -> bool:
        field = cond.get("field", "")
        op = cond.get("operator", "equals")
        target_val = str(cond.get("value", "")).lower()

        if field not in raw_log:
            return False

        field_val = str(raw_log[field]).lower()

        if op == "equals":
            return field_val == target_val
        elif op == "not_equals":
            return field_val != target_val
        elif op == "contains":
            return target_val in field_val
        elif op == "contains_any":
            parts = [p.strip() for p in target_val.split(",")]
            return any(p in field_val for p in parts)
        elif op == "in":
            parts = [p.strip() for p in target_val.split(",")]
            return field_val in parts
        elif op == "regex":
            try:
                return bool(re.search(target_val, field_val))
            except Exception:
                return False

        return False


# Singleton engine instance
global_rule_engine = RuleEngine()
