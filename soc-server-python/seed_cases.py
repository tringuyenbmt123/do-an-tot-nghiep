# seed_cases.py - Script nạp dữ liệu Case Management mẫu thực tế
import asyncio
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.case import Case

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_cases")

REAL_CASES = [
    {
        "title": "[INC-2026-001] Nghi vấn tấn công Ransomware LockBit 3.0 tại Server Kế toán",
        "description": "Phát hiện chuỗi hành vi bất thường: Tiến trình vssadmin.exe thực hiện xóa Volume Shadow Copies, đồng thời phát hiện file mã hóa có phần mở rộng .lockbit trên Endpoint DESKTOP-OQEMTR9.",
        "severity_num": 1,  # Critical
        "status": "InProgress",
        "assigned_to": "admin",
        "tags": '["ransomware", "lockbit", "critical", "incident_response"]',
        "soar_status": "isolated",
        "ai_reason": "AI khuyến nghị ngắt kết nối mạng endpoint lập tức và vô hiệu hóa tài khoản bị lạm dụng.",
        "confidence": 0.95
    },
    {
        "title": "[INC-2026-002] Phát hiện kết nối C2 Beacon Cobalt Strike qua HTTPS",
        "description": "Cảnh báo từ Network Monitoring cho thấy Endpoint thực hiện kết nối liên tục (beaconing) đến IP độc hại 193.23.161.42 định kỳ mỗi 60 giây.",
        "severity_num": 2,  # High
        "status": "New",
        "assigned_to": "soc_analyst1",
        "tags": '["cobalt_strike", "c2", "apt29", "high"]',
        "soar_status": "pending",
        "ai_reason": "Phát hiện lưu lượng mã hóa HTTPS không chuẩn, trùng khớp với mẫu Cobalt Strike Malleable C2 Profile.",
        "confidence": 0.88
    },
    {
        "title": "[INC-2026-003] Cảnh báo đánh cắp tài khoản qua chiến dịch Phishing Office365",
        "description": "Người dùng nhấp vào đường dẫn lừa đảo account-verification-office365.net và nhập thông tin đăng nhập trong thư lừa đảo giả danh IT Helpdesk.",
        "severity_num": 3,  # Medium
        "status": "Closed",
        "assigned_to": "admin",
        "tags": '["phishing", "credential_harvesting", "mfa_reset"]',
        "soar_status": "completed",
        "ai_reason": "Đã thu hồi token đăng nhập và yêu cầu người dùng đổi mật khẩu + xác thực MFA lại.",
        "confidence": 0.90
    }
]

async def seed_cases_data():
    async with AsyncSessionLocal() as session:
        logger.info("[SEED] Đang kiểm tra dữ liệu Cases trong DB...")
        stmt = select(Case)
        res = await session.execute(stmt)
        existing_cases = res.scalars().all()

        if len(existing_cases) == 0:
            for c_data in REAL_CASES:
                new_case = Case(
                    title=c_data["title"],
                    description=c_data["description"],
                    severity_num=c_data["severity_num"],
                    status=c_data["status"],
                    assigned_to=c_data["assigned_to"],
                    tags=c_data["tags"],
                    soar_status=c_data["soar_status"],
                    ai_reason=c_data["ai_reason"],
                    confidence=c_data["confidence"],
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_case)
            await session.commit()
            logger.info(f"[SEED] ✅ Đã bổ sung thành công {len(REAL_CASES)} Incident Cases mẫu vào Database!")
        else:
            logger.info("[SEED] ℹ️ Đã có dữ liệu Cases trong Database.")

if __name__ == "__main__":
    asyncio.run(seed_cases_data())
