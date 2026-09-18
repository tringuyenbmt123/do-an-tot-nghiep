# ==============================================================================
# app/routers/indicators.py - Indicators (IOCs) Router
# Tương đương: internal/api/handlers/indicator_handler.go
# ==============================================================================

from datetime import datetime
from typing import Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.indicator_service import IndicatorService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/indicators", tags=["Indicators"])


class MISPSearchRequest(BaseModel):
    returnFormat: Optional[str] = None
    limit: Optional[int] = 50
    type: Optional[str] = None
    value: Optional[str] = None
    tag: Optional[str] = None
    timestamp: Optional[str] = None


class CreateIndicatorRequest(BaseModel):
    type: str
    value: str
    category: Optional[str] = "malware"
    source: Optional[str] = "analyst"
    mitre_tactic: Optional[str] = None
    mitre_technique_id: Optional[str] = None
    risk_score: Optional[int] = 50
    description: Optional[str] = ""
    is_active: Optional[bool] = True


class UpdateIndicatorRequest(BaseModel):
    type: Optional[str] = None
    value: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    mitre_tactic: Optional[str] = None
    mitre_technique_id: Optional[str] = None
    risk_score: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class AnalyzeIOCRequest(BaseModel):
    type: str
    value: str


@router.post("/restSearch")
async def search_misp_compat(
    req: MISPSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    indicator_service = IndicatorService(db)
    indicators = await indicator_service.search_indicators_compat(
        ioc_type=req.type or "",
        value=req.value or "",
        limit=req.limit or 50,
    )

    attributes = [
        {
            "id": ind.id,
            "type": ind.type,
            "category": ind.category,
            "value": ind.value,
            "comment": ind.description,
            "to_ids": ind.is_active,
            "risk_score": ind.risk_score,
            "source": ind.source,
            "tag": req.tag,
        }
        for ind in indicators
    ]

    response = []
    if indicators:
        for ind in indicators:
            response.append({
                "Event": {
                    "id": ind.id,
                    "uuid": ind.id,
                    "info": ind.description,
                    "timestamp": int(ind.created_at.timestamp()) if ind.created_at else 0,
                    "Attribute": attributes,
                }
            })

    return {
        "response": response,
        "meta": {
            "source": "soc-app-indicators",
            "type": req.type,
            "value": req.value,
            "timestamp": req.timestamp,
        },
    }


@router.get("")
async def get_indicators(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    ioc_type: Optional[str] = Query(None, alias="type"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    indicator_service = IndicatorService(db)
    indicators, total = await indicator_service.get_all_indicators(
        page=page,
        page_size=limit,
        ioc_type=ioc_type or "",
    )

    return {
        "data": indicators,
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_indicator(
    req: CreateIndicatorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    indicator_service = IndicatorService(db)
    ioc = await indicator_service.create_indicator(req.dict())
    return ioc


@router.put("/{indicator_id}")
async def update_indicator(
    indicator_id: str,
    req: UpdateIndicatorRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    indicator_service = IndicatorService(db)
    updated = await indicator_service.update_indicator(indicator_id, req.dict(exclude_unset=True))
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy indicator",
        )
    return {"message": "Cập nhật blacklist thành công", "data": updated}


@router.delete("/{indicator_id}")
async def delete_indicator(
    indicator_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    indicator_service = IndicatorService(db)
    deleted = await indicator_service.delete_indicator(indicator_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy indicator",
        )
    return {"message": "Xóa blacklist thành công"}


@router.post("/analyze")
async def analyze_ioc(
    req: AnalyzeIOCRequest,
    current_user: dict = Depends(get_current_user),
):
    # Fake Cortex Analyzer response tương tự Go server
    return {
        "analyzer": "Cortex_VirusTotal",
        "type": req.type,
        "value": req.value,
        "verdict": "malicious",
        "risk_score": 85,
        "detections": 14,
        "total_engines": 72,
        "tags": ["c2", "malware"],
        "community_score": -50,
        "last_analysis": datetime.utcnow().isoformat(),
        "details": {
            "country": "UNKNOWN",
        },
    }
