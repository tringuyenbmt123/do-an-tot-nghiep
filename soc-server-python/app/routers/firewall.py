from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
import asyncio
from app.database import get_db
from app.models.firewall import IpBlocklist
from app.models.user import User
from app.services.auth_service import AuthService
from app.config import settings
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/firewall", tags=["Firewall"])

# ====================== CẤU HÌNH PFSENSE SSH ======================
PFSENSE_HOST = "192.168.221.221"
PFSENSE_PORT = 22
PFSENSE_USER = "admin"
PFSENSE_PASS = "pfsense"
DNSBL_FILE   = "/var/unbound/pfb_dnsbl_SOAR.conf"
# ==================================================================


def _run_ssh_command(command: str) -> dict:
    """Chạy lệnh SSH đồng bộ trên pfSense, trả về stdout+stderr."""
    try:
        import paramiko
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=PFSENSE_HOST,
            port=PFSENSE_PORT,
            username=PFSENSE_USER,
            password=PFSENSE_PASS,
            timeout=10,
            look_for_keys=False,
            allow_agent=False,
        )
        stdin, stdout, stderr = client.exec_command(command, timeout=15)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        exit_code = stdout.channel.recv_exit_status()
        client.close()
        return {"output": out, "error": err, "exit_code": exit_code, "command": command}
    except Exception as e:
        return {"output": "", "error": str(e), "exit_code": -1, "command": command}


@router.get("/blocklist")
async def get_blocklist(user: dict = Depends(get_current_user)):
    """
    Đọc trực tiếp danh sách IP bị chặn trên pfSense:
    - SOAR_Phishing_BlockList: IP phân giải từ Phishing Domain
    - SOAR_BlockList: IP tấn công mạng / DDoS
    """
    cmd = (
        "echo '===PHISHING==='; pfctl -t SOAR_Phishing_BlockList -T show 2>/dev/null; "
        "echo '===ATTACK==='; pfctl -t SOAR_BlockList -T show 2>/dev/null"
    )
    result = await asyncio.get_event_loop().run_in_executor(None, _run_ssh_command, cmd)
    out = result.get("output", "")

    items = []
    current_table = "SOAR_Phishing_BlockList"
    current_type = "Phishing Resolved IP"

    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        if line == "===PHISHING===":
            current_table = "SOAR_Phishing_BlockList"
            current_type = "Phishing IP"
            continue
        if line == "===ATTACK===":
            current_table = "SOAR_BlockList"
            current_type = "DDoS / Threat IP"
            continue

        items.append({
            "cidr": line,
            "table": current_table,
            "type": current_type,
            "reason": f"Chặn tự động qua SOAR ({current_table})",
            "source": "pfSense pfctl",
        })

    return {"data": items, "total": len(items)}


class UnblockIpRequest(BaseModel):
    ip: str
    table: Optional[str] = "SOAR_Phishing_BlockList"
    password: str
    reason: Optional[str] = "Gỡ chặn thủ công bởi chuyên viên SOC"


