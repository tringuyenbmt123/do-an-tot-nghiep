# ==============================================================================
# app/routers/rules.py - Detection Rules Router
# Tương đương: internal/api/handlers/rule_handler.go
# ==============================================================================

import json
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.rule_service import RuleService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/rules", tags=["Rules"])


class RuleRequest(BaseModel):
    id: Optional[str] = None
    name: str
    severity: Optional[str] = "medium"
    event_type: Optional[str] = "custom_event"
    conditions: Any
    mitre_tactic: Optional[str] = ""
    mitre_technique_id: Optional[str] = ""
    description: Optional[str] = ""
    is_active: Optional[bool] = True
    source: Optional[str] = "database"


class ToggleRuleRequest(BaseModel):
    is_active: bool


@router.get("")
async def get_rules(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule_service = RuleService(db)
    rules = await rule_service.get_all_rules()
    return {"data": rules}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_rule(
    req: RuleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule_service = RuleService(db)
    data = req.dict()
    try:
        rule = await rule_service.create_rule(data)
        return rule
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/{rule_id}")
async def update_rule(
    rule_id: str,
    req: RuleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule_service = RuleService(db)
    data = req.dict()
    try:
        rule = await rule_service.update_rule(rule_id, data)
        return {"message": "Cập nhật rule thành công", "data": rule}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.patch("/{rule_id}/toggle")
async def toggle_rule(
    rule_id: str,
    req: ToggleRuleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule_service = RuleService(db)
    success = await rule_service.toggle_rule(rule_id, req.is_active)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Rule '{rule_id}'",
        )
    return {"message": "Cập nhật trạng thái rule thành công"}


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule_service = RuleService(db)
    success = await rule_service.delete_rule(rule_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Rule '{rule_id}'",
        )
    return {"message": "Xóa rule thành công"}
