# ==============================================================================
# start_ddos_soc_integration.ps1
# Script khoi dong DDoS Server tich hop voi SOC Infrastructure
#
# Su dung:
#   .\start_ddos_soc_integration.ps1
#
# Mo ta:
#   1. Lay JWT token tu SOC Server dang chay
#   2. Cap nhat SOC_API_TOKEN vao .env cua CodeWebDDoS
#   3. Khoi dong DDoS Server trong terminal moi
#   4. In lenh chay client_analyzer cho tung agent machine
# ==============================================================================

# Fix encoding - hien thi dung UTF-8 tren moi terminal Windows
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
# Helper: lay IP cua interface co default gateway (tranh VMware/VBox)
# Su dung UDP connect trick tuong tu Python: ket noi UDP toi 8.8.8.8,
# OS tu chon interface co default gateway, lay IP tu do.
# ------------------------------------------------------------------
function Get-GatewayIP {
    try {
        $udp = New-Object System.Net.Sockets.UdpClient
        $udp.Connect("8.8.8.8", 80)
        $ip = ($udp.Client.LocalEndPoint -as [System.Net.IPEndPoint]).Address.ToString()
        $udp.Close()
        return $ip
    } catch {
        # Fallback: lay tat ca IPv4 non-loopback, loai bo VMware/VBox/Hyper-V
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
# STEP 1: Lay JWT token tu SOC Server
# ------------------------------------------------------------------
Write-Host "[1/4] Lay JWT token tu SOC Server ($SOC_SERVER)..." -ForegroundColor Yellow

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
        Write-Host "  [OK] Da lay duoc JWT token ($($jwt.Length) ky tu)" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Khong lay duoc token tu SOC Server. Response: $($loginResp | ConvertTo-Json)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [WARN] Khong ket noi duoc SOC Server: $_" -ForegroundColor Yellow
    Write-Host "  [INFO] Tiep tuc khong co token..." -ForegroundColor Gray
}

# ------------------------------------------------------------------
# STEP 2: Cap nhat SOC_API_TOKEN vao .env
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[2/4] Cap nhat SOC_API_TOKEN vao $ENV_FILE..." -ForegroundColor Yellow

if (Test-Path $ENV_FILE) {
    $envContent = Get-Content $ENV_FILE -Raw
    if ($jwt) {
        $envContent = $envContent -replace "SOC_API_TOKEN=.*", "SOC_API_TOKEN=$jwt"
        Set-Content -Path $ENV_FILE -Value $envContent.TrimEnd() -NoNewline -Encoding UTF8
        Write-Host "  [OK] Da cap nhat SOC_API_TOKEN vao .env" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP] Khong co token de cap nhat" -ForegroundColor Gray
    }
} else {
    Write-Host "  [WARN] Khong tim thay $ENV_FILE" -ForegroundColor Yellow
}

# ------------------------------------------------------------------
# STEP 3: Kiem tra python-dotenv
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[3/4] Kiem tra python-dotenv..." -ForegroundColor Yellow
$dotenvOk = python -c "import dotenv; print('ok')" 2>&1
if ($dotenvOk -eq "ok") {
    Write-Host "  [OK] python-dotenv san sang" -ForegroundColor Green
} else {
    Write-Host "  [INFO] Cai python-dotenv..." -ForegroundColor Gray
    pip install python-dotenv --quiet
    Write-Host "  [OK] Da cai python-dotenv" -ForegroundColor Green
}

# ------------------------------------------------------------------
# STEP 4: Lay IP chinh xac cua SOC Master Server
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[4/4] Xac dinh IP chinh cua SOC Master Server..." -ForegroundColor Yellow

$myIP = Get-GatewayIP
if (-not $myIP) {
    Write-Host "  [WARN] Khong tu dong xac dinh duoc IP. Dung IP mac dinh tu .env" -ForegroundColor Yellow
    # Doc tu .env neu co
    if (Test-Path $ENV_FILE) {
        $n8nLine = Select-String -Path $ENV_FILE -Pattern "N8N_WEBHOOK_URL=" | Select-Object -First 1
        if ($n8nLine) {
            # Trich xuat IP tu URL: http://10.251.46.150:5678/...
            if ($n8nLine.Line -match "http://([0-9.]+):") {
                $myIP = $Matches[1]
            }
        }
    }
    if (-not $myIP) { $myIP = "10.251.46.150" }
}

