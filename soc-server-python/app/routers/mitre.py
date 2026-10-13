# ==============================================================================
# app/routers/mitre.py - MITRE ATT&CK Matrix Coverage API
# ==============================================================================

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.rule import Rule
from app.models.alert import Alert
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/mitre", tags=["MITRE"])

# Bản đồ tên kỹ thuật chuẩn theo MITRE ATT&CK Enterprise
TECHNIQUE_NAMES = {
    "T1059": "Command and Scripting Interpreter",
    "T1059.001": "PowerShell",
    "T1059.003": "Windows Command Shell",
    "T1059.004": "Unix Shell",
    "T1059.005": "Visual Basic",
    "T1046": "Network Service Discovery",
    "T1087.002": "Domain Account Discovery",
    "T1003.001": "LSASS Memory Dumping",
    "T1003.002": "Security Account Manager",
    "T1566": "Phishing",
    "T1566.001": "Spearphishing Attachment",
    "T1036": "Masquerading",
    "T1036.005": "Match Legitimate Name/Location",
    "T1070.001": "Clear Windows Event Logs",
    "T1070.002": "Clear Linux System Logs",
    "T1562.001": "Disable or Modify Tools",
    "T1562.004": "Disable System Firewall",
    "T1565.001": "Stored Data Manipulation",
    "T1486": "Data Encrypted for Impact",
    "T1490": "Inhibit System Recovery",
    "T1496": "Resource Hijacking",
    "T1547.001": "Registry Run Keys / Startup Folder",
    "T1053.005": "Scheduled Task",
    "T1021.001": "Remote Desktop Protocol",
    "T1047": "Windows Management Instrumentation",
    "T1570": "Lateral Tool Transfer",
    "T1071.001": "Web Protocols (C2)",
    "T1090.003": "Multi-hop Proxy",
    "T1136.001": "Local Account Creation",
    "T1548.001": "Setuid and Setgid",
    "T1548.003": "Sudo and Sudo Caching",
    "T1552.001": "Credentials In Files",
    "T1552.004": "Private Keys",
    "T1558.003": "Kerberoasting",
    "T1560.001": "Archive via Utility",
    "T1048.003": "Exfiltration Over Unencrypted Protocol",
    "T1140": "Deobfuscate/Decode Files or Information",
    "T1195.002": "Compromise Software Supply Chain",
    "T1204.002": "Malicious File Execution",
    "T1484.001": "Group Policy Modification",
    "T1505.003": "Web Shell",
    "T1542.003": "Bootkit",
    "T1543.002": "Systemd Service",
    "T1543.003": "Windows Service",
    "T1546.003": "WMI Event Subscription",
    "T1546.004": "Unix Shell Configuration Modification",
    "T1546.013": "PowerShell Profile",
    "T1547.006": "Kernel Modules and Extensions",
    "T1553.004": "Install Root Certificate",
    "T1556.003": "Pluggable Authentication Modules",
    "T1574.001": "DLL Search Order Hijacking",
    "T1574.006": "Dynamic Linker Hijacking",
    "T1610": "Deploy Container",
    "T1078": "Valid Accounts",
    "T1005": "Data from Local System",
}

TACTIC_NORMALIZE = {
    t.lower(): t for t in [
        "Initial Access", "Execution", "Persistence", "Privilege Escalation",
        "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
        "Collection", "Exfiltration", "Command and Control", "Impact",
        "Resource Development", "Reconnaissance"
    ]
}


def normalize_tactic(tac: str) -> str:
    if not tac:
        return "Discovery"
    return TACTIC_NORMALIZE.get(tac.strip().lower(), tac.strip())


@router.get("/coverage")
async def get_mitre_coverage(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Tính toán độ phủ MITRE ATT&CK dựa trên:
    1. Danh sách Rules đang kích hoạt (Coverage theo dõi).
    2. Số lượng Alerts thực tế đã phát hiện trong DB (Hits theo dõi).
    """
    # 1. Đếm số lượng alert thực tế theo từng mitre_technique_id
    alert_counts_query = (
        select(Alert.mitre_technique_id, func.count(Alert.id))
        .where(Alert.mitre_technique_id.isnot(None), Alert.mitre_technique_id != "")
        .group_by(Alert.mitre_technique_id)
    )
    alert_res = await db.execute(alert_counts_query)
    hits_map = {row[0].strip(): row[1] for row in alert_res.all() if row[0]}

    # 2. Lấy danh sách rules đang hoạt động có mitre_technique_id
    rules_res = await db.execute(
        select(Rule).where(
            Rule.mitre_technique_id.isnot(None),
            Rule.mitre_technique_id != "",
            Rule.is_active == True
        )
    )
    rules = rules_res.scalars().all()

    techniques_dict = {}

    # 3. Nạp danh sách technique từ các Rule đang hoạt động
    for r in rules:
        tid = r.mitre_technique_id.strip() if r.mitre_technique_id else ""
        if not tid:
            continue
        tactic = normalize_tactic(r.mitre_tactic or "")
        name = TECHNIQUE_NAMES.get(tid, r.name)

        if tid not in techniques_dict:
            techniques_dict[tid] = {
                "id": tid,
                "name": name,
                "tactic": tactic,
                "hits": hits_map.get(tid, 0),
                "description": r.description or r.name,
                "rule_count": 1,
            }
        else:
            techniques_dict[tid]["rule_count"] += 1
            # Giữ hits thực tế đã đếm
            techniques_dict[tid]["hits"] = hits_map.get(tid, 0)

    # 4. Nạp bổ sung từ Alerts nếu alert có technique mà rules chưa có
    for tid, hits in hits_map.items():
        if tid and tid not in techniques_dict:
            alert_sample_res = await db.execute(
                select(Alert.mitre_tactic, Alert.title, Alert.description)
                .where(Alert.mitre_technique_id == tid)
                .limit(1)
            )
            sample = alert_sample_res.first()
            sample_tactic = normalize_tactic(sample[0]) if sample and sample[0] else "Discovery"
            sample_name = TECHNIQUE_NAMES.get(tid, sample[1] if sample and sample[1] else f"Technique {tid}")
            sample_desc = sample[2] if sample and sample[2] else f"Phát hiện qua cảnh báo {tid}"
            techniques_dict[tid] = {
                "id": tid,
                "name": sample_name,
                "tactic": sample_tactic,
                "hits": hits,
                "description": sample_desc,
                "rule_count": 0,
            }

    # 5. Sắp xếp kết quả theo Tactic và Technique ID
    result = sorted(list(techniques_dict.values()), key=lambda x: (x["tactic"], x["id"]))

    return {
        "data": result,
        "total_techniques": len(result),
        "total_hits": sum(x["hits"] for x in result)
    }
