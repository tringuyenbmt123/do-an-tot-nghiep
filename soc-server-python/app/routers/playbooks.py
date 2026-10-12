# ==============================================================================
# app/routers/playbooks.py - SOAR Playbooks & n8n Execution Router
# ==============================================================================

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
import httpx
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, desc, delete

from app.database import get_db
from app.config import settings
from app.models.playbook import Playbook, PlaybookStep, PlaybookRun
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/playbooks", tags=["Playbooks"])


class StepItem(BaseModel):
    label: str
    type: Optional[str] = "action"
    position: Optional[int] = 1


class CreatePlaybookRequest(BaseModel):
    name: str
    trigger: str
    enabled: Optional[bool] = True
    steps: Optional[List[StepItem]] = []


@router.get("")
async def get_playbooks(
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Lấy danh sách Playbooks kèm các bước (steps) thực thi."""
    query = select(Playbook).order_by(Playbook.id.asc())
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()

    # Nạp các steps cho từng playbook
    result = []
    for item in items:
        steps_stmt = (
            select(PlaybookStep)
            .where(PlaybookStep.playbook_id == item.id)
            .order_by(PlaybookStep.position.asc())
        )
        steps_res = await db.execute(steps_stmt)
        steps = [
            {"id": s.id, "type": s.type, "label": s.label, "position": s.position}
            for s in steps_res.scalars().all()
        ]

        result.append({
            "id": item.id,
            "name": item.name,
            "trigger": item.trigger,
            "enabled": item.enabled,
            "steps": steps,
        })

    return {"data": result, "total": total}


@router.post("")
async def create_playbook(
    req: CreatePlaybookRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Tạo mới Playbook thủ công."""
    pb = Playbook(name=req.name, trigger=req.trigger, enabled=req.enabled)
    db.add(pb)
    await db.commit()
    await db.refresh(pb)

    for idx, s in enumerate(req.steps):
        step = PlaybookStep(
            playbook_id=pb.id,
            type=s.type or "action",
            label=s.label,
            position=s.position or (idx + 1),
            config={},
        )
        db.add(step)

    await db.commit()
    return {"message": "Tạo Playbook thành công", "id": pb.id}


@router.post("/import-n8n")
async def import_n8n_workflow(
    file: Optional[UploadFile] = File(None),
    raw_json: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Import n8n Workflow JSON để tự động tạo Playbook:
    1. Đọc tên workflow và phân tích các node webhook làm trigger
    2. Trích xuất các node quan trọng (AI, Telegram, Action) thành các bước (steps)
    3. Lưu vào database
    """
    try:
        if file:
            content = await file.read()
            data = json.loads(content.decode("utf-8-sig"))
        elif raw_json:
            data = json.loads(raw_json)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vui lòng đính kèm file JSON hoặc nội dung raw JSON",
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lỗi phân tích file JSON n8n: {e}",
        )

    wf_name = data.get("name") or "n8n Imported Workflow"
    nodes = data.get("nodes", [])

    # Tìm trigger từ webhook node
    trigger = "custom_webhook"
    for n in nodes:
        if "webhook" in n.get("type", "").lower():
            p = n.get("parameters", {})
            trigger = p.get("path") or n.get("name") or "custom_webhook"
            break

    # Tạo Playbook
    pb = Playbook(name=wf_name, trigger=trigger, enabled=True)
    db.add(pb)
    await db.commit()
    await db.refresh(pb)

    # Trích xuất các node tiêu biểu thành steps
    extracted_steps = []
    pos = 1
    for n in nodes:
        t = n.get("type", "")
        name = n.get("name", "")
        # Bỏ qua node trigger
        if "webhook" in t.lower():
            continue

        step_type = "action"
        if "generate" in t.lower() or "ai" in name.lower() or "ollama" in name.lower():
            step_type = "ai_triage"
        elif "telegram" in t.lower() or "approval" in name.lower():
            step_type = "approval"
        elif "httprequest" in t.lower() or "callback" in name.lower():
            step_type = "containment"
        elif "code" in t.lower():
            step_type = "processing"

        extracted_steps.append((step_type, name, pos))
        pos += 1
        if pos > 8:  # Giới hạn tối đa 8 bước chính
            break

    if not extracted_steps:
        extracted_steps = [("action", "Thực thi toàn bộ quy trình qua n8n Engine", 1)]

    for st_type, st_label, st_pos in extracted_steps:
        step = PlaybookStep(
            playbook_id=pb.id,
            type=st_type,
            label=st_label,
            position=st_pos,
            config={},
        )
        db.add(step)

    await db.commit()

    return {
        "message": f"Import thành công Playbook: {pb.name}",
        "id": pb.id,
        "name": pb.name,
        "trigger": pb.trigger,
        "steps_count": len(extracted_steps),
    }


@router.delete("/{playbook_id}")
async def delete_playbook(
    playbook_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Xóa một Playbook và toàn bộ các bước liên quan."""
    pb_stmt = select(Playbook).where(Playbook.id == playbook_id)
    pb_res = await db.execute(pb_stmt)
    playbook = pb_res.scalar_one_or_none()

    if not playbook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Playbook #{playbook_id}",
        )

    # Xóa steps
    await db.execute(delete(PlaybookStep).where(PlaybookStep.playbook_id == playbook_id))
    # Xóa playbook
    await db.delete(playbook)
    await db.commit()

    return {"message": f"Đã xóa thành công Playbook #{playbook_id} ({playbook.name})"}


@router.patch("/{playbook_id}/toggle")
async def toggle_playbook(
    playbook_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Bật hoặc tắt trạng thái kích hoạt của Playbook."""
    pb_stmt = select(Playbook).where(Playbook.id == playbook_id)
    pb_res = await db.execute(pb_stmt)
    playbook = pb_res.scalar_one_or_none()

    if not playbook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Playbook #{playbook_id}",
        )

    playbook.enabled = not playbook.enabled
    await db.commit()

    return {
        "message": f"Đã {'kích hoạt' if playbook.enabled else 'tắt'} Playbook {playbook.name}",
        "enabled": playbook.enabled,
    }


@router.get("/runs")
async def get_playbook_runs(
    page: int = 1,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Lấy lịch sử chạy Playbook kèm tên kịch bản."""
    query = select(PlaybookRun).order_by(PlaybookRun.started_at.desc())
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = (await db.execute(query.limit(limit).offset((page - 1) * limit))).scalars().all()

    # Nạp tên playbook
    pb_ids = list(set([i.playbook_id for i in items]))
    pb_map = {}
    if pb_ids:
        pb_res = await db.execute(select(Playbook).where(Playbook.id.in_(pb_ids)))
        pb_map = {pb.id: pb.name for pb in pb_res.scalars().all()}

    return {
        "data": [
            {
                "id": i.id,
                "playbook_id": i.playbook_id,
                "playbook_name": pb_map.get(i.playbook_id, f"Playbook #{i.playbook_id}"),
                "status": i.status,
                "started_at": i.started_at.isoformat() if i.started_at else None,
                "completed_at": i.completed_at.isoformat() if i.completed_at else None,
                "logs": i.logs,
            }
            for i in items
        ],
        "total": total,
    }


@router.post("/{playbook_id}/run")
async def trigger_playbook_run(
    playbook_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Kích hoạt chạy thử Playbook:
    1. Tạo bản ghi PlaybookRun trong Database (status=running)
    2. Bắn gói tin webhook tương ứng sang n8n Docker qua ngrok/local
    3. Cập nhật kết quả phản hồi từ n8n
    """
    pb_stmt = select(Playbook).where(Playbook.id == playbook_id)
    pb_res = await db.execute(pb_stmt)
    playbook = pb_res.scalar_one_or_none()

    if not playbook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Playbook với ID {playbook_id}",
        )

    now = datetime.now(timezone.utc)
    # 1. Tạo bản ghi Run
    run = PlaybookRun(
        playbook_id=playbook.id,
        status="running",
        started_at=now,
        logs={"triggered_by": user.get("username", "admin"), "mode": "manual_test"},
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # 2. Xây dựng payload mẫu tương thích với workflow n8n
    trigger = playbook.trigger
    test_id = str(uuid.uuid4())[:8].upper()

    sample_alerts = {
        "phishing_detected": {
            "alert_id": f"TEST-PHISH-{test_id}",
            "event_type": "phishing_detected",
            "severity": "high",
            "url": "http://malicious-login-portal.net/auth/login.php",
            "domain": "malicious-login-portal.net",
            "title": "[SOAR Test] Phishing Link Clicked by User",
            "description": "Người dùng nhấp vào liên kết email lừa đảo thu thập thông tin đăng nhập.",
            "agent_id": "endpoint-win11-01",
        },
        "ransomware_detected": {
            "alert_id": f"TEST-RANSOM-{test_id}",
            "event_type": "ransomware_detected",
            "severity": "critical",
            "process_id": "4128",
            "title": "[SOAR Test] Ransomware Shadow Copy Deletion",
            "description": "Phát hiện tiến trình vssadmin xóa Volume Shadow Copy của máy trạm.",
            "agent_id": "endpoint-win11-01",
        },
        "ddos_detected": {
            "alert_id": f"TEST-DDOS-{test_id}",
            "event_type": "ddos_detected",
            "severity": "critical",
            "src_ip": "198.51.100.88",
            "title": "[SOAR Test] High Volume SYN Flood Traffic",
            "description": "Lưu lượng bất thường 50,000 req/s từ nguồn IP không xác định.",
            "agent_id": "gateway-core",
        },
        "credential_access": {
            "alert_id": f"TEST-CRED-{test_id}",
            "event_type": "credential_access",
            "severity": "critical",
            "process_id": "5892",
            "title": "[SOAR Test] Mimikatz LSASS Dump Activity",
            "description": "Tiến trình độc hại đọc trực tiếp bộ nhớ quy trình bảo mật LSASS.",
            "agent_id": "endpoint-win11-01",
        },
        "critical_alert": {
            "alert_id": f"TEST-CRIT-{test_id}",
            "event_type": "critical_alert",
            "severity": "critical",
            "title": "[SOAR Test] Multi-stage Threat Chain Observed",
            "description": "Phát hiện chuỗi tấn công đa giai đoạn từ Recon đến Lateral Movement.",
            "agent_id": "endpoint-win11-01",
        },
    }

    alert_data = sample_alerts.get(trigger, sample_alerts["critical_alert"])
    alert_data["timestamp"] = now.isoformat()
    alert_data["playbook_run_id"] = run.id

    webhook_url = settings.n8n_webhook_url or "http://localhost:5678/webhook/soc-alert"
    headers = {
        "Content-Type": "application/json",
        "X-SOC-Source": "SOC-Server-Python",
        "ngrok-skip-browser-warning": "true",
    }

    n8n_success = False
    n8n_msg = ""

    # 3. Gửi sang n8n Webhook
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=alert_data, headers=headers)

            # Nếu 404, thử sang webhook-test (khi n8n đang ở chế độ Editor Test)
            if resp.status_code == 404 and "/webhook/" in webhook_url:
                test_url = webhook_url.replace("/webhook/", "/webhook-test/")
                resp = await client.post(test_url, json=alert_data, headers=headers)

            if 200 <= resp.status_code < 300:
                n8n_success = True
                n8n_msg = f"n8n tiếp nhận thành công (HTTP {resp.status_code})"
                run.status = "success"
                run.completed_at = datetime.now(timezone.utc)
                run.logs = {
                    "alert_sent": alert_data,
                    "n8n_response": resp.text[:500],
                    "status_code": resp.status_code,
                }
            else:
                n8n_msg = f"n8n trả về mã lỗi HTTP {resp.status_code}"
                run.status = "failed"
                run.completed_at = datetime.now(timezone.utc)
                run.logs = {"error": resp.text[:500], "status_code": resp.status_code}
    except Exception as e:
        logger.warning(f"[PLAYBOOK RUN] Lỗi kết nối n8n ({webhook_url}): {e}")
        n8n_msg = f"Không thể kết nối n8n ({e})"
        run.status = "failed"
        run.completed_at = datetime.now(timezone.utc)
        run.logs = {"error": str(e)}

    await db.commit()

    return {
        "success": n8n_success,
        "message": f"Kích hoạt {playbook.name}: {n8n_msg}",
        "run_id": run.id,
        "playbook_id": playbook.id,
        "n8n_target": webhook_url,
        "status": run.status,
    }
