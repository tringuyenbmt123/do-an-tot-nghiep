# ==============================================================================
# start-n8n.ps1 - Khoi dong n8n SOAR voi IP tu dong
# Chay bang: .\start-n8n.ps1  (tai thu muc goc du an)
# ==============================================================================

$projectDir = $PSScriptRoot
if (-not $projectDir) { $projectDir = (Get-Location).Path }

Write-Host "=== n8n SOAR Auto-Start Script ===" -ForegroundColor Cyan
Write-Host "Thu muc du an: $projectDir" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# 1. Tu dong lay IP may theo thu tu uu tien:
#    Wi-Fi > Ethernet > VMnet (bo qua Loopback/Docker/vEthernet/VMware)
# ------------------------------------------------------------------------------
$preferredIPs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch "Loopback|Docker|vEthernet|VMnet|Hyper-V|WSL" -and
    $_.PrefixOrigin -ne "WellKnown" -and
    $_.IPAddress -ne "127.0.0.1" -and
    $_.IPAddress -notmatch "^169\."   # bo qua APIPA
} | Sort-Object { if ($_.InterfaceAlias -match "Wi-Fi") { 0 } else { 1 } }, InterfaceMetric

$ip = ($preferredIPs | Select-Object -First 1).IPAddress

if (-not $ip) {
    # Fallback: dung VMnet neu co
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.InterfaceAlias -match "VMnet" -and $_.IPAddress -ne "127.0.0.1"
    } | Select-Object -First 1).IPAddress
}

if (-not $ip) {
    Write-Host "CANH BAO: Khong tim duoc IP! Su dung localhost." -ForegroundColor Yellow
    $ip = "localhost"
}

Write-Host "IP su dung cho n8n: $ip" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2. Cap nhat file .env (goc du an) - Docker Compose doc tu day
# ------------------------------------------------------------------------------
$envPath = Join-Path $projectDir ".env"
$envContent = "N8N_HOST=$ip"
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "Da cap nhat .env: N8N_HOST=$ip" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 3. Dung container n8n cu neu dang chay, giu lai volumes (data khong mat)
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "Dang dung container n8n cu (giu lai data)..." -ForegroundColor Yellow
& docker stop soc-n8n 2>$null | Out-Null
& docker rm soc-n8n 2>$null | Out-Null

# Kill bat ky container nao dang dung port 5678 (tranh loi "port already allocated")
$conflictContainers = & docker ps -q --filter "publish=5678" 2>$null
if ($conflictContainers) {
    Write-Host "Phat hien container khac dang dung port 5678, dang dung..." -ForegroundColor Yellow
    $conflictContainers | ForEach-Object {
        $name = (& docker inspect --format "{{.Name}}" $_).TrimStart('/')
        Write-Host "  Dung: $name ($_)" -ForegroundColor Gray
        & docker stop $_ 2>$null | Out-Null
        & docker rm $_ 2>$null | Out-Null
    }
}

# ------------------------------------------------------------------------------
# 4. Khoi dong lai n8n qua docker compose (chi restart n8n, giu services khac)
# ------------------------------------------------------------------------------
Write-Host "Dang khoi dong n8n voi IP $ip..." -ForegroundColor Yellow
Set-Location $projectDir
& docker compose up -d n8n

if ($LASTEXITCODE -ne 0) {
    Write-Host "LOI: Khoi dong n8n that bai! Kiem tra docker compose." -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------------------------
# 5. Cho n8n san sang (toi da 60 giay)
# ------------------------------------------------------------------------------
Write-Host "Dang cho n8n khoi dong xong..." -ForegroundColor Yellow
$maxWait = 60
$waited = 0
$ready = $false

while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 3
    $waited += 3
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:5678/healthz" -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch { }
    Write-Host "  Cho... ($waited/$maxWait giay)" -ForegroundColor Gray
}

if (-not $ready) {
    Write-Host "CANH BAO: n8n chua san sang sau $maxWait giay. Tiep tuc..." -ForegroundColor Yellow
} else {
    Write-Host "n8n da san sang!" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 6. Tu dong import workflow JSON vao n8n qua CLI
# ------------------------------------------------------------------------------
$workflowFile = Join-Path $projectDir "SOC SOAR - SOC Server Tot nghiep.json"

if (Test-Path $workflowFile) {
    Write-Host ""
    Write-Host "Dang import workflow vao n8n..." -ForegroundColor Yellow

    # Chay n8n CLI ben trong container de import
    $containerPath = "/workflows/SOC SOAR - SOC Server Tot nghiep.json"
    $importResult = & docker exec soc-n8n n8n import:workflow "--input=$containerPath" 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Import workflow thanh cong!" -ForegroundColor Green
        Write-Host $importResult -ForegroundColor Gray
    } else {
        Write-Host "CANH BAO: Import workflow that bai. Hay import thu cong trong n8n UI." -ForegroundColor Yellow
        Write-Host $importResult -ForegroundColor Gray
    }
} else {
    Write-Host "CANH BAO: Khong tim thay file workflow." -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# 7. Hien thi thong tin ket noi
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  n8n SOAR DA KHOI DONG XONG!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Giao dien n8n   : http://${ip}:5678" -ForegroundColor White
Write-Host "  Webhook test URL: http://${ip}:5678/webhook-test/<path>" -ForegroundColor White
Write-Host "  Webhook prod URL: http://${ip}:5678/webhook/<path>" -ForegroundColor White
Write-Host ""
Write-Host "  Webhook paths:" -ForegroundColor Yellow
Write-Host "   DDoS    -> http://${ip}:5678/webhook-test/ddos-alert" -ForegroundColor Gray
Write-Host "   Phishing-> http://${ip}:5678/webhook-test/phishing-alert" -ForegroundColor Gray
Write-Host "   Generic -> http://${ip}:5678/webhook-test/soc-alert" -ForegroundColor Gray
Write-Host ""
Write-Host "  Test nhanh DDoS:" -ForegroundColor Yellow
Write-Host "   curl -X POST http://${ip}:5678/webhook-test/ddos-alert ``" -ForegroundColor Gray
Write-Host "     -H 'Content-Type: application/json' ``" -ForegroundColor Gray
Write-Host "     -d '{""alert_id"":""test-001"",""event_type"":""ddos_detected"",""severity"":""critical"",""src_ip"":""1.2.3.4""}'" -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor Cyan
