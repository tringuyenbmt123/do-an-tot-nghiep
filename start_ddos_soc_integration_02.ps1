# ==============================================================================
# start_ddos_soc_integration.ps1
# Script khởi động DDoS Server tích hợp với SOC Infrastructure
#
# Sử dụng:
#   .\start_ddos_soc_integration.ps1
#
# Mô tả:
#   1. Lấy JWT token từ SOC Server đang chạy
#   2. Cập nhật SOC_API_TOKEN vào .env của CodeWebDDoS
#   3. Khởi động DDoS Server trong terminal mới
#   4. In lệnh chạy client_analyzer cho từng agent machine
# ==============================================================================

# Fix encoding - hiển thị đúng UTF-8 trên mọi terminal Windows
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$SOC_SERVER  = "http://localhost:8080"
$DDOS_DIR    = "$PSScriptRoot\CodeWebDDoS"
$ENV_FILE    = "$DDOS_DIR\.env"
$ADMIN_USER  = "admin"
$ADMIN_PASS  = "admin123"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  DDoS Server + SOC Integration Startup Script" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------
# Hàm hỗ trợ: lấy IP của interface có default gateway (tránh VMware/VBox)
# Sử dụng UDP connect trick tương tự Python: kết nối UDP tới 8.8.8.8,
# hệ điều hành tự chọn interface có default gateway, sau đó lấy IP từ đó.
# ------------------------------------------------------------------
function Get-GatewayIP {
    try {
        $udp = New-Object System.Net.Sockets.UdpClient
        $udp.Connect("8.8.8.8", 80)
        $ip = ($udp.Client.LocalEndPoint -as [System.Net.IPEndPoint]).Address.ToString()
        $udp.Close()
        return $ip
    } catch {
        # Dự phòng: lấy tất cả IPv4 không phải loopback, loại bỏ VMware/VBox/Hyper-V
        $virtualPatterns = @("vmware", "vmnet", "vethernet", "virtualbox", "hyper-v",
                             "npcap", "bluetooth", "teredo", "isatap", "loopback",
                             "docker", "wsl", "vpn", "zerotier")
        $candidates = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*"
        }
        foreach ($c in $candidates) {
            $adapterName = (Get-NetAdapter -InterfaceIndex $c.InterfaceIndex -ErrorAction SilentlyContinue).Name
            if (-not $adapterName) { continue }
            $isVirtual = $false
            foreach ($pat in $virtualPatterns) {
                if ($adapterName -match $pat) { $isVirtual = $true; break }
            }
            if (-not $isVirtual) {
                return $c.IPAddress
            }
        }
        return $null
    }
}

# ------------------------------------------------------------------
# BƯỚC 1: Lấy JWT token từ SOC Server
# ------------------------------------------------------------------
Write-Host "[1/4] Lấy JWT token từ SOC Server ($SOC_SERVER)..." -ForegroundColor Yellow

