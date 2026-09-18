# ==============================================================================
# app/routers/agents.py - Agents Router
# Tương đương: internal/api/handlers/agent_handler.go
# ==============================================================================

import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.agent_service import AgentService
from app.middleware.auth import get_current_user
from app.grpc_server.connection_manager import global_conn_manager
from app.grpc_server import agent_pb2

router = APIRouter(prefix="/api/v1/agents", tags=["Agents"])


class KillProcessRequest(BaseModel):
    pid: int


class BlockIPRequest(BaseModel):
    ip: str


class BlockURLRequest(BaseModel):
    url: str


class QuarantineFileRequest(BaseModel):
    path: str


class IsolateNetworkRequest(BaseModel):
    reason: Optional[str] = ""


@router.get("")
async def get_agents(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    agent_service = AgentService(db)
    agents, total = await agent_service.get_all_agents(
        page=page,
        page_size=limit,
        status=status_filter or "",
    )

    return {
        "data": agents,
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/online-ids")
async def get_online_agent_ids(
    current_user: dict = Depends(get_current_user),
):
    """Lấy danh sách Agent ID đang kết nối gRPC (online)"""
    ids = await global_conn_manager.get_online_agent_ids()
    return {"online_agent_ids": ids, "count": len(ids)}


# ==============================================================================
# Active Response Endpoints — gửi lệnh thực xuống Agent qua gRPC
# Tương đương: agent_handler.go KillProcess, BlockIP...
# ==============================================================================

async def _send_grpc_command(
    agent_id: str,
    command_type: int,
    target: str,
    parameters: Optional[dict] = None,
) -> dict:
    """
    Helper: Gửi lệnh Active Response xuống Agent qua gRPC ConnectionManager.
    Trả về dict kết quả.
    """
    # Kiểm tra Agent có đang kết nối gRPC không
    is_connected = await global_conn_manager.is_agent_connected(agent_id)
    if not is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Agent '{agent_id}' không online hoặc không có kết nối gRPC active",
        )

    command = {
        "command_id": str(uuid.uuid4()),
        "command_type": command_type,
        "target": target,
        "parameters": parameters or {},
        "timestamp": int(datetime.utcnow().timestamp() * 1000),
    }

    sent = await global_conn_manager.send_command(agent_id, command)
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Không thể gửi lệnh: Command queue của Agent '{agent_id}' đã đầy",
        )

    return command


@router.post("/{agent_id}/response/kill-process")
async def kill_process(
    agent_id: str,
    req: KillProcessRequest,
    current_user: dict = Depends(get_current_user),
):
    """Gửi lệnh Kill Process xuống Agent qua gRPC"""
    # CommandType KILL_PROCESS = 1
    cmd = await _send_grpc_command(
        agent_id=agent_id,
        command_type=1,  # KILL_PROCESS
        target=str(req.pid),
        parameters={"pid": str(req.pid)},
    )
    return {
        "success": True,
        "message": f"Đã gửi lệnh Kill Process PID={req.pid} tới Agent {agent_id}",
        "command_id": cmd["command_id"],
    }


@router.post("/{agent_id}/response/block-ip")
async def block_ip(
    agent_id: str,
    req: BlockIPRequest,
    current_user: dict = Depends(get_current_user),
):
    """Gửi lệnh Block IP xuống Agent qua gRPC"""
    # CommandType BLOCK_IP = 2
    cmd = await _send_grpc_command(
        agent_id=agent_id,
        command_type=2,  # BLOCK_IP
        target=req.ip,
        parameters={"ip": req.ip},
    )
    return {
        "success": True,
        "message": f"Đã gửi lệnh Block IP {req.ip} tới Agent {agent_id}",
        "command_id": cmd["command_id"],
    }


@router.post("/{agent_id}/response/block-url")
async def block_url(
    agent_id: str,
    req: BlockURLRequest,
    current_user: dict = Depends(get_current_user),
):
    """Gửi lệnh Block URL xuống Agent qua gRPC"""
    # CommandType BLOCK_URL = 3
    cmd = await _send_grpc_command(
        agent_id=agent_id,
        command_type=3,  # BLOCK_URL
        target=req.url,
        parameters={"url": req.url},
    )
    return {
        "success": True,
        "message": f"Đã gửi lệnh Block URL {req.url} tới Agent {agent_id}",
        "command_id": cmd["command_id"],
    }


@router.post("/{agent_id}/response/quarantine-file")
async def quarantine_file(
    agent_id: str,
    req: QuarantineFileRequest,
    current_user: dict = Depends(get_current_user),
):
    """Gửi lệnh Quarantine File xuống Agent qua gRPC"""
    # CommandType QUARANTINE_FILE = 4
    cmd = await _send_grpc_command(
        agent_id=agent_id,
        command_type=4,  # QUARANTINE_FILE
        target=req.path,
        parameters={"path": req.path},
    )
    return {
        "success": True,
        "message": f"Đã gửi lệnh Quarantine File {req.path} tới Agent {agent_id}",
        "command_id": cmd["command_id"],
    }


@router.post("/{agent_id}/response/isolate-network")
async def isolate_network(
    agent_id: str,
    req: IsolateNetworkRequest,
    current_user: dict = Depends(get_current_user),
):
    """Gửi lệnh Isolate Network xuống Agent qua gRPC"""
    # CommandType ISOLATE_NETWORK = 6
    cmd = await _send_grpc_command(
        agent_id=agent_id,
        command_type=6,  # ISOLATE_NETWORK
        target=agent_id,
        parameters={"reason": req.reason or "Manual isolation"},
    )
    return {
        "success": True,
        "message": f"Đã gửi lệnh Isolate Network tới Agent {agent_id}",
        "command_id": cmd["command_id"],
    }
