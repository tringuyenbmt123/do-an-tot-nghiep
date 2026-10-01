# ==============================================================================
# SOC/EDR Agent - Python Port
# File: metric_collector.py
# Mô tả: Thu thập số liệu hệ thống (CPU, RAM, Network I/O, Active Connections)
#         với footprint cực nhẹ bằng psutil.
# ==============================================================================

import json
import logging
import threading
import time
from typing import Optional

import psutil

logger = logging.getLogger(__name__)


class SystemMetricSnapshot:
    """Snapshot toàn diện về tình trạng máy."""

    def __init__(self):
        self.cpu_usage_percent: float = 0.0
        self.memory_usage_percent: float = 0.0
        self.memory_used_mb: int = 0
        self.memory_total_mb: int = 0
        self.bytes_sent: int = 0
        self.bytes_recv: int = 0
        self.active_connections_count: int = 0
        self.top_processes: list = []
        self.timestamp: int = 0

    def to_dict(self) -> dict:
        return {
            "cpu_usage_percent": round(self.cpu_usage_percent, 2),
            "memory_usage_percent": round(self.memory_usage_percent, 2),
            "memory_used_mb": self.memory_used_mb,
            "memory_total_mb": self.memory_total_mb,
            "bytes_sent": self.bytes_sent,
            "bytes_recv": self.bytes_recv,
            "active_connections_count": self.active_connections_count,
            "top_processes": self.top_processes,
            "timestamp": self.timestamp,
        }


class MetricCollector:
    """Bộ thu thập metric định kỳ dùng psutil."""

    def __init__(self, cfg, event_buffer):
        self._cfg = cfg
        self._buffer = event_buffer
        self._lock = threading.Lock()

    def start(self, stop_event: threading.Event):
        """Vòng lặp thu thập định kỳ. Dừng khi stop_event được set."""
        logger.info(
            "[COLLECTOR] 🚀 Metric Collector đã khởi chạy (Interval: %ds)",
            self._cfg.metric_interval_seconds,
        )
        while not stop_event.is_set():
            interval = self._cfg.metric_interval
            stop_event.wait(timeout=interval)
            if stop_event.is_set():
                break
            self._collect_and_send()
        logger.info("[COLLECTOR] 🛑 Metric Collector đã dừng an toàn.")

    def collect_snapshot(self) -> Optional[SystemMetricSnapshot]:
        """Lấy snapshot metric đầy đủ tức thì."""
        with self._lock:
            snap = SystemMetricSnapshot()
            snap.timestamp = int(time.time() * 1000)

            try:
                snap.cpu_usage_percent = psutil.cpu_percent(interval=None)
            except Exception:
                pass

            try:
                mem = psutil.virtual_memory()
                snap.memory_usage_percent = mem.percent
                snap.memory_used_mb = mem.used // (1024 * 1024)
                snap.memory_total_mb = mem.total // (1024 * 1024)
            except Exception:
                pass

            try:
                net = psutil.net_io_counters()
                if net:
                    snap.bytes_sent = net.bytes_sent
                    snap.bytes_recv = net.bytes_recv
            except Exception:
                pass

            try:
                conns = psutil.net_connections()
                snap.active_connections_count = len(conns)
            except Exception:
                pass

            return snap

    def collect_forensics(self) -> Optional[SystemMetricSnapshot]:
        """Thu thập forensic kèm danh sách top 10 processes."""
        snap = self.collect_snapshot()
        if snap is None:
            return None

        try:
            procs = []
            for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]):
                try:
                    info = p.info
                    cpu_p = info.get("cpu_percent") or 0.0
                    mem_info = info.get("memory_info")
                    mem_mb = (mem_info.rss // (1024 * 1024)) if mem_info else 0
                    if cpu_p > 0.1 or mem_mb > 50:
                        procs.append(
                            {
                                "pid": info["pid"],
                                "name": info.get("name", ""),
                                "cpu_percent": round(cpu_p, 2),
                                "memory_mb": mem_mb,
                            }
                        )
                    if len(procs) >= 10:
                        break
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            snap.top_processes = procs
        except Exception as e:
            logger.warning("[COLLECTOR] Lỗi lấy process list: %s", e)

        return snap

    def _collect_and_send(self):
        """Thu thập và đóng gói thành EventRequest gửi vào Buffer."""
        from grpc_stubs import make_event_request  # import lazy để tránh circular

        snap = self.collect_snapshot()
        if snap is None:
            return

        payload = json.dumps(snap.to_dict())
        req = make_event_request(
            agent_id=self._cfg.agent_id,
            event_type="system_metric",
            hostname=self._cfg.hostname,
            ip_address=self._cfg.ip_address,
            raw_payload=payload,
            timestamp=snap.timestamp,
            metadata={
                "cpu_usage": f"{snap.cpu_usage_percent:.1f}",
                "mem_usage": f"{snap.memory_usage_percent:.1f}",
                "severity": "low",
            },
        )
        self._buffer.push(req)