$jwt = ""
try {
    $loginBody = @{ username = $ADMIN_USER; password = $ADMIN_PASS } | ConvertTo-Json
    $loginResp = Invoke-RestMethod `
        -Uri "$SOC_SERVER/api/v1/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody `
        -TimeoutSec 10

    $jwt = if ($loginResp.access_token) { $loginResp.access_token }
           elseif ($loginResp.token) { $loginResp.token }
           else { "" }

    if ($jwt) {
        Write-Host "  [OK] Đã lấy được JWT token ($($jwt.Length) ký tự)" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Không lấy được token từ SOC Server. Phản hồi: $($loginResp | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [WARN] Không kết nối được SOC Server: $_" -ForegroundColor Yellow
    Write-Host "  [INFO] Tiếp tục mà không có token..." -ForegroundColor Gray
}

# ------------------------------------------------------------------
# BƯỚC 2: Cập nhật SOC_API_TOKEN vào .env
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[2/4] Cập nhật SOC_API_TOKEN vào $ENV_FILE..." -ForegroundColor Yellow

if (Test-Path $ENV_FILE) {
    $envContent = Get-Content $ENV_FILE -Raw
    if ($jwt) {
        $envContent = $envContent -replace "SOC_API_TOKEN=.*", "SOC_API_TOKEN=$jwt"
        Set-Content -Path $ENV_FILE -Value $envContent.TrimEnd() -NoNewline -Encoding UTF8
        Write-Host "  [OK] Đã cập nhật SOC_API_TOKEN vào .env" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] Không có token để cập nhật" -ForegroundColor Gray
    }
} else {
    Write-Host "  [WARN] Không tìm thấy $ENV_FILE" -ForegroundColor Yellow
}

# ------------------------------------------------------------------
# BƯỚC 3: Kiểm tra python-dotenv
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[3/4] Kiểm tra python-dotenv..." -ForegroundColor Yellow
$dotenvOk = python -c "import dotenv; print('ok')" 2>&1
if ($dotenvOk -eq "ok") {
    Write-Host "  [OK] python-dotenv đã sẵn sàng" -ForegroundColor Green
} else {
    Write-Host "  [INFO] Đang cài đặt python-dotenv..." -ForegroundColor Gray
    pip install python-dotenv --quiet
    Write-Host "  [OK] Đã cài đặt python-dotenv" -ForegroundColor Green
}

# ------------------------------------------------------------------
# BƯỚC 4: Lấy IP chính xác của SOC Master Server
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[4/4] Xác định IP chính của SOC Master Server..." -ForegroundColor Yellow

$myIP = Get-GatewayIP
if (-not $myIP) {
    Write-Host "  [WARN] Không tự động xác định được IP. Sử dụng IP mặc định từ .env" -ForegroundColor Yellow
    # Đọc từ .env nếu có
    if (Test-Path $ENV_FILE) {
        $n8nLine = Select-String -Path $ENV_FILE -Pattern "N8N_WEBHOOK_URL=" | Select-Object -First 1
        if ($n8nLine) {
            # Trích xuất IP từ URL: http://10.251.46.150:5678/...
            if ($n8nLine.Line -match "http://([0-9.]+):") {
                $myIP = $Matches[1]
            }
        }
    }
    if (-not $myIP) { $myIP = "10.251.46.150" }
}

Write-Host "  [OK] IP của SOC Master Server: $myIP" -ForegroundColor Green

# In tất cả interface để kiểm tra
Write-Host ""
Write-Host "  Danh sách interface (để kiểm tra):" -ForegroundColor Gray
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" } | ForEach-Object {
    $adapterName = (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Name
    $marker = if ($_.IPAddress -eq $myIP) { " <== ĐƯỢC CHỌN" } else { "" }
    Write-Host "    [$adapterName] $($_.IPAddress)$marker" -ForegroundColor $(if ($_.IPAddress -eq $myIP) { "Green" } else { "Gray" })
}

# ------------------------------------------------------------------
# BƯỚC 5: Khởi động DDoS Server
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[5/5] Khởi động DDoS Server tại $DDOS_DIR..." -ForegroundColor Yellow

$port5000InUse = netstat -ano 2>$null | Select-String ":5000 " | Select-String "LISTENING"
if ($port5000InUse) {
    Write-Host "  [INFO] Cổng 5000 đang được sử dụng - DDoS Server có thể đã chạy" -ForegroundColor Gray
    Write-Host "  Kiểm tra tình trạng: http://localhost:5000/api/receive_flow/health" -ForegroundColor Gray
} else {
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; cd '$DDOS_DIR'; Write-Host 'Starting CodeWebDDoS Server...' -ForegroundColor Cyan; python -m app.app"
    ) -WindowStyle Normal
    Write-Host "  [OK] Đã mở terminal mới cho DDoS Server" -ForegroundColor Green
    Write-Host "  [INFO] Chờ 15-20 giây để mô hình ML tải xong..." -ForegroundColor Gray
    Start-Sleep -Seconds 8
}

# ------------------------------------------------------------------
# Hiển thị lệnh chạy client_analyzer trên từng Agent
# ------------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  LỆNH CHẠY client_analyzer TRÊN CÁC AGENT MACHINES" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Endpoint của DDoS Server: http://${myIP}:5000/api/receive_flow" -ForegroundColor White
Write-Host ""
Write-Host "Chạy lệnh sau trên từng Agent Machine (thay agent-id):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  # Agent 01 (Win11):" -ForegroundColor Gray
Write-Host "  python client_analyzer.py --server http://${myIP}:5000/api/receive_flow --agent-id endpoint-win11-01" -ForegroundColor White
Write-Host ""
Write-Host "  # Agent 02 (Win10):" -ForegroundColor Gray
Write-Host "  python client_analyzer.py --server http://${myIP}:5000/api/receive_flow --agent-id endpoint-win10-02" -ForegroundColor White
Write-Host ""
Write-Host "  # Agent 03 (Linux/Kali):" -ForegroundColor Gray
Write-Host "  python client_analyzer.py --server http://${myIP}:5000/api/receive_flow --agent-id endpoint-kali-03" -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------------
# Kiểm tra kết nối cuối cùng
# ------------------------------------------------------------------
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  KIỂM TRA KẾT NỐI" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Kiểm tra tình trạng DDoS Server
try {
    $healthResp = Invoke-RestMethod -Uri "http://localhost:5000/api/receive_flow/health" -TimeoutSec 5
    Write-Host "  [OK] DDoS Server đang chạy | analyzer_ready=$($healthResp.analyzer_ready)" -ForegroundColor Green
} catch {
    Write-Host "  [INFO] DDoS Server chưa sẵn sàng - mô hình ML đang tải (chờ thêm 10-15 giây)" -ForegroundColor Yellow
}

# Kiểm tra SOC Server (thử nhiều endpoint)
$socOk = $false
foreach ($endpoint in @("$SOC_SERVER/health", "$SOC_SERVER/api/v1/agents")) {
    try {
        Invoke-RestMethod -Uri $endpoint -TimeoutSec 3 | Out-Null
        Write-Host "  [OK] SOC Server đang chạy ($endpoint)" -ForegroundColor Green
        $socOk = $true; break
    } catch { }
}
if (-not $socOk) {
    Write-Host "  [WARN] SOC Server không phản hồi. Hãy kiểm tra lại terminal soc-server-python." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  TÍCH HỢP HOÀN TẤT!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  DDoS Server : http://localhost:5000" -ForegroundColor White
Write-Host "  SOC Server  : $SOC_SERVER" -ForegroundColor White
Write-Host "  n8n SOAR    : http://10.251.46.150:5678" -ForegroundColor White
Write-Host "  Agent IP    : $myIP (sử dụng IP này trong tham số --server của client_analyzer)" -ForegroundColor Cyan
Write-Host ""