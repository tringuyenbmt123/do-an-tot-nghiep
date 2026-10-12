import asyncio
import sys
sys.path.insert(0, '.')
from app.database import init_db, AsyncSessionLocal
from app.models.rule import Rule
from app.services.rule_service import default_rules
from sqlalchemy import text

async def reseed_only_rules():
    await init_db()
    async with AsyncSessionLocal() as db:
        print("Clearing old rules...")
        await db.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        await db.execute(text("TRUNCATE TABLE rules;"))
        await db.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
        await db.commit()
        print("✅ Đã xóa các rule cũ trong database.")
        
        print("Inserting new rules...")
        rules_data = default_rules()
        for r_data in rules_data:
            r = Rule(**r_data)
            db.add(r)
        await db.commit()
        print(f"✅ Đã thêm thành công {len(rules_data)} detection rules.")
    
    from app.database import engine
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(reseed_only_rules())
