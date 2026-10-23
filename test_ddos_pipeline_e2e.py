"""
test_ddos_pipeline_e2e.py
=========================
Kiem tra toan dien pipeline DDoS:
  Agent -> SOC Server -> n8n -> Telegram/Block

Chay: python test_ddos_pipeline_e2e.py
"""

import sys
import io
import json
import time
import datetime
import urllib.request
import urllib.error
import urllib.parse

# Force UTF-8 output on Windows (fix CP1252 UnicodeEncodeError)
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ===== CAU HINH =====
SOC_SERVER       = "http://10.251.46.150:8080"
N8N_SERVER       = "http://10.251.46.150:5678"
DDOS_WEB         = "http://10.251.46.150:5000"
N8N_WEBHOOK      = f"{N8N_SERVER}/webhook/ddos-alert"
N8N_WEBHOOK_TEST = f"{N8N_SERVER}/webhook-test/ddos-alert"

SOC_USER   = "admin"
SOC_PASS   = "Admin@123"

ATTACK_IP = "185.220.101.45"
AGENT_ID  = "endpoint-win11-01"

# ===== COLORS (ANSI) =====
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
GRAY   = "\033[90m"
RESET  = "\033[0m"
BOLD   = "\033[1m"
MAGENTA= "\033[95m"

def now_ts():
    return datetime.datetime.now().strftime("%H:%M:%S")

def step(msg):  print(f"\n{CYAN}[{now_ts()}] STEP: {msg}{RESET}")
def ok(msg):    print(f"  {GREEN}[PASS] {msg}{RESET}")
def fail(msg):  print(f"  {RED}[FAIL] {msg}{RESET}")
def info(msg):  print(f"  {YELLOW}[INFO] {msg}{RESET}")
def skip(msg):  print(f"  {GRAY}[SKIP] {msg}{RESET}")

results = {}

# ===== HTTP HELPER =====
def http_get(url, headers=None, timeout=8):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode())

def http_post(url, data, headers=None, timeout=15):
    body = json.dumps(data).encode("utf-8")
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode())

# ============================================================
# BUOC 1: HEALTH CHECK
# ============================================================
step("BUOC 1: Health Check tat ca Service")

# SOC Server
try:
    status_code, body = http_get(f"{SOC_SERVER}/health")
    if body.get("status") == "ok":
        ok(f"SOC Server dang chay tai {SOC_SERVER}")
        results["soc_server"] = True
    else:
        fail(f"SOC Server phan hoi bat thuong: {body}")
        results["soc_server"] = False
except Exception as e:
    fail(f"SOC Server KHONG phan hoi: {e}")
    results["soc_server"] = False

# n8n Server
try:
    req = urllib.request.Request(N8N_SERVER)
    with urllib.request.urlopen(req, timeout=5) as r:
        ok(f"n8n Server dang chay tai {N8N_SERVER} (HTTP {r.status})")
        results["n8n_server"] = True
except urllib.error.HTTPError as e:
    ok(f"n8n Server dang chay tai {N8N_SERVER} (HTTP {e.code})")
    results["n8n_server"] = True
except Exception as e:
    fail(f"n8n Server KHONG phan hoi: {e}")
    results["n8n_server"] = False

# CodeWebDDoS (optional)
try:
    status_code, body = http_get(f"{DDOS_WEB}/api/combined_data")
    ok(f"CodeWebDDoS dang chay tai {DDOS_WEB}")
    results["ddos_web"] = True
except Exception as e:
    skip(f"CodeWebDDoS khong phan hoi tai {DDOS_WEB} (bo qua): {type(e).__name__}")
    results["ddos_web"] = False

# ============================================================
# BUOC 2: DANG NHAP SOC SERVER
# ============================================================
step("BUOC 2: Dang nhap SOC Server lay JWT Token")

JWT_TOKEN = None
AUTH_HEADER = {}

if results.get("soc_server"):
    try:
        status_code, body = http_post(
            f"{SOC_SERVER}/api/v1/auth/login",
            {"username": SOC_USER, "password": SOC_PASS}
        )
        JWT_TOKEN = body.get("access_token")
        if JWT_TOKEN:
            ok(f"Dang nhap thanh cong! Token: {JWT_TOKEN[:25]}...")
            AUTH_HEADER = {"Authorization": f"Bearer {JWT_TOKEN}"}
            results["soc_login"] = True
        else:
            fail(f"Khong nhan duoc access_token. Body: {body}")
            results["soc_login"] = False
    except Exception as e:
        fail(f"Loi dang nhap: {e}")
        results["soc_login"] = False
