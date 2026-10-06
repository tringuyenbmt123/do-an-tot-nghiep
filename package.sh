#!/bin/bash
# ==============================================================================
# SOC/EDR Unified Security Platform — Đóng gói Release
# Tạo các file .zip phân phối cho Server và Agent (Linux/Windows)
# ==============================================================================

set -e

VERSION="v1.0.0"
DIST_DIR="dist"
mkdir -p "$DIST_DIR"
rm -rf "$DIST_DIR"/*

echo "========================================================================"
echo " Đang đóng gói SOC/EDR Platform Release $VERSION"
echo "========================================================================"

# --- 1. ĐÓNG GÓI SERVER (Chung cho Docker) ---
echo "[1/3] Đóng gói SOC Server & Frontend..."
SERVER_ZIP="$DIST_DIR/soc-server-$VERSION.zip"
zip -r "$SERVER_ZIP" \
    soc-server-python \
    soc-frontend \
    docker-compose.yml \
    install-server.sh \
    install-server.bat \
    install-server.ps1 \
    .env.example \
    README.md \
    -x "*/venv/*" "*/__pycache__/*" "*/node_modules/*" "*/dist/*" "*/.git/*"

# --- 2. ĐÓNG GÓI AGENT (Windows) ---
echo "[2/3] Đóng gói SOC Agent (Windows)..."
AGENT_WIN_ZIP="$DIST_DIR/soc-agent-windows-$VERSION.zip"
cd soc-agent-python
zip -r "../$AGENT_WIN_ZIP" . -x "venv/*" "__pycache__/*" "install-agent.sh" "*.tar.gz" "*.zip"
cd ..

# --- 3. ĐÓNG GÓI AGENT (Linux) ---
echo "[3/3] Đóng gói SOC Agent (Linux)..."
AGENT_LINUX_TAR="$DIST_DIR/soc-agent-linux-$VERSION.tar.gz"
cd soc-agent-python
tar --exclude="venv" --exclude="__pycache__" --exclude="install-agent.bat" --exclude="install-agent.ps1" -czvf "../$AGENT_LINUX_TAR" .
cd ..

echo "========================================================================"
echo " HOÀN TẤT ĐÓNG GÓI!"
echo " Các file được lưu tại thư mục $DIST_DIR:"
ls -lh "$DIST_DIR"
echo "========================================================================"
