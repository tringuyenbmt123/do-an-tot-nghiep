# ==============================================================================
# app/services/alert_service.py - Alert Service
# Tương đương: internal/services/alert_service.go
# ==============================================================================

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple, List, Dict, Any

from sqlalchemy import select, func, desc, delete, text
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertSeverity, AlertStatus
from app.models.agent import Agent
from app.models.case import Case

logger = logging.getLogger(__name__)


def default_agents() -> List[dict]:
    return [
        {
            "id": "agent-demo-win-01",
            "hostname": "WIN-CLIENT-01",
            "ip_address": "10.0.0.21",
            "os_type": "windows",
            "status": "online",
            "last_heartbeat_at": datetime.utcnow() - timedelta(minutes=2),
            "mtls_cert_fingerprint": "demo-win-01-cert",
            "agent_version": "1.4.2",
        },
        {
            "id": "agent-demo-linux-01",
            "hostname": "LINUX-SRV-07",
            "ip_address": "10.0.0.42",
            "os_type": "linux",
            "status": "online",
            "last_heartbeat_at": datetime.utcnow() - timedelta(minutes=3),
            "mtls_cert_fingerprint": "demo-linux-01-cert",
            "agent_version": "1.4.2",
        },
    ]


def default_alerts() -> List[dict]:
    return [
        {
            "id": "alert-demo-001",
            "agent_id": "agent-demo-win-01",
            "rule_id": "RULE-POWERSHELL-ENCODED",
            "event_type": "suspicious_process",
            "severity": "high",
            "status": "new",
            "title": "PowerShell encoded command execution",
            "description": "PowerShell executed an encoded payload with suspicious flags commonly used by malware loaders.",
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1059.001",
            "raw_payload": '{"process_name":"powershell.exe","command_line":"powershell -EncodedCommand JABjAGwAaQBlAG4...","host":"WIN-CLIENT-01"}',
        },
        {
            "id": "alert-demo-002",
            "agent_id": "agent-demo-linux-01",
            "rule_id": "RULE-RANSOMWARE-VSS",
            "event_type": "network_anomaly",
            "severity": "critical",
            "status": "in_progress",
            "title": "Shadow copy deletion attempt",
            "description": "Endpoint attempted to delete local shadow copies in a pattern consistent with ransomware behavior.",
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1490",
            "raw_payload": '{"process_name":"vssadmin.exe","command_line":"vssadmin.exe shadow delete /all /quiet","host":"LINUX-SRV-07"}',
        },
        {
            "id": "alert-demo-003",
            "agent_id": "agent-demo-win-01",
            "rule_id": "RULE-NETWORK-C2",
            "event_type": "network_anomaly",
            "severity": "medium",
            "status": "resolved",
            "title": "Outbound suspicious connection",
            "description": "New outbound TCP connection to an external IP outside the known internal subnets.",
            "mitre_tactic": "Command and Control",
            "mitre_technique_id": "T1071",
            "raw_payload": '{"dst_ip":"185.220.101.182","protocol":"tcp","host":"WIN-CLIENT-01"}',
        },
    ]


