# ==============================================================================
# app/services/agent_service.py - Agent Service
# Tương đương: internal/services/agent_service.go
# ==============================================================================

import logging
from typing import Optional, Tuple, List
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime, timezone, timedelta
from app.models.agent import Agent
from app.grpc_server.connection_manager import global_conn_manager

logger = logging.getLogger(__name__)


class AgentService:
    def __init__(self, db: AsyncSession, redis_client=None):
        self.db = db
        self.redis = redis_client

    async def _resolve_agent_status(self, agent: Agent) -> str:
        """
        Xác định chính xác trạng thái online/offline thực tế:
        1. Kiểm tra stream gRPC active trong global_conn_manager
        2. Kiểm tra Redis key (nếu có)
        3. Kiểm tra last_heartbeat_at trong vòng 60 giây gần nhất
        -> Nếu không thỏa điều kiện nào thì là offline
        """
        # 1. Có kết nối gRPC active đang mở
        if await global_conn_manager.is_agent_connected(agent.id):
            return "online"

        # 2. Kiểm tra Redis (nếu có)
        if self.redis:
            try:
                if await self.redis.exists(f"agent:{agent.id}:online"):
                    return "online"
            except Exception:
                pass

        # 3. Kiểm tra last_heartbeat_at (nếu trong vòng 60 giây gần nhất)
        if agent.last_heartbeat_at:
            try:
                # Chuẩn hóa về datetime không múi giờ hoặc có múi giờ để so sánh
                heartbeat_time = agent.last_heartbeat_at
                if heartbeat_time.tzinfo is not None:
                    now = datetime.now(timezone.utc)
                else:
                    now = datetime.utcnow()
                
                diff_seconds = abs((now - heartbeat_time).total_seconds())
                if diff_seconds <= 60:
                    return "online"
            except Exception:
                pass

        return "offline"

    async def get_all_agents(
        self,
        page: int = 1,
        page_size: int = 50,
        status: str = "",
    ) -> Tuple[List[Agent], int]:
        """Lấy danh sách Agents với phân trang và filter status"""
        stmt = select(Agent)
        count_stmt = select(func.count(Agent.id))

        if status:
            stmt = stmt.where(Agent.status == status)
            count_stmt = count_stmt.where(Agent.status == status)

        total_res = await self.db.execute(count_stmt)
        total = total_res.scalar() or 0

        offset = (page - 1) * page_size
        stmt = stmt.order_by(desc(Agent.last_heartbeat_at)).offset(offset).limit(page_size)

        result = await self.db.execute(stmt)
        agents = list(result.scalars().all())

        # Đồng bộ trạng thái thực tế
        for agent in agents:
            real_status = await self._resolve_agent_status(agent)
            agent.status = real_status

        return agents, total

    async def get_agent_by_id(self, agent_id: str) -> Optional[Agent]:
        """Lấy chi tiết 1 Agent"""
        stmt = select(Agent).where(Agent.id == agent_id)
        res = await self.db.execute(stmt)
        agent = res.scalar_one_or_none()

        if agent:
            agent.status = await self._resolve_agent_status(agent)

        return agent
