from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database import get_db
from app.models.siem import LogEvent
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/siem", tags=["SIEM"])

@router.get("/events")
async def get_log_events(page: int = 1, limit: int = 50, q: str = None, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(LogEvent).order_by(LogEvent.occurred_at.desc())
    if q:
        query = query.where(LogEvent.message.ilike(f"%{q}%") | LogEvent.source.ilike(f"%{q}%"))
    
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    
    return {
        "data": [{"id": i.id, "occurred_at": i.occurred_at, "host": i.host, "source": i.source, "level": i.level, "user": i.user, "ip": i.ip, "message": i.message, "raw": i.raw} for i in items],
        "total": total,
        "page": page,
        "limit": limit
    }