else:
    skip("Bo qua dang nhap (SOC Server khong kha dung)")
    results["soc_login"] = False

# ============================================================
# BUOC 3: GUI DDoS ALERT VAO n8n WEBHOOK
# ============================================================
step("BUOC 3: Gui DDoS Alert vao n8n Webhook (gia lap CodeWebDDoS / Agent Kali)")

ddos_payload = {
    "agent_id"   : AGENT_ID,
    "event_type" : "ddos_detected",
    "severity"   : "critical",
    "title"      : "[CRITICAL] DDoS Attack - SYN Flood",
    "description": f"High volume SYN Flood from external IP {ATTACK_IP}",
    "src_ip"     : ATTACK_IP,
    "target"     : "192.168.91.100",
    "attack_type": "SYN Flood",
    "confidence" : 0.98,
    "reported_by": "DDoS-ML-Detector",
    "timestamp"  : datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "pps"        : 15000,
    "infrastructure": {
        "detector_host": "kali-linux",
        "n8n_host"     : "n8n-server",
        "wazuh_host"   : "wazuh-server",
    }
}

info("Payload:")
print(f"  {GRAY}{json.dumps(ddos_payload, indent=4)}{RESET}")

webhook_success = False
for wh_url in [N8N_WEBHOOK, N8N_WEBHOOK_TEST]:
    try:
        status_code, resp_body = http_post(wh_url, ddos_payload)
        ok(f"Gui thanh cong toi: {wh_url}")
        info(f"Response: {json.dumps(resp_body)[:300]}")
        webhook_success = True
        results["n8n_webhook"] = True
        break
    except urllib.error.HTTPError as e:
        raw = e.read()
        info(f"Webhook {wh_url} -> HTTP {e.code}: {raw[:200]}")
        if e.code < 500:
            ok(f"n8n nhan webhook (HTTP {e.code}) tai: {wh_url}")
            webhook_success = True
            results["n8n_webhook"] = True
            break
    except Exception as e:
        info(f"Webhook {wh_url} that bai: {type(e).__name__}: {e}")

if not webhook_success:
    fail("Khong the gui alert vao n8n (ca production lan test webhook)")
    results["n8n_webhook"] = False

# ============================================================
# BUOC 4: TAO ALERT TREN SOC SERVER
# ============================================================
step("BUOC 4: Gui Alert vao SOC Server REST API")

ALERT_ID = None

if results.get("soc_login"):
    alert_body = {
        "agent_id"   : AGENT_ID,
        "event_type" : "ddos_detected",
        "severity"   : "critical",
        "title"      : "[E2E-TEST] SYN Flood DDoS Attack",
        "description": f"Kiem tra pipeline: SYN Flood tu {ATTACK_IP} - Confidence 0.98",
        "raw_payload": {
            "src_ip"     : ATTACK_IP,
            "attack_type": "SYN Flood",
            "confidence" : 0.98,
            "pps"        : 15000,
            "reported_by": "E2E-Test-Script",
        }
    }
    try:
        status_code, alert_resp = http_post(
            f"{SOC_SERVER}/api/v1/alerts",
            alert_body,
            headers=AUTH_HEADER
        )
        ALERT_ID = alert_resp.get("id")
        ok(f"Alert tao thanh cong! ID: {ALERT_ID}")
        info(f"Status: {alert_resp.get('status')}, Severity: {alert_resp.get('severity')}")
        results["soc_create_alert"] = True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        fail(f"Loi tao Alert (HTTP {e.code}): {err_body[:300]}")
        results["soc_create_alert"] = False
    except Exception as e:
        fail(f"Loi tao Alert: {e}")
        results["soc_create_alert"] = False
else:
    skip("Bo qua tao Alert (chua login)")
    results["soc_create_alert"] = False

# ============================================================
# BUOC 5: KIEM TRA ALERT TRONG DB
# ============================================================
step("BUOC 5: Kiem tra Alert da luu trong DB")

