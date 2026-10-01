# SOC Console – Bộ template HTML (theme trắng)

Bộ giao diện Trung tâm giám sát an ninh (SOC/EDR) gồm 15 trang HTML thuần (kèm 1 bản theme tối cũ để tham khảo) (HTML + CSS + JavaScript, không thư viện ngoài). Dữ liệu hiện là **dữ liệu mẫu nằm trong mảng JavaScript ở đầu mỗi file**. Tài liệu này giúp bạn (1) hiểu cấu trúc, (2) dùng AI để sửa/tạo giao diện cùng phong cách, (3) nối vào **MySQL đã có** và hoàn thiện logic.

---

## 1. Danh sách file và bản đồ trang

Đặt **tất cả file trong cùng một thư mục** để các liên kết menu hoạt động. Trang chủ là `soc-dashboard-light.html` (có thể đổi tên thành `index.html`, khi đó sửa liên kết trong menu và trong `soc-login.html`).

| File | Menu | Chức năng chính | Biến dữ liệu mẫu (đầu `<script>`) |
|---|---|---|---|
| `soc-login.html` | (đăng nhập) | Form đăng nhập, 2FA, hiện/ẩn mật khẩu | — |
| `soc-dashboard-light.html` | Tổng quan | KPI, biểu đồ cảnh báo, phân bổ mức độ, top nguồn tấn công, MITRE, sự cố, live log | `alerts`, `geo`, `types`, `assetsData`, `mitre`, `incidents`, `intel`, `logMsgs` |
| `soc-alerts.html` | Cảnh báo | Hàng đợi cảnh báo, lọc, chọn nhiều, nhận xử lý/đóng/false positive | `alerts`, `TPL` |
| `soc-cases.html` | Sự cố | Quản lý case, SLA, ghi chú điều tra, đổi trạng thái/người phụ trách | `cases`, `OWN` |
| `soc-siem.html` | Nhật ký (SIEM) | Tìm log theo `trường:giá_trị`, biểu đồ theo thời gian, xuất CSV | `events`, `SAVED` |
| `soc-threat-intel.html` | Threat Intelligence | IOC/blacklist, Cortex Analyzer (làm giàu IOC), Custom Rules | `iocs`, `crules` |
| `soc-detection-rules.html` | Detection Rules | CRUD luật phát hiện, bật/tắt, xem YAML | `rules` |
| `soc-mitre.html` | MITRE ATT&CK | Ma trận độ phủ phát hiện, khoảng trống | `RAW` → `TAC` |
| `soc-vulns.html` | Lỗ hổng | CVE, CVSS, hạn xử lý, trạng thái vá | `vulns` |
| `soc-assets.html` | Tài sản & Endpoint | Kiểm kê tài sản, điểm rủi ro | `assets` |
| `soc-agents.html` | Agents & EDR | Trạng thái agent, Kill PID, Block IP | `agents`, `cmds` |
| `soc-firewall.html` | Firewall / IDS | Rule firewall, cảnh báo IDS, IP blocklist | `rules`, `ids`, `bl` |
| `soc-playbooks.html` | Playbook | Playbook SOAR, thêm/xóa bước, chạy thử | `pbs`, `runs` |
| `soc-reports.html` | Báo cáo | Tạo/tải báo cáo CSV/JSON, lịch gửi | `DATA`, `hist`, `sch` |
| `soc-audit-settings.html` | Quản trị → Audit & Settings / Cài đặt | Audit log, cấu hình SOAR/n8n, Auto-Response | `logs`, `saved`/`cfg` |
| `soc-dashboard.html` | (bản cũ) | Bản theme tối đời đầu, **không còn trong menu**, chỉ để tham khảo | — |

Chạy thử: mở `soc-login.html` bằng trình duyệt (bấm Đăng nhập với bất kỳ thông tin nào, bản mẫu chưa kiểm tra thật). Khi bắt đầu nối API, hãy chạy qua một web server (ví dụ `npx serve .`) thay vì mở trực tiếp bằng `file://`.

---

## 2. Hệ thống thiết kế (để AI sao chép đúng phong cách)

