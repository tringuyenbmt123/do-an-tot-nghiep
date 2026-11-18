


# import paramiko
# import re
# import requests
# import time
# import os
# from datetime import datetime
# from urllib.parse import urlparse

# # ================= CẤU HÌNH CŨ (SSH pfsense) =================
# PFSENSE_HOST = "192.168.221.221"
# PFSENSE_PORT = 22
# PFSENSE_USER = "admin"
# PFSENSE_PASS = "pfsense"
# LOG_FILE = "/var/squid/logs/access.log"


# LOCAL_LOG_FILE = "access.log" 

# N8N_WEBHOOK_URL = "https://undegenerate-alisia-farsightedly.ngrok-free.dev/webhook/phishing-alert"


# MAIN_CONTENT_TYPES = ("text/html",)

# # domain nền không phải trang user chủ động truy cập, luôn bỏ qua
# EXCLUDE_HOSTS_SUFFIX = (
#     "bing.com",
#     "msn.com",
#     "microsoftonline.com",
#     "live.com",
#     "microsoft.com",
#     "akamaized.net",
#     "clients6.google.com",
#     "clients.google.com",
#     "googleapis.com",
#     "nelreports.net"
# )

# # Subdomain kiểu API/tracking/telemetry -> bỏ qua 
# EXCLUDE_HOST_PREFIX = ("api.", "login.", "vcf.", "ntp.", "track.", "cdn.", "ogads-pa.")

# # Path chứa các từ khoá đặc trưng của API call / tracking / analytics -> bỏ qua
# EXCLUDE_PATH_KEYWORDS = (
#     "/track", "/geolocation", "/rewardsapp", "/identity", "/feedback",
#     "sbi", "hit.gif", "/ck/a", "signin", "authorize", "/oauth",
#     "/OneCollector", "onecollector",
#     "gen_204", "client_204", "/ajax/", "browser_error_reports",
#     "asyncdata", "/rpc/", "/log?", "/beacon", "collect?",
#     "/api/report", "/report?", "/csp-report", "/reporting",
# )

# def is_noise(url: str) -> bool:
#     try:
#         parsed = urlparse(url)
#         host = parsed.netloc.lower()
#         path = parsed.path.lower()
#     except Exception:
#         return True

#     if any(host.endswith(suffix) for suffix in EXCLUDE_HOSTS_SUFFIX):
#         return True
#     if any(host.startswith(prefix) for prefix in EXCLUDE_HOST_PREFIX):
#         return True
#     if any(keyword.lower() in path for keyword in EXCLUDE_PATH_KEYWORDS):
#         return True
#     return False

# # Format log Squid mặc định:
# # [0] timestamp  [1] response_time  [2] client_ip  [3] status  [4] bytes  [5] method
# # [6] url  [7] user  [8] hierarchy  [9] content-type
# LOG_PATTERN = re.compile(
#     r'^(?P<time>\d+\.\d+)\s+\d+\s+(?P<ip>\d+\.\d+\.\d+\.\d+)\s+\S+\s+\d+\s+(?P<method>\S+)\s+'
#     r'(?P<url>\S+)\s+\S+\s+\S+\s+(?P<ctype>\S+)'
# )


# def is_main_navigation(url: str, ctype: str) -> bool:
#     # Bỏ các dòng chỉ có IP:port (traffic HTTPS bị splice, chưa giải mã được nội dung)
#     if re.match(r"^\d+\.\d+\.\d+\.\d+:\d+$", url):
#         return False
#     # Chỉ giữ GET trả về text/html 
#     if not ctype.startswith(MAIN_CONTENT_TYPES):
#         return False
#     return True

# URL_VALID = re.compile(r'^https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', re.IGNORECASE)

# def process_line(line: str):
#     match = LOG_PATTERN.match(line.strip())
#     if not match:
#         return

#     url = match.group("url")
#     ctype = match.group("ctype")

#     if "NONE_NONE" in line or "error:" in url.lower():
#         return
#     if not URL_VALID.match(url):
#         return

#     if is_noise(url):
#         return
#     if not is_main_navigation(url, ctype):
#         return

#     ts = float(match.group("time"))
#     record = {
#         "client_ip": match.group("ip"),
#         "url": url,
#         "time": datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S"),
#     }

#     print(f"[{record['time']}] {record['client_ip']} -> {record['url']}")

