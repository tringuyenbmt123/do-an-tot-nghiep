from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database import get_db
from app.models.playbook import Playbook, PlaybookRun
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/playbooks", tags=["Playbooks"])

@router.get("")
async def get_playbooks(page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(Playbook)
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    return {"data": [{"id": i.id, "name": i.name, "trigger": i.trigger, "enabled": i.enabled} for i in items], "total": total}

@router.get("/runs")
async def get_playbook_runs(page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(PlaybookRun).order_by(PlaybookRun.started_at.desc())
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    return {"data": [{"id": i.id, "playbook_id": i.playbook_id, "status": i.status, "started_at": i.started_at, "completed_at": i.completed_at} for i in items], "total": total}
