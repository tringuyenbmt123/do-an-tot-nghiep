# ==============================================================================
# test_db.py - Script kiểm tra kết nối MySQL Database
# Chạy: python test_db.py
# ==============================================================================

import asyncio
import sys
from sqlalchemy import text
from app.config import settings
from app.database import engine

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

async def test_connection():
    print("=" * 60)
    print("--> Đang kiểm tra kết nối đến MySQL Database...")
    print(f"[+] DB_HOST : {settings.DB_HOST}:{settings.DB_PORT}")
    print(f"[+] DB_USER : {settings.DB_USER}")
    print(f"[+] DB_NAME : {settings.DB_NAME}")
    print("=" * 60)

    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT VERSION()"))
            version = result.scalar()
            print("[SUCCESS] KẾT NỐI THÀNH CÔNG!")
            print(f"[+] Phiên bản MySQL: {version}")
    except Exception as e:
        print("[ERROR] KẾT NỐI THẤT BẠI!")
        print(f"[-] Chi tiết lỗi: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(test_connection())