@router.post("/blocklist/unblock")
async def unblock_ip(
    req: UnblockIpRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Gỡ chặn IP khỏi bảng pfSense pfctl (yêu cầu mật khẩu xác thực)."""
    # 1. Xác thực mật khẩu
    auth_service = AuthService(db)
    stmt = select(User).where((User.id == user.get("id")) | (User.username == user.get("username")))
    user_record = (await db.execute(stmt)).scalar_one_or_none()

    password_valid = False
    if user_record and auth_service.verify_password(req.password, user_record.password_hash):
        password_valid = True
    elif req.password == settings.admin_password:
        password_valid = True

    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mật khẩu xác thực không đúng! Vui lòng nhập đúng mật khẩu.",
        )

    safe_ip = req.ip.strip()
    safe_table = req.table.strip() if req.table else "SOAR_Phishing_BlockList"
    if safe_table not in ["SOAR_Phishing_BlockList", "SOAR_BlockList"]:
        raise HTTPException(status_code=400, detail="Bảng pfctl không hợp lệ")

    cmd = f"pfctl -t {safe_table} -T delete {safe_ip}"
    result = await asyncio.get_event_loop().run_in_executor(None, _run_ssh_command, cmd)
    if result["exit_code"] != 0 and result["error"]:
        raise HTTPException(status_code=500, detail=f"Lỗi khi xóa IP trên pfSense: {result['error']}")

    return {
        "success": True,
        "message": f"Đã gỡ chặn IP {safe_ip} khỏi bảng {safe_table} thành công.",
        "ip": safe_ip,
        "table": safe_table,
    }


@router.get("/domains")
async def get_blocked_domains(user: dict = Depends(get_current_user)):
    """Đọc danh sách domain đã bị DNS Sinkhole từ pfSense qua SSH."""
    result = await asyncio.get_event_loop().run_in_executor(
        None, _run_ssh_command,
        f"cat {DNSBL_FILE} 2>/dev/null || echo ''"
    )
    if result["exit_code"] != 0 and not result["output"]:
        return {"data": [], "total": 0, "error": result["error"]}

    domains = []
    for line in result["output"].splitlines():
        line = line.strip()
        # Dòng mẫu: local-data: "an0r3w.qzz.io 60 IN A 192.168.10.1"
        if line.startswith("local-data:"):
            try:
                inner = line.split('"')[1]   # an0r3w.qzz.io 60 IN A 192.168.10.1
                parts = inner.split()
                domain = parts[0]
                sinkhole_ip = parts[-1] if len(parts) >= 5 else "N/A"
                domains.append({
                    "domain": domain,
                    "sinkhole_ip": sinkhole_ip,
                    "source": "pfBlockerNG/Unbound"
                })
            except Exception:
                continue

    return {"data": domains, "total": len(domains)}


class UnblockDomainRequest(BaseModel):
    domain: str
    password: str
    reason: Optional[str] = "Gỡ chặn thủ công bởi chuyên viên SOC"


@router.post("/domains/unblock")
async def unblock_domain(
    req: UnblockDomainRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Gỡ chặn domain khỏi pfSense DNS Sinkhole (yêu cầu xác thực mật khẩu người dùng hoặc admin)."""
    # 1. Xác thực mật khẩu
    auth_service = AuthService(db)
    stmt = select(User).where((User.id == user.get("id")) | (User.username == user.get("username")))
    user_record = (await db.execute(stmt)).scalar_one_or_none()

    password_valid = False
    if user_record and auth_service.verify_password(req.password, user_record.password_hash):
        password_valid = True
    elif req.password == settings.admin_password:
        password_valid = True

    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mật khẩu xác thực không đúng! Vui lòng nhập mật khẩu tài khoản của bạn để gỡ chặn.",
        )

    # 2. Làm sạch domain
    safe_domain = req.domain.strip().lower().replace('"', '').replace("'", "")
    if not safe_domain:
        raise HTTPException(status_code=400, detail="Domain không hợp lệ")

    # 3. Lệnh xoá dòng chứa domain và reload unbound trên pfSense
    cmd = (
        f"grep -v '\"{safe_domain} ' {DNSBL_FILE} > {DNSBL_FILE}.tmp 2>/dev/null && "
        f"mv {DNSBL_FILE}.tmp {DNSBL_FILE} && "
        f"/usr/local/sbin/pfSsh.php playback svc restart unbound"
    )
    result = await asyncio.get_event_loop().run_in_executor(None, _run_ssh_command, cmd)
    if result["exit_code"] != 0 and result["error"]:
        raise HTTPException(status_code=500, detail=f"Lỗi khi thực thi trên pfSense: {result['error']}")

    return {
        "success": True,
        "message": f"Đã gỡ chặn domain {safe_domain} thành công và reload lại Unbound DNS.",
        "domain": safe_domain,
    }


ALLOWED_PREFIXES = [
    "pfctl -t", "pfctl -s", "cat ", "grep ", "ls ", "echo ",
    "/usr/local/sbin/pfSsh.php", "unbound-control",
    "ps aux", "netstat", "ifconfig", "df ", "uptime", "uname",
]

DANGEROUS_PATTERNS = [
    "rm ", "mkfs", "dd ", "; rm", "&& rm", "| rm",
    "reboot", "shutdown", "halt", "init 0",
    "> /etc", "> /bin", "> /usr",
]


class SSHCommandRequest(BaseModel):
    command: str
    confirm: Optional[bool] = False


@router.post("/ssh")
async def run_pfsense_ssh(req: SSHCommandRequest, user: dict = Depends(get_current_user)):
    """Chạy lệnh pfSense qua SSH trực tiếp từ giao diện SOC Console."""
    cmd = req.command.strip()

    for bad in DANGEROUS_PATTERNS:
        if bad.lower() in cmd.lower():
            raise HTTPException(status_code=400, detail=f"Lệnh bị từ chối: chứa cú pháp nguy hiểm '{bad}'")

    allowed = any(cmd.startswith(p) for p in ALLOWED_PREFIXES)
    if not allowed and not req.confirm:
        raise HTTPException(
            status_code=400,
            detail="Lệnh không nằm trong danh sách cho phép. Đặt confirm=true để chạy lệnh tùy ý."
        )

    result = await asyncio.get_event_loop().run_in_executor(None, _run_ssh_command, cmd)
    return result
