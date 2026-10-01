# SOC/EDR Endpoint Agent - Python Port

## Cấu trúc thư mục

```
soc-agent-python/
├── main.py                 # Entry point chính
├── agent_config.py         # Load & quản lý cấu hình (config.json + env vars)
├── buffer.py               # In-memory buffer với Backpressure
├── grpc_stubs.py           # Helper import pb2 stubs + factory EventRequest
├── grpc_streamer.py        # gRPC Bidirectional Streaming + Heartbeat + Auto-Reconnect
├── metric_collector.py     # Thu thập CPU/RAM/Network (psutil)
├── command_executor.py     # Thực thi lệnh từ Server (kill, block, forensic...)
├── log_tailer.py           # Real-time log tailer (watchdog)
├── fim_watcher.py          # File Integrity Monitoring (watchdog)
├── process_monitor.py      # Phát hiện process mới (psutil)
├── network_monitor.py      # Phát hiện kết nối mạng mới (psutil)
├── config.json             # File cấu hình mặc định
└── requirements.txt        # Dependencies
```

## Yêu cầu

- Python 3.10+
- soc-server-python phải đang chạy (dùng chung proto/pb2 stubs)

## Cài đặt Dependencies

```powershell
pip install -r requirements.txt
```

## Chạy Agent

```powershell
# Từ thư mục soc-agent-python
python main.py

# Chỉ định file config khác
python main.py -config path/to/config.json
```

## Cấu hình (config.json)

| Key | Mặc định | Mô tả |
|-----|---------|-------|
| `server_url` | `localhost:50051` | Địa chỉ gRPC server |
| `agent_id` | `agent-<hostname>` | ID duy nhất của agent |
| `agent_secret_key` | - | Bearer token xác thực |
| `heartbeat_interval_seconds` | `5` | Chu kỳ heartbeat |
| `metric_interval_seconds` | `1` | Chu kỳ thu thập metric |
| `buffer_size` | `1000` | Kích thước queue buffer |
| `log_paths` | `[]` | Danh sách file log cần theo dõi |
| `fim_enabled` | `true` | Bật File Integrity Monitoring |
| `fim_paths` | `[]` | Các thư mục FIM |
| `metrics_enabled` | `true` | Bật metric collector |
| `log_tailer_enabled` | `true` | Bật log tailer |
| `process_monitor_enabled` | `false` | Bật process monitor |
| `network_monitor_enabled` | `false` | Bật network monitor |

## So sánh với Go Agent

| Tính năng | Go Agent | Python Agent |
|-----------|----------|-------------|
| gRPC Streaming | ✅ grpc-go | ✅ grpcio |
| Heartbeat | ✅ | ✅ |
| Metric Collector | ✅ gopsutil | ✅ psutil |
| Log Tailer | ✅ fsnotify | ✅ watchdog |
| FIM | ✅ fsnotify | ✅ watchdog |
| Process Monitor | ✅ gopsutil | ✅ psutil |
| Network Monitor | ✅ gopsutil | ✅ psutil |
| Command Executor | ✅ | ✅ |
| Auto-Reconnect | ✅ Exponential Backoff | ✅ Exponential Backoff |
| Backpressure Buffer | ✅ | ✅ |
| Windows Service | ✅ | ❌ (chạy console/script) |
