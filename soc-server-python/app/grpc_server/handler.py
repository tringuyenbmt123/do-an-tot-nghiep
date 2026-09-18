# ==============================================================================
# app/grpc_server/handler.py - gRPC Service Handler (AgentServiceServicer)
# Tương đương: internal/agent_grpc/handler.go
#
# Implement AgentService với 2 RPC:
#   1. StreamEvents (Bidirectional Streaming):
#      - Nhận stream Sysmon/Event Log từ Agent
#      - Parse JSON → Gọi RuleEngine.evaluate_log() → Tạo Alert → Broadcast
#      - Lắng nghe command queue → Đẩy CommandResponse xuống Agent
#   2. Heartbeat (Unary):
#      - Cập nhật last_heartbeat_at trong MySQL
#      - Cập nhật agent status = "online" trong Redis (với TTL)
# ==============================================================================

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Optional, Callable, AsyncIterator

import grpc
from sqlalchemy import select

from app.grpc_server import agent_pb2, agent_pb2_grpc
from app.grpc_server.connection_manager import ConnectionManager, ActiveConnection
from app.database import AsyncSessionLocal
from app.models.agent import Agent
from app.models.alert import Alert
from app.models.audit_log import AuditLog
from app.rules.engine import RuleEngine

logger = logging.getLogger(__name__)

# Type alias cho callback khi có alert mới
AlertCallback = Callable[[dict], None]


