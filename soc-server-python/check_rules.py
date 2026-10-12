import asyncio
import sys
sys.path.insert(0, '.')
from app.database import init_db, AsyncSessionLocal
from sqlalchemy import text

async def check():
    await init_db()
    async with AsyncSessionLocal() as db:
        r = await db.execute(text("SELECT id, name, severity, event_type, is_active FROM rules ORDER BY id"))
        rows = r.fetchall()
        print(f"Total rules in DB: {len(rows)}")
        print("-" * 120)
        for row in rows:
            rid = str(row[0]).ljust(30)
            sev = str(row[2]).ljust(10)
            evt = str(row[3]).ljust(25)
            act = str(row[4])
            nm = str(row[1])
            print(f"  {rid} | {sev} | {evt} | active={act} | {nm}")
        print("-" * 120)
    from app.database import engine
    await engine.dispose()

asyncio.run(check())
