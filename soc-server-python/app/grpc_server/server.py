# ==============================================================================
# app/grpc_server/server.py - gRPC Server Setup
# Tương đương: internal/agent_grpc/server.go
#
# Khởi tạo gRPC Async Server trên port 50051 (giữ nguyên port Go)
# Hỗ trợ cả mTLS (production) và insecure (dev mode)
# ==============================================================================

import logging
import ssl
import os
from typing import Optional, Callable

import grpc
import grpc.aio

from app.grpc_server import agent_pb2_grpc
from app.grpc_server.handler import AgentServiceHandler
from app.grpc_server.connection_manager import ConnectionManager
from app.rules.engine import RuleEngine

logger = logging.getLogger(__name__)

# Port gRPC — giữ nguyên như Go server (port 50051)
GRPC_PORT = int(os.getenv("GRPC_PORT", "50051"))

# Đường dẫn cert mTLS (tùy chọn, nếu có)
MTLS_ENABLED    = os.getenv("MTLS_ENABLED", "false").lower() == "true"
CA_CERT_PATH    = os.getenv("CA_CERT_PATH", "certs/ca.crt")
SERVER_CERT_PATH = os.getenv("SERVER_CERT_PATH", "certs/server.crt")
SERVER_KEY_PATH  = os.getenv("SERVER_KEY_PATH", "certs/server.key")


def create_server_credentials() -> Optional[grpc.ServerCredentials]:
    """
    Tạo mTLS credentials cho gRPC Server nếu MTLS_ENABLED=true.
    Nếu cert không tồn tại hoặc MTLS_ENABLED=false → trả về None (insecure).
    Tương đương: createMTLSConfig() trong server.go
    """
    if not MTLS_ENABLED:
        logger.info("[gRPC SERVER] ⚠️ mTLS đang tắt - Chạy ở chế độ INSECURE (dev mode)")
        return None

    try:
        with open(CA_CERT_PATH, "rb") as f:
            ca_cert = f.read()
        with open(SERVER_CERT_PATH, "rb") as f:
            server_cert = f.read()
        with open(SERVER_KEY_PATH, "rb") as f:
            server_key = f.read()

        credentials = grpc.ssl_server_credentials(
            private_key_certificate_chain_pairs=[(server_key, server_cert)],
            root_certificates=ca_cert,
            require_client_auth=True,  # RequireAndVerifyClientCert
        )
        logger.info("[gRPC SERVER] ✅ Đã tạo mTLS credentials thành công")
        return credentials

    except FileNotFoundError as e:
        logger.warning(
            f"[gRPC SERVER] ⚠️ Không tìm thấy cert file: {e}. "
            f"Chạy ở chế độ INSECURE (không mTLS) - CHỈ DÙNG CHO DEV!"
        )
        return None
    except Exception as e:
        logger.warning(
            f"[gRPC SERVER] ⚠️ Không thể tạo mTLS credentials: {e}. "
            f"Chạy ở chế độ INSECURE"
        )
        return None


async def create_grpc_server(
    rule_engine: RuleEngine,
    conn_manager: ConnectionManager,
    on_new_alert: Optional[Callable] = None,
    redis_client=None,
) -> grpc.aio.Server:
    """
    Khởi tạo và trả về gRPC async server đã được cấu hình.
    Tương đương: NewGRPCServer() trong server.go

    Args:
        rule_engine: Detection Rule Engine singleton
        conn_manager: Connection Manager singleton
        on_new_alert: Callback khi có Alert mới (WebSocket broadcast + SOAR)
        redis_client: Redis client (tùy chọn)

    Returns:
        grpc.aio.Server instance đã add service và listen
    """
    # Tạo gRPC Async Server với options tương đương Go
    server = grpc.aio.server(
        options=[
            # Tương đương grpc.MaxRecvMsgSize(50MB)
            ("grpc.max_receive_message_length", 50 * 1024 * 1024),
            # Tương đương grpc.MaxSendMsgSize(10MB)
            ("grpc.max_send_message_length", 10 * 1024 * 1024),
            # Keep-alive để giữ kết nối Agent lâu dài
            ("grpc.keepalive_time_ms", 30000),      # 30s
            ("grpc.keepalive_timeout_ms", 10000),    # 10s timeout
            ("grpc.keepalive_permit_without_calls", True),
        ]
    )

    # Khởi tạo AgentService Handler với dependencies
    handler = AgentServiceHandler(
        rule_engine=rule_engine,
        conn_manager=conn_manager,
        on_new_alert=on_new_alert,
        redis_client=redis_client,
    )

    # Đăng ký service handler
    agent_pb2_grpc.add_AgentServiceServicer_to_server(handler, server)

    # Thêm port với hoặc không có TLS
    credentials = create_server_credentials()
    listen_addr = f"[::]:{GRPC_PORT}"

    if credentials:
        server.add_secure_port(listen_addr, credentials)
        logger.info(
            f"[gRPC SERVER] ✅ gRPC Server đã sẵn sàng với mTLS trên port {GRPC_PORT}"
        )
    else:
        server.add_insecure_port(listen_addr)
        logger.info(
            f"[gRPC SERVER] ⚠️ gRPC Server INSECURE đang listen trên port {GRPC_PORT}"
        )

    return server


async def start_grpc_server(
    rule_engine: RuleEngine,
    conn_manager: ConnectionManager,
    on_new_alert: Optional[Callable] = None,
    redis_client=None,
) -> grpc.aio.Server:
    """
    Khởi động gRPC server và trả về instance để gọi graceful_stop khi shutdown.
    Gọi hàm này trong asyncio lifespan của FastAPI.
    """
    logger.info("================================================")
    logger.info(f"🚀 Khởi động gRPC Agent Server trên port :{GRPC_PORT}")
    logger.info("================================================")

    server = await create_grpc_server(
        rule_engine=rule_engine,
        conn_manager=conn_manager,
        on_new_alert=on_new_alert,
        redis_client=redis_client,
    )

    await server.start()
    logger.info(f"[gRPC SERVER] 🚀 gRPC Server đang chạy trên port :{GRPC_PORT}")
    return server
