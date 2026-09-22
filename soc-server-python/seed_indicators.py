# seed_indicators.py - Script nạp dữ liệu IOC Threat Intelligence thực tế
import asyncio
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models.indicator import Indicator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_indicators")

REAL_IOCS = [
    # IP Addresses (C2, Botnet, Ransomware Exfil, Tor Exit)
    {
        "type": "ip-src",
        "value": "185.220.101.5",
        "category": "c2_server",
        "source": "AbuseIPDB",
        "mitre_tactic": "Command and Control",
        "mitre_technique_id": "T1071.001",
        "risk_score": 95,
        "description": "Tor Exit Node thường xuyên được dùng trong các đợt tấn công brute-force và C2 traffic của ransomware.",
    },
    {
        "type": "ip-dst",
        "value": "193.23.161.42",
        "category": "c2_server",
        "source": "ThreatConnect OSINT",
        "mitre_tactic": "Command and Control",
        "mitre_technique_id": "T1071.001",
        "risk_score": 90,
        "description": "Cobalt Strike Beacon C2 Server điều khiển từ xa được phát hiện trong chiến dịch tấn công APT29.",
    },
    {
        "type": "ip-src",
        "value": "45.147.229.177",
        "category": "malware",
        "source": "URLhaus",
        "mitre_tactic": "Credential Access",
        "mitre_technique_id": "T1555",
        "risk_score": 88,
        "description": "Máy chủ C2 của phần mềm đánh cắp thông tin RedLine Stealer, thu thập mật khẩu và session cookies.",
    },
    {
        "type": "ip-dst",
        "value": "185.193.127.185",
        "category": "botnet",
        "source": "AlienVault OTX",
        "mitre_tactic": "Command and Control",
        "mitre_technique_id": "T1571",
        "risk_score": 92,
        "description": "Hạ tầng Botnet Qakbot (Qbot) chuyên phát tán mã độc qua tài liệu Office đính kèm email.",
    },
    {
        "type": "ip-src",
        "value": "141.98.11.91",
        "category": "ransomware",
        "source": "CISA KEV",
        "mitre_tactic": "Impact",
        "mitre_technique_id": "T1486",
        "risk_score": 98,
        "description": "IP thuộc hạ tầng tống tiền LockBit 3.0 Ransomware, được dùng để trích xuất dữ liệu (Data Exfiltration).",
    },
    {
        "type": "ip-dst",
        "value": "23.106.160.37",
        "category": "malware",
        "source": "Mandiant Intelligence",
        "mitre_tactic": "Execution",
        "mitre_technique_id": "T1059.001",
        "risk_score": 85,
        "description": "Emotet Epoch 5 Command Server phát tán tệp thực thi mã độc qua các tập tin đính kèm lừa đảo.",
    },
    {
        "type": "ip-src",
        "value": "194.26.29.114",
        "category": "c2_server",
        "source": "VirusTotal Feed",
        "mitre_tactic": "Command and Control",
        "mitre_technique_id": "T1095",
        "risk_score": 82,
        "description": "AsyncRAT C2 Node kết nối qua cổng mã hóa TLS tùy chỉnh để duy trì quyền truy cập trái phép.",
    },

    # Domains (Phishing, C2, Malicious Droppers)
    {
        "type": "domain",
        "value": "update-microsoft-security.com",
        "category": "phishing",
        "source": "CISA KEV",
        "mitre_tactic": "Initial Access",
        "mitre_technique_id": "T1566.002",
        "risk_score": 94,
        "description": "Tên miền giả mạo Microsoft Security Update được sử dụng trong chiến dịch lừa đảo chiếm tài khoản.",
    },
    {
        "type": "domain",
        "value": "account-verification-office365.net",
        "category": "phishing",
        "source": "Abuse.ch Feed",
        "mitre_tactic": "Initial Access",
        "mitre_technique_id": "T1566.002",
        "risk_score": 91,
        "description": "Trang web phishing giả mạo xác minh tài khoản Office365 nhằm thu thập thông tin đăng nhập của doanh nghiệp.",
    },
    {
        "type": "domain",
        "value": "cdn-cloud-deliver.xyz",
        "category": "c2_server",
        "source": "AlienVault OTX",
        "mitre_tactic": "Command and Control",
        "mitre_technique_id": "T1071.001",
        "risk_score": 89,
        "description": "Tên miền ngụy trang dưới dạng CDN để phân phối Cobalt Strike Stagers và tải thêm DLL độc hại.",
    },
    {
        "type": "domain",
        "value": "auth-login-paypal.servehttp.com",
        "category": "phishing",
        "source": "URLhaus",
        "mitre_tactic": "Credential Access",
        "mitre_technique_id": "T1556",
        "risk_score": 86,
        "description": "Tên miền DDNS giả mạo trang đăng nhập PayPal nhằm đánh cắp thông tin thẻ và tài khoản ngân hàng.",
    },
    {
        "type": "domain",
        "value": "update-win11-patch.info",
        "category": "malware",
        "source": "ThreatConnect OSINT",
        "mitre_tactic": "Execution",
        "mitre_technique_id": "T1204.002",
        "risk_score": 87,
        "description": "Trang web giả mạo bản vá Windows 11 dụ dỗ người dùng tải về file thực thi chứa mã độc trojan.",
    },

    # Hashes (SHA256 / MD5)
    {
        "type": "sha256",
        "value": "24d4a157f43e45bc4a32e5c2d0550055572dd876350796dee098d41270f8ed84",
        "category": "ransomware",
        "source": "VirusTotal",
        "mitre_tactic": "Impact",
        "mitre_technique_id": "T1486",
        "risk_score": 100,
        "description": "Mẫu WannaCry Ransomware binary huyền thoại mã hóa dữ liệu hàng loạt và đòi tiền chuộc qua Bitcoin.",
    },
    {
        "type": "sha256",
        "value": "70972608485b0aa7a1029c9b1f7d54b428d0b2f56b233a7e32ef74e5349272f6",
        "category": "ransomware",
        "source": "Mandiant Intelligence",
        "mitre_tactic": "Defense Evasion",
        "mitre_technique_id": "T1027",
        "risk_score": 99,
        "description": "LockBit 3.0 Ransomware Executable Payload với kỹ thuật chống phân tích ngược nâng cao.",
    },
    {
        "type": "sha256",
        "value": "4f4645391d4e022f4625b1ae310a0e4c6984e1b9b1e9488a0e2a22f30b91d293",
        "category": "malware",
        "source": "URLhaus Feed",
        "mitre_tactic": "Execution",
        "mitre_technique_id": "T1059.005",
        "risk_score": 93,
        "description": "Emotet DLL Dropper thực thi thông qua rundll32.exe nhằm injection vào các tiến trình hệ thống.",
    },
    {
        "type": "sha256",
        "value": "ed01ebfbc9eb5bbea545af4d01bf5f1071661840480439c6e5babe8e080e41aa",
        "category": "c2_server",
        "source": "AlienVault OTX",
        "mitre_tactic": "Defense Evasion",
        "mitre_technique_id": "T1055",
        "risk_score": 96,
        "description": "Cobalt Strike Reflective DLL Injection Payload sử dụng giao thức HTTPS để giao tiếp C2 ngụy trang.",
    },
    {
        "type": "md5",
        "value": "84c82835a5d21bbcf75a61706d8ab549",
        "category": "ransomware",
        "source": "MISP Feed",
        "mitre_tactic": "Impact",
        "mitre_technique_id": "T1486",
        "risk_score": 97,
        "description": "MD5 Hash của WannaCry Worm Component chuyên quét cổng 445 (SMB) để lan truyền nội bộ.",
    },
    {
        "type": "md5",
        "value": "b7b512c011e1388b17ee27ef74bf2524",
        "category": "c2_server",
        "source": "ThreatConnect",
        "mitre_tactic": "Execution",
        "mitre_technique_id": "T1059.001",
        "risk_score": 90,
        "description": "MD5 Hash của Cobalt Strike Stager PowerShell Script dùng để tải Beacon về bộ nhớ RAM.",
    },

    # URLs (Malicious Download / Phishing Links)
    {
        "type": "url",
        "value": "http://185.193.127.185/payloads/invoice_2026.exe",
        "category": "malware",
        "source": "URLhaus",
        "mitre_tactic": "Initial Access",
        "mitre_technique_id": "T1566.001",
        "risk_score": 92,
        "description": "Đường dẫn tải xuống file thực thi độc hại ngụy trang hóa đơn tài chính nhằm hạ gục máy nạn nhân.",
    },
    {
        "type": "url",
        "value": "https://update-microsoft-security.com/login/auth.php",
        "category": "phishing",
        "source": "PhishTank Feed",
        "mitre_tactic": "Credential Access",
        "mitre_technique_id": "T1556",
        "risk_score": 94,
        "description": "Đường dẫn trang đăng nhập lừa đảo nhằm chiếm đoạt tài khoản Microsoft 365 Enterprise.",
    }
]

async def seed_data():
    async with AsyncSessionLocal() as session:
        logger.info("[SEED] Đang kiểm tra dữ liệu IOCs trong DB...")
        stmt = select(Indicator)
        res = await session.execute(stmt)
        existing_iocs = res.scalars().all()
        existing_values = {ioc.value.lower() for ioc in existing_iocs}

        added_count = 0
        for ioc_data in REAL_IOCS:
            val = ioc_data["value"].lower()
            if val not in existing_values:
                new_ioc = Indicator(
                    type=ioc_data["type"],
                    value=ioc_data["value"],
                    category=ioc_data["category"],
                    source=ioc_data["source"],
                    mitre_tactic=ioc_data["mitre_tactic"],
                    mitre_technique_id=ioc_data["mitre_technique_id"],
                    risk_score=ioc_data["risk_score"],
                    description=ioc_data["description"],
                    is_active=True,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_ioc)
                added_count += 1

        await session.commit()
        logger.info(f"[SEED] ✅ Đã bổ sung thành công {added_count} IOCs chất lượng vào Database!")

if __name__ == "__main__":
    asyncio.run(seed_data())
