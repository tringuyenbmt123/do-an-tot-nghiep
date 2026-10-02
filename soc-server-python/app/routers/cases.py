# ==============================================================================
# app/routers/cases.py - Cases Router
# Tương đương: internal/api/handlers/case_handler.go
# ==============================================================================

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.case_service import CaseService
from app.middleware.auth import get_current_user
from app.websocket.hub import ws_hub

router = APIRouter(prefix="/api/v1/cases", tags=["Cases"])


class CreateCaseRequest(BaseModel):
    alert_id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    assigned_to: Optional[str] = ""
    severity: Optional[str] = "medium"


class AssignCaseRequest(BaseModel):
    assigned_to: str


class AddNoteRequest(BaseModel):
    note: str


class UpdateStatusRequest(BaseModel):
    status: str


def serialize_case(c) -> dict:
    if not c:
        return {}
    num_to_sev = {1: "critical", 2: "high", 3: "medium", 4: "low"}
    sev = num_to_sev.get(c.severity_num, "medium")
    if hasattr(c, "alert") and c.alert and getattr(c.alert, "severity", None):
        sev = str(c.alert.severity).lower()

    return {
        "id": c.id,
        "alert_id": c.alert_id,
        "title": c.title,
        "description": c.description,
        "severity": sev,
        "severity_num": c.severity_num,
        "status": c.status,
        "assigned_to": c.assigned_to,
        "tags": c.tags,
        "soar_status": getattr(c, "soar_status", "pending"),
        "ai_reason": getattr(c, "ai_reason", None),
        "confidence": getattr(c, "confidence", 0.0),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@router.get("")
async def get_cases(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    assigned_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    filters = {}
    if status_filter:
        filters["status"] = status_filter
    if assigned_to:
        filters["assigned_to"] = assigned_to

    case_service = CaseService(db)
    cases, total = await case_service.get_all_cases(page=page, page_size=limit, filters=filters)

    return {
        "data": [serialize_case(c) for c in cases],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/{case_id}")
async def get_case_by_id(
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    case_service = CaseService(db)
    case_item = await case_service.get_case_by_id(case_id)
    if not case_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Case '{case_id}'",
        )
    return serialize_case(case_item)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_case(
    req: CreateCaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    assigned_to = req.assigned_to or current_user.get("username", "soc_analyst")
    case_service = CaseService(db)

    sev_to_num = {"critical": 1, "high": 2, "medium": 3, "low": 4}
    sev_num = sev_to_num.get((req.severity or "medium").lower(), 3)

    if req.alert_id:
        try:
            new_case = await case_service.create_case_from_alert(
                alert_id=req.alert_id,
                title=req.title,
                description=req.description or "",
                assigned_to=assigned_to,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    else:
        new_case = await case_service.create_manual_case(
            title=req.title,
            description=req.description or "",
            assigned_to=assigned_to,
            severity_num=sev_num,
        )

    await ws_hub.broadcast_case_update({
        "id": new_case.id,
        "title": new_case.title,
        "status": new_case.status,
        "assigned_to": new_case.assigned_to,
    })

    return serialize_case(new_case)


@router.patch("/{case_id}/assign")
async def assign_case(
    case_id: str,
    req: AssignCaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    actor = current_user.get("username", "api_user")
    case_service = CaseService(db)
    success = await case_service.assign_case(case_id, req.assigned_to, actor)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Case")

    await ws_hub.broadcast_case_update({"id": case_id, "assigned_to": req.assigned_to})
    return {"success": True}


@router.post("/{case_id}/notes")
async def add_case_note(
    case_id: str,
    req: AddNoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    actor = current_user.get("username", "api_user")
    case_service = CaseService(db)
    success = await case_service.add_case_note(case_id, req.note, actor)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Case")

    return {"success": True}


@router.patch("/{case_id}/status")
async def update_case_status(
    case_id: str,
    req: UpdateStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    actor = current_user.get("username", "api_user")
    case_service = CaseService(db)
    success = await case_service.update_case_status(case_id, req.status, actor)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy Case")

    await ws_hub.broadcast_case_update({"id": case_id, "status": req.status})
    return {"success": True}