#     # Gửi lên n8n webhook node "Extract Phishing Payload" với các  field: url, src_ip, user, timestamp)
#     payload = {
#         "url": record["url"].rstrip("/"), 
#         "src_ip": record["client_ip"],  
#         "user": "unknown", 
#         "timestamp": record["time"],
#     }
#     try:
#         resp = requests.post(
#             N8N_WEBHOOK_URL,
#             json=payload,
#             timeout=5,
#             headers={"ngrok-skip-browser-warning": "true"},
#         )
#         print(f"    -> gửi n8n: HTTP {resp.status_code}")
#     except requests.exceptions.RequestException as e:
#         print(f"    -> LỖI gửi n8n: {e}")


# # ================= HÀM MỚI: Đọc file realtime trên máy local =================
# def tail_local_file(file_path):
#     """
#     Hàm này thay thế cho `tail -F -n 0` của Linux/pfSense.
#     Nó sẽ mở file, nhảy thẳng tới dòng cuối cùng hiện tại,
#     và liên tục chờ các dòng mới được ghi thêm vào (realtime).
#     """
#     if not os.path.exists(file_path):
#         # Nếu file chưa tồn tại, tạo file trống để tránh báo lỗi
#         open(file_path, 'a').close()
        
#     with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
#         # Di chuyển con trỏ xuống cuối cùng của file (giống -n 0)
#         f.seek(0, os.SEEK_END)
#         while True:
#             line = f.readline()
#             if not line:
#                 # Nếu không có dòng mới, nghỉ 0.1s rồi đọc lại
#                 time.sleep(0.1)
#                 continue
#             yield line
# # ==============================================================================


# def main():
#     # ---------------- CODE CŨ (Dùng cho SSH) ----------------
#     client = paramiko.SSHClient()
#     client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
#     client.connect(
#         PFSENSE_HOST,
#         port=PFSENSE_PORT,
#         username=PFSENSE_USER,
#         password=PFSENSE_PASS,
#         look_for_keys=False,
#         allow_agent=False,
#     )
#     print(f"Đã kết nối SSH tới pfSense ({PFSENSE_HOST}), đang theo dõi realtime {LOG_FILE} ...")
#     print("Nhấn Ctrl+C để dừng.\n")
#     stdin, stdout, stderr = client.exec_command(f"tail -F -n 0 {LOG_FILE}")
#     try:
#         for line in iter(stdout.readline, ""):
#             if line:
#                 process_line(line)
#     except KeyboardInterrupt:
#         print("\nĐang dừng...")
#     finally:
#         client.close()
#     # --------------------------------------------------------

   

# if __name__ == "__main__":
#     main()


import paramiko
import re
import requests
import time
import threading
from datetime import datetime
from urllib.parse import urlparse

#  CẤU HÌNH 
PFSENSE_HOST = "192.168.221.221"   
PFSENSE_PORT = 22
PFSENSE_USER = "admin"
PFSENSE_PASS = "pfsense"
LOG_FILE = "/var/squid/logs/access.log"

N8N_WEBHOOK_URL = "https://undegenerate-alisia-farsightedly.ngrok-free.dev/webhook/phishing-alert"



USE_WHITELIST = False
WHITELIST_DOMAINS = (
    "vnexpress.net", "thanhnien.vn", "vietnamnet.vn", "tienphong.vn",
    "tuoitre.vn", "24h.com.vn", "youtube.com", "google.com",
)

MAIN_CONTENT_TYPES = ("text/html",)

#  BỘ LỌC NHIỄU 
EXCLUDE_HOSTS_SUFFIX = (
    "bing.com", "msn.com", "microsoftonline.com", "live.com", "microsoft.com",
    "akamaized.net", "clients6.google.com", "clients.google.com",
    "googleapis.com", "nelreports.net", "gstatic.com", "google-analytics.com",
    "googletagmanager.com", "doubleclick.net", "msftconnecttest.com",
    "windowsupdate.com", "digicert.com", "msedge.net",
)

EXCLUDE_HOST_PREFIX = (
    "api.", "login.", "vcf.", "ntp.", "track.", "cdn.", "ogads-pa.",
    "media.", "embed.", "static.", "img.", "image.", "images.",
    "assets.", "video.", "stream.",
)

EXCLUDE_EXTENSIONS = (
    ".js", ".mjs", ".css", ".map", ".json", ".xml", ".txt",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".avif",
    ".woff", ".woff2", ".ttf", ".eot",
    ".mp4", ".m3u8", ".ts", ".mp3", ".webm",
)

