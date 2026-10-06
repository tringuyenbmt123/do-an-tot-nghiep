# ==============================================================================
# SOC/EDR Agent - PowerShell Installer
# ==============================================================================

param(
    [string]$ServerUrl = "localhost:50051",
    [string]$AgentId = "",
    [string]$SecretKey = "soc-agent-secret-token-2026"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "           SOC/EDR PYTHON AGENT INSTALLER (POWERSHELL)" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

# Check Admin
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Loi: Ban phai chay script nay voi quyen Administrator." -ForegroundColor Red
    exit 1
}

$DestDir = "C:\SOC-Agent"

Write-Host "[1/4] Kiem tra Python..." -ForegroundColor Yellow
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Khong tim thay Python. Vui long cai dat Python 3.10+." -ForegroundColor Red
    exit 1
}

Write-Host "[2/4] Sao chep file toi $DestDir..." -ForegroundColor Yellow
if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
}
Copy-Item -Path .\* -Destination $DestDir -Recurse -Force

Set-Location $DestDir

Write-Host "[3/4] Cai dat dependencies (venv)..." -ForegroundColor Yellow
python -m venv venv
& .\venv\Scripts\python.exe -m pip install --upgrade pip | Out-Null
& .\venv\Scripts\pip.exe install -r requirements.txt | Out-Null

Write-Host "[4/4] Tao file cau hinh config.json..." -ForegroundColor Yellow
$config = @{
    server_url = $ServerUrl
    agent_id = $AgentId
    agent_secret_key = $SecretKey
    heartbeat_interval_seconds = 5
    metric_interval_seconds = 1
    fim_enabled = $true
}
$config | ConvertTo-Json -Depth 2 | Out-File -FilePath "$DestDir\config.json" -Encoding UTF8

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "    CAI DAT THANH CONG!" -ForegroundColor Green
Write-Host "    Thu muc cai dat: $DestDir" -ForegroundColor Green
Write-Host "    De chay Agent: C:\SOC-Agent\venv\Scripts\python.exe C:\SOC-Agent\main.py" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