**Bố cục chung** mỗi trang: `body` là lưới 2 cột (sidebar 250px + nội dung) × 2 hàng (topbar 56px + `<main>`). Khối `<!-- SIDEBAR -->` … `</header>` là **giống hệt nhau ở mọi trang**, chỉ khác mục có `class="on"`.

**Biến màu** (khối `:root`, chỉnh ở đây để đổi theme):

| Biến | Giá trị | Dùng cho |
|---|---|---|
| `--bg` / `--panel` / `--panel2` / `--line` | `#f2f5f9` / `#fff` / `#eef2f7` / `#dce4ed` | nền trang / thẻ / nền phụ / viền |
| `--text` / `--muted` | `#1b2a3b` / `#5f7288` | chữ chính / chữ phụ |
| `--accent` | `#0a7f9c` | màu nhấn, nút chính, liên kết |
| `--crit` `--high` `--med` `--low` | `#d92d3f` `#e8770e` `#e0b000` `#2a7de1` | mức độ Nghiêm trọng / Cao / Trung bình / Thấp |
| `--ok` | `#1f9d5c` | thành công, online |

**Chữ:** font `IBM Plex Sans` → `Segoe UI` → sans-serif; cỡ nền **16px**, dòng 1.55. Bảng và chip 14–16px, chú thích 13–14px, tiêu đề trang ~23px. Muốn đổi cỡ toàn bộ, nhân mọi giá trị `font-size:…px` với một hệ số (kể cả trong style nội tuyến) và chỉnh `font:16px/1.55` của `body`.

**Thành phần dùng lại** (không tự đặt tên class mới nếu đã có):

- Trang: `.ph` (tiêu đề trang: `.ic` icon, `h1`, `p`, `.act` nút), `.grid.kpis` + `.card.kpi` (`.k-crit .k-high .k-ok .k-info` = viền màu), `.card` (+ `h2` có `<span>` phụ đề bên phải).
- Bộ lọc: `.bar2` (hàng công cụ), `.q` (ô tìm), `select`, `.tools` + `.chip(.on)`, `.tabs` + `.tab(.on)`.
- Bảng: bọc `<div class="tw"><table>`; `.sev.s-crit|s-high|s-med|s-low` (nhãn mức độ), `.stt(.a .b .c .d)` (nhãn trạng thái), `.mono`, `.tag`, `.lnk(.d)` (nút nhỏ trong bảng), `tr.cl` (hàng bấm được).
- Nút/khác: `.b1` (chính), `.b2` (phụ), `.b1.danger`, `.sw` (công tắc, `role="switch"` + `aria-checked`), `.ico`, `.empty` (trạng thái trống), `.bar3` (thanh tiến độ), `.toast`, `.hide`.
- Hộp thoại: `<dialog>` gồm `.dh` (đầu), `.db` (thân), `.df` (chân), nút đóng dùng thuộc tính `data-close`.
- Menu thu gọn: `.grp` > `button.grp-btn[aria-expanded][aria-controls]` + `.sub#id > div > a`.

**Quy ước mã của mọi trang** (AI phải giữ nguyên):

1. Toàn bộ trang là **1 file HTML tự chứa** (CSS trong `<style>`, JS trong `<script>`), không dùng `localStorage`.
2. Đầu `<script>` có hàm dùng chung: `$`, `esc` (escape HTML), `fmt`, `ago`, `toast`, `download`, xử lý `data-close`, menu thu gọn, đồng hồ.
3. Dữ liệu nằm ở mảng/đối tượng đầu script → hàm `render()` (hoặc `renderXxx()`) dựng bảng/thẻ bằng template literal → sự kiện dùng **event delegation** (`data-*`).
4. Mọi chuỗi từ dữ liệu phải qua `esc()` trước khi chèn HTML.
5. Có đủ trạng thái: **trống** (`.empty`), lỗi/kiểm tra hợp lệ (thông báo tiếng Việt cụ thể), và xác nhận trước thao tác không hoàn tác (`confirm`).
6. Nhãn giao diện bằng **tiếng Việt**, giữ nguyên thuật ngữ kỹ thuật (IOC, CVE, MITRE, Kill PID…). Dùng `aria-label` cho nút chỉ có icon.
7. Mục `class="on"` trong menu phải trỏ đúng trang hiện tại.

