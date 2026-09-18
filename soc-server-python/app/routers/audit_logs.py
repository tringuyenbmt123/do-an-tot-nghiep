# ==============================================================================
# app/routers/audit_logs.py - Audit Logs Router
# Tương đương: internal/api/handlers/audit_handler.go
# ==============================================================================

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.audit_service import AuditService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/audit-logs", tags=["Audit Logs"])


@router.get("")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    source: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    audit_service = AuditService(db)
    logs, total = await audit_service.get_audit_logs(
        page=page,
        page_size=limit,
        source=source or "",
        action=action or "",
    )

    return {
        "data": logs,
        "total": total,
        "page": page,
        "limit": limit,
    }
