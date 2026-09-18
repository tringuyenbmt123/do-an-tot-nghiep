# ==============================================================================
# app/database.py - Kết nối MySQL với SQLAlchemy async
# Tương đương: pkg/database/mysql.go
# ==============================================================================

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator
import logging

from app.config import settings

logger = logging.getLogger(__name__)


# Base class cho tất cả SQLAlchemy models
class Base(DeclarativeBase):
    pass


# Async engine (tương đương gorm.Open)
engine = create_async_engine(
    settings.database_url,
    pool_size=25,           # max_open_conns = 25
    max_overflow=5,
    pool_recycle=1800,      # conn_max_lifetime_minutes = 30 → 1800s
    pool_pre_ping=True,     # Kiểm tra kết nối trước khi dùng
    echo=False,             # Tắt SQL logging (set True để debug)
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    """Tạo tất cả bảng nếu chưa có (AutoMigrate). Tương đương AutoMigrateAll()"""
    async with engine.begin() as conn:
        # Import all models để SQLAlchemy nhận diện
        from app.models import (  # noqa: F401
            agent, alert, case, rule, indicator, audit_log, user, setting
        )
        await conn.run_sync(Base.metadata.create_all)
    logger.info("[DATABASE] ✅ AutoMigrate hoàn tất - Tất cả bảng đã sẵn sàng!")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency injection cho FastAPI routes."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