**Thêm trang mới (checklist):** copy một trang gần giống nhất → đổi `<title>`, tiêu đề `.ph`, nội dung `<main>`, phần JS riêng → thêm liên kết vào menu ở **tất cả** các file → đặt `class="on"` đúng chỗ.

---

## 3. PROMPT A – Sửa hoặc tạo giao diện theo template

Dán nguyên khối dưới đây vào AI (đính kèm 1–2 file mẫu gần nhất, ví dụ `soc-cases.html` và `soc-alerts.html`), rồi thêm yêu cầu cụ thể ở cuối.

```text
Bạn là frontend engineer. Tôi đính kèm các file HTML mẫu của "SOC Console" (theme trắng).
Hãy tạo/sửa giao diện theo ĐÚNG phong cách và quy ước của các file mẫu.

BẮT BUỘC GIỮ NGUYÊN:
- Mỗi trang là 1 file HTML tự chứa (CSS trong <style>, JS trong <script>), không thêm thư viện/CDN, không dùng localStorage.
- Bố cục: sidebar 250px + topbar 56px + <main>. Sao chép nguyên khối SIDEBAR/topbar từ file mẫu, chỉ đổi mục class="on".
- Biến màu :root, font 16px, các class có sẵn (.ph, .card, .kpi, .bar2, .chip, .tabs, .tw table, .sev, .stt, .lnk, .b1, .b2, .sw, .empty, dialog .dh/.db/.df, .toast). Không tự tạo class mới nếu đã có class tương đương.
- Cấu trúc JS: dữ liệu mẫu ở đầu script -> hàm render() dựng HTML bằng template literal -> event delegation bằng data-*. Mọi chuỗi từ dữ liệu phải qua esc().
- Nhãn giao diện bằng tiếng Việt; có trạng thái trống, kiểm tra hợp lệ với thông báo cụ thể, confirm trước khi xóa.
- Khả năng truy cập: aria-label cho nút icon, role="switch"+aria-checked cho công tắc, focus nhìn thấy được.
- Mọi liên kết menu giữa các trang phải hoạt động (các file cùng thư mục).

YÊU CẦU CỤ THỂ CỦA TÔI:
<<< mô tả trang/khối cần làm hoặc chỉnh sửa >>>

ĐẦU RA:
1. File HTML hoàn chỉnh (không cắt bớt, không viết "phần còn lại giữ nguyên").
2. Nếu thêm trang mới: liệt kê các file cần thêm liên kết menu và đưa đoạn sửa cụ thể.
3. Chạy kiểm tra cú pháp JavaScript và nói rõ những gì đã/chưa kiểm tra.
```

---

## 4. PROMPT B – Nối MySQL đã có, thêm logic và hoàn thiện

Dán khối dưới đây vào AI có quyền đọc mã/DB của bạn (Claude Code, Cursor…). Điền phần `<<< >>>` trước khi gửi. **Đừng dán mật khẩu DB vào chat**, hãy đặt trong file `.env`.

