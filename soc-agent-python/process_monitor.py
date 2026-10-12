# ==============================================================================
# SOC/EDR Agent - Python Port
# File: process_monitor.py
# Mô tả: Phát hiện process mới đáng ngờ được khởi chạy trên endpoint.
#         CHỈ gửi event khi process chạy từ đường dẫn bất thường
#         (Temp, Downloads, AppData\Roaming, v.v.) để tránh false positive.
# ==============================================================================

import json
import logging
import os
import threading
import time

import psutil

from grpc_stubs import make_event_request

logger = logging.getLogger(__name__)

# Các đường dẫn đáng ngờ - process chạy từ đây cần được báo cáo
SUSPICIOUS_PATH_PATTERNS = [
    "\\temp\\",
    "\\tmp\\",
    "\\downloads\\",
    "\\appdata\\roaming\\",
    "\\appdata\\local\\temp\\",
    "\\users\\public\\",
    "\\programdata\\",
    "/tmp/",
    "/var/tmp/",
    "/dev/shm/",
    "/home/",
]

# Các đường dẫn an toàn - process chạy từ đây thường lành tính
SAFE_PATH_PREFIXES = [
    "c:\\program files\\",
    "c:\\program files (x86)\\",
    "c:\\windows\\",
    "c:\\windows\\system32\\",
    "c:\\windows\\syswow64\\",
    "/usr/bin/",
    "/usr/sbin/",
    "/bin/",
    "/sbin/",
    "/opt/",
]


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
        """Lấy snapshot danh sách process hiện tại (kèm exe path)."""
        result = {}
        try:
            for p in psutil.process_iter(["pid", "name", "exe", "cmdline"]):
                try:
                    name = p.info["name"] or ""
                    pid = p.info["pid"]
                    exe = p.info.get("exe") or ""
                    cmdline_list = p.info.get("cmdline") or []
                    cmdline = " ".join(cmdline_list) if isinstance(cmdline_list, list) else str(cmdline_list)
                    if not self._excluded(name):
                        result[pid] = (name, cmdline, exe)
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

    def _is_suspicious(self, name: str, exe: str, cmdline: str) -> bool:
        """
        Xác định process có đáng ngờ không dựa trên đường dẫn thực thi.
        - Chạy từ Temp, Downloads, AppData\\Roaming → ĐÁng ngờ → gửi event
        - Chạy từ Program Files, Windows → Lành tính → bỏ qua
        """
        if not exe:
            return False  # Không có exe path → không đủ thông tin

        exe_lower = exe.replace("/", "\\").lower()

        # Bỏ qua các path an toàn
        for safe in SAFE_PATH_PREFIXES:
            if exe_lower.startswith(safe):
                return False

        # Báo cáo nếu chạy từ path đáng ngờ
        for sus in SUSPICIOUS_PATH_PATTERNS:
            if sus in exe_lower:
                return True

        return False  # Mặc định: không đủ bằng chứng → im lặng

    def _emit(self, pid: int, info_tuple: tuple):
        """Phát EventRequest khi phát hiện process mới đáng ngờ."""
        name, cmdline, exe = info_tuple

        # CHỈ gửi event khi process chạy từ đường dẫn đáng ngờ
        if not self._is_suspicious(name, exe, cmdline):
            return

        logger.info("[PROCESS] 🚨 Process đáng ngờ từ path bất thường: %s (exe=%s)", name, exe)

        raw = json.dumps(
            {
                "action": "process_started",
                "pid": pid,
                "process_name": name,
                "command_line": cmdline,
                "exe_path": exe,
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
            metadata={"severity": "medium", "process_name": name, "exe_path": exe},
        )
        pushed = self._buffer.push(req)
        if not pushed:
            logger.debug("[PROCESS] Bỏ qua event vì buffer đầy: %s", name)

