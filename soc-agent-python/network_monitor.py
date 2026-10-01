# ==============================================================================
# SOC/EDR Agent - Python Port
# File: network_monitor.py
# Mô tả: Phát hiện các kết nối mạng mới trên endpoint bằng psutil polling.
# ==============================================================================

import json
import logging
import threading
import time

import psutil

from grpc_stubs import make_event_request

logger = logging.getLogger(__name__)


class NetworkMonitor:
    """Phát hiện kết nối mạng mới trên endpoint."""

    def __init__(self, cfg, event_buffer):
        self._cfg = cfg
        self._buffer = event_buffer

    def start(self, stop_event: threading.Event):
        """Vòng lặp polling kết nối mạng. Dừng khi stop_event được set."""
        interval = float(max(self._cfg.network_poll_interval_seconds, 1))
        previous = self._snapshot()
        logger.info("[NETWORK] Network Monitor đã khởi chạy (Interval: %ds)", int(interval))

        while not stop_event.is_set():
            stop_event.wait(timeout=interval)
            if stop_event.is_set():
                break
            current = self._snapshot()
            for conn_key in current:
                if conn_key not in previous:
                    self._emit(conn_key)
            previous = current

        logger.info("[NETWORK] Network Monitor đã dừng.")

    def _snapshot(self) -> set:
        """Lấy snapshot tập hợp kết nối mạng hiện tại."""
        result = set()
        try:
            for c in psutil.net_connections(kind="all"):
                laddr = f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else ":"
                raddr = f"{c.raddr.ip}:{c.raddr.port}" if c.raddr else ":"
                key = f"{c.type}:{laddr}:{raddr}"
                result.add(key)
        except Exception:
            pass
        return result

    def _emit(self, connection: str):
        """Phát EventRequest khi phát hiện kết nối mới."""
        raw = json.dumps(
            {
                "action": "connection_opened",
                "connection": connection,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )
        req = make_event_request(
            agent_id=self._cfg.agent_id,
            event_type="network_connection",
            hostname=self._cfg.hostname,
            ip_address=self._cfg.ip_address,
            raw_payload=raw,
            timestamp=int(time.time() * 1000),
            metadata={"severity": "low"},
        )
        pushed = self._buffer.push(req)
        if not pushed:
            logger.debug("[NETWORK] Bỏ qua event vì buffer đầy")