Write-Host "  [OK] SOC Master Server IP: $myIP" -ForegroundColor Green

# In tat ca interface de kiem tra
Write-Host ""
Write-Host "  Danh sach interface (de kiem tra):" -ForegroundColor Gray
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" } | ForEach-Object {
    $adapterName = (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Name
    $marker = if ($_.IPAddress -eq $myIP) { " <== CHON" } else { "" }
    Write-Host "    [$adapterName] $($_.IPAddress)$marker" -ForegroundColor $(if ($_.IPAddress -eq $myIP) { "Green" } else { "Gray" })
}

# ------------------------------------------------------------------
# STEP 5: Khoi dong DDoS Server
# ------------------------------------------------------------------
Write-Host ""
Write-Host "[5/5] Khoi dong DDoS Server tai $DDOS_DIR..." -ForegroundColor Yellow

$port5000InUse = netstat -ano 2>$null | Select-String ":5000 " | Select-String "LISTENING"
if ($port5000InUse) {
    Write-Host "  [INFO] Port 5000 dang duoc su dung - DDoS Server co the da chay" -ForegroundColor Gray
    Write-Host "  Health check: http://localhost:5000/api/receive_flow/health" -ForegroundColor Gray
} else {
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; cd '$DDOS_DIR'; Write-Host 'Starting CodeWebDDoS Server...' -ForegroundColor Cyan; python -m app.app"
    ) -WindowStyle Normal
    Write-Host "  [OK] Da mo terminal moi cho DDoS Server" -ForegroundColor Green
    Write-Host "  [INFO] Doi 15-20 giay de ML model tai xong..." -ForegroundColor Gray
    Start-Sleep -Seconds 8
}

# ------------------------------------------------------------------
# Hien thi lenh chay client_analyzer tren tung Agent
# ------------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  LENH CHAY client_analyzer TREN CAC AGENT MACHINES" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "DDoS Server endpoint: http://${myIP}:5000/api/receive_flow" -ForegroundColor White
Write-Host ""
Write-Host "Chay lenh sau tren moi Agent Machine (thay agent-id):" -ForegroundColor Yellow
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
# Kiem tra ket noi cuoi cung
# ------------------------------------------------------------------
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  KIEM TRA KET NOI" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# DDoS Server health
try {
    $healthResp = Invoke-RestMethod -Uri "http://localhost:5000/api/receive_flow/health" -TimeoutSec 5
    Write-Host "  [OK] DDoS Server dang chay | analyzer_ready=$($healthResp.analyzer_ready)" -ForegroundColor Green
} catch {
    Write-Host "  [INFO] DDoS Server chua ready - ML model dang tai (doi them 10-15s)" -ForegroundColor Yellow
}

# SOC Server check (thu nhieu endpoint)
$socOk = $false
foreach ($endpoint in @("$SOC_SERVER/health", "$SOC_SERVER/api/v1/agents")) {
    try {
        Invoke-RestMethod -Uri $endpoint -TimeoutSec 3 | Out-Null
        Write-Host "  [OK] SOC Server dang chay ($endpoint)" -ForegroundColor Green
        $socOk = $true; break
    } catch { }
}
if (-not $socOk) {
    Write-Host "  [WARN] SOC Server khong phan hoi. Kiem tra lai terminal soc-server-python." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  Tich hop hoan tat!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  DDoS Server : http://localhost:5000" -ForegroundColor White
Write-Host "  SOC Server  : $SOC_SERVER" -ForegroundColor White
Write-Host "  n8n SOAR    : http://10.251.46.150:5678" -ForegroundColor White
Write-Host "  Agent IP    : $myIP (dung IP nay trong --server cua client_analyzer)" -ForegroundColor Cyan
Write-Host ""
