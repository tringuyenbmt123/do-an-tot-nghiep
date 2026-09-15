#!/bin/bash
# ==============================================================================
# 🛡️ SOC/EDR Unified Security Platform — 1-Command Server Installer (All-in-One)
# Tương tự như Wazuh: Tự động cài đặt Docker, DB, Redis, Backend, Frontend
# Chạy lệnh: curl -sSL https://.../install-server.sh | sudo bash
# ==============================================================================

set -e

# Màu sắc terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

echo -e "${MAGENTA}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║        🛡️  SOC/EDR ALL-IN-ONE PLATFORM — 1-COMMAND INSTALLER     ║"
echo "║          (Tự động cài đặt DB, Redis, Backend & Web Dashboard)    ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Kiểm tra quyền root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ Lỗi: Bạn cần chạy script này với quyền root (sudo bash install-server.sh)${NC}"
   exit 1
fi

# 2. Tự động lấy IP máy chủ hiện tại
SERVER_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="localhost"
fi
echo -e "${CYAN}🌐 IP máy chủ hiện tại được phát hiện: ${YELLOW}$SERVER_IP${NC}"

# 3. Kiểm tra và tự động cài Docker nếu chưa có
echo -e "\n${CYAN}📦 [1/4] Kiểm tra môi trường Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Chưa tìm thấy Docker. Đang tự động cài đặt Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}✅ Docker đã được cài đặt thành công!${NC}"
else
    echo -e "${GREEN}✅ Docker đã sẵn sàng: $(docker --version)${NC}"
fi

# 4. Kiểm tra Docker Compose
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠️  Đang cài đặt docker-compose plugin...${NC}"
    apt-get update && apt-get install -y docker-compose-plugin || yum install -y docker-compose-plugin
fi

# 5. Khởi động toàn bộ cụm dịch vụ (MySQL + Redis + Server + Frontend)
echo -e "\n${CYAN}🚀 [2/4] Khởi động hệ thống SOC (Database, Cache, API, Dashboard)...${NC}"
docker compose down 2>/dev/null || true
docker compose up -d --build

echo -e "\n${CYAN}⏳ [3/4] Đang chờ Cơ sở dữ liệu và Dịch vụ khởi động hoàn tất...${NC}"
sleep 5

# 6. Hiển thị thông tin hoàn thành
echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║               🎉 CÀI ĐẶT MÁY CHỦ SOC THÀNH CÔNG!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "🖥️  ${YELLOW}Web Dashboard (Frontend):${NC}  http://${SERVER_IP} (User: admin / Pass: admin123)"
echo -e "🔌 ${YELLOW}REST API & WebSocket:   ${NC}  http://${SERVER_IP}:8080"
echo -e "🛡️  ${YELLOW}gRPC Server (Agent):    ${NC}  ${SERVER_IP}:50051"
echo -e "🗄️  ${YELLOW}MySQL Database:         ${NC}  ${SERVER_IP}:3306 (User: root / Pass: 1 / DB: soc_edr_db)"
echo -e "⚡ ${YELLOW}Redis Cache:            ${NC}  ${SERVER_IP}:6379"
echo ""
echo -e "${CYAN}------------------------------------------------------------------${NC}"
echo -e "📌 ${MAGENTA}HƯỚNG DẪN CÀI ĐẶT AGENT TRÊN MÁY NHÂN VIÊN / CLIENT:${NC}"
echo -e "  👉 ${YELLOW}Máy Windows:${NC} Tải gói agent và chạy file INSTALL.bat (Run as Admin)"
echo -e "  👉 ${YELLOW}Máy Linux:${NC}   Chạy: sudo bash install-agent.sh"
echo -e "${CYAN}------------------------------------------------------------------${NC}"
echo ""
