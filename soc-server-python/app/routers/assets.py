from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database import get_db
from app.models.asset import Asset
from app.middleware.auth import get_current_user
import math

router = APIRouter(prefix="/api/v1/assets", tags=["Assets"])

@router.get("")
async def get_assets(page: int = 1, limit: int = 50, q: str = None, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(Asset)
    if q:
        query = query.where(Asset.hostname.ilike(f"%{q}%") | Asset.ip.ilike(f"%{q}%"))
    
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    
    return {
        "data": [{"id": i.id, "hostname": i.hostname, "ip": i.ip, "type": i.type, "os": i.os, "owner": i.owner, "criticality": i.criticality, "last_seen": i.last_seen} for i in items],
        "total": total,
        "page": page,
        "limit": limit
    }
