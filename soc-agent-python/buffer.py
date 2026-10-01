# ==============================================================================
# SOC/EDR Agent - Python Port
# File: buffer.py
# Mô tả: Hàng đợi đệm trong RAM với dung lượng cố định (1000 items),
#         cơ chế Backpressure ưu tiên giữ lại các log Critical/High khi mạng chậm.
# ==============================================================================

import logging
import queue
import threading

logger = logging.getLogger(__name__)


class EventBuffer:
    """Queue có giới hạn với Backpressure: ưu tiên giữ lại event severity cao."""

    def __init__(self, capacity: int = 1000):
        if capacity <= 0:
            capacity = 1000
        self._capacity = capacity
        self._queue: queue.Queue = queue.Queue(maxsize=capacity)
        self._dropped = 0
        self._lock = threading.Lock()

    def push(self, event) -> bool:
        """Đẩy event vào buffer. Nếu đầy, áp dụng Backpressure."""
        if event is None:
            return False

        try:
            self._queue.put_nowait(event)
            return True
        except queue.Full:
            pass

        # Queue đã đầy! Kiểm tra severity
        severity = ""
        if hasattr(event, "metadata") and event.metadata:
            severity = event.metadata.get("severity", "")

        # Nếu critical/high → drop event cũ nhất để nhường chỗ
        if severity in ("critical", "high"):
            try:
                old = self._queue.get_nowait()  # Lấy ra event cũ
                with self._lock:
                    self._dropped += 1
                _ = old  # Bỏ event cũ

                try:
                    self._queue.put_nowait(event)
                    logger.warning(
                        "[BUFFER] ⚠️ Queue đầy: Đã drop 1 event cũ để nhường chỗ cho Event [%s]",
                        severity,
                    )
                    return True
                except queue.Full:
                    pass
            except queue.Empty:
                pass

        # Drop event thông thường
        with self._lock:
            self._dropped += 1
        return False

    def pop(self, timeout: float = 0.5):
        """Lấy event ra khỏi buffer (blocking với timeout)."""
        try:
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def get_queue(self) -> queue.Queue:
        """Trả về queue nội bộ để Streamer có thể đọc trực tiếp."""
        return self._queue

    @property
    def dropped(self) -> int:
        with self._lock:
            return self._dropped

    @property
    def size(self) -> int:
        return self._queue.qsize()
