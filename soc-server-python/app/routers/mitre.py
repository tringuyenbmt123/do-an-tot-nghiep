from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import get_db
from app.models.mitre import MitreTechnique
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/mitre", tags=["MITRE"])

@router.get("/coverage")
async def get_mitre_coverage(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    items = (await db.execute(select(MitreTechnique))).scalars().all()
    return {
        "data": [{"id": i.id, "name": i.name, "tactic": i.tactic, "hits": i.hits} for i in items]
    }
