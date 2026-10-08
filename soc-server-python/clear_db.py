import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def clear_data():
    async with AsyncSessionLocal() as session:
        # Xóa hết alerts và cases để làm sạch database
        await session.execute(text("TRUNCATE TABLE alerts;"))
        await session.execute(text("TRUNCATE TABLE cases;"))
        await session.commit()
        print("✅ Đã xoá sạch toàn bộ Alerts và Cases bị lỗi font!")

if __name__ == "__main__":
    asyncio.run(clear_data())
