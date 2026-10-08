# ==============================================================================
# SOC/EDR Agent - Python Port
# File: process_monitor.py
# Mô tả: Phát hiện process mới được khởi chạy trên endpoint bằng psutil polling.
# ==============================================================================

import json
import logging
import threading
import time

import psutil

from grpc_stubs import make_event_request

logger = logging.getLogger(__name__)


class ProcessMonitor:
    """Phát hiện process mới được khởi chạy trên endpoint."""

    def __init__(self, cfg, event_buffer):
        self._cfg = cfg
        self._buffer = event_buffer

    def start(self, stop_event: threading.Event):
        """Vòng lặp polling process. Dừng khi stop_event được set."""
        interval = float(max(self._cfg.process_poll_interval_seconds, 1))
        previous = self._snapshot()
        logger.info("[PROCESS] Process Monitor đã khởi chạy (Interval: %ds)", int(interval))

        while not stop_event.is_set():
            stop_event.wait(timeout=interval)
            if stop_event.is_set():
                break
            current = self._snapshot()
            for pid, info in current.items():
                if pid not in previous:
                    self._emit(pid, info)
            previous = current

        logger.info("[PROCESS] Process Monitor đã dừng.")

    def _snapshot(self) -> dict:
        """Lấy snapshot danh sách process hiện tại."""
        result = {}
        try:
            for p in psutil.process_iter(["pid", "name", "cmdline"]):
                try:
                    name = p.info["name"] or ""
                    pid = p.info["pid"]
                    cmdline_list = p.info.get("cmdline") or []
                    cmdline = " ".join(cmdline_list) if isinstance(cmdline_list, list) else str(cmdline_list)
                    if not self._excluded(name):
                        result[pid] = (name, cmdline)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception:
            pass
        return result

    def _excluded(self, name: str) -> bool:
        """Kiểm tra xem tên process có trong danh sách loại trừ không."""
        lower = name.lower()
        for ex in self._cfg.process_exclude_names:
            if ex.lower() == lower:
                return True
        return False

    def _emit(self, pid: int, info_tuple: tuple):
        """Phát EventRequest khi phát hiện process mới."""
        name, cmdline = info_tuple
        raw = json.dumps(
            {
                "action": "process_started",
                "pid": pid,
                "process_name": name,
                "command_line": cmdline,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )
        req = make_event_request(
            agent_id=self._cfg.agent_id,
            event_type="sysmon_process_create",
            hostname=self._cfg.hostname,
            ip_address=self._cfg.ip_address,
            raw_payload=raw,
            timestamp=int(time.time() * 1000),
            metadata={"severity": "low", "process_name": name, "command_line": cmdline},
        )
        pushed = self._buffer.push(req)
        if not pushed:
            logger.debug("[PROCESS] Bỏ qua event vì buffer đầy: %s", name)
