# ==============================================================================
# app/websocket/hub.py - WebSocket Hub
# Tương đương: internal/api/websocket/hub.go
# ==============================================================================

import asyncio
import json
import logging
from datetime import datetime
from typing import Set, Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class WebSocketHub:
    """Quản lý kết nối WebSocket của các client Frontend và broadcast events."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"[WEBSOCKET HUB] 🟢 Client mới kết nối. Tổng: {len(self.active_connections)} clients")

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info(f"[WEBSOCKET HUB] 🔴 Client ngắt kết nối. Tổng: {len(self.active_connections)} clients")

    async def broadcast_json(self, event_type: str, payload: Any):
        """Gửi message JSON tới tất cả WebSocket clients đang kết nối"""
        event = {
            "type": event_type,
            "payload": payload,
            "time": datetime.utcnow().isoformat() + "Z",
        }
        message_str = json.dumps(event)

        async with self._lock:
            disconnected = set()
            for connection in list(self.active_connections):
                try:
                    await connection.send_text(message_str)
                except Exception:
                    disconnected.add(connection)

            for dead_conn in disconnected:
                self.active_connections.discard(dead_conn)

    async def broadcast_alert(self, alert_data: Any):
        await self.broadcast_json("new_alert", alert_data)

    async def broadcast_case_update(self, case_data: Any):
        await self.broadcast_json("case_update", case_data)

    async def broadcast_agent_status(self, agent_status: Any):
        await self.broadcast_json("agent_status", agent_status)

    def get_client_count(self) -> int:
        return len(self.active_connections)


# Singleton WebSocket Hub
ws_hub = WebSocketHub()
