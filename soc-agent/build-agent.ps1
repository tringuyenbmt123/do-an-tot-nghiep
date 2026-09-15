# ==============================================================================
# SOC/EDR Agent - Build & Package Script
# ==============================================================================

param(
    [string]$Version    = "v1.0.0",
    [string]$ServerIP   = "",
    [string]$SecretKey  = "soc-agent-secret-token-2026",
    [switch]$WindowsOnly,
    [switch]$LinuxOnly,
    [switch]$SkipClean
)

$ErrorActionPreference = "Stop"

function Write-Step  { param($msg) Write-Host "`n  $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Fail  { param($msg) Write-Host "   FAIL: $msg" -ForegroundColor Red }
function Write-Info  { param($msg) Write-Host "   INFO: $msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "   SOC/EDR Agent - Build & Package Script" -ForegroundColor Magenta
Write-Host "   Version: $Version" -ForegroundColor Magenta
if ($ServerIP) {
    Write-Host "   Server IP: $ServerIP" -ForegroundColor Magenta
}
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""

Write-Step "Kiem tra moi truong..."
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Fail "Khong tim thay 'go'. Hay cai Go tu https://go.dev/dl/"
    exit 1
}
Write-OK "Go: $(go version)"

$ProjectRoot = $PSScriptRoot
$BinDir      = Join-Path $ProjectRoot "bin"
$ReleaseDir  = Join-Path $ProjectRoot "release"

if (-not $SkipClean) {
    Write-Step "Don dep thu muc cu..."
    if (Test-Path $BinDir)     { Remove-Item $BinDir     -Recurse -Force; Write-OK "Da xoa bin/" }
    if (Test-Path $ReleaseDir) { Remove-Item $ReleaseDir -Recurse -Force; Write-OK "Da xoa release/" }
}

New-Item -ItemType Directory -Force -Path $BinDir     | Out-Null
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

# Ham tu dong lay dia chi IP LAN thuc te cua may
function Get-LocalIPv4 {
    try {
        $sock = New-Object System.Net.Sockets.UdpClient
        $sock.Connect("8.8.8.8", 80)
        $detectedIP = $sock.Client.LocalEndPoint.Address.ToString()
        $sock.Close()
        if ($detectedIP -and $detectedIP -ne "127.0.0.1") {
            return $detectedIP
        }
    } catch {}

    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
           Where-Object { 
               $_.IPAddress -notlike "127.*" -and 
               $_.IPAddress -notlike "169.254.*" -and 
               $_.InterfaceAlias -notlike "*Loopback*" -and 
               $_.InterfaceAlias -notlike "*vEthernet*" -and
               $_.InterfaceAlias -notlike "*VMware*" -and
               $_.InterfaceAlias -notlike "*Virtual*"
           }
    if ($ips) {
        return ($ips | Select-Object -First 1).IPAddress
    }
    return "127.0.0.1"
}

if (-not $ServerIP) {
    $ServerIP = Get-LocalIPv4
    Write-Info "Tu dong phat hien IP may chu: $ServerIP"
}
$GrpcEndpoint = "$($ServerIP):50051"

$ConfigTemplate = @{
    server_url                     = "SOC_SERVER_IP:50051"
    protocol                       = "grpc"
    agent_id                       = "HOSTNAME-will-auto-detect"
    agent_secret_key               = $SecretKey
    heartbeat_interval_seconds     = 5
    metric_interval_seconds        = 1
    max_backoff_seconds            = 30
    buffer_size                    = 1000
    log_paths                      = @()
    fim_enabled                    = $true
    fim_paths                      = @("C:\Windows\System32\drivers", "C:\Users\Public")
    metrics_enabled                = $true
    log_tailer_enabled             = $true
    process_monitor_enabled        = $false
    process_poll_interval_seconds  = 5
    process_exclude_names          = @("System Idle Process", "svchost.exe")
    network_monitor_enabled        = $false
    network_poll_interval_seconds  = 10
    mtls_enabled                   = $false
    ca_cert_path                   = ""
    client_cert_path               = ""
    client_key_path                = ""
}

# Ham luu file JSON khong co BOM (tranh loi '\ufeff' khi Go doc file)
function Save-JsonNoBom {
    param([object]$Data, [string]$Path)
    $json = $Data | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

Write-Step "Tai Go modules (go mod tidy)..."
Set-Location $ProjectRoot
go mod tidy
if ($LASTEXITCODE -ne 0) { Write-Fail "go mod tidy that bai!"; exit 1 }
Write-OK "Modules da duoc cap nhat"

# Build Windows
if (-not $LinuxOnly) {
    Write-Step "Build soc-agent.exe (Windows/amd64)..."
    $env:GOOS   = "windows"
    $env:GOARCH = "amd64"
    go build -ldflags="-s -w -X main.Version=$Version" -o "$BinDir\soc-agent.exe" .
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build Windows that bai!"; exit 1 }
    $agentItem = Get-Item "$BinDir\soc-agent.exe"
    $sizeMB = [math]::Round($agentItem.Length / 1MB, 1)
    Write-OK "soc-agent.exe ($sizeMB MB)"
}

# Build Linux
if (-not $WindowsOnly) {
    Write-Step "Build soc-agent-linux (Linux/amd64)..."
    $env:GOOS   = "linux"
    $env:GOARCH = "amd64"
    go build -ldflags="-s -w -X main.Version=$Version" -o "$BinDir\soc-agent-linux" .
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build Linux that bai!"; exit 1 }
    $agentItem = Get-Item "$BinDir\soc-agent-linux"
    $sizeMB = [math]::Round($agentItem.Length / 1MB, 1)
    Write-OK "soc-agent-linux ($sizeMB MB)"
}

Remove-Item Env:\GOOS   -ErrorAction SilentlyContinue
Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue

# Package Windows
if (-not $LinuxOnly) {
    Write-Step "Dong goi Windows package..."
    $WinPkg = Join-Path $ReleaseDir "soc-agent-windows-$Version"
    New-Item -ItemType Directory -Force -Path $WinPkg | Out-Null

    Copy-Item "$BinDir\soc-agent.exe" "$WinPkg\"
    Save-JsonNoBom -Data $ConfigTemplate -Path "$WinPkg\config.json"

    $installPs1Content = @'
param(
    [string]$ServerIP = "",
    [string]$AgentID = "",
    [string]$InstallDir = "C:\Program Files\SOC-Agent",
    [string]$ServiceName = "SOCAgent"
)

$ErrorActionPreference = "Stop"

# Mo khoa tat ca file neu bi Windows chan (Mark-of-the-Web / Zone.Identifier)
Get-ChildItem -Path $PSScriptRoot -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: Ban can chay script nay voi quyen Administrator!" -ForegroundColor Red
    Write-Host "       Click phai vao PowerShell -> Run as Administrator" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   SOC/EDR Agent - Windows Installer" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/5] Cau hinh Agent..." -ForegroundColor Yellow
$configPath = Join-Path $PSScriptRoot "config.json"

if (Test-Path $configPath) {
    $config = Get-Content $configPath | ConvertFrom-Json
    
    # Neu truyen tham so -ServerIP thi dung tham so do
    if ($ServerIP) {
        $config.server_url = "$($ServerIP):50051"
    } elseif ($config.server_url -like "*SOC_SERVER_IP*" -or -not $config.server_url) {
        $inputIP = Read-Host "   Nhap IP cua SOC Server"
        if ($inputIP) {
            $config.server_url = "$($inputIP):50051"
        }
    }
    
    # Agent ID
    if ($AgentID) {
        $config.agent_id = $AgentID
    } elseif ($config.agent_id -like "*will-auto-detect*" -or -not $config.agent_id) {
        $config.agent_id = $env:COMPUTERNAME.ToLower() + "-" + [System.Guid]::NewGuid().ToString().Substring(0, 6)
    }
    
    Write-Host "   OK: Server: $($config.server_url)" -ForegroundColor Green
    Write-Host "   OK: Agent ID: $($config.agent_id)" -ForegroundColor Green
} else {
    Write-Host "   ERROR: Khong tim thay config.json ben canh installer!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/5] Tao thu muc $InstallDir..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host "[3/5] Copy files..." -ForegroundColor Yellow
Copy-Item (Join-Path $PSScriptRoot "soc-agent.exe") "$InstallDir\soc-agent.exe" -Force
# Mo khoa file trong thu muc dich de dam bao chay duoc
Get-ChildItem -Path $InstallDir -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
# Luu config.json khong co BOM de tranh loi parse '\ufeff'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("$InstallDir\config.json", ($config | ConvertTo-Json -Depth 10), $utf8NoBom)
Write-Host "   OK: Da copy soc-agent.exe va config.json" -ForegroundColor Green

Write-Host "`n[4/5] Cai dat Windows Service '$ServiceName'..." -ForegroundColor Yellow
$exePath = "$InstallDir\soc-agent.exe"

$existingSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingSvc) {
    if ($existingSvc.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
    }
    & "$InstallDir\soc-agent.exe" -service uninstall 2>$null
    Start-Sleep -Seconds 1
}

& $exePath -service install
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ERROR: Cai Windows Service that bai!" -ForegroundColor Red
    exit 1
}
Write-Host "   OK: Service '$ServiceName' da duoc cai" -ForegroundColor Green

Write-Host "`n[5/5] Khoi dong service..." -ForegroundColor Yellow
Start-Service -Name $ServiceName
Start-Sleep -Seconds 2
$svc = Get-Service -Name $ServiceName
Write-Host "   Trang thai: $($svc.Status)" -ForegroundColor $(if ($svc.Status -eq "Running") { "Green" } else { "Red" })

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   CAI DAT HOAN THANH!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Agent ID : $($config.agent_id)"
Write-Host "   Server   : $($config.server_url)"
Write-Host "   Log file : $InstallDir\agent.log"
Write-Host "   Config   : $InstallDir\config.json"
Write-Host ""
Write-Host "   Quan ly service:" -ForegroundColor Yellow
Write-Host "     Start: net start $ServiceName"
Write-Host "     Stop : net stop  $ServiceName"
Write-Host "     Go   : soc-agent.exe -service uninstall"
Write-Host ""
'@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText("$WinPkg\install-agent.ps1", $installPs1Content, $utf8NoBom)

    $batContent = @"
@echo off
echo.
echo Dang mo khoa va cai dat SOC/EDR Agent...
echo Yeu cau quyen Administrator!
echo.
PowerShell -ExecutionPolicy Bypass -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue; & '%~dp0install-agent.ps1'"
pause
"@
    $batContent | Out-File -FilePath "$WinPkg\INSTALL.bat" -Encoding ASCII

    $readmeContent = @"
# SOC/EDR Agent $Version - Windows Package

## Cai dat nhanh (Windows)

1. Double-click vao file `INSTALL.bat` (chon "Run as Administrator")
2. Script se tu dong copy vao C:\Program Files\SOC-Agent va khoi dong Windows Service!

## Quan ly
- Start: net start SOCAgent
- Stop:  net stop SOCAgent
- Log:   C:\Program Files\SOC-Agent\agent.log
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText("$WinPkg\README.md", $readmeContent, $utf8NoBom)

    $WinZip = Join-Path $ReleaseDir "soc-agent-windows-$Version.zip"
    Compress-Archive -Path "$WinPkg\*" -DestinationPath $WinZip -Force
    $zipItem = Get-Item $WinZip
    $zipMB = [math]::Round($zipItem.Length / 1MB, 1)
    Write-OK "soc-agent-windows-$Version.zip ($zipMB MB)"
}

# Package Linux
if (-not $WindowsOnly) {
    Write-Step "Dong goi Linux package..."
    $LinuxPkg = Join-Path $ReleaseDir "soc-agent-linux-$Version"
    New-Item -ItemType Directory -Force -Path $LinuxPkg | Out-Null

    Copy-Item "$BinDir\soc-agent-linux" "$LinuxPkg\soc-agent"

    $LinuxConfig = $ConfigTemplate.Clone()
    $LinuxConfig.fim_paths = @("/etc", "/usr/bin", "/var/log")
    Save-JsonNoBom -Data $LinuxConfig -Path "$LinuxPkg\config.json"

    $serviceContent = @"
[Unit]
Description=SOC/EDR Endpoint Agent $Version
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/soc-agent
ExecStart=/opt/soc-agent/soc-agent -config /opt/soc-agent/config.json
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText("$LinuxPkg\soc-agent.service", $serviceContent, $utf8NoBom)

    $shContent = @'
#!/bin/bash
set -e
INSTALL_DIR="/opt/soc-agent"
SERVICE_NAME="soc-agent"

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: Chay voi sudo: sudo bash install-agent.sh"
    exit 1
fi

CONFIG_FILE="$(dirname $0)/config.json"
mkdir -p "$INSTALL_DIR"
cp soc-agent "$INSTALL_DIR/"
cp config.json "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/soc-agent"

cp soc-agent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME
sleep 2
systemctl status $SERVICE_NAME --no-pager
'@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText("$LinuxPkg\install-agent.sh", $shContent, $utf8NoBom)

    $LinuxZip = Join-Path $ReleaseDir "soc-agent-linux-$Version.zip"
    Compress-Archive -Path "$LinuxPkg\*" -DestinationPath $LinuxZip -Force
    $zipItem = Get-Item $LinuxZip
    $zipMB = [math]::Round($zipItem.Length / 1MB, 1)
    Write-OK "soc-agent-linux-$Version.zip ($zipMB MB)"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   BUILD AGENT HOAN TAT!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