# Toàn bộ viết thường. Đã bỏ "signin"/"authorize"/"sbi" vì dễ loại nhầm trang phishing giả đăng nhập.
EXCLUDE_PATH_KEYWORDS = (
    "/track", "/geolocation", "/rewardsapp", "/identity", "/feedback",
    "hit.gif", "/ck/a", "/onecollector", "gen_204", "client_204",
    "/ajax", "browser_error_reports", "asyncdata", "/rpc/", "/log?",
    "/beacon", "collect?", "/api/", "/api-", "/report", "/csp-report",
    "/reporting", "getdsklist", "/embed", "/widget", "/sw.js",
    "/service-worker", "workbox", "/_next/", "/static/", "/assets/",
)

# Format log Squid mặc định:
# [0] timestamp [1] elapsed [2] client_ip [3] status [4] bytes [5] method
# [6] url [7] user [8] hierarchy [9] content-type
LOG_PATTERN = re.compile(
    r'^(?P<time>\d+\.\d+)\s+\d+\s+(?P<ip>\d+\.\d+\.\d+\.\d+)\s+(?P<status>\S+)\s+\d+\s+(?P<method>\S+)\s+'
    r'(?P<url>\S+)\s+\S+\s+\S+\s+(?P<ctype>\S+)'
)
URL_VALID = re.compile(r'^https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', re.IGNORECASE)



def get_host(url: str) -> str:
    host = urlparse(url).netloc.lower().split(":")[0]
    return host[4:] if host.startswith("www.") else host


def is_whitelisted(url: str) -> bool:
    host = get_host(url)
    return any(host == d or host.endswith("." + d) for d in WHITELIST_DOMAINS)


def is_noise(url: str) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path.lower()
        target = path + ("?" + parsed.query.lower() if parsed.query else "")
    except Exception:
        return True

    if any(host.endswith(s) for s in EXCLUDE_HOSTS_SUFFIX):
        return True
    if any(host.startswith(p) for p in EXCLUDE_HOST_PREFIX):
        return True
    if path.endswith(EXCLUDE_EXTENSIONS):
        return True
    if any(k in target for k in EXCLUDE_PATH_KEYWORDS):
        return True
    return False


def is_main_navigation(url: str, ctype: str) -> bool:
    if re.match(r"^\d+\.\d+\.\d+\.\d+:\d+$", url):
        return False
    return ctype.startswith(MAIN_CONTENT_TYPES)


def send_to_n8n(payload: dict):
    try:
        resp = requests.post(
            N8N_WEBHOOK_URL,
            json=payload,
            timeout=5,
            headers={"ngrok-skip-browser-warning": "true"},
        )
        print(f"    -> gửi n8n: HTTP {resp.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"    -> LỖI gửi n8n: {e}")


def process_line(line: str):
    line = line.strip()
    match = LOG_PATTERN.match(line)
    if not match:
        return

    url = match.group("url")
    ctype = match.group("ctype")
    client_ip = match.group("ip")

    # Bỏ dòng lỗi của Squid và URL không hợp lệ
    if "NONE_NONE" in line or "error:" in url.lower():
        return
    if "DENIED" in match.group("status"):
        return
    if not URL_VALID.match(url):
        return
    if match.group("method") != "GET":
        return
    if is_noise(url):
        return
    if not is_main_navigation(url, ctype):
        return
    if USE_WHITELIST and is_whitelisted(url):
        return
    

    t = datetime.fromtimestamp(float(match.group("time"))).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{t}] {client_ip} -> {url}")

    payload = {
        "url": url.rstrip("/"),
        "src_ip": client_ip,
        "user": "unknown",
        "timestamp": t,
    }
    threading.Thread(target=send_to_n8n, args=(payload,), daemon=True).start()


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        PFSENSE_HOST,
        port=PFSENSE_PORT,
        username=PFSENSE_USER,
        password=PFSENSE_PASS,
        look_for_keys=False,
        allow_agent=False,
    )
    print(f"Đã kết nối SSH tới pfSense ({PFSENSE_HOST}), đang theo dõi {LOG_FILE} ...")

    stdin, stdout, stderr = client.exec_command(f"tail -F -n 0 {LOG_FILE}")
    try:
        for line in iter(stdout.readline, ""):
            if line:
                process_line(line)
    except KeyboardInterrupt:
        print("\nĐang dừng...")
    finally:
        client.close()


if __name__ == "__main__":
    main()