class AlertService:
    def __init__(self, db: AsyncSession, redis_client=None):
        self.db = db
        self.redis = redis_client

    async def get_all_alerts(
        self,
        page: int = 1,
        page_size: int = 100,
        filters: Optional[Dict[str, str]] = None,
    ) -> Tuple[List[Alert], int]:
        """Lấy danh sách tất cả alerts với phân trang và eager load Agent"""
        filters = filters or {}
        stmt = select(Alert).options(joinedload(Alert.agent)).where(Alert.event_type != "system_metric")
        count_stmt = select(func.count(Alert.id)).where(Alert.event_type != "system_metric")

        if filters.get("severity"):
            stmt = stmt.where(Alert.severity == filters["severity"])
            count_stmt = count_stmt.where(Alert.severity == filters["severity"])
        if filters.get("status"):
            stmt = stmt.where(Alert.status == filters["status"])
            count_stmt = count_stmt.where(Alert.status == filters["status"])
        if filters.get("event_type"):
            stmt = stmt.where(Alert.event_type == filters["event_type"])
            count_stmt = count_stmt.where(Alert.event_type == filters["event_type"])
        if filters.get("agent_id"):
            stmt = stmt.where(Alert.agent_id == filters["agent_id"])
            count_stmt = count_stmt.where(Alert.agent_id == filters["agent_id"])

        total_res = await self.db.execute(count_stmt)
        total = total_res.scalar() or 0

        offset = (page - 1) * page_size
        stmt = stmt.order_by(desc(Alert.created_at)).offset(offset).limit(page_size)

        result = await self.db.execute(stmt)
        alerts = list(result.scalars().all())
        return alerts, total

    async def get_alert_by_id(self, alert_id: str) -> Optional[Alert]:
        """Lấy alert theo ID với Agent preload"""
        stmt = select(Alert).options(joinedload(Alert.agent)).where(Alert.id == alert_id)
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    async def create_alert(self, data: Dict[str, Any]) -> Alert:
        """Tạo alert mới"""
        alert = Alert(
            id=data.get("id") or str(uuid.uuid4()),
            agent_id=data["agent_id"],
            rule_id=data.get("rule_id"),
            event_type=data["event_type"],
            severity=data["severity"],
            raw_payload=data.get("raw_payload", "{}"),
            status=data.get("status", "new"),
            title=data.get("title", ""),
            description=data.get("description", ""),
            mitre_tactic=data.get("mitre_tactic"),
            mitre_technique_id=data.get("mitre_technique_id"),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.db.add(alert)
        await self.db.commit()
        await self.db.refresh(alert)
        return alert

    async def update_alert_status(self, alert_id: str, status: str) -> bool:
        """Cập nhật trạng thái Alert"""
        stmt = select(Alert).where(Alert.id == alert_id)
        res = await self.db.execute(stmt)
        alert = res.scalar_one_or_none()
        if not alert:
            return False

        alert.status = status
        alert.updated_at = datetime.utcnow()
        await self.db.commit()
        return True

    async def update_alert_status_with_context(
        self,
        alert_id: str,
        status: str,
        description: str = "",
        tags: Optional[List[str]] = None,
    ) -> bool:
        """Cập nhật trạng thái + context từ n8n SOAR"""
        stmt = select(Alert).where(Alert.id == alert_id)
        res = await self.db.execute(stmt)
        alert = res.scalar_one_or_none()
        if not alert:
            return False

        alert.status = status
        if description:
            alert.description = description
        alert.updated_at = datetime.utcnow()
        await self.db.commit()
        return True

    async def get_alert_stats(self) -> Dict[str, Any]:
        """Thống kê alerts cho Dashboard"""
        stats: Dict[str, Any] = {}
        now = datetime.utcnow()
        start24h = now - timedelta(hours=24)

        # 1. Tổng alerts trong 24h
        res_today = await self.db.execute(
            select(func.count(Alert.id)).where(Alert.created_at >= start24h)
        )
        total_alerts_today = res_today.scalar() or 0
        stats["total_alerts_today"] = total_alerts_today

        # 2. Phân bố severity
        severity_map = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for sev in ["critical", "high", "medium", "low"]:
            cnt_res = await self.db.execute(
                select(func.count(Alert.id)).where(Alert.severity == sev)
            )
            severity_map[sev] = cnt_res.scalar() or 0

        stats["critical_alerts"] = severity_map["critical"]
        stats["severity_distribution"] = [
            {"name": "Critical", "value": severity_map["critical"], "color": "#ff3366"},
            {"name": "High", "value": severity_map["high"], "color": "#ff9900"},
            {"name": "Medium", "value": severity_map["medium"], "color": "#eab308"},
            {"name": "Low", "value": severity_map["low"], "color": "#60a5fa"},
        ]

        # 3. Agents total & online
        cnt_agents = await self.db.execute(select(func.count(Agent.id)))
        stats["agents_total"] = cnt_agents.scalar() or 0

        cnt_online = await self.db.execute(select(func.count(Agent.id)).where(Agent.status == "online"))
        stats["agents_online"] = cnt_online.scalar() or 0

        # 4. Active cases
        cnt_cases = await self.db.execute(
            select(func.count(Case.id)).where(Case.status.not_in(["Closed", "Rejected"]))
        )
        stats["active_cases"] = cnt_cases.scalar() or 0

        # 5. Alert trend last 24h
        trend_query = text("""
            SELECT DATE_FORMAT(created_at, '%H:00') AS hour,
                   severity,
                   COUNT(*) AS count
            FROM alerts
            WHERE created_at >= :start24h
              AND severity IN ('critical', 'high', 'medium')
            GROUP BY hour, severity
            ORDER BY hour ASC
        """)
        trend_rows = await self.db.execute(trend_query, {"start24h": start24h})
        hour_map = {}
        for row in trend_rows.fetchall():
            hour_str, sev, count = row[0], row[1], row[2]
            if hour_str not in hour_map:
                hour_map[hour_str] = {"critical": 0, "high": 0, "medium": 0}
            hour_map[hour_str][sev] = count

        alert_trend = []
        for i in range(23, -1, -1):
            target_hour = (now - timedelta(hours=i)).strftime("%H:00")
            counts = hour_map.get(target_hour, {"critical": 0, "high": 0, "medium": 0})
            alert_trend.append({
                "hour": target_hour,
                "critical": counts.get("critical", 0),
                "high": counts.get("high", 0),
                "medium": counts.get("medium", 0),
            })
        stats["alert_trend"] = alert_trend

        # 6. Top affected agents
        top_agents_query = text("""
            SELECT COALESCE(agents.hostname, 'Unknown') AS hostname, COUNT(*) AS alert_count
            FROM alerts
            LEFT JOIN agents ON agents.id = alerts.agent_id
            GROUP BY alerts.agent_id, agents.hostname
            ORDER BY alert_count DESC
            LIMIT 5
        """)
        top_agents_rows = await self.db.execute(top_agents_query)
        top_agents = [
            {"hostname": row[0].strip() if row[0] else "Unknown", "alert_count": row[1]}
            for row in top_agents_rows.fetchall()
        ]
        stats["top_agents"] = top_agents

        # Legacy keys
        stats["total"] = total_alerts_today
        stats["by_severity"] = severity_map
        stats["by_status"] = {"new": 0, "in_progress": 0, "resolved": 0}

        return stats

    async def run_cleanup(self, retention_days: int = 7):
        """Xóa LOW/EVENT-OBSERVED alerts cũ hơn N ngày"""
        cutoff = datetime.utcnow() - timedelta(days=retention_days)
        stmt = delete(Alert).where(
            ((Alert.severity == "low") | (Alert.rule_id == "EVENT-OBSERVED"))
            & (Alert.created_at < cutoff)
        )
        res = await self.db.execute(stmt)
        await self.db.commit()
        if res.rowcount:
            logger.info(f"[CLEANUP JOB] ✅ Đã xóa {res.rowcount} LOW alerts cũ hơn {retention_days} ngày")
