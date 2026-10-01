from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database import get_db
from app.models.report import Report, ReportSchedule
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/reports", tags=["Reports"])

@router.get("")
async def get_reports(page: int = 1, limit: int = 50, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(Report).order_by(Report.created_at.desc())
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    return {"data": [{"id": i.id, "type": i.type, "range": i.range, "format": i.format, "created_at": i.created_at, "file_path": i.file_path} for i in items], "total": total}

@router.get("/schedules")
async def get_schedules(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    items = (await db.execute(select(ReportSchedule))).scalars().all()
    return {"data": [{"id": i.id, "name": i.name, "type": i.type, "cron": i.cron, "recipients": i.recipients, "enabled": i.enabled} for i in items]}