if results.get("soc_login") and ALERT_ID:
    time.sleep(2)
    try:
        status_code, got_alert = http_get(
            f"{SOC_SERVER}/api/v1/alerts/{ALERT_ID}",
            headers=AUTH_HEADER
        )
        if got_alert.get("id") == ALERT_ID:
            ok(f"Alert tim thay trong DB: ID={got_alert['id']}, Status={got_alert.get('status')}")
            results["soc_get_alert"] = True
        else:
            fail(f"Alert ID khong khop: {got_alert}")
            results["soc_get_alert"] = False
    except Exception as e:
        fail(f"Loi GET Alert: {e}")
        results["soc_get_alert"] = False
else:
    skip("Bo qua kiem tra DB Alert")
    results["soc_get_alert"] = False

# ============================================================
# BUOC 6: DISPATCH SOAR
# ============================================================
step("BUOC 6: Dispatch Alert sang n8n SOAR tu SOC Server")

if results.get("soc_login") and ALERT_ID:
    try:
        status_code, soar_resp = http_post(
            f"{SOC_SERVER}/api/v1/alerts/{ALERT_ID}/soar",
            {},
            headers=AUTH_HEADER
        )
        ok(f"Dispatch SOAR thanh cong: {soar_resp.get('message')}")
        results["soar_dispatch"] = True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        fail(f"Loi dispatch SOAR (HTTP {e.code}): {err_body[:300]}")
        results["soar_dispatch"] = False
    except Exception as e:
        fail(f"Loi dispatch SOAR: {e}")
        results["soar_dispatch"] = False
else:
    skip("Bo qua dispatch SOAR")
    results["soar_dispatch"] = False

# ============================================================
# BUOC 7: DASHBOARD STATS
# ============================================================
step("BUOC 7: Kiem tra Dashboard Stats SOC Server")

if results.get("soc_login"):
    try:
        status_code, dashboard = http_get(
            f"{SOC_SERVER}/api/v1/dashboard/stats",
            headers=AUTH_HEADER
        )
        ok("Dashboard stats nhan duoc:")
        info(f"  Total Alerts  : {dashboard.get('total_alerts', 'N/A')}")
        info(f"  Critical Alerts: {dashboard.get('critical_alerts', 'N/A')}")
        info(f"  Online Agents : {dashboard.get('online_agents', 'N/A')}")
        results["soc_dashboard"] = True
    except Exception as e:
        fail(f"Loi lay Dashboard: {e}")
        results["soc_dashboard"] = False
else:
    skip("Bo qua Dashboard")
    results["soc_dashboard"] = False

# ============================================================
# BUOC 8: DANH SACH AGENTS
# ============================================================
step("BUOC 8: Kiem tra Agents dang ket noi SOC Server")

if results.get("soc_login"):
    try:
        status_code, agents_resp = http_get(
            f"{SOC_SERVER}/api/v1/agents",
            headers=AUTH_HEADER
        )
        agent_list = agents_resp if isinstance(agents_resp, list) else agents_resp.get("data", [])
        online  = [a for a in agent_list if a.get("status") == "online"]
        offline = [a for a in agent_list if a.get("status") != "online"]
        ok(f"Tong Agents: {len(agent_list)} | Online: {len(online)} | Offline: {len(offline)}")
        for ag in agent_list:
            color = GREEN if ag.get("status") == "online" else RED
            print(f"    {color}- {ag.get('hostname', ag.get('id', '?'))} [{ag.get('status')}] IP: {ag.get('ip_address', 'N/A')}{RESET}")
        results["soc_agents"] = True
    except Exception as e:
        fail(f"Loi lay Agents: {e}")
        results["soc_agents"] = False
else:
    skip("Bo qua Agents")
    results["soc_agents"] = False

# ============================================================
# BUOC 9: GUI SYN FLOOD PAYLOAD DAY DU (giong PowerShell ban dau)
# ============================================================
step("BUOC 9: Gui DDoS SYN Flood (giong luong thuc te tu PowerShell ban dau)")

syn_payload = {
    "agent_id"   : AGENT_ID,
    "event_type" : "ddos_detected",
    "severity"   : "critical",
    "title"      : "[CRITICAL] DDoS Attack - SYN Flood",
    "description": f"High volume SYN Flood from external IP {ATTACK_IP}",
    "src_ip"     : ATTACK_IP,
    "target"     : "192.168.91.100",
    "attack_type": "SYN Flood",
    "confidence" : 0.98,
    "reported_by": "DDoS-ML-Detector",
    "timestamp"  : datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
}

