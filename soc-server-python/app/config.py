# ==============================================================================
# app/config.py - Cấu hình server (tương đương internal/config/*.go)
# ==============================================================================

from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Tên ứng dụng
    APP_NAME: str = "SOC Backend Server"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8080

    # Database MySQL
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = "1"
    DB_NAME: str = "soc_edr_db"

    # JWT
    JWT_SECRET_KEY: str = "super-secret-soc-key-2026"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0

    # SOAR
    SOAR_ENABLED: bool = True
    N8N_WEBHOOK_URL: str = ""
    N8N_WEBHOOK_URL_DDOS: str = ""
    N8N_WEBHOOK_URL_PHISHING: str = ""
    N8N_WEBHOOK_URL_WAZUH: str = ""
    SOAR_WEBHOOK_TIMEOUT: int = 10
    SOAR_MAX_RETRIES: int = 3
    SOAR_CALLBACK_SECRET: str = ""

    # Alert
    ALERT_RETENTION_DAYS: int = 7

    # Backward-compatible property getters
    @property
    def app_name(self) -> str:
        return self.APP_NAME

    @property
    def server_host(self) -> str:
        return self.HOST

    @property
    def server_port(self) -> int:
        return self.PORT

    @property
    def jwt_secret(self) -> str:
        return self.JWT_SECRET_KEY

    @property
    def jwt_algorithm(self) -> str:
        return self.JWT_ALGORITHM

    @property
    def jwt_expire_hours(self) -> int:
        return self.JWT_EXPIRE_HOURS

    @property
    def soar_enabled(self) -> bool:
        return self.SOAR_ENABLED

    @property
    def n8n_webhook_url(self) -> str:
        return self.N8N_WEBHOOK_URL

    @property
    def n8n_webhook_url_ddos(self) -> str:
        return self.N8N_WEBHOOK_URL_DDOS

    @property
    def n8n_webhook_url_phishing(self) -> str:
        return self.N8N_WEBHOOK_URL_PHISHING

    @property
    def n8n_webhook_url_wazuh(self) -> str:
        return self.N8N_WEBHOOK_URL_WAZUH

    @property
    def soar_webhook_timeout_secs(self) -> int:
        return self.SOAR_WEBHOOK_TIMEOUT

    @property
    def soar_max_retries(self) -> int:
        return self.SOAR_MAX_RETRIES

    @property
    def soar_callback_secret(self) -> str:
        return self.SOAR_CALLBACK_SECRET

    @property
    def alert_retention_days(self) -> int:
        return self.ALERT_RETENTION_DAYS

    @property
    def database_url(self) -> str:
        return (
            f"mysql+aiomysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            f"?charset=utf8mb4"
        )

    @property
    def database_url_sync(self) -> str:
        """Sync URL dùng cho PyMySQL"""
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            f"?charset=utf8mb4"
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Singleton instance
settings = Settings()