```text
Bạn là senior full-stack engineer. Tôi có bộ giao diện "SOC Console" (15 file HTML đang dùng, đính kèm) đang chạy bằng dữ liệu mẫu,
và một CƠ SỞ DỮ LIỆU MySQL ĐÃ CÓ DỮ LIỆU THẬT. Nhiệm vụ: nối giao diện vào MySQL đó, thêm logic backend, rồi hoàn thiện.

THÔNG TIN MÔI TRƯỜNG:
- Stack backend ưu tiên: <<< Node.js 20 + Express + mysql2 / hoặc stack dự án hiện có >>>
- Kết nối MySQL qua biến môi trường DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (tôi đã đặt trong .env).
- Người dùng cuối: đội SOC (vai trò admin, analyst, viewer).

QUY TRÌNH BẮT BUỘC (làm tuần tự, dừng hỏi tôi khi gặp điểm mơ hồ):

BƯỚC 1 – KHÁM PHÁ (CHỈ ĐỌC, KHÔNG SỬA GÌ):
- Chạy SHOW TABLES; với mỗi bảng chạy SHOW CREATE TABLE và đếm số dòng; xem vài dòng mẫu (che dữ liệu nhạy cảm).
- Lập "BẢNG ÁNH XẠ": mỗi trang giao diện -> bảng/cột MySQL hiện có -> trường mà giao diện cần (xem mục "Bản đồ dữ liệu" trong README).
  Ghi rõ: cột khớp trực tiếp / cần đổi tên hiển thị / cần tính toán (ví dụ mức độ từ CVSS, điểm rủi ro) / hoàn toàn thiếu.
- DỪNG và trình bày bảng ánh xạ + các câu hỏi để tôi xác nhận trước khi viết mã.

BƯỚC 2 – AN TOÀN DỮ LIỆU:
- TUYỆT ĐỐI không DROP, TRUNCATE, đổi kiểu cột, đổi tên hoặc xóa cột/bảng đang có. Không UPDATE/DELETE hàng loạt dữ liệu cũ.
- Chỉ THÊM: cột mới (nullable hoặc có DEFAULT), bảng mới, chỉ mục. Mỗi thay đổi là một migration đánh số, idempotent (IF NOT EXISTS),
  kèm file rollback. Nhắc tôi chạy mysqldump sao lưu và thử trên bản sao trước khi áp dụng lên DB thật.
- Với dữ liệu thiếu: ưu tiên VIEW hoặc truy vấn JOIN thay vì sửa bảng gốc. Dùng schema tham khảo trong README chỉ cho bảng CHƯA tồn tại.

BƯỚC 3 – API BACKEND (REST, JSON):
- Endpoint theo mục "Bản đồ dữ liệu". Thời gian trả về ISO 8601 UTC; khóa JSON camelCase; phân trang (page, pageSize), lọc/sắp xếp/tìm kiếm ở PHÍA SERVER.
- 100% truy vấn dùng prepared statements/parameter binding. Validate đầu vào (zod/joi). Trả lỗi dạng {error:{code,message}} với mã HTTP đúng.
- Logic nghiệp vụ phải làm ở server, không tin dữ liệu từ trình duyệt: tính mức độ CVSS, điểm rủi ro tài sản, SLA còn lại, trạng thái agent online/offline (heartbeat > 5 phút = offline), thống kê KPI dashboard.
- Thao tác nguy hiểm (Kill PID, Block IP, cách ly, Auto-Response): kiểm tra quyền, xác thực đầu vào (PID là số, IP/CIDR hợp lệ), ghi agent_commands, không thực thi trực tiếp trong request; xếp hàng cho agent/n8n và trả trạng thái.

BƯỚC 4 – XÁC THỰC VÀ PHÂN QUYỀN:
- Nối soc-login.html: POST /api/auth/login, /api/auth/logout, GET /api/auth/me. Băm mật khẩu bằng argon2/bcrypt, cookie phiên httpOnly + Secure + SameSite, chống CSRF, giới hạn tần suất đăng nhập, khóa tạm khi sai nhiều lần, hỗ trợ TOTP 2FA.
- RBAC: viewer chỉ xem; analyst xử lý cảnh báo/case, chạy playbook; admin sửa rule, cài đặt, người dùng, Active Response.
- Mọi trang: nếu API trả 401 thì chuyển về soc-login.html. Bật helmet, CORS chỉ cho origin của giao diện.

BƯỚC 5 – AUDIT VÀ THỜI GIAN THỰC:
- Mọi thao tác ghi (POST/PUT/PATCH/DELETE) ghi một dòng vào audit_logs (actor, source, event, action, payload JSON, ip, thời gian).
- Realtime bằng SSE hoặc WebSocket cho: cảnh báo mới (cập nhật badge menu), heartbeat agent, luồng log ở dashboard. Có fallback polling 15 giây.

BƯỚC 6 – TÍCH HỢP NGOÀI (QUA BACKEND, KHÔNG GỌI TỪ TRÌNH DUYỆT):
- n8n/SOAR: lưu webhook URL trong bảng settings, nút "Kiểm tra" gửi POST thật từ server, timeout 5 giây.
- VirusTotal/MISP/Cortex cho "Làm giàu IOC": gọi từ server, cache kết quả, giới hạn tần suất. Khóa API chỉ ở .env.
- Telegram HITL: gửi yêu cầu duyệt trước hành động quan trọng, nhận phản hồi qua webhook.
- Ollama (AI Analysis): chỉ chạy cục bộ, không gửi dữ liệu ra ngoài.

BƯỚC 7 – SỬA GIAO DIỆN ĐỂ DÙNG API (GIỮ NGUYÊN HTML/CSS):
- Tạo js/api.js (fetch wrapper: credentials 'include', xử lý 401, timeout, thông báo lỗi tiếng Việt) và thay mảng dữ liệu mẫu ở đầu mỗi trang bằng lời gọi API rồi gọi lại hàm render() sẵn có.
- KHÔNG đổi id, class, cấu trúc DOM đang có. Giữ esc() cho mọi dữ liệu. Thêm trạng thái loading (skeleton/“Đang tải…”) và trạng thái lỗi có nút "Thử lại".
- Bỏ các đoạn mô phỏng có chú thích "mô phỏng – thay bằng…" và thay bằng logic thật. Không lưu token trong localStorage.
- Nút xuất CSV/báo cáo: chuyển sang tạo ở server cho dữ liệu lớn.

BƯỚC 8 – HOÀN THIỆN THÊM:
- Phân trang + sắp xếp cột + debounce ô tìm kiếm cho các bảng lớn (cảnh báo, SIEM, audit, tài sản).
- Menu điện thoại: hiện sidebar đang ẩn dưới 760px, hãy thêm nút mở menu.
- Trang Người dùng & vai trò (admin), đổi mật khẩu, nhật ký đăng nhập.
- Script seed dữ liệu demo (không chạm dữ liệu thật), docker-compose (backend + tùy chọn MySQL demo), test API cho luồng chính, README vận hành.

ĐẦU RA MONG ĐỢI:
1. Bảng ánh xạ đã được tôi xác nhận. 2. Danh sách migration (up/down). 3. Mã backend + tài liệu API (OpenAPI hoặc bảng). 4. Các file HTML đã sửa đầy đủ. 5. Hướng dẫn chạy và kiểm thử. 6. Danh sách việc còn lại/rủi ro.
Nếu thiếu thông tin, hãy hỏi tôi, không tự đoán cấu trúc DB.
```

