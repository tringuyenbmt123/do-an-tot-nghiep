from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database import get_db
from app.models.firewall import FwRule, IdsEvent, IpBlocklist
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/firewall", tags=["Firewall"])

@router.get("/rules")
async def get_fw_rules(page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(FwRule)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    return {"data": [{"id": i.id, "name": i.name, "action": i.action, "src": i.src, "dst": i.dst, "port": i.port, "hits": i.hits, "enabled": i.enabled} for i in items], "total": total}

@router.get("/ids")
async def get_ids_events(page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(IdsEvent).order_by(IdsEvent.created_at.desc())
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    return {"data": [{"id": i.id, "sid": i.sid, "signature": i.signature, "severity": i.severity, "count": i.count, "created_at": i.created_at} for i in items], "total": total}

@router.get("/blocklist")
async def get_blocklist(page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(IpBlocklist).order_by(IpBlocklist.created_at.desc())
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    return {"data": [{"id": i.id, "cidr": i.cidr, "reason": i.reason, "expires_at": i.expires_at, "created_at": i.created_at} for i in items], "total": total}
