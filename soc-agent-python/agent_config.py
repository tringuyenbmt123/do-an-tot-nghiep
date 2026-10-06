# ==============================================================================
# SOC/EDR Agent - Python Port
# File: agent_config.py
# Mô tả: Đọc cấu hình từ config.json hoặc Environment Variables,
#         tự động xác định Hostname, IP, OS và AgentID.
# ==============================================================================

import json
import os
import platform
import socket
import threading
import uuid


class AgentConfig:
    """Chứa toàn bộ cấu hình của Agent - thread-safe."""

    def __init__(self):
        self._lock = threading.RLock()

        # Server connection
        self.server_url: str = "localhost:50051"
        self.protocol: str = "grpc"
        self.agent_id: str = ""
        self.agent_secret_key: str = ""

        # Timing
        self.heartbeat_interval_seconds: int = 5
        self.metric_interval_seconds: int = 1
        self.max_backoff_seconds: int = 30

        # Buffer
        self.buffer_size: int = 1000

        # Log tailing
        self.log_paths: list = []

        # FIM
        self.fim_enabled: bool = True
        self.fim_paths: list = []

        # Optional modules
        self.metrics_enabled: bool = True
        self.log_tailer_enabled: bool = True
        self.process_monitor_enabled: bool = False
        self.process_poll_interval_seconds: int = 5
        self.process_exclude_names: list = []
        self.network_monitor_enabled: bool = False
        self.network_poll_interval_seconds: int = 10

        # mTLS
        self.mtls_enabled: bool = False
        self.ca_cert_path: str = ""
        self.client_cert_path: str = ""
        self.client_key_path: str = ""

        # Runtime metadata (auto-detect)
        self.hostname: str = ""
        self.ip_address: str = ""
        self.os_type: str = ""
        self.version: str = "v1.0.0-python"

    @property
    def heartbeat_interval(self) -> float:
        with self._lock:
            return float(self.heartbeat_interval_seconds)

    @property
    def metric_interval(self) -> float:
        with self._lock:
            return float(self.metric_interval_seconds)

    def update_intervals(self, hb_sec: int = 0, metric_sec: int = 0):
        """Cập nhật chu kỳ động khi nhận lệnh update_config từ Server."""
        with self._lock:
            if hb_sec > 0:
                self.heartbeat_interval_seconds = hb_sec
            if metric_sec > 0:
                self.metric_interval_seconds = metric_sec


def load_config(config_path: str = "config.json", cli_args=None) -> AgentConfig:
    """Tải cấu hình từ file JSON + override bằng Env Vars và CLI Arguments."""
    cfg = AgentConfig()

    # 1. Đọc file config.json
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
            _apply_dict(cfg, data)
        except Exception as e:
            print(f"[CONFIG] ⚠️ Lỗi đọc config file '{config_path}': {e}")

    # 2. Override bằng Environment Variables
    if v := os.getenv("SERVER_URL"):
        cfg.server_url = v
    if v := os.getenv("PROTOCOL"):
        cfg.protocol = v
    if v := os.getenv("AGENT_ID"):
        cfg.agent_id = v
    if v := os.getenv("AGENT_SECRET_KEY"):
        cfg.agent_secret_key = v
    if v := os.getenv("HEARTBEAT_INTERVAL"):
        try:
            cfg.heartbeat_interval_seconds = int(v)
        except ValueError:
            pass
    if v := os.getenv("METRIC_INTERVAL"):
        try:
            cfg.metric_interval_seconds = int(v)
        except ValueError:
            pass

    # 3. Override bằng CLI Arguments
    if cli_args:
        if getattr(cli_args, "server", None):
            cfg.server_url = cli_args.server
        if getattr(cli_args, "agent_id", None):
            cfg.agent_id = cli_args.agent_id
        if getattr(cli_args, "secret", None):
            cfg.agent_secret_key = cli_args.secret
        if getattr(cli_args, "protocol", None):
            cfg.protocol = cli_args.protocol

    # 4. Tự động xác định Hostname và Agent ID
    try:
        cfg.hostname = socket.gethostname()
    except Exception:
        cfg.hostname = "endpoint-" + str(uuid.uuid4())[:8]

    if not cfg.agent_id:
        cfg.agent_id = f"agent-{cfg.hostname}"

    # 5. Lấy IP outbound
    cfg.ip_address = _get_outbound_ip()

    # 6. Xác định OS
    cfg.os_type = platform.system().lower()  # 'windows', 'linux', 'darwin'

    return cfg


def _apply_dict(cfg: AgentConfig, data: dict):
    """Map dict JSON sang AgentConfig fields."""
    field_map = {
        "server_url": "server_url",
        "protocol": "protocol",
        "agent_id": "agent_id",
        "agent_secret_key": "agent_secret_key",
        "heartbeat_interval_seconds": "heartbeat_interval_seconds",
        "metric_interval_seconds": "metric_interval_seconds",
        "max_backoff_seconds": "max_backoff_seconds",
        "buffer_size": "buffer_size",
        "log_paths": "log_paths",
        "fim_enabled": "fim_enabled",
        "fim_paths": "fim_paths",
        "metrics_enabled": "metrics_enabled",
        "log_tailer_enabled": "log_tailer_enabled",
        "process_monitor_enabled": "process_monitor_enabled",
        "process_poll_interval_seconds": "process_poll_interval_seconds",
        "process_exclude_names": "process_exclude_names",
        "network_monitor_enabled": "network_monitor_enabled",
        "network_poll_interval_seconds": "network_poll_interval_seconds",
        "mtls_enabled": "mtls_enabled",
        "ca_cert_path": "ca_cert_path",
        "client_cert_path": "client_cert_path",
        "client_key_path": "client_key_path",
    }
    for json_key, attr in field_map.items():
        if json_key in data:
            setattr(cfg, attr, data[json_key])


def _get_outbound_ip() -> str:
    """Lấy địa chỉ IP LAN outbound thực tế của máy."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"