---

## 5. Bản đồ dữ liệu: trang ↔ API ↔ bảng MySQL gợi ý

Tên bảng bên phải chỉ là **gợi ý**. AI phải ánh xạ sang bảng/cột thật của bạn ở Bước 1.

| Trang | Endpoint | Bảng gợi ý | Trường giao diện cần |
|---|---|---|---|
| Đăng nhập | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | `users` | username, password_hash, role, totp_secret |
| Tổng quan | `GET /api/dashboard/summary` (tổng hợp) | `alerts`, `cases`, `agents`, `log_events` | KPI, số cảnh báo theo giờ × mức độ, phân bổ mức độ, top quốc gia/loại tấn công, MITRE |
| Cảnh báo | `GET /api/alerts`, `PATCH /api/alerts` (hàng loạt), `GET /api/alerts/:id` | `alerts` | id, title, severity, source, asset, mitre, created_at, status, raw JSON |
| Sự cố | `GET/POST /api/cases`, `PATCH /api/cases/:id`, `POST /api/cases/:id/notes` | `cases`, `case_notes` | id, title, severity, status, owner, sla_due, updated_at, notes |
| Nhật ký SIEM | `GET /api/events?q=&from=&to=&limit=` | `log_events` | time, host, source, level, user, ip, message, raw |
| Threat Intel | `GET/POST/PUT/DELETE /api/iocs`, `POST /api/iocs/enrich`, `GET/PATCH /api/ioc-rules` | `iocs`, `ioc_rules` | type, value, category, source, mitre_tactic, risk_score, active, added_at |
| Detection Rules | `GET/POST/PUT/DELETE /api/rules`, `PATCH /api/rules/:id/enabled` | `detection_rules`, `rule_conditions` | id, name, severity, event_type, mitre_technique, mitre_tactic, enabled, điều kiện (field, operator, value) |
| MITRE | `GET /api/mitre/coverage` | `mitre_techniques` + JOIN `detection_rules`, `alerts` | technique id, name, tactic, hits, danh sách rule |
| Lỗ hổng | `GET /api/vulnerabilities`, `PATCH /api/vulnerabilities/:cve` | `vulnerabilities` | cve, description, cvss, affected_assets, exploited, due_date, status |
| Tài sản | `GET/POST/PUT/DELETE /api/assets` | `assets` | hostname, ip, type, os, owner, criticality, has_agent, vuln_count, last_seen |
| Agents & EDR | `GET /api/agents`, `POST /api/agents/:id/commands` | `agents`, `agent_commands` | agent_id, hostname, ip, os, last_heartbeat, version; lệnh: type (kill_pid/block_ip), arg, status |
| Firewall / IDS | `/api/firewall/rules`, `/api/ids/alerts`, `/api/blocklist` | `fw_rules`, `ids_events`, `ip_blocklist` | name, action, src, dst, port, hits, enabled; sid, signature, severity, count; ip, reason, expires_at |
| Playbook | `/api/playbooks`, `POST /api/playbooks/:id/run`, `GET /api/playbook-runs` | `playbooks`, `playbook_steps`, `playbook_runs` | name, trigger, enabled, steps (type, label, position), run status |
| Báo cáo | `POST /api/reports`, `GET /api/reports/:id/download`, `/api/report-schedules` | `reports`, `report_schedules` | type, range, format, created_at, file, cron, recipients, enabled |
| Audit & Settings | `GET /api/audit-logs`, `GET/PUT /api/settings`, `POST /api/settings/test-webhook` | `audit_logs`, `settings` | time, source, actor, event_type, action, confidence, payload; webhook_url, auto_response, telegram_hitl, ai_analysis, threshold |

