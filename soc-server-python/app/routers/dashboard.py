# ==============================================================================
# app/routers/dashboard.py - Dashboard Router
# Tương đương: internal/api/handlers/alert_handler.go (GetAlertStats)
# ==============================================================================

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.alert_service import AlertService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    alert_service = AlertService(db)
    stats = await alert_service.get_alert_stats()
    return stats
