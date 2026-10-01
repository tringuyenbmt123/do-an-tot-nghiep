# ==============================================================================
# SOC/EDR Agent - Python Port
# File: grpc_streamer.py
# Mô tả: Kết nối gRPC Bidirectional Streaming (StreamEvents) + Heartbeat tới Server,
#         tự động reconnect với Exponential Backoff, xác thực Token & Metadata,
#         và chuyển tiếp Command từ Server tới Executor.
# ==============================================================================

import logging
import math
import os
import sys
import threading
import time

import grpc

from grpc_stubs import get_pb2

logger = logging.getLogger(__name__)

# Thêm path đến grpc server stubs
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_SERVER_GRPC_DIR = os.path.normpath(
    os.path.join(_THIS_DIR, "..", "soc-server-python", "app", "grpc_server")
)
for _p in [_THIS_DIR, _SERVER_GRPC_DIR]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

import agent_pb2_grpc as _pb2_grpc  # noqa: E402


class GRPCStreamer:
    """Quản lý kết nối gRPC liên tục 2 chiều với Auto-Reconnect."""

    def __init__(self, cfg, event_buffer, command_executor, metric_collector):
        self._cfg = cfg
        self._buffer = event_buffer
        self._executor = command_executor
        self._collector = metric_collector

    def start(self, stop_event: threading.Event):
        """Vòng lặp kết nối và duy trì Stream liên tục với Auto-Reconnect."""
        logger.info(
            "[STREAMER] 🚀 Bắt đầu gRPC Streamer (Server: %s, Protocol: gRPC)",
            self._cfg.server_url,
        )

        attempt = 0
        while not stop_event.is_set():
            try:
                self._connect_and_stream(stop_event)
            except Exception as e:
                if stop_event.is_set():
                    break
                attempt += 1
                backoff = min(
                    float(self._cfg.max_backoff_seconds),
                    math.pow(2, min(attempt, 6)),  # Exponential: 2,4,8,16,32,64
                )
                backoff = max(backoff, 1.0)
                logger.warning(
                    "[STREAMER] ⚠️ Mất kết nối tới Server: %s. Thử lại sau %.0fs (Lần #%d)...",
                    e, backoff, attempt,
                )
                stop_event.wait(timeout=backoff)
            else:
                # Kết nối bình thường (không lỗi)
                if not stop_event.is_set():
                    attempt = 0

        logger.info("[STREAMER] 🛑 gRPC Streamer đã kết thúc.")

    def _connect_and_stream(self, stop_event: threading.Event):
        """Thiết lập kết nối gRPC, stream events và nhận commands."""
        channel = self._create_channel()
        try:
            stub = _pb2_grpc.AgentServiceStub(channel)

            # Tạo metadata xác thực
            metadata = [
                ("authorization", f"Bearer {self._cfg.agent_secret_key}"),
                ("x-agent-id", self._cfg.agent_id),
            ]

            logger.info(
                "[STREAMER] 🟢 Kết nối thành công tới SOC Server: %s [AgentID: %s]",
                self._cfg.server_url,
                self._cfg.agent_id,
            )

            # Khởi chạy Heartbeat loop trong thread riêng
            hb_stop = threading.Event()
            hb_thread = threading.Thread(
                target=self._run_heartbeat_loop,
                args=(stub, hb_stop, metadata),
                daemon=True,
            )
            hb_thread.start()

            try:
                # Tạo generator gửi events từ buffer
                event_gen = self._event_generator(stop_event)

                # Mở bidirectional stream
                response_stream = stub.StreamEvents(event_gen, metadata=metadata)

                # Đọc commands từ server trong main loop
                for cmd in response_stream:
                    if stop_event.is_set():
                        break
                    # Thực thi lệnh trong thread riêng
                    threading.Thread(
                        target=self._executor.execute_proto_command,
                        args=(cmd,),
                        daemon=True,
                    ).start()

            finally:
                hb_stop.set()
                hb_thread.join(timeout=3)

        finally:
            channel.close()

    def _event_generator(self, stop_event: threading.Event):
        """Generator liên tục đọc từ buffer và yield EventRequest lên server."""
        while not stop_event.is_set():
            event = self._buffer.pop(timeout=0.5)
            if event is not None:
                yield event

    def _run_heartbeat_loop(self, stub, stop_event: threading.Event, metadata: list):
        """Vòng lặp gửi Heartbeat định kỳ."""
        pb2 = get_pb2()
        while not stop_event.is_set():
            interval = self._cfg.heartbeat_interval
            stop_event.wait(timeout=interval)
            if stop_event.is_set():
                break

            # Lấy metric tức thời để kèm theo Heartbeat
            cpu_pct = 0.0
            mem_pct = 0.0
            if self._collector:
                snap = self._collector.collect_snapshot()
                if snap:
                    cpu_pct = snap.cpu_usage_percent
                    mem_pct = snap.memory_usage_percent

            req = pb2.HeartbeatRequest(
                agent_id=self._cfg.agent_id,
                hostname=self._cfg.hostname,
                ip_address=self._cfg.ip_address,
                os_type=self._cfg.os_type,
                agent_version=self._cfg.version,
                cpu_usage=cpu_pct,
                memory_usage=mem_pct,
                timestamp=int(time.time() * 1000),
            )

            try:
                resp = stub.Heartbeat(req, metadata=metadata, timeout=3)
                if resp and resp.acknowledged:
                    # Server có thể yêu cầu thay đổi interval heartbeat
                    if resp.heartbeat_interval_seconds > 0 and \
                       resp.heartbeat_interval_seconds != self._cfg.heartbeat_interval_seconds:
                        self._cfg.update_intervals(
                            hb_sec=int(resp.heartbeat_interval_seconds)
                        )
            except grpc.RpcError as e:
                logger.warning("[STREAMER] ⚠️ Gửi Heartbeat thất bại: %s", e.details() if hasattr(e, 'details') else e)
            except Exception as e:
                logger.warning("[STREAMER] ⚠️ Heartbeat lỗi: %s", e)

    def _create_channel(self):
        """Tạo gRPC channel (mTLS nếu có cert, hoặc insecure)."""
        target = self._cfg.server_url

        if self._cfg.mtls_enabled and self._cfg.ca_cert_path:
            with open(self._cfg.ca_cert_path, "rb") as f:
                ca_cert = f.read()

            if self._cfg.client_cert_path and self._cfg.client_key_path:
                with open(self._cfg.client_cert_path, "rb") as f:
                    client_cert = f.read()
                with open(self._cfg.client_key_path, "rb") as f:
                    client_key = f.read()
                credentials = grpc.ssl_channel_credentials(
                    root_certificates=ca_cert,
                    private_key=client_key,
                    certificate_chain=client_cert,
                )
            else:
                credentials = grpc.ssl_channel_credentials(root_certificates=ca_cert)

            return grpc.secure_channel(target, credentials)
        else:
            return grpc.insecure_channel(
                target,
                options=[
                    ("grpc.max_receive_message_length", 50 * 1024 * 1024),
                    ("grpc.max_send_message_length", 10 * 1024 * 1024),
                ],
            )
