from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database import get_db
from app.models.vuln import Vulnerability
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/vulnerabilities", tags=["Vulnerabilities"])

@router.get("")
async def get_vulns(page: int = 1, limit: int = 50, q: str = None, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    query = select(Vulnerability)
    if q:
        query = query.where(Vulnerability.cve.ilike(f"%{q}%") | Vulnerability.description.ilike(f"%{q}%"))
    
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()
    
    return {
        "data": [{"cve": i.cve, "description": i.description, "cvss": float(i.cvss), "exploited": i.exploited, "due_date": str(i.due_date) if i.due_date else None, "status": i.status} for i in items],
        "total": total,
        "page": page,
        "limit": limit
    }
