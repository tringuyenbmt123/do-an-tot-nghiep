# ==============================================================================
# app/grpc_server/__init__.py
# Fix sys.path để protoc-generated pb2 files có thể import nhau
# ==============================================================================
import sys
import os

# Thêm thư mục này vào sys.path để agent_pb2_grpc.py tìm được agent_pb2
_grpc_dir = os.path.dirname(os.path.abspath(__file__))
if _grpc_dir not in sys.path:
    sys.path.insert(0, _grpc_dir)
