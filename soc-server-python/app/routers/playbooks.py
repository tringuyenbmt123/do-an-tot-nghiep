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
    """Lấy danh sách Playbooks kèm các bước (steps) thực thi và kết quả chạy gần nhất."""
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
            {"id": s.id, "type": s.type, "label": s.label, "position": s.position, "config": s.config}
            for s in steps_res.scalars().all()
        ]

        # Lấy lần chạy mới nhất (latest run) để phục vụ tô màu giai đoạn
        latest_run_stmt = (
            select(PlaybookRun)
            .where(PlaybookRun.playbook_id == item.id)
            .order_by(PlaybookRun.started_at.desc())
            .limit(1)
        )
        latest_run = (await db.execute(latest_run_stmt)).scalar_one_or_none()
        latest_run_data = None
        if latest_run:
            latest_logs = latest_run.logs or {}
            latest_run_data = {
                "id": latest_run.id,
                "status": latest_run.status,
                "started_at": latest_run.started_at.isoformat() if latest_run.started_at else None,
                "completed_at": latest_run.completed_at.isoformat() if latest_run.completed_at else None,
                "stages": latest_logs.get("stages", {}),
            }

        result.append({
            "id": item.id,
            "name": item.name,
            "trigger": item.trigger,
            "enabled": item.enabled,
            "steps": steps,
            "latest_run": latest_run_data,
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
    wf_name = wf_name.replace("Wazuh + ", "").replace("Wazuh", "").strip()
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

    # Gom các node thành 6 giai đoạn chuẩn của SOAR Playbook
    stages = [
        {"type": "ingestion", "label": "Tiếp nhận", "desc": "Tiếp nhận Webhook & Chuẩn hóa sự kiện"},
        {"type": "enrichment", "label": "Làm giàu (IOC)", "desc": "Truy vấn Threat Intel VirusTotal & Phân tích IOC"},
        {"type": "decision", "label": "AI/Rule Quyết định", "desc": "AI Ollama phân loại & Đánh giá Zero-Trust"},
        {"type": "approval", "label": "Phê duyệt", "desc": "Xin phê duyệt quản trị viên qua Telegram Bot"},
        {"type": "containment", "label": "Hành động (Block/Kill)", "desc": "Thực thi Firewall Block IP & Kill Process qua EDR"},
        {"type": "closure", "label": "Ghi nhận & Báo cáo", "desc": "Cập nhật Case TheHive, Alert & Báo Telegram"},
    ]

    for idx, st in enumerate(stages):
        step = PlaybookStep(
            playbook_id=pb.id,
            type=st["type"],
            label=st["label"],
            position=idx + 1,
            config={"desc": st["desc"]},
        )
        db.add(step)

    await db.commit()

    return {
        "message": f"Import thành công Playbook: {pb.name}",
        "id": pb.id,
        "name": pb.name,
        "trigger": pb.trigger,
        "steps_count": len(stages),
    }


class UniversalProgressBody(BaseModel):
    trigger: Optional[str] = None          # Ví dụ: "ddos-alert", "phishing", "ddos"
    playbook_id: Optional[int] = None      # Hoặc ID cụ thể của Playbook
    run_id: Optional[int] = None           # Hoặc run_id nếu có
    stage: str                             # ingestion | enrichment | decision | approval | containment | closure
    status: str                            # running | success | failed | skipped
    detail: Optional[str] = None           # Ghi chú hoặc chi tiết thực thi


class StepProgressBody(BaseModel):
    stage: str
    status: str
    detail: Optional[str] = None


@router.post("/progress")
async def report_progress(
    body: UniversalProgressBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint linh hoạt cao nhất cho n8n:
    Chỉ cần gửi { "trigger": "ddos-alert", "stage": "enrichment", "status": "running" }
    Server tự tìm đúng Playbook, tự tạo/cập nhật lượt chạy PlaybookRun và làm sáng ô quy trình trên Console!
    """
    VALID_STAGES = {"ingestion", "enrichment", "decision", "approval", "containment", "closure"}
    VALID_STATUSES = {"running", "success", "failed", "skipped"}

    stage_clean = body.stage.lower().strip()
    status_clean = body.status.lower().strip()

    if stage_clean not in VALID_STAGES:
        raise HTTPException(status_code=422, detail=f"Stage không hợp lệ: {body.stage}. Hợp lệ: {VALID_STAGES}")
    if status_clean not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Status không hợp lệ: {body.status}")

    now = datetime.now(timezone.utc)
    target_run = None

    # 1. Nếu có run_id cụ thể
    if body.run_id:
        r_stmt = select(PlaybookRun).where(PlaybookRun.id == body.run_id)
        target_run = (await db.execute(r_stmt)).scalar_one_or_none()

    # 2. Nếu không có run_id, tìm theo playbook_id hoặc trigger
    if not target_run:
        target_pb = None
        if body.playbook_id:
            pb_stmt = select(Playbook).where(Playbook.id == body.playbook_id)
            target_pb = (await db.execute(pb_stmt)).scalar_one_or_none()
        elif body.trigger:
            trig = body.trigger.strip().lower()
            pb_all_stmt = select(Playbook)
            pbs = (await db.execute(pb_all_stmt)).scalars().all()
            
            # Ưu tiên 1: Khớp chính xác Trigger
            for pb in pbs:
                pb_trig = (pb.trigger or "").strip().lower()
                if trig == pb_trig:
                    target_pb = pb
                    break

            # Ưu tiên 2: Khớp từ khóa trong Trigger (ví dụ "phish" trong "phishing-alert")
            if not target_pb:
                for pb in pbs:
                    pb_trig = (pb.trigger or "").strip().lower()
                    if trig in pb_trig or pb_trig in trig:
                        target_pb = pb
                        break

        if not target_pb:
            # Fallback lấy Playbook đầu tiên
            target_pb = (await db.execute(select(Playbook).order_by(Playbook.id.asc()))).scalars().first()

        if not target_pb:
            raise HTTPException(status_code=404, detail="Không tìm thấy Playbook phù hợp để ghi nhận tiến trình")

        # Tìm run đang running gần nhất của playbook này
        run_stmt = (
            select(PlaybookRun)
            .where(PlaybookRun.playbook_id == target_pb.id, PlaybookRun.status == "running")
            .order_by(PlaybookRun.started_at.desc())
            .limit(1)
        )
        target_run = (await db.execute(run_stmt)).scalar_one_or_none()

        # Nếu không có run nào đang running -> tự tạo mới
        if not target_run:
            target_run = PlaybookRun(
                playbook_id=target_pb.id,
                status="running",
                started_at=now,
                logs={
                    "triggered_by": "n8n_production",
                    "trigger": body.trigger or target_pb.trigger,
                    "stages": {},
                },
            )
            db.add(target_run)
            await db.commit()
            await db.refresh(target_run)

    # 3. Cập nhật stage trong logs
    logs = dict(target_run.logs) if target_run.logs else {}
    if "stages" not in logs or not isinstance(logs["stages"], dict):
        logs["stages"] = {}

    logs["stages"][stage_clean] = status_clean
    if body.detail:
        if "stage_details" not in logs:
            logs["stage_details"] = {}
        logs["stage_details"][stage_clean] = body.detail

    # Đóng kịch bản nếu giai đoạn cuối closure hoàn tất
    if stage_clean == "closure" and status_clean == "success":
        target_run.status = "success"
        target_run.completed_at = now
    elif status_clean == "failed":
        target_run.status = "failed"
        target_run.completed_at = now

    target_run.logs = logs
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(target_run, "logs")

    await db.commit()
    logger.info(f"[SOAR PROGRESS] PlaybookRun#{target_run.id} stage={stage_clean} status={status_clean}")

    return {
        "ok": True,
        "run_id": target_run.id,
        "playbook_id": target_run.playbook_id,
        "stage": stage_clean,
        "status": status_clean,
        "stages": logs["stages"],
    }


@router.post("/runs/{run_id}/progress")
async def step_progress(
    run_id: int,
    body: StepProgressBody,
    db: AsyncSession = Depends(get_db),
):
    """Callback endpoint nhận run_id cụ thể từ n8n."""
    return await report_progress(
        body=UniversalProgressBody(run_id=run_id, stage=body.stage, status=body.status, detail=body.detail),
        db=db,
    )


@router.get("/runs/{run_id}")
async def get_playbook_run_detail(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Lấy chi tiết một lần chạy Playbook, bao gồm trạng thái từng giai đoạn (stages)."""
    run_stmt = select(PlaybookRun).where(PlaybookRun.id == run_id)
    run = (await db.execute(run_stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy PlaybookRun #{run_id}")

    pb_name = None
    pb_stmt = select(Playbook).where(Playbook.id == run.playbook_id)
    pb = (await db.execute(pb_stmt)).scalar_one_or_none()
    if pb:
        pb_name = pb.name

    return {
        "id": run.id,
        "playbook_id": run.playbook_id,
        "playbook_name": pb_name,
        "status": run.status,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "logs": run.logs or {},
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


class UpdatePlaybookRequest(BaseModel):
    name: Optional[str] = None
    trigger: Optional[str] = None
    enabled: Optional[bool] = None
    steps: Optional[List[StepItem]] = None


@router.put("/{playbook_id}")
async def update_playbook(
    playbook_id: int,
    req: UpdatePlaybookRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Cập nhật tên, trigger và quy trình các bước của Playbook."""
    pb_stmt = select(Playbook).where(Playbook.id == playbook_id)
    pb_res = await db.execute(pb_stmt)
    playbook = pb_res.scalar_one_or_none()

    if not playbook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy Playbook #{playbook_id}",
        )

    if req.name is not None and req.name.strip():
        playbook.name = req.name.strip()
    if req.trigger is not None and req.trigger.strip():
        playbook.trigger = req.trigger.strip()
    if req.enabled is not None:
        playbook.enabled = req.enabled

    if req.steps is not None:
        await db.execute(delete(PlaybookStep).where(PlaybookStep.playbook_id == playbook_id))
        for idx, s in enumerate(req.steps):
            step = PlaybookStep(
                playbook_id=playbook.id,
                type=s.type or "action",
                label=s.label.strip(),
                position=s.position or (idx + 1),
                config={"desc": s.label.strip()},
            )
            db.add(step)

    await db.commit()
    await db.refresh(playbook)

    return {
        "message": f"Cập nhật thành công Playbook #{playbook_id} ({playbook.name})",
        "id": playbook.id,
        "name": playbook.name,
        "trigger": playbook.trigger,
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
    trigger = playbook.trigger.lower() if playbook.trigger else ""
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

    # Tự động chọn đúng Webhook URL và Alert Payload theo Trigger
    if "phish" in trigger:
        alert_data = sample_alerts["phishing_detected"]
        webhook_url = settings.n8n_webhook_url_phishing or settings.n8n_webhook_url
    elif "ddos" in trigger:
        alert_data = sample_alerts["ddos_detected"]
        webhook_url = settings.n8n_webhook_url_ddos or settings.n8n_webhook_url
    else:
        alert_data = sample_alerts.get(trigger, sample_alerts["critical_alert"])
        webhook_url = settings.n8n_webhook_url or "http://localhost:5678/webhook/soc-alert"

    alert_data = dict(alert_data)
    alert_data["timestamp"] = now.isoformat()
    alert_data["playbook_run_id"] = run.id
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
                n8n_msg = f"n8n tiếp nhận thành công (HTTP {resp.status_code}), quy trình đang thực thi..."
                run.status = "running"
                run.completed_at = None
                run.logs = {
                    "alert_sent": alert_data,
                    "n8n_response": resp.text[:500],
                    "status_code": resp.status_code,
                    "stages": {
                        "ingestion": "success",
                        "enrichment": "running",
                    },
                }
            else:
                n8n_msg = f"n8n trả về mã lỗi HTTP {resp.status_code}"
                run.status = "failed"
                run.completed_at = datetime.now(timezone.utc)
                run.logs = {
                    "error": resp.text[:500],
                    "status_code": resp.status_code,
                    "stages": {"ingestion": "failed"},
                }
    except Exception as e:
        logger.warning(f"[PLAYBOOK RUN] Lỗi kết nối n8n ({webhook_url}): {e}")
        n8n_msg = f"Không thể kết nối n8n ({e})"
        run.status = "failed"
        run.completed_at = datetime.now(timezone.utc)
        run.logs = {"error": str(e), "stages": {"ingestion": "failed"}}

    await db.commit()

    return {
        "success": n8n_success,
        "message": f"Kích hoạt {playbook.name}: {n8n_msg}",
        "run_id": run.id,
        "playbook_id": playbook.id,
        "n8n_target": webhook_url,
        "status": run.status,
    }
