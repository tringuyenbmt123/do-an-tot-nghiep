# ==============================================================================
# SOC/EDR Agent - Python Port
# File: fim_watcher.py
# Mô tả: File Integrity Monitoring - theo dõi thay đổi filesystem trong các
#         thư mục được cấu hình bằng watchdog.
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


class _FIMEventHandler(FileSystemEventHandler):
    """Watchdog handler cho FIM."""

    def __init__(self, watcher: "FIMWatcher"):
        super().__init__()
        self._watcher = watcher

    def on_created(self, event):
        self._watcher._emit("created", event.src_path)

    def on_modified(self, event):
        if not event.is_directory:
            self._watcher._emit("modified", event.src_path)

    def on_deleted(self, event):
        self._watcher._emit("deleted", event.src_path)

    def on_moved(self, event):
        self._watcher._emit("renamed", event.src_path)


class FIMWatcher:
    """Theo dõi thay đổi filesystem trong các thư mục cấu hình."""

    def __init__(self, cfg, event_buffer):
        self._cfg = cfg
        self._buffer = event_buffer
        self._observer = Observer()

    def start(self, stop_event: threading.Event):
        """Bắt đầu FIM. Dừng khi stop_event được set."""
        logger.info("[FIM] Đang theo dõi: %s", self._cfg.fim_paths)

        handler = _FIMEventHandler(self)
        watched_count = 0
        for root in self._cfg.fim_paths:
            root = os.path.abspath(root)
            if not os.path.exists(root):
                logger.warning("[FIM] Thư mục không tồn tại (bỏ qua): %s", root)
                continue
            if not os.path.isdir(root):
                logger.warning("[FIM] Đường dẫn không phải thư mục (bỏ qua): %s", root)
                continue
            try:
                self._observer.schedule(handler, root, recursive=True)
                watched_count += 1
            except Exception as e:
                logger.warning("[FIM] Không thể theo dõi '%s': %s", root, e)

        logger.info(
            "[FIM] File Integrity Monitoring đã khởi chạy (%d thư mục gốc)", watched_count
        )
        self._observer.start()

        stop_event.wait()

        self._observer.stop()
        self._observer.join()
        logger.info("[FIM] File Integrity Monitoring đã dừng.")

    def _emit(self, action: str, path: str):
        """Phát EventRequest khi có thay đổi."""
        logger.info("[FIM] Phát hiện file %s: %s", action, path)

        raw = json.dumps(
            {
                "action": action,
                "path": path,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )

        req = make_event_request(
            agent_id=self._cfg.agent_id,
            event_type="file_integrity",
            hostname=self._cfg.hostname,
            ip_address=self._cfg.ip_address,
            raw_payload=raw,
            timestamp=int(time.time() * 1000),
            metadata={"severity": "medium", "action": action, "path": path},
        )
        pushed = self._buffer.push(req)
        if not pushed:
            logger.debug("[FIM] Bỏ qua event vì buffer đầy: %s", path)
