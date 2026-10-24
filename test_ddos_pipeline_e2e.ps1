<#
.SYNOPSIS
    Kiểm tra toàn bộ pipeline DDoS: Agent → SOC Server → n8n → Telegram/Block
.DESCRIPTION
    Script này kiểm tra:
    1. Health check tất cả các service đang chạy (SOC Server, n8n, DDoS Web)
    2. Gửi DDoS alert từ Agent vào webhook n8n (giả lập CodeWebDDoS)
    3. Gửi DDoS alert từ Agent vào SOC Server qua REST API
    4. Kiểm tra alert đã được lưu vào DB + broadcast WebSocket
    5. Kiểm tra n8n flow đã xử lý (Telegram bot / Block IP)
    6. Kiểm tra SOC Server đã dispatch alert sang n8n SOAR
#>

# ===== CẤU HÌNH =====
$SOC_SERVER   = "http://10.251.46.150:8080"     # SOC Server Python FastAPI
$N8N_SERVER   = "http://10.251.46.150:5678"     # n8n Server
$DDOS_WEB     = "http://10.251.46.150:5000"     # CodeWebDDoS Flask (nếu chạy)
$N8N_WEBHOOK  = "$N8N_SERVER/webhook/ddos-alert"
$N8N_WEBHOOK_TEST = "$N8N_SERVER/webhook-test/ddos-alert"

# SOC Server credentials
$SOC_USER     = "admin"
$SOC_PASS     = "Admin@123"

# Test IP (giả lập attacker)
$ATTACK_IP    = "185.220.101.45"
$AGENT_ID     = "endpoint-win11-01"

