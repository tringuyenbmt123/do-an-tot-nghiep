# ==============================================================================
# app/main.py - SOC Server FastAPI Entrypoint
# Tương đương: cmd/server/main.go & internal/api/router.go
# ==============================================================================

import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, func

from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.models.user import User
from app.models.rule import Rule
from app.models.indicator import Indicator
from app.services.auth_service import AuthService
from app.services.rule_service import default_rules
from app.services.indicator_service import default_indicators
from app.rules.engine import global_rule_engine
from app.websocket.hub import ws_hub

# Import gRPC server components
from app.grpc_server.server import start_grpc_server
from app.grpc_server.connection_manager import global_conn_manager

# Import routers
from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.alerts import router as alerts_router
from app.routers.cases import router as cases_router
from app.routers.agents import router as agents_router
from app.routers.indicators import router as indicators_router
from app.routers.rules import router as rules_router
from app.routers.audit_logs import router as audit_logs_router
from app.routers.settings import router as settings_router
from app.routers.soar import router as soar_router

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


async def seed_initial_data():
    """Tự động seed admin, rules và indicators mặc định nếu database trống"""
    async with AsyncSessionLocal() as session:
        # 1. Admin user
        res = await session.execute(select(func.count(User.id)).where(User.username == "admin"))
        if (res.scalar() or 0) == 0:
            auth_service = AuthService(session)
            await auth_service.create_user(
                username="admin",
                password="admin123",
                email="admin@soc.local",
                role="admin",
            )
            logger.info("[SEED] ✅ Đã tạo tài khoản Admin mặc định (user: admin / pass: admin123)")

        # 2. Default Rules
        res = await session.execute(select(func.count(Rule.id)))
        if (res.scalar() or 0) == 0:
            for r_data in default_rules():
                r = Rule(**r_data)
                session.add(r)
            await session.commit()
            logger.info(f"[SEED] ✅ Đã nạp {len(default_rules())} Detection Rules mặc định")

        # 3. Default Indicators
        res = await session.execute(select(func.count(Indicator.id)))
        if (res.scalar() or 0) == 0:
            for ind_data in default_indicators():
                ind = Indicator(**ind_data)
                session.add(ind)
            await session.commit()
            logger.info(f"[SEED] ✅ Đã nạp {len(default_indicators())} Indicators mặc định")

        # 4. Load rules into in-memory engine
        await global_rule_engine.load_all_rules(session)


async def alert_cleanup_loop():
    """Background task dọn dẹp alerts cũ mỗi 24h"""
    retention_days = settings.alert_retention_days
    while True:
        try:
            async with AsyncSessionLocal() as session:
                from app.services.alert_service import AlertService
                alert_service = AlertService(session)
                await alert_service.run_cleanup(retention_days)
        except Exception as e:
            logger.error(f"[CLEANUP JOB] ❌ Lỗi dọn dẹp alert: {e}")
        await asyncio.sleep(24 * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("==================================================")
    logger.info("🛡️  Khởi động SOC Server Python (FastAPI) 🛡️")
    logger.info("==================================================")

    # 1. Khởi tạo DB & AutoMigrate
    await init_db()

    # 2. Seed dữ liệu ban đầu & nạp rules
    await seed_initial_data()

    # 3. Định nghĩa callback khi có Alert mới từ gRPC
    async def on_new_alert(alert_data: dict):
        """Broadcast Alert mới qua WebSocket và dispatch SOAR nếu cần"""
        try:
            # Broadcast tới tất cả Frontend WebSocket clients
            await ws_hub.broadcast_alert(alert_data)

            # Dispatch sang n8n SOAR nếu đủ điều kiện
            if settings.soar_enabled:
                from app.services.soar_service import SOARService
                from app.models.alert import Alert
                # Tạo Alert object tạm để check điều kiện
                tmp_alert = Alert()
                tmp_alert.event_type = alert_data.get("event_type", "")
                tmp_alert.severity   = alert_data.get("severity", "")
                tmp_alert.id         = alert_data.get("id", "")
                async with AsyncSessionLocal() as db:
                    soar = SOARService(db)
                    if soar.should_dispatch_to_n8n(tmp_alert):
                        soar.dispatch_to_n8n(tmp_alert)
        except Exception as e:
            logger.error(f"[ALERT CALLBACK] ❌ Lỗi xử lý alert mới: {e}")

    # 4. Khởi động gRPC Agent Server trên port 50051 (giữ nguyên port Go)
    grpc_server = await start_grpc_server(
        rule_engine=global_rule_engine,
        conn_manager=global_conn_manager,
        on_new_alert=on_new_alert,
        redis_client=None,  # Có thể truyền redis client nếu cần
    )

    # 5. Chạy background cleanup job
    cleanup_task = asyncio.create_task(alert_cleanup_loop())

    yield

    # Graceful shutdown
    cleanup_task.cancel()
    logger.info("[gRPC SERVER] 🛑 Đang graceful shutdown gRPC Server...")
    await grpc_server.stop(grace=5)
    logger.info("🛑 SOC Server Python đã dừng.")


# Tạo FastAPI Application
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request Logging Middleware (tương tự Gin RequestLogger)
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000

    path = request.url.path
    method = request.method
    status_code = response.status_code

    # Bỏ qua log đối với các GET request polling thường xuyên nếu thành công
    is_polling_get = method == "GET" and status_code < 400 and (
        path.startswith("/api/v1/alerts") or
        path.startswith("/api/v1/dashboard") or
        path.startswith("/api/v1/agents") or
        path.startswith("/api/v1/cases") or
        path.startswith("/api/v1/indicators") or
        path.startswith("/api/v1/rules") or
        path.startswith("/api/v1/audit-logs") or
        path == "/api/v1/ping"
    )

    if path != "/ws/alerts" and not is_polling_get:
        logger.info(f"[REST API] {status_code} | {duration_ms:8.2f}ms | {request.client.host if request.client else 'unknown'} | {method:<7} {path}")

    return response


# Ping / Health check endpoint
@app.get("/health")
@app.get("/api/v1/health")
@app.get("/api/v1/ping")
async def ping():
    return {"status": "ok", "service": "soc-server-python", "message": "SOC Server is running"}


# WebSocket Endpoint cho Frontend: ws://localhost:8080/ws/alerts
@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    await ws_hub.connect(websocket)
    try:
        while True:
            # Nhận message từ client nếu có (chủ yếu ping/pong hoặc filter)
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_hub.disconnect(websocket)
    except Exception:
        await ws_hub.disconnect(websocket)


# Đăng ký các Routers
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(alerts_router)
app.include_router(cases_router)
app.include_router(agents_router)
app.include_router(indicators_router)
app.include_router(rules_router)
app.include_router(audit_logs_router)
app.include_router(settings_router)
app.include_router(soar_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.server_host, port=settings.server_port, reload=False)