syn_success = False
for wh_url in [N8N_WEBHOOK, N8N_WEBHOOK_TEST]:
    try:
        status_code, resp = http_post(wh_url, syn_payload)
        ok(f"SYN Flood alert gui thanh cong! URL: {wh_url}")
        info(f"Response: {json.dumps(resp)[:300]}")
        syn_success = True
        results["n8n_syn_flood"] = True
        break
    except urllib.error.HTTPError as e:
        if e.code < 500:
            ok(f"n8n nhan SYN Flood (HTTP {e.code}) tai: {wh_url}")
            syn_success = True
            results["n8n_syn_flood"] = True
            break
        info(f"Thu {wh_url} -> HTTP {e.code}")
    except Exception as e:
        info(f"Thu {wh_url} that bai: {type(e).__name__}: {e}")

if not syn_success:
    fail("Khong the gui SYN Flood payload vao n8n")
    results["n8n_syn_flood"] = False

# ============================================================
# KET QUA TONG HOP
# ============================================================
print(f"\n{MAGENTA}{'='*60}")
print(f"  KET QUA KIEM TRA PIPELINE DDoS E2E")
print(f"{'='*60}{RESET}")

checks = [
    ("soc_server",       "SOC Server (FastAPI) Health"),
    ("n8n_server",       "n8n Server Health"),
    ("ddos_web",         "CodeWebDDoS (Flask) Health"),
    ("soc_login",        "SOC Server Login (JWT)"),
    ("n8n_webhook",      "n8n DDoS Webhook (ddos-alert)"),
    ("soc_create_alert", "SOC Server - Tao Alert vao DB"),
    ("soc_get_alert",    "SOC Server - Lay Alert tu DB"),
    ("soar_dispatch",    "SOC Server - Dispatch Alert -> n8n SOAR"),
    ("soc_dashboard",    "SOC Server - Dashboard Stats"),
    ("soc_agents",       "SOC Server - Danh sach Agents"),
    ("n8n_syn_flood",    "n8n - SYN Flood Alert (Luong thuc te)"),
]

passed = failed = skipped = 0

for key, label in checks:
    v = results.get(key)
    if v is None:
        print(f"  {GRAY}[-] {label}{RESET}")
        skipped += 1
    elif v:
        print(f"  {GREEN}[OK] {label}{RESET}")
        passed += 1
    else:
        print(f"  {RED}[XX] {label}{RESET}")
        failed += 1

print(f"\n{MAGENTA}{'─'*60}{RESET}")
print(f"  {BOLD}PASSED: {GREEN}{passed}{RESET} | {BOLD}FAILED: {RED}{failed}{RESET} | {BOLD}SKIPPED: {GRAY}{skipped}{RESET}")

if failed == 0:
    print(f"  {GREEN}{BOLD}[SUCCESS] PIPELINE HOAN TOAN HOAT DONG!{RESET}")
elif passed > failed:
    print(f"  {YELLOW}{BOLD}[WARNING] Pipeline hoat dong mot phan - kiem tra cac muc [XX] o tren{RESET}")
else:
    print(f"  {RED}{BOLD}[ERROR] Pipeline co van de nghiem trong - kiem tra lai service{RESET}")

print(f"{MAGENTA}{'='*60}{RESET}\n")

# Goi y sua loi
if failed > 0:
    print(f"{YELLOW}HUONG DAN SUA LOI:{RESET}")
    if not results.get("soc_server"):
        print(f"  - SOC Server: cd soc-server-python && python main.py")
    if not results.get("n8n_server"):
        print(f"  - n8n: .\\start-n8n.ps1 hoac npx n8n start")
    if not results.get("soc_login"):
        print(f"  - Kiem tra credentials: SOC_USER={SOC_USER}, SOC_PASS=<check .env>")
    if not results.get("n8n_webhook"):
        print(f"  - Kich hoat workflow n8n: mo n8n UI -> Activate DDoS workflow")
        print(f"    Webhook URL can: {N8N_WEBHOOK}")
    if not results.get("soar_dispatch"):
        print(f"  - Kiem tra bien SOAR_ENABLED=true trong soc-server-python/.env")
        print(f"    N8N_WEBHOOK_URL_DDOS={N8N_WEBHOOK}")
    print()
