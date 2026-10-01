# ==============================================================================
# SOC/EDR Agent - Python Port
# File: log_tailer.py
# Mô tả: Theo dõi sự kiện thay đổi file log thời gian thực bằng watchdog,
#         non-blocking, đọc dòng mới nhất và gửi về pipeline với CPU cực thấp.
# ==============================================================================

import json
import logging
import os
import threading
import time

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from grpc_stubs import make_event_request

logger = logging.getLogger(__name__)


class _FileState:
    """Lưu offset của từng file đang theo dõi."""

    def __init__(self, path: str, offset: int = 0):
        self.path = path
        self.offset = offset


class _LogFileHandler(FileSystemEventHandler):
    """Watchdog handler nhận sự kiện file write/delete/rename."""

    def __init__(self, tailer: "LogTailer"):
        super().__init__()
        self._tailer = tailer

    def on_modified(self, event):
        if not event.is_directory:
            self._tailer._handle_file_write(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            self._tailer._handle_file_rotate(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            self._tailer._handle_file_rotate(event.src_path)


class LogTailer:
    """Quản lý việc theo dõi và đọc log từ các file được cấu hình."""

    def __init__(self, cfg, event_buffer):
        self._cfg = cfg
        self._buffer = event_buffer
        self._states: dict[str, _FileState] = {}
        self._lock = threading.Lock()
        self._observer = Observer()
        self._watched_dirs: set = set()

    def start(self, stop_event: threading.Event):
        """Bắt đầu theo dõi các file log. Dừng khi stop_event được set."""
        logger.info("[TAILER] 🚀 Log Tailer (watchdog) đang khởi động...")

        handler = _LogFileHandler(self)

        # Thêm các file từ config
        for path in self._cfg.log_paths:
            abs_path = os.path.abspath(path)
            self._add_file(abs_path, handler)

        self._observer.start()
        logger.info("[TAILER] 👁️ Đang theo dõi %d file log", len(self._states))

        stop_event.wait()

        self._observer.stop()
        self._observer.join()
        logger.info("[TAILER] 🛑 Log Tailer đã dừng an toàn.")

    def _add_file(self, file_path: str, handler: "_LogFileHandler") -> None:
        """Thêm một file log mới vào danh sách theo dõi."""
        abs_path = os.path.abspath(file_path)
        dir_path = os.path.dirname(abs_path)

        # Lấy offset ban đầu
        initial_offset = 0
        if os.path.exists(abs_path):
            initial_offset = os.path.getsize(abs_path)
        else:
            logger.warning("[TAILER] ⚠️ File không tồn tại (sẽ chờ tạo): %s", abs_path)

        with self._lock:
            self._states[abs_path] = _FileState(abs_path, initial_offset)

        # Watch directory nếu chưa watch
        if dir_path not in self._watched_dirs:
            os.makedirs(dir_path, exist_ok=True)
            self._observer.schedule(handler, dir_path, recursive=False)
            self._watched_dirs.add(dir_path)

        logger.info(
            "[TAILER] 👁️ Bắt đầu theo dõi file: %s (Offset ban đầu: %d)",
            abs_path,
            initial_offset,
        )

    def _handle_file_write(self, file_path: str):
        """Đọc các dòng log mới vừa được ghi."""
        abs_path = os.path.abspath(file_path)
        with self._lock:
            state = self._states.get(abs_path)
        if state is None:
            return

        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(state.offset)
                lines = f.readlines()
                new_offset = f.tell()

            for line in lines:
                trimmed = line.strip()
                if trimmed:
                    self._dispatch_log_line(abs_path, trimmed)

            with self._lock:
                if abs_path in self._states:
                    self._states[abs_path].offset = new_offset
        except Exception as e:
            logger.debug("[TAILER] Lỗi đọc file %s: %s", abs_path, e)

    def _handle_file_rotate(self, file_path: str):
        """Xử lý khi file bị log rotate (deleted/renamed)."""
        abs_path = os.path.abspath(file_path)
        time.sleep(0.5)
        if os.path.exists(abs_path):
            with self._lock:
                self._states[abs_path] = _FileState(abs_path, 0)
            logger.info("[TAILER] 🔄 Đã reload file sau khi Rotate: %s", abs_path)

    def _dispatch_log_line(self, file_path: str, line: str):
        """Đóng gói dòng log thành EventRequest và gửi vào buffer."""
        event_type = "system_log"
        severity = "info"

        lower = line.lower()
        if any(kw in lower for kw in ("error", "failed", "denied")):
            severity = "medium"
        if any(kw in lower for kw in ("malware", "attack", "unauthorized")):
            severity = "critical"
        if "sysmon" in lower:
            event_type = "sysmon_event"

        raw_payload = json.dumps(
            {
                "source_file": file_path,
                "message": line,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )

        req = make_event_request(
            agent_id=self._cfg.agent_id,
            event_type=event_type,
            hostname=self._cfg.hostname,
            ip_address=self._cfg.ip_address,
            raw_payload=raw_payload,
            timestamp=int(time.time() * 1000),
            metadata={"source_file": file_path, "severity": severity},
        )
        self._buffer.push(req)
