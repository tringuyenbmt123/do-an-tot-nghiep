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
            "id": "PS-SUSPICIOUS-001",
            "name": "Phát hiện PowerShell thực thi lệnh mã hóa/tải file đáng ngờ",
            "severity": "high",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "powershell.exe,pwsh.exe,powershell_ise.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "-EncodedCommand,-enc ,Invoke-Expression,IEX,DownloadString,DownloadFile,Net.WebClient,Invoke-WebRequest,Start-BitsTransfer,-ExecutionPolicy Bypass,-ep bypass,-nop -w hidden"}
            ]),
            "mitre_tactic": "Execution",
            "mitre_technique_id": "T1059.001",
            "description": "Phát hiện PowerShell chạy tham số mã hóa hoặc tải script độc hại từ bên ngoài.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "RANSOMWARE-VSS-001",
            "name": "Phát hiện xóa Volume Shadow Copy - Dấu hiệu Ransomware",
            "severity": "critical",
            "event_type": "sysmon_process_create",
            "conditions": json.dumps([
                {"field": "process_name", "operator": "in", "value": "vssadmin.exe,wmic.exe,bcdedit.exe,wbadmin.exe"},
                {"field": "command_line", "operator": "contains_any", "value": "delete shadows,shadowcopy delete,recoveryenabled No,resize shadowstorage"}
            ]),
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1490",
            "description": "Cảnh báo hành vi cố tình xóa bản sao lưu phục hồi hệ thống của ransomware.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100101",
            "name": "Linux - Critical Identity Database Modified",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/passwd,/etc/shadow"}
            ]),
            "mitre_tactic": "Initial Access",
            "mitre_technique_id": "T1078",
            "description": "Phát hiện sự thay đổi/thêm người dùng vào file quản lý tài khoản hệ thống Linux.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100102",
            "name": "Linux - Sudoers Privilege Escalation Tampering",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/sudoers,/etc/sudoers.d"}
            ]),
            "mitre_tactic": "Privilege Escalation",
            "mitre_technique_id": "T1548.003",
            "description": "Phát hiện cấu hình cấp quyền Root (Sudoers) bị can thiệp trái phép.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100103",
            "name": "Linux - SSH Configuration or Keys Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/ssh/sshd_config,authorized_keys"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1098.004",
            "description": "Phát hiện sửa cấu hình SSH daemon hoặc thêm SSH Public Key lạ để duy trì truy cập.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100104",
            "name": "Linux - Persistence Cron Job Created or Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/etc/cron,/var/spool/cron"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1053.003",
            "description": "Phát hiện lịch chạy tự động (Cron job) mới được tạo hoặc chỉnh sửa.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100105",
            "name": "Linux - Persistence Systemd Service Unit Added/Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains", "value": "/etc/systemd/system"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1543.002",
            "description": "Phát hiện service hệ thống Linux mới được đăng ký để khởi động cùng OS.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100107",
            "name": "Linux - SUID/SGID Bit Granted to File",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "perm", "operator": "contains_any", "value": "4000,2000"}
            ]),
            "mitre_tactic": "Privilege Escalation",
            "mitre_technique_id": "T1548.001",
            "description": "Phát hiện gán quyền SUID/SGID cho file cho phép leo thang quyền root.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100108",
            "name": "Linux - Web Shell Dropped in Web Root",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains", "value": "/var/www/html"},
                {"field": "path", "operator": "contains_any", "value": ".php,.phtml,.phar"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1505.003",
            "description": "Phát hiện file mã độc Web Shell tạo mới trong thư mục nguồn Web Server.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100109",
            "name": "Linux - Executable Script Created in Temp Directory",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "/tmp/,/var/tmp/,/dev/shm/"},
                {"field": "path", "operator": "contains_any", "value": ".sh,.py,.pl,.elf"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1059.004",
            "description": "Phát hiện script/binary thực thi được thả vào thư mục tạm của hệ thống.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100201",
            "name": "Windows - System32 Executable / DLL Modification",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "System32,SysWOW64"},
                {"field": "path", "operator": "contains_any", "value": ".exe,.dll,.sys"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1036",
            "description": "Phát hiện can thiệp chỉnh sửa/ghi đè file hệ thống cốt lõi Windows System32.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100202",
            "name": "Windows - Scheduled Task File Created / Modified",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains", "value": "System32\\Tasks"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1053.005",
            "description": "Phát hiện file cấu hình Windows Scheduled Task mới được tạo hoặc chỉnh sửa.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100203",
            "name": "Windows - Startup Folder Modification",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains", "value": "Start Menu\\Programs\\Startup"}
            ]),
            "mitre_tactic": "Persistence",
            "mitre_technique_id": "T1547.001",
            "description": "Phát hiện shortcut hoặc file thực thi thả vào thư mục Startup khởi động cùng Windows.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100301",
            "name": "Global - Security Agent Configuration Tampering",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "ossec.conf,wazuh-agent.conf"}
            ]),
            "mitre_tactic": "Defense Evasion",
            "mitre_technique_id": "T1562.001",
            "description": "Phát hiện file cấu hình agent giám sát an ninh bị can thiệp/vô hiệu hóa.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-100303",
            "name": "Global - Ransomware Note Detected",
            "severity": "critical",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "path", "operator": "contains_any", "value": "readme_decrypt,how_to_decrypt,DECRYPT_FILES,.LOCKED,.crypted"}
            ]),
            "mitre_tactic": "Impact",
            "mitre_technique_id": "T1486",
            "description": "Phát hiện file thông báo tống tiền (Ransom note) hoặc đuôi file bị mã hóa.",
            "is_active": True,
            "source": "database",
        },
        {
            "id": "FIM-DOWNLOAD-SUSP-001",
            "name": "Phát hiện file thực thi mới được tải về (Downloads Monitor)",
            "severity": "high",
            "event_type": "file_integrity",
            "conditions": json.dumps([
                {"field": "action", "operator": "equals", "value": "created"},
                {"field": "path", "operator": "contains_any", "value": "Downloads,temp,.exe,.bat,.ps1,.vbs,.iso"}
            ]),
            "mitre_tactic": "Initial Access",
            "mitre_technique_id": "T1566",
            "description": "Phát hiện các file có khả năng chứa mã độc thực thi được tải về thư mục Downloads.",
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
