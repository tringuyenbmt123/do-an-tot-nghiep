# ==============================================================================
# seeder.py - Database Seeder Script cho SOC Server Python
# Sử dụng: python seeder.py
# ==============================================================================

import asyncio
import logging

from sqlalchemy import select, func

from app.database import init_db, AsyncSessionLocal
from app.models.user import User
from app.models.agent import Agent
from app.models.alert import Alert
from app.models.rule import Rule
from app.models.indicator import Indicator
from app.services.auth_service import AuthService
from app.services.alert_service import default_agents, default_alerts
from app.services.rule_service import default_rules
from app.services.indicator_service import default_indicators

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seeder")


async def run_seed():
    logger.info("🌱 Bắt đầu seed dữ liệu mẫu vào MySQL...")
    await init_db()

    async with AsyncSessionLocal() as session:
        # 1. Admin account
        res = await session.execute(select(func.count(User.id)).where(User.username == "admin"))
        if (res.scalar() or 0) == 0:
            auth = AuthService(session)
            await auth.create_user("admin", "admin123", "admin@soc.local", "admin")
            logger.info("✅ Đã tạo tài khoản admin (pass: admin123)")
        else:
            logger.info("ℹ️ Tài khoản admin đã tồn tại.")

        # 2. Demo Agents
        res = await session.execute(select(func.count(Agent.id)))
        if (res.scalar() or 0) == 0:
            for ag_data in default_agents():
                ag = Agent(**ag_data)
                session.add(ag)
            await session.commit()
            logger.info(f"✅ Đã thêm {len(default_agents())} demo agents")
        else:
            logger.info("ℹ️ Agents đã tồn tại trong database.")

        # 3. Detection Rules
        res = await session.execute(select(func.count(Rule.id)))
        if (res.scalar() or 0) == 0:
            for r_data in default_rules():
                r = Rule(**r_data)
                session.add(r)
            await session.commit()
            logger.info(f"✅ Đã thêm {len(default_rules())} detection rules")
        else:
            logger.info("ℹ️ Rules đã tồn tại trong database.")

        # 4. Indicators (IOCs)
        res = await session.execute(select(func.count(Indicator.id)))
        if (res.scalar() or 0) == 0:
            for ind_data in default_indicators():
                ind = Indicator(**ind_data)
                session.add(ind)
            await session.commit()
            logger.info(f"✅ Đã thêm {len(default_indicators())} IOC indicators")
        else:
            logger.info("ℹ️ Indicators đã tồn tại trong database.")

        # 5. Demo Alerts
        res = await session.execute(select(func.count(Alert.id)))
        if (res.scalar() or 0) == 0:
            for al_data in default_alerts():
                al = Alert(**al_data)
                session.add(al)
            await session.commit()
            logger.info(f"✅ Đã thêm {len(default_alerts())} demo alerts")
        else:
            logger.info("ℹ️ Alerts đã tồn tại trong database.")

    from app.database import engine
    await engine.dispose()
    logger.info("🎉 Seed hoàn tất!")


if __name__ == "__main__":
    asyncio.run(run_seed())
