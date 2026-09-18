# SOC Backend Server (Python / FastAPI)

Phiên bản Python của **SOC/EDR All-in-One Backend Server**, được chuyển đổi hoàn toàn từ phiên bản Go (`soc-server`) và tương thích 100% với giao diện Frontend React/Vite cũng như luồng SOAR (n8n).

---

## 🚀 Tính năng

- **FastAPI**: REST API hiệu năng cao với tự động sinh tài liệu Swagger UI tại `/docs`.
- **SQLAlchemy 2.0 (Async)**: Kết nối MySQL bất đồng bộ với `aiomysql`.
- **Detection Rule Engine**: Bộ máy phát hiện mối đe dọa trong bộ nhớ, hỗ trợ hot-reload khi thêm/sửa rule.
- **WebSocket Hub**: Quản lý kết nối real-time và broadcast alerts/cases tức thì cho Frontend qua `/ws/alerts`.
- **SOAR Orchestration**: Dispatch webhook tới n8n và xử lý callback nhận về (AI analysis, Telegram HITL, Active Response).
- **Incident Response (Cases)**: Quản lý vụ việc, điều tra, phân công và ghi chú markdown.
- **Threat Intelligence (IOCs)**: Quản lý Blacklist, IOC search tương thích MISP node.
- **Audit Logging**: Ghi vết mọi hành động trong hệ thống.

---

## 📋 Yêu cầu hệ thống

- **Python**: 3.10 trở lên
- **MySQL**: 8.0 trở lên
- (Tùy chọn) **Redis**: Quản lý trạng thái heartbeat Agent

---

## ⚙️ Cài đặt & Khởi chạy

### 1. Tạo môi trường ảo & cài thư viện
```powershell
cd "d:\DO AN TOT NGHIEP\soc-server-python"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Cấu hình file `.env`
Sao chép `.env.example` thành `.env` (đã được tạo sẵn):
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=soc_db

SERVER_HOST=0.0.0.0
SERVER_PORT=8080

JWT_SECRET=super-secret-soc-key-2026
```

### 3. (Tùy chọn) Nạp dữ liệu mẫu
```powershell
python seeder.py
```

### 4. Khởi chạy Server
```powershell
python main.py
# hoặc
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

Server sẽ lắng nghe tại `http://localhost:8080`.  
Xem tài liệu API trực quan tại: `http://localhost:8080/docs`

---

## 🌐 Các Endpoint API chính

| Nhóm | Method | Path | Mô tả |
|---|---|---|---|
| **Health** | `GET` | `/api/v1/ping` | Kiểm tra server hoạt động |
| **WebSocket** | `WS` | `/ws/alerts` | Kênh real-time cho Frontend |
| **Auth** | `POST` | `/api/v1/auth/login` | Đăng nhập lấy JWT Bearer Token |
| **Dashboard** | `GET` | `/api/v1/dashboard/stats` | Thống kê tổng quan cho Dashboard |
| **Alerts** | `GET` | `/api/v1/alerts` | Danh sách cảnh báo (phân trang, lọc) |
| | `POST` | `/api/v1/alerts` | Nhận cảnh báo mới |
| | `PATCH` | `/api/v1/alerts/{id}/status` | Cập nhật trạng thái cảnh báo |
| | `POST` | `/api/v1/alerts/{id}/escalate` | Nâng cấp cảnh báo thành Case |
| | `POST` | `/api/v1/alerts/{id}/soar` | Bắn cảnh báo sang pipeline n8n SOAR |
| **Cases** | `GET` | `/api/v1/cases` | Danh sách vụ việc điều tra |
| | `POST` | `/api/v1/cases` | Tạo vụ việc mới |
| | `PATCH` | `/api/v1/cases/{id}/assign` | Phân công analyst |
| | `POST` | `/api/v1/cases/{id}/notes` | Thêm ghi chú điều tra |
| | `PATCH` | `/api/v1/cases/{id}/status` | Đổi trạng thái vụ việc |
| **Agents** | `GET` | `/api/v1/agents` | Danh sách máy trạm (Endpoint) |
| | `POST` | `/api/v1/agents/{id}/response/kill-process` | Lệnh diệt tiến trình độc hại |
| | `POST` | `/api/v1/agents/{id}/response/block-ip` | Lệnh chặn IP mạng |
| **IOCs** | `GET` | `/api/v1/indicators` | Danh sách IOCs / Blacklist |
| | `POST` | `/api/v1/indicators/restSearch` | Tra cứu tương thích MISP n8n |
| | `POST` | `/api/v1/indicators/analyze` | Phân tích IOC (VirusTotal/Cortex) |
| **Rules** | `GET` | `/api/v1/rules` | Danh sách Detection Rules |
| | `POST` | `/api/v1/rules` | Tạo rule mới & hot-reload |
| | `PATCH` | `/api/v1/rules/{id}/toggle` | Bật/tắt rule |
| **SOAR** | `POST` | `/api/v1/soar/callback` | Nhận callback xử lý từ n8n |
| **Settings** | `GET` | `/api/v1/settings` | Lấy cấu hình hệ thống |
| | `PUT` | `/api/v1/settings` | Lưu cấu hình hệ thống |
