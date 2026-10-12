import asyncio
import sys
sys.path.insert(0, '.')
from app.database import init_db, AsyncSessionLocal
from sqlalchemy import text
from seeder import run_seed

async def reset_rules():
    await init_db()
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        await db.execute(text("TRUNCATE TABLE rules;"))
        await db.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
        await db.commit()
        print("✅ Đã xóa các rule cũ trong database.")
    
    # Chạy seeder để thêm lại
    await run_seed()

if __name__ == "__main__":
    asyncio.run(reset_rules())
