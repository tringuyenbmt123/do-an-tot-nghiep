import paramiko
import re
import requests
from datetime import datetime

#  CẤU HÌNH 
PFSENSE_HOST = "192.168.221.221"
PFSENSE_PORT = 22
PFSENSE_USER = "admin"
PFSENSE_PASS = "pfsense"
LOG_FILE = "/var/squid/logs/access.log"


N8N_WEBHOOK_URL = "https://undegenerate-alisia-farsightedly.ngrok-free.dev/webhook/phishing-alert"

from urllib.parse import urlparse


MAIN_CONTENT_TYPES = ("text/html",)


# domain nền không phải trang user chủ động truy cập, luôn bỏ qua
EXCLUDE_HOSTS_SUFFIX = (
    "bing.com",
    "msn.com",
    "microsoftonline.com",
    "live.com",
    "microsoft.com",
    "akamaized.net",
    "clients6.google.com",
    "clients.google.com",
    "googleapis.com",
)

# Subdomain kiểu API/tracking/telemetry -> bỏ qua 
EXCLUDE_HOST_PREFIX = ("api.", "login.", "vcf.", "ntp.", "track.", "cdn.", "ogads-pa.")

# Path chứa các từ khoá đặc trưng của API call / tracking / analytics -> bỏ qua
EXCLUDE_PATH_KEYWORDS = (
    "/track", "/geolocation", "/rewardsapp", "/identity", "/feedback",
    "sbi", "hit.gif", "/ck/a", "signin", "authorize", "/oauth",
    "/OneCollector", "onecollector",
    "gen_204", "client_204", "/ajax/", "browser_error_reports",
    "asyncdata", "/rpc/", "/log?", "/beacon", "collect?",
)


def is_noise(url: str) -> bool:
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = parsed.path.lower()
    except Exception:
        return True

    if any(host.endswith(suffix) for suffix in EXCLUDE_HOSTS_SUFFIX):
        return True
    if any(host.startswith(prefix) for prefix in EXCLUDE_HOST_PREFIX):
        return True
    if any(keyword.lower() in path for keyword in EXCLUDE_PATH_KEYWORDS):
        return True
    return False


# Format log Squid mặc định:
# [0] timestamp  [1] response_time  [2] client_ip  [3] status  [4] bytes  [5] method
# [6] url  [7] user  [8] hierarchy  [9] content-type
LOG_PATTERN = re.compile(
    r'^(?P<time>\d+\.\d+)\s+\d+\s+(?P<ip>\d+\.\d+\.\d+\.\d+)\s+\S+\s+\d+\s+(?P<method>\S+)\s+'
    r'(?P<url>\S+)\s+\S+\s+\S+\s+(?P<ctype>\S+)'
)


def is_main_navigation(url: str, ctype: str) -> bool:
    # Bỏ các dòng chỉ có IP:port (traffic HTTPS bị splice, chưa giải mã được nội dung)
    if re.match(r"^\d+\.\d+\.\d+\.\d+:\d+$", url):
        return False
    # Chỉ giữ GET trả về text/html 
    if not ctype.startswith(MAIN_CONTENT_TYPES):
        return False
    return True


def process_line(line: str):
    match = LOG_PATTERN.match(line.strip())
    if not match:
        return

    url = match.group("url")
    ctype = match.group("ctype")

    if is_noise(url):
        return
    if not is_main_navigation(url, ctype):
        return

    ts = float(match.group("time"))
    record = {
        "client_ip": match.group("ip"),
        "url": url,
        "time": datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S"),
    }

    print(f"[{record['time']}] {record['client_ip']} -> {record['url']}")

    # Gửi lên n8n webhook node "Extract Phishing Payload" với các  field: url, src_ip, user, timestamp)
    payload = {
        "url": record["url"].rstrip("/"),   
        "user": "unknown", 
        "timestamp": record["time"],
    }
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

    print(f"Đã kết nối SSH tới pfSense ({PFSENSE_HOST}), đang theo dõi realtime {LOG_FILE} ...")
    print("Nhấn Ctrl+C để dừng.\n")

    # tail -F -n 0: bỏ qua log cũ, chỉ lấy log mới phát sinh từ lúc chạy script
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