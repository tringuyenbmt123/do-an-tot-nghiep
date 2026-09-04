# 🛡️ SOC/EDR Endpoint Detection & Response Agent (Golang)

High-Performance, Ultra-Lightweight EDR Agent for SOC Security Monitoring.

---

## 🚀 Đặc điểm kỹ thuật
- **Kiến trúc cực nhẹ**: CPU < 1%, RAM < 20MB.
- **Giao tiếp 2 chiều (Bidirectional)**: Sử dụng gRPC `StreamEvents` + `Heartbeat` RPC tương thích 100% với `soc-server`.
- **Auto-Reconnect & Backpressure**: Thuật toán Exponential Backoff và In-Memory Ring Buffer ưu tiên log Critical khi nghẽn mạng.
- **Metric Real-time**: Thu thập CPU, RAM, Network I/O, Active Connections bằng `gopsutil`.
- **Event-Driven Log Tailer**: Đọc log không trễ bằng `fsnotify`.
- **Active Response**: Nhận lệnh từ Server để diệt Process (`kill_process`), chặn IP (`block_ip`), trích xuất Forensic (`collect_now`), hoặc thay đổi cấu hình (`update_config`).

---

## ⚙️ Cấu hình (`config.json`)

```json
{
  "server_url": "localhost:50051",
  "protocol": "grpc",
  "agent_id": "endpoint-win11-01",
  "agent_secret_key": "soc-agent-secret-token-2026",
  "heartbeat_interval_seconds": 5,
  "metric_interval_seconds": 1,
  "max_backoff_seconds": 30,
  "buffer_size": 1000,
  "log_paths": []
}
```

Có thể ghi đè (override) bằng các biến môi trường:
- `SERVER_URL`
- `AGENT_ID`
- `AGENT_SECRET_KEY`
- `HEARTBEAT_INTERVAL`
- `METRIC_INTERVAL`

---

## 🛠️ Hướng dẫn Build Executable

### 1. Build cho Windows (`soc-agent.exe`)
```powershell
# Chạy trên Windows PowerShell
cd "d:\DO AN TOT NGHIEP\soc-agent"
go mod tidy
$env:GOOS="windows"; $env:GOARCH="amd64"; go build -ldflags="-s -w" -o bin/soc-agent.exe main.go
```

### 2. Build cho Linux (`soc-agent-linux`)
```powershell
# Cross-compile sang Linux ELF từ Windows
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -ldflags="-s -w" -o bin/soc-agent-linux main.go
```

### 3. Chạy thử nghiệm trực tiếp
```powershell
go run main.go -config config.json
```
