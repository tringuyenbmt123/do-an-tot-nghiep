# ==============================================================================
# 🛠️  SOC/EDR Server — Build & Package Script
# Chay lenh: .\build-server.ps1
# ==============================================================================

param(
    [string]$Version = "v1.0.0",
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
Write-Host "   SOC/EDR Server - Build & Package Script" -ForegroundColor Magenta
Write-Host "   Version: $Version" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""

# Kiem tra Go
Write-Step "Kiem tra moi truong..."
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Fail "Khong tim thay 'go'. Hay cai Go tu https://go.dev/dl/"
    exit 1
}
$goVersion = (go version)
Write-OK "Go: $goVersion"

# Chuan bi thu muc
$ProjectRoot   = $PSScriptRoot
$BinDir        = Join-Path $ProjectRoot "bin"
$ReleaseDir    = Join-Path $ProjectRoot "release"
$ConfigSrc     = Join-Path $ProjectRoot "configs"

if (-not $SkipClean) {
    Write-Step "Don dep thu muc cu..."
    if (Test-Path $BinDir)     { Remove-Item $BinDir     -Recurse -Force; Write-OK "Da xoa bin/" }
    if (Test-Path $ReleaseDir) { Remove-Item $ReleaseDir -Recurse -Force; Write-OK "Da xoa release/" }
}

New-Item -ItemType Directory -Force -Path $BinDir     | Out-Null
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

# Tai dependencies
Write-Step "Tai Go modules (go mod tidy)..."
Set-Location $ProjectRoot
go mod tidy
if ($LASTEXITCODE -ne 0) { Write-Fail "go mod tidy that bai!"; exit 1 }
Write-OK "Modules da duoc cap nhat"

# Build Windows .exe
if (-not $LinuxOnly) {
    Write-Step "Build soc-server.exe (Windows/amd64)..."
    $env:GOOS   = "windows"
    $env:GOARCH = "amd64"
    go build -ldflags="-s -w -X main.Version=$Version" -o "$BinDir\soc-server.exe" ./cmd/server/main.go
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build Windows that bai!"; exit 1 }
    $sizeMB = [math]::Round((Get-Item "$BinDir\soc-server.exe").Length / 1MB, 1)
    Write-OK "soc-server.exe ($sizeMB MB)"
}

# Build Linux binary
if (-not $WindowsOnly) {
    Write-Step "Build soc-server-linux (Linux/amd64)..."
    $env:GOOS   = "linux"
    $env:GOARCH = "amd64"
    go build -ldflags="-s -w -X main.Version=$Version" -o "$BinDir\soc-server-linux" ./cmd/server/main.go
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build Linux that bai!"; exit 1 }
    $sizeMB = [math]::Round((Get-Item "$BinDir\soc-server-linux").Length / 1MB, 1)
    Write-OK "soc-server-linux ($sizeMB MB)"
}

Remove-Item Env:\GOOS   -ErrorAction SilentlyContinue
Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue

# Dong goi Release Windows
if (-not $LinuxOnly) {
    Write-Step "Dong goi release-windows..."
    $WinDir = Join-Path $ReleaseDir "soc-server-windows-$Version"
    New-Item -ItemType Directory -Force -Path $WinDir | Out-Null

    Copy-Item "$BinDir\soc-server.exe" "$WinDir\"
    Copy-Item $ConfigSrc "$WinDir\configs" -Recurse

    @"
@echo off
echo Starting SOC/EDR Server $Version...
soc-server.exe
pause
"@ | Out-File -FilePath "$WinDir\start-server.bat" -Encoding ASCII

    $deployContent = @"
# SOC/EDR Server $Version - Windows Package

## Cai dat nhanh

1. Chinh sua file `configs\config.yaml`:
   - database.host, database.user, database.password, database.dbname
   - redis.address
   - soar.n8n_webhook_url (neu dung n8n)

2. Dam bao MySQL va Redis dang chay.

3. Chay server:
   soc-server.exe
   hoac double-click start-server.bat

## Cong mac dinh
- REST API:    8080
- gRPC Agent:  50051

## Yeu cau
- Windows Server 2016+ hoac Windows 10+
- MySQL 8.0+
- Redis 6+
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText("$WinDir\DEPLOY.md", $deployContent, $utf8NoBom)

    $WinZip = Join-Path $ReleaseDir "soc-server-windows-$Version.zip"
    Compress-Archive -Path "$WinDir\*" -DestinationPath $WinZip -Force
    $zipMB = [math]::Round((Get-Item $WinZip).Length / 1MB, 1)
    Write-OK "soc-server-windows-$Version.zip ($zipMB MB)"
}

# Dong goi Release Linux
if (-not $WindowsOnly) {
    Write-Step "Dong goi release-linux..."
    $LinuxDir = Join-Path $ReleaseDir "soc-server-linux-$Version"
    New-Item -ItemType Directory -Force -Path $LinuxDir | Out-Null

    Copy-Item "$BinDir\soc-server-linux" "$LinuxDir\soc-server"
    Copy-Item $ConfigSrc "$LinuxDir\configs" -Recurse

$serviceContent = @"
[Unit]
Description=SOC/EDR Server $Version
After=network.target mysqld.service redis.service

[Service]
Type=simple
User=soc
WorkingDirectory=/opt/soc-server
ExecStart=/opt/soc-server/soc-server
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText("$LinuxDir\soc-server.service", $serviceContent, $utf8NoBom)

$installShContent = @'
#!/bin/bash
# Script cai dat SOC/EDR Server tren Linux
set -e

INSTALL_DIR="/opt/soc-server"
SERVICE_USER="soc"

echo "SOC/EDR Server Installer"
echo "===================================="

if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -r -s /bin/false $SERVICE_USER
    echo "OK: Tao user '$SERVICE_USER'"
fi

mkdir -p "$INSTALL_DIR"
cp soc-server     "$INSTALL_DIR/"
cp -r configs     "$INSTALL_DIR/"
chmod +x          "$INSTALL_DIR/soc-server"
chown -R $SERVICE_USER:$SERVICE_USER "$INSTALL_DIR"

echo ""
echo "Hay chinh sua: $INSTALL_DIR/configs/config.yaml"
echo "   (database, redis, soar settings)"
echo ""
read -p "Da chinh sua config xong? Cai dat systemd service? [y/N] " yn
if [[ "$yn" == "y" || "$yn" == "Y" ]]; then
    cp soc-server.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable soc-server
    systemctl start  soc-server
    echo "OK: Service da cai va dang chay!"
    systemctl status soc-server --no-pager
fi
'@
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText("$LinuxDir\install.sh", $installShContent, $utf8NoBom)

    $LinuxZip = Join-Path $ReleaseDir "soc-server-linux-$Version.zip"
    Compress-Archive -Path "$LinuxDir\*" -DestinationPath $LinuxZip -Force
    $zipMB = [math]::Round((Get-Item $LinuxZip).Length / 1MB, 1)
    Write-OK "soc-server-linux-$Version.zip ($zipMB MB)"
}

# Tong ket
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   BUILD HOAN TAT!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Info "Cac file release tai: $ReleaseDir"
Get-ChildItem $ReleaseDir -Filter "*.zip" | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 1)
    Write-Host "   $($_.Name) - $mb MB" -ForegroundColor White
}
Write-Host ""