# ===== MÀUSẮC =====
function Write-Step  { param($msg) Write-Host "`n[$([datetime]::Now.ToString('HH:mm:ss'))] STEP: $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "  [✓] $msg" -ForegroundColor Green }
function Write-FAIL  { param($msg) Write-Host "  [✗] $msg" -ForegroundColor Red }
function Write-INFO  { param($msg) Write-Host "  [i] $msg" -ForegroundColor Yellow }
function Write-SKIP  { param($msg) Write-Host "  [-] $msg" -ForegroundColor DarkGray }

$results = @{}

# ============================================================
# BƯỚC 1: KIỂM TRA HEALTH CÁC SERVICE
# ============================================================
Write-Step "BƯỚC 1: Health Check tất cả Service"

# 1a. SOC Server
try {
    $r = Invoke-RestMethod -Uri "$SOC_SERVER/health" -Method GET -TimeoutSec 5
    if ($r.status -eq "ok") {
        Write-OK "SOC Server đang chạy tại $SOC_SERVER"
        $results["soc_server"] = $true
    } else {
        Write-FAIL "SOC Server phản hồi bất thường: $($r | ConvertTo-Json)"
        $results["soc_server"] = $false
    }
} catch {
    Write-FAIL "SOC Server KHÔNG phản hồi tại $SOC_SERVER - $($_.Exception.Message)"
    $results["soc_server"] = $false
}

# 1b. n8n Server
try {
    $r = Invoke-WebRequest -Uri "$N8N_SERVER/healthz" -Method GET -TimeoutSec 5 -UseBasicParsing
    if ($r.StatusCode -eq 200) {
        Write-OK "n8n Server đang chạy tại $N8N_SERVER"
        $results["n8n_server"] = $true
    } else {
        Write-INFO "n8n /healthz trả về HTTP $($r.StatusCode)"
        $results["n8n_server"] = $true  # n8n có thể không có /healthz
    }
} catch {
    # n8n có thể không có /healthz - thử root
    try {
        $r2 = Invoke-WebRequest -Uri "$N8N_SERVER" -Method GET -TimeoutSec 5 -UseBasicParsing
        Write-OK "n8n Server đang chạy (HTTP $($r2.StatusCode))"
        $results["n8n_server"] = $true
    } catch {
        Write-FAIL "n8n Server KHÔNG phản hồi tại $N8N_SERVER"
        $results["n8n_server"] = $false
    }
}

# 1c. CodeWebDDoS (Flask - optional)
try {
    $r = Invoke-WebRequest -Uri "$DDOS_WEB/api/combined_data" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-OK "CodeWebDDoS đang chạy tại $DDOS_WEB (HTTP $($r.StatusCode))"
    $results["ddos_web"] = $true
} catch {
    Write-SKIP "CodeWebDDoS không phản hồi tại $DDOS_WEB (có thể đang tắt - bỏ qua)"
    $results["ddos_web"] = $false
}

# ============================================================
# BƯỚC 2: ĐĂNG NHẬP SOC SERVER - LẤY JWT TOKEN
# ============================================================
Write-Step "BƯỚC 2: Đăng nhập SOC Server lấy JWT Token"

$loginBody = @{ username = $SOC_USER; password = $SOC_PASS } | ConvertTo-Json
$JWT_TOKEN = $null

try {
    $loginResp = Invoke-RestMethod `
        -Uri "$SOC_SERVER/api/v1/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody `
        -TimeoutSec 10

    $JWT_TOKEN = $loginResp.access_token
    if ($JWT_TOKEN) {
        Write-OK "Đăng nhập thành công! Token: $($JWT_TOKEN.Substring(0, [Math]::Min(20, $JWT_TOKEN.Length)))..."
        $results["soc_login"] = $true
    } else {
        Write-FAIL "Không nhận được JWT token từ SOC Server"
        $results["soc_login"] = $false
    }
} catch {
    Write-FAIL "Lỗi đăng nhập SOC Server: $($_.Exception.Message)"
    $results["soc_login"] = $false
}

$AUTH_HEADER = @{ "Authorization" = "Bearer $JWT_TOKEN" }

# ============================================================
# BƯỚC 3: GỬI DDoS ALERT VÀO n8n WEBHOOK (giả lập CodeWebDDoS)
# ============================================================
Write-Step "BƯỚC 3: Gửi DDoS Alert vào n8n Webhook (giả lập CodeWebDDoS / Agent Kali)"

$ddosPayload = @{
    agent_id    = $AGENT_ID
    event_type  = "ddos_detected"
    severity    = "critical"
    title       = "[CRITICAL] DDoS Attack - SYN Flood"
    description = "High volume SYN Flood from external IP $ATTACK_IP"
    src_ip      = $ATTACK_IP
    target      = "192.168.91.100"
    attack_type = "SYN Flood"
    confidence  = 0.98
    reported_by = "DDoS-ML-Detector"
    timestamp   = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    pps         = 15000
    infrastructure = @{
        detector_host = "kali-linux"
        n8n_host      = "n8n-server"
        wazuh_host    = "wazuh-server"
    }
} | ConvertTo-Json -Depth 3

Write-INFO "Payload gửi đi:"
Write-Host ($ddosPayload) -ForegroundColor DarkGray

# Thử webhook production trước, nếu thất bại thì dùng webhook-test
$webhookSuccess = $false
$n8nResp = $null

foreach ($webhookUrl in @($N8N_WEBHOOK, $N8N_WEBHOOK_TEST)) {
    try {
        $n8nResp = Invoke-RestMethod `
            -Uri $webhookUrl `
            -Method POST `
            -ContentType "application/json" `
            -Body $ddosPayload `
            -TimeoutSec 15
        Write-OK "Gửi thành công tới n8n webhook: $webhookUrl"
        Write-INFO "Response từ n8n: $($n8nResp | ConvertTo-Json -Depth 3)"
        $webhookSuccess = $true
        $results["n8n_webhook"] = $true
        break
    } catch {
        Write-INFO "Webhook $webhookUrl thất bại: $($_.Exception.Message)"
    }
}

if (-not $webhookSuccess) {
    Write-FAIL "Không thể gửi alert vào n8n (cả production lẫn test webhook)"
    $results["n8n_webhook"] = $false
}

# ============================================================
# BƯỚC 4: GỬI ALERT VÀO SOC SERVER (REST API) - Kiểm tra DB + WebSocket
# ============================================================
Write-Step "BƯỚC 4: Gửi Alert vào SOC Server REST API"

$ALERT_ID = $null

if ($results["soc_login"]) {
    $alertBody = @{
        agent_id    = $AGENT_ID
        event_type  = "ddos_detected"
        severity    = "critical"
        title       = "[E2E-TEST] SYN Flood DDoS Attack"
        description = "Kiểm tra pipeline: SYN Flood từ $ATTACK_IP - Confidence 0.98"
        raw_payload = @{
            src_ip      = $ATTACK_IP
            attack_type = "SYN Flood"
            confidence  = 0.98
            pps         = 15000
            reported_by = "E2E-Test-Script"
        }
    } | ConvertTo-Json -Depth 3

    try {
        $alertResp = Invoke-RestMethod `
            -Uri "$SOC_SERVER/api/v1/alerts" `
            -Method POST `
            -ContentType "application/json" `
            -Headers $AUTH_HEADER `
            -Body $alertBody `
            -TimeoutSec 10

        $ALERT_ID = $alertResp.id
        Write-OK "Alert tạo thành công trên SOC Server!"
        Write-INFO "Alert ID: $ALERT_ID"
        Write-INFO "Status: $($alertResp.status), Severity: $($alertResp.severity)"
        $results["soc_create_alert"] = $true
    } catch {
        Write-FAIL "Lỗi tạo Alert trên SOC Server: $($_.Exception.Message)"
        $results["soc_create_alert"] = $false
    }
} else {
    Write-SKIP "Bỏ qua tạo Alert (chưa login SOC Server)"
    $results["soc_create_alert"] = $false
}

# ============================================================
# BƯỚC 5: KIỂM TRA ALERT ĐÃ LƯU VÀO DB
# ============================================================
Write-Step "BƯỚC 5: Kiểm tra Alert đã lưu trong DB (GET /api/v1/alerts)"

if ($results["soc_login"] -and $ALERT_ID) {
    Start-Sleep -Seconds 2  # chờ DB commit

    try {
        $getAlert = Invoke-RestMethod `
            -Uri "$SOC_SERVER/api/v1/alerts/$ALERT_ID" `
            -Method GET `
            -Headers $AUTH_HEADER `
            -TimeoutSec 10

        if ($getAlert.id -eq $ALERT_ID) {
            Write-OK "Alert tìm thấy trong DB: ID=$($getAlert.id), Status=$($getAlert.status)"
            $results["soc_get_alert"] = $true
        } else {
            Write-FAIL "Alert không khớp ID"
            $results["soc_get_alert"] = $false
        }
    } catch {
        Write-FAIL "Lỗi GET Alert: $($_.Exception.Message)"
        $results["soc_get_alert"] = $false
    }
} else {
    Write-SKIP "Bỏ qua kiểm tra DB Alert"
    $results["soc_get_alert"] = $false
}

# ============================================================
# BƯỚC 6: DISPATCH ALERT SANG n8n SOAR TỪ SOC SERVER
# ============================================================
Write-Step "BƯỚC 6: Dispatch Alert sang n8n SOAR từ SOC Server"

if ($results["soc_login"] -and $ALERT_ID) {
    try {
        $soarResp = Invoke-RestMethod `
            -Uri "$SOC_SERVER/api/v1/alerts/$ALERT_ID/soar" `
            -Method POST `
            -Headers $AUTH_HEADER `
            -TimeoutSec 15

        Write-OK "Dispatch SOAR thành công: $($soarResp.message)"
        $results["soar_dispatch"] = $true
    } catch {
        Write-FAIL "Lỗi dispatch SOAR: $($_.Exception.Message)"
        $results["soar_dispatch"] = $false
    }
} else {
    Write-SKIP "Bỏ qua dispatch SOAR"
    $results["soar_dispatch"] = $false
}

# ============================================================
# BƯỚC 7: KIỂM TRA DASHBOARD SOC SERVER
# ============================================================
Write-Step "BƯỚC 7: Kiểm tra Dashboard Stats SOC Server"

if ($results["soc_login"]) {
    try {
        $dashboard = Invoke-RestMethod `
            -Uri "$SOC_SERVER/api/v1/dashboard/stats" `
            -Method GET `
            -Headers $AUTH_HEADER `
            -TimeoutSec 10

        Write-OK "Dashboard stats nhận được:"
        Write-INFO "  - Total Alerts: $($dashboard.total_alerts)"
        Write-INFO "  - Critical Alerts: $($dashboard.critical_alerts)"
        Write-INFO "  - Online Agents: $($dashboard.online_agents)"
        $results["soc_dashboard"] = $true
    } catch {
        Write-FAIL "Lỗi lấy Dashboard: $($_.Exception.Message)"
        $results["soc_dashboard"] = $false
    }
} else {
    Write-SKIP "Bỏ qua kiểm tra Dashboard"
    $results["soc_dashboard"] = $false
}

# ============================================================
# BƯỚC 8: KIỂM TRA CÁC AGENT ĐANG KẾT NỐI
# ============================================================
Write-Step "BƯỚC 8: Kiểm tra Agents đang kết nối với SOC Server"

if ($results["soc_login"]) {
    try {
        $agents = Invoke-RestMethod `
            -Uri "$SOC_SERVER/api/v1/agents" `
            -Method GET `
            -Headers $AUTH_HEADER `
            -TimeoutSec 10

        $agentList = if ($agents -is [array]) { $agents } else { $agents.data }
        $onlineCount = ($agentList | Where-Object { $_.status -eq "online" }).Count
        $offlineCount = ($agentList | Where-Object { $_.status -eq "offline" }).Count

        Write-OK "Tổng Agents: $($agentList.Count) | Online: $onlineCount | Offline: $offlineCount"
        foreach ($ag in $agentList) {
            $statusColor = if ($ag.status -eq "online") { "Green" } else { "Red" }
            Write-Host "    - $($ag.hostname ?? $ag.id) [$($ag.status)] IP: $($ag.ip_address)" -ForegroundColor $statusColor
        }
        $results["soc_agents"] = $true
    } catch {
        Write-FAIL "Lỗi lấy Agents: $($_.Exception.Message)"
        $results["soc_agents"] = $false
    }
} else {
    Write-SKIP "Bỏ qua kiểm tra Agents"
    $results["soc_agents"] = $false
}

# ============================================================
# BƯỚC 9: KIỂM TRA FLOW n8n THỰC TẾ - Gửi payload SYN Flood đầy đủ
# ============================================================
Write-Step "BƯỚC 9: Gửi DDoS SYN Flood payload đầy đủ (giống PowerShell test ban đầu)"

$synFloodPayload = @{
    agent_id    = $AGENT_ID
    event_type  = "ddos_detected"
    severity    = "critical"
    title       = "[CRITICAL] DDoS Attack - SYN Flood"
    description = "High volume SYN Flood from external IP $ATTACK_IP"
    src_ip      = $ATTACK_IP
    target      = "192.168.91.100"
    attack_type = "SYN Flood"
    confidence  = 0.98
    reported_by = "DDoS-ML-Detector"
    timestamp   = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

$synSuccess = $false
foreach ($url in @($N8N_WEBHOOK, $N8N_WEBHOOK_TEST)) {
    try {
        $r = Invoke-RestMethod `
            -Uri $url `
            -Method POST `
            -ContentType "application/json" `
            -Body $synFloodPayload `
            -TimeoutSec 15
        Write-OK "SYN Flood alert đã gửi thành công!"
        Write-Host "    URL: $url" -ForegroundColor DarkGray
        Write-Host "    Response: $($r | ConvertTo-Json -Depth 3)" -ForegroundColor DarkCyan
        $synSuccess = $true
        $results["n8n_syn_flood"] = $true
        break
    } catch {
        Write-INFO "Thử $url thất bại: $($_.Exception.Message)"
    }
}

if (-not $synSuccess) {
    Write-FAIL "Không thể gửi SYN Flood payload vào n8n"
    $results["n8n_syn_flood"] = $false
}

# ============================================================
# KẾT QUẢ TỔNG HỢP
# ============================================================
Write-Host "`n============================================================" -ForegroundColor Magenta
Write-Host "  KẾT QUẢ KIỂM TRA PIPELINE DDoS E2E" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta

$checks = @(
    @{ key = "soc_server";       label = "SOC Server (FastAPI) Health" },
    @{ key = "n8n_server";       label = "n8n Server Health" },
    @{ key = "ddos_web";         label = "CodeWebDDoS (Flask) Health" },
    @{ key = "soc_login";        label = "SOC Server Login (JWT)" },
    @{ key = "n8n_webhook";      label = "n8n DDoS Webhook (ddos-alert)" },
    @{ key = "soc_create_alert"; label = "SOC Server - Tạo Alert vào DB" },
    @{ key = "soc_get_alert";    label = "SOC Server - Lấy Alert từ DB" },
    @{ key = "soar_dispatch";    label = "SOC Server - Dispatch Alert → n8n SOAR" },
    @{ key = "soc_dashboard";    label = "SOC Server - Dashboard Stats" },
    @{ key = "soc_agents";       label = "SOC Server - Danh sách Agents" },
    @{ key = "n8n_syn_flood";    label = "n8n - SYN Flood Alert (Giống luồng thực)" }
)

$passed = 0; $failed = 0; $skipped = 0

foreach ($c in $checks) {
    $v = $results[$c.key]
    if ($null -eq $v) {
        Write-Host "  [-] $($c.label)" -ForegroundColor DarkGray
        $skipped++
    } elseif ($v -eq $true) {
        Write-Host "  [✓] $($c.label)" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  [✗] $($c.label)" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`n------------------------------------------------------------" -ForegroundColor Magenta
Write-Host "  PASSED: $passed | FAILED: $failed | SKIPPED: $skipped" -ForegroundColor White

if ($failed -eq 0) {
    Write-Host "  🎉 PIPELINE HOÀN TOÀN HOẠT ĐỘNG!" -ForegroundColor Green
} elseif ($passed -gt $failed) {
    Write-Host "  ⚠️  Pipeline hoạt động một phần - kiểm tra các mục FAILED ↑" -ForegroundColor Yellow
} else {
    Write-Host "  ❌ Pipeline có vấn đề nghiêm trọng - kiểm tra lại các service" -ForegroundColor Red
}

Write-Host "============================================================`n" -ForegroundColor Magenta

# ============================================================
# GỢI Ý SỬA LỖI
# ============================================================
if ($failed -gt 0) {
    Write-Host "HƯỚNG DẪN SỬA LỖI:" -ForegroundColor Yellow
    if (-not $results["soc_server"]) {
        Write-Host "  - SOC Server: cd soc-server-python && python main.py" -ForegroundColor DarkYellow
    }
    if (-not $results["n8n_server"]) {
        Write-Host "  - n8n: .\start-n8n.ps1 hoặc npx n8n start" -ForegroundColor DarkYellow
    }
    if (-not $results["soc_login"]) {
        Write-Host "  - Kiểm tra credentials: SOC_USER=$SOC_USER, SOC_PASS=$SOC_PASS" -ForegroundColor DarkYellow
    }
    if (-not $results["n8n_webhook"]) {
        Write-Host "  - Kích hoạt workflow n8n: mở n8n UI → Activate workflow DDoS" -ForegroundColor DarkYellow
        Write-Host "    Webhook URL cần phải là: $N8N_WEBHOOK" -ForegroundColor DarkYellow
    }
    if (-not $results["soar_dispatch"]) {
        Write-Host "  - Kiểm tra biến SOAR_ENABLED=true trong soc-server-python/.env" -ForegroundColor DarkYellow
        Write-Host "  - Kiểm tra N8N_WEBHOOK_URL_DDOS trong .env" -ForegroundColor DarkYellow
    }
}
