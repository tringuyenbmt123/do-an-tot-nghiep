# ==============================================================================
# app/routers/alerts.py - Alerts Router
# Tương đương: internal/api/handlers/alert_handler.go
# ==============================================================================

import json
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.alert_service import AlertService
from app.services.case_service import CaseService
from app.services.soar_service import SOARService
from app.middleware.auth import get_current_user
from app.websocket.hub import ws_hub

router = APIRouter(prefix="/api/v1/alerts", tags=["Alerts"])


class CreateAlertRequest(BaseModel):
    agent_id: str
    rule_id: Optional[str] = None
    event_type: str
    severity: str
    raw_payload: Optional[Any] = None
    status: Optional[str] = "new"
    title: Optional[str] = ""
    description: Optional[str] = ""
    mitre_tactic: Optional[str] = None
    mitre_technique_id: Optional[str] = None


class UpdateAlertStatusRequest(BaseModel):
    status: str
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class EscalateAlertRequest(BaseModel):
    title: Optional[str] = ""
    description: Optional[str] = ""
    assigned_to: Optional[str] = ""


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_alert(
    req: CreateAlertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    valid_severities = ["critical", "high", "medium", "low"]
    if req.severity.lower() not in valid_severities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="severity phải là critical, high, medium hoặc low",
        )

    raw_payload_str = "{}"
    if req.raw_payload is not None:
        if isinstance(req.raw_payload, str):
            raw_payload_str = req.raw_payload
        else:
            raw_payload_str = json.dumps(req.raw_payload)

    alert_data = {
        "agent_id": req.agent_id,
        "rule_id": req.rule_id,
        "event_type": req.event_type,
        "severity": req.severity.lower(),
        "raw_payload": raw_payload_str,
        "status": req.status or "new",
        "title": req.title or "",
        "description": req.description or "",
        "mitre_tactic": req.mitre_tactic,
        "mitre_technique_id": req.mitre_technique_id,
    }

    alert_service = AlertService(db)
    alert = await alert_service.create_alert(alert_data)

    # Broadcast qua WebSocket
    await ws_hub.broadcast_alert({
        "id": alert.id,
        "agent_id": alert.agent_id,
        "event_type": alert.event_type,
        "severity": alert.severity,
        "title": alert.title,
        "status": alert.status,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
    })

    # Dispatch to SOAR nếu cần
    soar_service = SOARService(db)
    soar_service.dispatch_to_n8n(alert)

    return alert


@router.get("")
async def get_alerts(
    page: int = Query(1, ge=1),
    limit: Optional[int] = Query(None, ge=1, le=500),
    pageSize: Optional[int] = Query(None, ge=1, le=500),
    severity: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    event_type: Optional[str] = Query(None),
    agent_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    effective_limit = limit or pageSize or 100

    filters = {}
    if severity:
        filters["severity"] = severity
    if status_filter:
        filters["status"] = status_filter
    if event_type:
        filters["event_type"] = event_type
    if agent_id:
        filters["agent_id"] = agent_id

    alert_service = AlertService(db)
    alerts, total = await alert_service.get_all_alerts(
        page=page,
        page_size=effective_limit,
        filters=filters,
    )

    return {
        "data": alerts,
        "total": total,
        "page": page,
    }


@router.get("/{alert_id}")
async def get_alert_by_id(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    alert_service = AlertService(db)
    alert = await alert_service.get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Alert '{alert_id}'",
        )
    return alert


@router.patch("/{alert_id}/status")
async def update_alert_status(
    alert_id: str,
    req: UpdateAlertStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    alert_service = AlertService(db)
    success = await alert_service.update_alert_status_with_context(
        alert_id=alert_id,
        status=req.status,
        description=req.description or "",
        tags=req.tags,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Alert '{alert_id}'",
        )
    return {"message": "Cập nhật thành công"}


@router.post("/{alert_id}/escalate", status_code=status.HTTP_201_CREATED)
async def escalate_to_case(
    alert_id: str,
    req: Optional[EscalateAlertRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    req = req or EscalateAlertRequest()
    alert_service = AlertService(db)
    alert = await alert_service.get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Alert '{alert_id}'",
        )

    assigned_to = req.assigned_to or current_user.get("username", "soc_analyst")
    title = req.title or f"Investigation: {alert.title or alert.id}"
    desc = req.description or f"Escalated from Alert: {alert.title}\nEvent Type: {alert.event_type}\nSeverity: {alert.severity}\nRule ID: {alert.rule_id}"

    case_service = CaseService(db)
    new_case = await case_service.create_case_from_alert(
        alert_id=alert_id,
        title=title,
        description=desc,
        assigned_to=assigned_to,
    )

    # Broadcast update
    await ws_hub.broadcast_case_update({
        "id": new_case.id,
        "title": new_case.title,
        "status": new_case.status,
        "assigned_to": new_case.assigned_to,
    })

    return {
        "message": "Escalated successfully",
        "case": new_case,
    }


@router.post("/{alert_id}/soar")
async def dispatch_to_soar(
    alert_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    alert_service = AlertService(db)
    alert = await alert_service.get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Alert '{alert_id}'",
        )

    soar_service = SOARService(db)
    soar_service.dispatch_to_n8n(alert)

    return {
        "message": "Alert dispatched to n8n SOAR pipeline",
        "alert_id": alert_id,
    }