class AgentServiceHandler(agent_pb2_grpc.AgentServiceServicer):
    """
    Implement AgentServiceServicer interface từ protobuf.
    Tương đương: AgentServiceHandler trong handler.go
    """

    def __init__(
        self,
        rule_engine: RuleEngine,
        conn_manager: ConnectionManager,
        on_new_alert: Optional[AlertCallback] = None,
        redis_client=None,
    ):
        self.rule_engine = rule_engine
        self.conn_manager = conn_manager
        self.on_new_alert = on_new_alert
        self.redis = redis_client

    # ==========================================================================
    # StreamEvents - Bidirectional Streaming RPC
    # Agent ──stream EventRequest──→ Server (receive loop)
    #                                  ↓ evaluate_log()
    #                                  ↓ Match? → Create Alert → Broadcast
    # Agent ←──stream CommandResponse── Server (send loop)
    #                                  ↑ Lắng nghe cmd_queue
    # ==========================================================================
    async def StreamEvents(
        self,
        request_iterator: AsyncIterator[agent_pb2.EventRequest],
        context: grpc.aio.ServicerContext,
    ):
        """Bidirectional streaming: nhận events, gửi commands"""
        conn: Optional[ActiveConnection] = None
        agent_id = ""
        registered = False

        try:
            # ===== Goroutine 2 (Python Task): Sender - Đẩy commands xuống Agent =====
            sender_task: Optional[asyncio.Task] = None

            async def command_sender():
                """Background task lắng nghe cmd_queue và gửi qua stream"""
                try:
                    while not conn.done.is_set():
                        try:
                            cmd_dict = await asyncio.wait_for(
                                conn.cmd_queue.get(), timeout=1.0
                            )
                            # Build protobuf CommandResponse từ dict
                            cmd_pb = agent_pb2.CommandResponse(
                                command_id=cmd_dict.get("command_id", str(uuid.uuid4())),
                                command_type=cmd_dict.get("command_type", 0),
                                target=cmd_dict.get("target", ""),
                                parameters=cmd_dict.get("parameters", {}),
                                timestamp=int(datetime.utcnow().timestamp() * 1000),
                            )
                            await context.write(cmd_pb)
                            logger.info(
                                f"[STREAM] 📤 Đã gửi command '{cmd_pb.command_type}' "
                                f"xuống Agent '{agent_id}'"
                            )
                        except asyncio.TimeoutError:
                            # Timeout bình thường, tiếp tục vòng lặp
                            continue
                        except Exception as e:
                            logger.error(
                                f"[STREAM] ❌ Lỗi gửi command xuống Agent '{agent_id}': {e}"
                            )
                            return
                except asyncio.CancelledError:
                    pass

            # ===== Main Loop: Nhận events từ Agent stream =====
            async for event in request_iterator:
                # Lần nhận đầu tiên: Register Agent connection
                if not registered:
                    agent_id = event.agent_id
                    conn = ActiveConnection(
                        agent_id=agent_id,
                        hostname=event.hostname,
                        ip_address=event.ip_address,
                        context=context,
                    )

                    # Đăng ký connection vào Connection Manager
                    await self.conn_manager.register(conn)
                    registered = True

                    # Bắt đầu sender task
                    sender_task = asyncio.create_task(command_sender())

                    # Cập nhật trạng thái Agent online trong DB và Redis
                    await self._set_agent_online(
                        agent_id=agent_id,
                        hostname=event.hostname,
                        ip_address=event.ip_address,
                    )

                    logger.info(
                        f"[STREAM] 🟢 Agent '{agent_id}' ({event.hostname}) "
                        f"đã bắt đầu stream events"
                    )

                # ===== Xử lý Event: Parse JSON → Evaluate Rule =====
                await self._process_event(event, agent_id)

        except grpc.aio.AbortError:
            pass
        except Exception as e:
            logger.error(f"[STREAM] ❌ Lỗi stream Agent '{agent_id}': {e}")
        finally:
            # Cleanup khi stream đóng
            if registered and conn:
                conn.done.set()
                if sender_task and not sender_task.done():
                    sender_task.cancel()
                await self.conn_manager.unregister(agent_id)
                await self._set_agent_offline(agent_id)
                logger.info(f"[STREAM] 🔴 Agent '{agent_id}' đã ngắt kết nối stream")

    async def _process_event(self, event: agent_pb2.EventRequest, agent_id: str):
        """
        Xử lý 1 event nhận từ Agent.
        Parse raw_payload JSON → Gọi RuleEngine → Tạo Alert nếu match
        Tương đương: processEvent() trong handler.go
        """
        # Parse raw_payload (JSON string) thành dict
        try:
            raw_log = json.loads(event.raw_payload) if event.raw_payload else {}
        except json.JSONDecodeError:
            logger.warning(
                f"[STREAM] ⚠️ Lỗi parse raw_payload JSON từ Agent '{agent_id}'"
            )
            raw_log = {"raw_data": event.raw_payload}

        # Bổ sung metadata vào raw_log để Rule Engine có thêm context
        raw_log["event_type"] = event.event_type
        raw_log["hostname"] = event.hostname
        raw_log["ip_address"] = event.ip_address
        raw_log["agent_id"] = agent_id

        # Metric là telemetry phục vụ biểu đồ — không phải security alert
        if event.event_type == "system_metric":
            return

        # ===== Gọi Rule Engine đánh giá event =====
        alerts_data, matched = self.rule_engine.evaluate_log(raw_log, agent_id)

        if not matched:
            # Event không nguy hiểm vẫn được lưu để analyst theo dõi
            raw_payload_json = json.dumps(raw_log)
            alerts_data = [
                {
                    "id": str(uuid.uuid4()),
                    "agent_id": agent_id,
                    "rule_id": "EVENT-OBSERVED",
                    "event_type": event.event_type or "observed",
                    "severity": "low",
                    "raw_payload": raw_payload_json,
                    "status": "new",
                    "title": f"[LOW] Event observed: {event.event_type}",
                    "description": "Sự kiện được ghi nhận từ Agent nhưng không khớp detection rule nguy hiểm.",
                    "mitre_tactic": "",
                    "mitre_technique_id": "",
                }
            ]

        # ===== Lưu Alerts vào DB và dispatch =====
        async with AsyncSessionLocal() as db:
            for alert_data in alerts_data:
                alert = Alert(
                    id=alert_data.get("id", str(uuid.uuid4())),
                    agent_id=alert_data["agent_id"],
                    rule_id=alert_data.get("rule_id"),
                    event_type=alert_data["event_type"],
                    severity=alert_data["severity"],
                    raw_payload=alert_data.get("raw_payload", ""),
                    status=alert_data.get("status", "new"),
                    title=alert_data.get("title", ""),
                    description=alert_data.get("description", ""),
                    mitre_tactic=alert_data.get("mitre_tactic", ""),
                    mitre_technique_id=alert_data.get("mitre_technique_id", ""),
                    created_at=datetime.utcnow(),
                )
                db.add(alert)

                try:
                    await db.flush()

                    logger.info(
                        f"[STREAM] 🚨 ALERT CREATED: [{alert.severity.upper()}] "
                        f"{alert.title} (Agent: {agent_id}, Rule: {alert.rule_id})"
                    )

                    # ===== Ghi Audit Log =====
                    audit_details = json.dumps({
                        "event_type": alert.event_type,
                        "rule_id": alert.rule_id,
                        "severity": alert.severity,
                    })
                    audit = AuditLog(
                        id=str(uuid.uuid4()),
                        event_type="alert_created",
                        source="rule_based",
                        action="log_only",
                        actor="rule_engine",
                        details=audit_details,
                        alert_id=alert.id,
                        agent_id=agent_id,
                        created_at=datetime.utcnow(),
                    )
                    db.add(audit)

                    # ===== Gọi callback thông báo Alert mới (WebSocket broadcast + SOAR) =====
                    if self.on_new_alert:
                        asyncio.create_task(
                            self._safe_alert_callback(alert_data)
                        )
                except Exception as e:
                    logger.error(f"[STREAM] ❌ Lỗi lưu Alert vào database: {e}")
                    await db.rollback()
                    continue

            try:
                await db.commit()
            except Exception as e:
                logger.error(f"[STREAM] ❌ Lỗi commit batch alerts: {e}")

    async def _safe_alert_callback(self, alert_data: dict):
        """Gọi alert callback an toàn trong background"""
        try:
            if asyncio.iscoroutinefunction(self.on_new_alert):
                await self.on_new_alert(alert_data)
            else:
                self.on_new_alert(alert_data)
        except Exception as e:
            logger.error(f"[STREAM] ❌ Lỗi alert callback: {e}")

    # ==========================================================================
    # Heartbeat - Unary RPC
    # Agent gửi heartbeat định kỳ (mỗi 30 giây) để báo cáo trạng thái
    # Tương đương: Heartbeat() trong handler.go
    # ==========================================================================
    async def Heartbeat(
        self,
        request: agent_pb2.HeartbeatRequest,
        context: grpc.aio.ServicerContext,
    ) -> agent_pb2.HeartbeatResponse:
        """Unary RPC: nhận heartbeat từ Agent, cập nhật DB và Redis"""
        now = datetime.utcnow()

        # ===== 1. Cập nhật Redis nếu có =====
        if self.redis:
            try:
                await self.redis.set(
                    f"agent:{request.agent_id}:online",
                    "1",
                    ex=90,  # TTL 90 giây (3× heartbeat interval)
                )
                heartbeat_data = {
                    "hostname": request.hostname,
                    "ip_address": request.ip_address,
                    "os_type": request.os_type,
                    "agent_version": request.agent_version,
                    "cpu_usage": str(request.cpu_usage),
                    "memory_usage": str(request.memory_usage),
                    "last_seen": now.isoformat(),
                }
                await self.redis.hset(
                    f"agent:{request.agent_id}:heartbeat", mapping=heartbeat_data
                )
                await self.redis.expire(f"agent:{request.agent_id}:heartbeat", 90)
            except Exception as e:
                logger.warning(
                    f"[HEARTBEAT] ⚠️ Lỗi cập nhật Redis cho Agent '{request.agent_id}': {e}"
                )

        # ===== 2. Upsert Agent trong MySQL =====
        async with AsyncSessionLocal() as db:
            try:
                stmt = select(Agent).where(Agent.id == request.agent_id)
                res = await db.execute(stmt)
                existing = res.scalar_one_or_none()

                if existing is None:
                    # Agent mới → INSERT
                    agent = Agent(
                        id=request.agent_id,
                        hostname=request.hostname,
                        ip_address=request.ip_address,
                        os_type=request.os_type,
                        status="online",
                        last_heartbeat_at=now,
                        agent_version=request.agent_version,
                    )
                    db.add(agent)
                    logger.info(
                        f"[HEARTBEAT] 🆕 Agent mới đã đăng ký: '{request.agent_id}' "
                        f"({request.hostname})"
                    )
                else:
                    # Agent đã tồn tại → UPDATE
                    existing.hostname = request.hostname
                    existing.ip_address = request.ip_address
                    existing.os_type = request.os_type
                    existing.status = "online"
                    existing.last_heartbeat_at = now
                    existing.agent_version = request.agent_version

                await db.commit()
            except Exception as e:
                logger.error(
                    f"[HEARTBEAT] ❌ Không thể lưu Agent '{request.agent_id}': {e}"
                )
                await db.rollback()

        # ===== 3. Trả về response cho Agent =====
        return agent_pb2.HeartbeatResponse(
            acknowledged=True,
            heartbeat_interval_seconds=30,
            message="OK",
        )

    # ==========================================================================
    # Helper: Cập nhật Agent status trong DB
    # ==========================================================================
    async def _set_agent_online(self, agent_id: str, hostname: str, ip_address: str):
        """Cập nhật Agent thành online khi bắt đầu stream"""
        async with AsyncSessionLocal() as db:
            try:
                stmt = select(Agent).where(Agent.id == agent_id)
                res = await db.execute(stmt)
                agent = res.scalar_one_or_none()
                if agent:
                    agent.status = "online"
                    agent.ip_address = ip_address
                    agent.hostname = hostname
                else:
                    db.add(Agent(
                        id=agent_id,
                        hostname=hostname,
                        ip_address=ip_address,
                        os_type="unknown",
                        status="online",
                    ))
                await db.commit()
            except Exception as e:
                logger.error(f"[STREAM] ❌ Lỗi cập nhật Agent online: {e}")

        # Cập nhật Redis
        if self.redis:
            try:
                await self.redis.set(f"agent:{agent_id}:online", "1", ex=90)
            except Exception:
                pass

    async def _set_agent_offline(self, agent_id: str):
        """Cập nhật Agent thành offline khi stream đóng"""
        async with AsyncSessionLocal() as db:
            try:
                stmt = select(Agent).where(Agent.id == agent_id)
                res = await db.execute(stmt)
                agent = res.scalar_one_or_none()
                if agent:
                    agent.status = "offline"
                    await db.commit()
            except Exception as e:
                logger.error(f"[STREAM] ❌ Lỗi cập nhật Agent offline: {e}")

        # Xóa key Redis
        if self.redis:
            try:
                await self.redis.delete(f"agent:{agent_id}:online")
            except Exception:
                pass
