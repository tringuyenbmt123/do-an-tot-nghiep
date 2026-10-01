# ==============================================================================
# SOC/EDR Agent - Python Port
# File: grpc_stubs.py
# Mô tả: Helper dùng chung - import pb2 stubs và tạo EventRequest nhanh.
#        Reuse agent_pb2.py từ soc-server-python (cùng proto).
# ==============================================================================

import os
import sys

# Thêm thư mục chứa agent_pb2.py vào sys.path
# Ưu tiên: thư mục hiện tại (nơi copy pb2 vào) → rồi mới đến server-python
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_SERVER_GRPC_DIR = os.path.join(
    _THIS_DIR,
    "..",
    "soc-server-python",
    "app",
    "grpc_server",
)
for _p in [_THIS_DIR, os.path.normpath(_SERVER_GRPC_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

import agent_pb2 as _pb2  # noqa: E402


def make_event_request(
    agent_id: str,
    event_type: str,
    hostname: str,
    ip_address: str,
    raw_payload: str,
    timestamp: int,
    metadata: dict = None,
) -> "_pb2.EventRequest":
    """Factory helper tạo EventRequest protobuf."""
    req = _pb2.EventRequest(
        agent_id=agent_id,
        event_type=event_type,
        hostname=hostname,
        ip_address=ip_address,
        raw_payload=raw_payload,
        timestamp=timestamp,
    )
    if metadata:
        req.metadata.update(metadata)
    return req


def get_pb2():
    return _pb2
