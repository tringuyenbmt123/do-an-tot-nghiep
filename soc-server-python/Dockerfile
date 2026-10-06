# ==============================================================================
# Dockerfile — soc-server-python (FastAPI + gRPC)
# Multi-stage build: nhẹ, bảo mật, sẵn sàng production
# ==============================================================================

# ── Stage 1: Build dependencies ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Cài hệ thống packages cần thiết để biên dịch các thư viện C
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements và cài vào thư mục riêng để cache tốt hơn
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime image ──────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

LABEL org.opencontainers.image.title="SOC/EDR Backend Server"
LABEL org.opencontainers.image.description="FastAPI + gRPC backend for SOC Unified Security Platform"
LABEL org.opencontainers.image.source="https://github.com/tringuyenbmt123/do-an-tot-nghiep"

# Tạo user không có quyền root để chạy app
RUN groupadd --gid 1001 soc && \
    useradd --uid 1001 --gid soc --shell /bin/bash --create-home soc

WORKDIR /app

# Copy installed packages từ builder
COPY --from=builder /install /usr/local

# Copy mã nguồn
COPY --chown=soc:soc . .

# Tạo thư mục log
RUN mkdir -p /app/logs && chown soc:soc /app/logs

# Chuyển sang user không phải root
USER soc

# Expose ports
EXPOSE 8080
EXPOSE 50051

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/v1/ping')" || exit 1

# Entrypoint: chạy server
CMD ["python", "main.py"]
