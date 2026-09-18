# ==============================================================================
# app/grpc_server/connection_manager.py - Quản lý kết nối gRPC active từ Agents
# Tương đương: internal/agent_grpc/connection_manager.go
# ==============================================================================

import asyncio
import logging
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)


class ActiveConnection:
    """Đại diện cho 1 kết nối gRPC active từ Agent"""

    def __init__(self, agent_id: str, hostname: str, ip_address: str, context):
        self.agent_id = agent_id
        self.hostname = hostname
        self.ip_address = ip_address
        self.context = context  # gRPC ServicerContext
        # Queue để đẩy lệnh xuống Agent (tương đương CmdChan chan *pb.CommandResponse)
        self.cmd_queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        # Event để báo hiệu kết nối đóng (tương đương Done chan struct{})
        self.done: asyncio.Event = asyncio.Event()


class ConnectionManager:
    """
    Quản lý tập trung tất cả Agent connections.
    Thread-safe: Sử dụng asyncio.Lock cho concurrent access.
    Tương đương: internal/agent_grpc/connection_manager.go
    """

    def __init__(self):
        self._connections: Dict[str, ActiveConnection] = {}
        self._lock = asyncio.Lock()

    async def register(self, conn: ActiveConnection):
        """Đăng ký kết nối Agent mới khi stream mở"""
        async with self._lock:
            # Nếu Agent đã có kết nối cũ → đóng cũ trước
            if conn.agent_id in self._connections:
                old = self._connections[conn.agent_id]
                logger.warning(
                    f"[CONN MANAGER] ⚠️ Agent '{conn.agent_id}' đã có kết nối cũ, đang đóng..."
                )
                old.done.set()  # Báo hiệu goroutine cũ dừng lại

            self._connections[conn.agent_id] = conn
            count = len(self._connections)
            logger.info(
                f"[CONN MANAGER] ✅ Đã đăng ký Agent '{conn.agent_id}' "
                f"({conn.hostname} - {conn.ip_address}). Tổng: {count} agents online"
            )

    async def unregister(self, agent_id: str):
        """Hủy đăng ký khi Agent ngắt kết nối"""
        async with self._lock:
            if agent_id in self._connections:
                conn = self._connections.pop(agent_id)
                conn.done.set()
                count = len(self._connections)
                logger.info(
                    f"[CONN MANAGER] 🔴 Agent '{agent_id}' đã ngắt kết nối. "
                    f"Tổng: {count} agents online"
                )

    async def send_command(self, agent_id: str, command: dict) -> bool:
        """
        Gửi lệnh Active Response xuống Agent cụ thể.
        Trả về False nếu Agent không online hoặc queue đầy.
        Tương đương: ConnectionManager.SendCommand() trong Go
        """
        async with self._lock:
            conn = self._connections.get(agent_id)

        if conn is None:
            logger.error(
                f"[CONN MANAGER] ❌ Agent '{agent_id}' không online "
                f"hoặc không có kết nối gRPC active"
            )
            return False

        try:
            conn.cmd_queue.put_nowait(command)
            logger.info(
                f"[CONN MANAGER] 📤 Đã gửi lệnh '{command.get('command_type')}' "
                f"xuống Agent '{agent_id}' (target: {command.get('target')})"
            )
            return True
        except asyncio.QueueFull:
            logger.warning(
                f"[CONN MANAGER] ⚠️ Command queue của Agent '{agent_id}' đã đầy. "
                f"Lệnh '{command.get('command_type')}' bị bỏ qua!"
            )
            return False

    async def get_connection(self, agent_id: str) -> Optional[ActiveConnection]:
        """Lấy ActiveConnection theo Agent ID"""
        async with self._lock:
            return self._connections.get(agent_id)

    async def get_online_agent_ids(self) -> List[str]:
        """Lấy danh sách Agent ID đang online"""
        async with self._lock:
            return list(self._connections.keys())

    async def get_online_count(self) -> int:
        """Đếm số Agent đang online"""
        async with self._lock:
            return len(self._connections)

    async def is_agent_connected(self, agent_id: str) -> bool:
        """Kiểm tra Agent có đang kết nối gRPC không"""
        async with self._lock:
            return agent_id in self._connections


# Singleton global instance — dùng chung giữa gRPC server và REST API
global_conn_manager = ConnectionManager()
