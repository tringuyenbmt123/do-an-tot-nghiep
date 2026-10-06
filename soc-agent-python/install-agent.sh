#!/bin/bash
# ==============================================================================
# SOC/EDR Agent - Linux Installer
# ==============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "========================================================================"
echo "           SOC/EDR PYTHON AGENT INSTALLER (LINUX)"
echo "========================================================================"
echo -e "${NC}"

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Lỗi: Script này cần chạy bằng quyền root (sudo bash install-agent.sh)${NC}"
   exit 1
fi

# Nhập thông tin cấu hình
read -p "Nhập địa chỉ gRPC Server (vd: 192.168.1.100:50051): " SERVER_URL
if [ -z "$SERVER_URL" ]; then
    SERVER_URL="localhost:50051"
fi

read -p "Nhập Agent ID (để trống sẽ tự sinh từ Hostname): " AGENT_ID
read -p "Nhập Secret Key (mặc định: soc-agent-secret-token-2026): " SECRET_KEY
if [ -z "$SECRET_KEY" ]; then
    SECRET_KEY="soc-agent-secret-token-2026"
fi

echo -e "\n${YELLOW}[1/4] Kiểm tra Python 3 và pip...${NC}"
if ! command -v python3 &> /dev/null; then
    echo "Đang cài đặt Python3..."
    apt-get update && apt-get install -y python3 python3-pip python3-venv || yum install -y python3 python3-pip
fi

DIR="/opt/soc-agent"
echo -e "${YELLOW}[2/4] Sao chép Agent tới ${DIR}...${NC}"
mkdir -p $DIR
cp -r ./* $DIR/
cd $DIR

echo -e "${YELLOW}[3/4] Cài đặt dependencies...${NC}"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo -e "${YELLOW}[4/4] Tạo cấu hình config.json...${NC}"
cat > config.json <<EOF
{
  "server_url": "$SERVER_URL",
  "agent_id": "$AGENT_ID",
  "agent_secret_key": "$SECRET_KEY",
  "heartbeat_interval_seconds": 5,
  "metric_interval_seconds": 1,
  "fim_enabled": true
}
EOF

echo -e "${YELLOW}[5/4] Đăng ký Systemd Service...${NC}"
cat > /etc/systemd/system/soc-agent.service <<EOF
[Unit]
Description=SOC/EDR Python Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$DIR
ExecStart=$DIR/venv/bin/python main.py
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=soc-agent

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable soc-agent
systemctl start soc-agent

echo -e "${GREEN}========================================================================"
echo "    CÀI ĐẶT THÀNH CÔNG! Agent đang chạy ngầm bằng systemd."
echo "    Để xem log, chạy: sudo journalctl -u soc-agent -f"
echo "    Để dừng, chạy:    sudo systemctl stop soc-agent"
echo "========================================================================${NC}"