**Quy ước phản hồi danh sách:** `{ "items": [...], "total": 123, "page": 1, "pageSize": 50 }`. Lỗi: `{ "error": { "code": "VALIDATION", "message": "PID phải là số nguyên dương" } }`.

---

## 6. Schema tham khảo (chỉ dùng cho bảng CHƯA tồn tại)

MySQL 8, `utf8mb4`. Không chạy trên bảng đã có. Đây là bản rút gọn, AI cần bổ sung khóa ngoại và chỉ mục theo thực tế.

```sql
CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL, role ENUM('viewer','analyst','admin') NOT NULL DEFAULT 'viewer',
  totp_secret VARCHAR(64) NULL, failed_logins INT NOT NULL DEFAULT 0, locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS assets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, hostname VARCHAR(128) UNIQUE NOT NULL, ip VARCHAR(45) NULL,
  type ENUM('server','workstation','network','cloud') NOT NULL, os VARCHAR(64) NULL, owner VARCHAR(64) NULL,
  criticality ENUM('high','med','low') NOT NULL DEFAULT 'med', last_seen DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(20) PRIMARY KEY, title VARCHAR(255) NOT NULL, severity ENUM('crit','high','med','low') NOT NULL,
  source ENUM('SIEM','EDR','IDS') NOT NULL, asset_id BIGINT NULL, mitre_id VARCHAR(16) NULL,
  status ENUM('new','ack','fp','closed') NOT NULL DEFAULT 'new', raw JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY(status, severity), KEY(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cases (
  id VARCHAR(20) PRIMARY KEY, title VARCHAR(255) NOT NULL, severity ENUM('crit','high','med','low') NOT NULL,
  status ENUM('new','progress','pending','closed') NOT NULL DEFAULT 'new', owner_id BIGINT NULL,
  sla_due DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS case_notes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, case_id VARCHAR(20) NOT NULL, author_id BIGINT NULL,
  body TEXT NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY(case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS detection_rules (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(255) NOT NULL, severity ENUM('crit','high','med','low') NOT NULL,
  event_type VARCHAR(64) NOT NULL, mitre_technique VARCHAR(16) NULL, mitre_tactic VARCHAR(64) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS rule_conditions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, rule_id VARCHAR(64) NOT NULL, field VARCHAR(64) NOT NULL,
  operator VARCHAR(32) NOT NULL, value TEXT NOT NULL, position INT NOT NULL DEFAULT 0, KEY(rule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS iocs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, type ENUM('ip-src','ip-dst','domain','url','md5','sha1','sha256','email') NOT NULL,
  value VARCHAR(512) NOT NULL, category VARCHAR(64) NULL, source VARCHAR(32) NULL, mitre_tactic VARCHAR(64) NULL,
  risk_score TINYINT UNSIGNED NOT NULL DEFAULT 50, active TINYINT(1) NOT NULL DEFAULT 1,
  added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY(type, value(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agents (
  agent_id VARCHAR(64) PRIMARY KEY, hostname VARCHAR(128) NOT NULL, ip VARCHAR(45) NULL, os VARCHAR(32) NULL,
  version VARCHAR(32) NULL, last_heartbeat DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS agent_commands (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, agent_id VARCHAR(64) NOT NULL, type ENUM('kill_pid','block_ip') NOT NULL,
  arg VARCHAR(255) NOT NULL, status ENUM('queued','sent','done','failed') NOT NULL DEFAULT 'queued',
  issued_by BIGINT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY(agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vulnerabilities (
  cve VARCHAR(20) PRIMARY KEY, description VARCHAR(255) NOT NULL, cvss DECIMAL(3,1) NOT NULL,
  exploited TINYINT(1) NOT NULL DEFAULT 0, due_date DATE NULL,
  status ENUM('open','patching','fixed','accepted') NOT NULL DEFAULT 'open'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ip_blocklist (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, cidr VARCHAR(50) UNIQUE NOT NULL, reason VARCHAR(255) NULL,
  expires_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY, occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source ENUM('dashboard','edr','ai','soar') NOT NULL, actor VARCHAR(64) NOT NULL, event_type VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL, confidence DECIMAL(3,2) NULL, payload JSON NULL, ip VARCHAR(45) NULL,
  KEY(occurred_at), KEY(actor), KEY(action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) PRIMARY KEY, v JSON NOT NULL, updated_by BIGINT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Các bảng còn lại (`log_events`, `fw_rules`, `ids_events`, `playbooks`, `playbook_steps`, `playbook_runs`, `reports`, `report_schedules`, `mitre_techniques`) làm tương tự theo cột ở mục 5. `log_events` nên phân vùng theo ngày và có chỉ mục `(occurred_at)`, `(source, level)`.

---

## 7. Checklist nghiệm thu

**Bảo mật:** không còn khóa API/mật khẩu trong HTML/JS; token không nằm trong `localStorage`; mọi truy vấn dùng tham số hóa; mọi chuỗi hiển thị qua `esc()`; RBAC được kiểm tra ở server, không chỉ ẩn nút; có giới hạn tần suất đăng nhập; mọi thao tác ghi đều có dòng audit.

**Dữ liệu:** không bảng/cột cũ nào bị xóa hay đổi kiểu; mỗi migration có rollback; đã sao lưu trước khi áp dụng; số liệu KPI trên giao diện khớp với truy vấn SQL kiểm chứng.

**Giao diện:** tất cả 15 trang mở được và menu điều hướng đúng; mỗi bảng có đủ trạng thái tải/trống/lỗi; bộ lọc và tìm kiếm chạy ở server; cỡ chữ đọc tốt ở màn hình 1366px và 1920px; thao tác chỉ bằng bàn phím được.

---

## 8. Giới hạn hiện tại của bộ template

- Dữ liệu, kết quả "làm giàu IOC", "Kiểm tra webhook", Kill PID/Block IP, chạy playbook, tạo báo cáo hiện đều là **mô phỏng** (có chú thích trong mã). Chúng chỉ hoạt động thật sau khi nối backend theo Prompt B.
- Chưa có trang quản lý người dùng/vai trò, và sidebar bị ẩn dưới 760px (chưa có nút mở menu trên điện thoại).
- Chưa có nút chuyển sáng/tối; muốn có theme tối, thêm một khối biến màu `[data-theme="dark"]` trong `:root` và một nút chuyển ở topbar.
- Phần khung menu lặp lại ở mọi file. Khi dự án lớn hơn, nên tách thành một component dùng chung (Prompt B, Bước 8 có thể yêu cầu AI làm).
