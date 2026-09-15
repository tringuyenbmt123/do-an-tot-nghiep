# ==============================================================================
# SOC/EDR Platform - Master Deploy Script
# Build toan bo he thong (server + agent) chi voi 1 lenh
#
# Cach dung:
#   .\deploy.ps1
#   .\deploy.ps1 -Version v2.0.0 -ServerIP 192.168.1.10
#   .\deploy.ps1 -ServerOnly
#   .\deploy.ps1 -AgentOnly
# ==============================================================================

param(
    [string]$Version   = "v1.0.0",
    [string]$ServerIP  = "",
    [string]$SecretKey = "soc-agent-secret-token-2026",
    [switch]$ServerOnly,
    [switch]$AgentOnly,
    [switch]$WindowsOnly,
    [switch]$LinuxOnly
)

$ErrorActionPreference = "Stop"
$StartTime = Get-Date

function Write-Banner {
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Magenta
    Write-Host "   SOC/EDR Unified Security Platform" -ForegroundColor Magenta
    Write-Host "   Master Deploy Script - Version: $Version" -ForegroundColor Magenta
    Write-Host "   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Magenta
    Write-Host "=================================================================" -ForegroundColor Magenta
    Write-Host ""
}

function Write-Phase { param($n, $total, $msg)
    Write-Host ""
    Write-Host "--- [$n/$total] $msg ---" -ForegroundColor Cyan
}

function Write-OK   { param($msg) Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host "    FAIL: $msg" -ForegroundColor Red; exit 1 }
function Write-Info { param($msg) Write-Host "    INFO: $msg" -ForegroundColor Yellow }

Write-Banner

$ProjectRoot  = $PSScriptRoot
$RootRelease  = Join-Path $ProjectRoot "dist"
$ServerDir    = Join-Path $ProjectRoot "soc-server"
$AgentDir     = Join-Path $ProjectRoot "soc-agent"

# Kiem tra thu muc con
if (-not (Test-Path $ServerDir)) { Write-Fail "Khong tim thay soc-server/ trong $ProjectRoot" }
if (-not (Test-Path $AgentDir))  { Write-Fail "Khong tim thay soc-agent/ trong $ProjectRoot" }

# Kiem tra Go
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Fail "Khong tim thay 'go'. Hay cai Go tu https://go.dev/dl/"
}
Write-OK "Go: $(go version)"

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

# Tu dong lay Server IP neu nguoi dung khong chi dinh
if (-not $ServerIP -and -not $ServerOnly) {
    $autoIP = Get-LocalIPv4
    Write-Info "Tu dong phat hien IP may chu hien tai: $autoIP"
    $ServerIP = $autoIP
}

$TotalPhases = 0
if (-not $AgentOnly)  { $TotalPhases++ }
if (-not $ServerOnly) { $TotalPhases++ }
$TotalPhases++ # Collect

$Phase = 0

# ============================================================================
# PHASE 1: BUILD SERVER
# ============================================================================
if (-not $AgentOnly) {
    $Phase++
    Write-Phase $Phase $TotalPhases "Build SOC Server"

    $buildArgs = @("-Version", $Version)
    if ($WindowsOnly) { $buildArgs += "-WindowsOnly" }
    if ($LinuxOnly)   { $buildArgs += "-LinuxOnly" }

    $serverScript = Join-Path $ServerDir "build-server.ps1"
    if (-not (Test-Path $serverScript)) { Write-Fail "Khong tim thay $serverScript" }

    & powershell -ExecutionPolicy Bypass -File $serverScript @buildArgs
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build server that bai!" }
    Write-OK "Server build hoan tat"
}

# ============================================================================
# PHASE 2: BUILD AGENT
# ============================================================================
if (-not $ServerOnly) {
    $Phase++
    Write-Phase $Phase $TotalPhases "Build SOC Agent"

    $buildArgs = @("-Version", $Version, "-ServerIP", $ServerIP, "-SecretKey", $SecretKey)
    if ($WindowsOnly) { $buildArgs += "-WindowsOnly" }
    if ($LinuxOnly)   { $buildArgs += "-LinuxOnly" }

    $agentScript = Join-Path $AgentDir "build-agent.ps1"
    if (-not (Test-Path $agentScript)) { Write-Fail "Khong tim thay $agentScript" }

    & powershell -ExecutionPolicy Bypass -File $agentScript @buildArgs
    if ($LASTEXITCODE -ne 0) { Write-Fail "Build agent that bai!" }
    Write-OK "Agent build hoan tat"
}

# ============================================================================
# PHASE 3: TAP HOP TAT CA RELEASE PACKAGES VE THU MUC dist/
# ============================================================================
$Phase++
Write-Phase $Phase $TotalPhases "Thu thap tat ca packages vao dist/"

# Don dep thu muc dist/ cu de khong bi sot file cu
if (Test-Path $RootRelease) {
    Remove-Item $RootRelease -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $RootRelease | Out-Null

$Collected = 0
$AllZips = @()

# Server packages
$serverReleaseDir = Join-Path $ServerDir "release"
if (Test-Path $serverReleaseDir) {
    Get-ChildItem $serverReleaseDir | ForEach-Object {
        Copy-Item $_.FullName $RootRelease -Recurse -Force
        if ($_.Name -like "*.zip") { $AllZips += $_ }
        $Collected++
    }
}

# Agent packages
$agentReleaseDir = Join-Path $AgentDir "release"
if (Test-Path $agentReleaseDir) {
    Get-ChildItem $agentReleaseDir | ForEach-Object {
        Copy-Item $_.FullName $RootRelease -Recurse -Force
        if ($_.Name -like "*.zip") { $AllZips += $_ }
        $Collected++
    }
}

Write-OK "Da thu thap $Collected packages vao dist/"

# ============================================================================
# TONG KET
# ============================================================================
$Duration = ((Get-Date) - $StartTime).TotalSeconds

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "   BUILD TOAN BO HE THONG HOAN TAT!" -ForegroundColor Green
Write-Host "   Thoi gian: $([math]::Round($Duration, 1)) giay" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Cac goi phat hanh tai: $RootRelease" -ForegroundColor White
Write-Host ""

Get-ChildItem $RootRelease -Filter "*.zip" | Sort-Object Name | ForEach-Object {
    $mb    = [math]::Round($_.Length / 1MB, 1)
    $icon  = if ($_.Name -like "*server*") { "SERVER" } else { "AGENT " }
    $os    = if ($_.Name -like "*windows*") { "[Win]" } elseif ($_.Name -like "*linux*") { "[Lin]" } else { "     " }
    Write-Host "   [$icon] $os  $($_.Name)  ($mb MB)" -ForegroundColor White
}

Write-Host ""
Write-Host "  Huong dan phat hanh:" -ForegroundColor Yellow
if (-not $AgentOnly) {
    Write-Host ""
    Write-Host "  [SERVER - Windows]" -ForegroundColor Cyan
    Write-Host "    1. Giai nen soc-server-windows-$Version.zip"
    Write-Host "    2. Chinh sua configs\config.yaml (DB, Redis, n8n)"
    Write-Host "    3. Chay: soc-server.exe"
    Write-Host ""
    Write-Host "  [SERVER - Linux]" -ForegroundColor Cyan
    Write-Host "    1. unzip soc-server-linux-$Version.zip"
    Write-Host "    2. sudo bash install.sh"
}
if (-not $ServerOnly) {
    Write-Host ""
    Write-Host "  [AGENT - Windows] (Gui cho nhan vien/may tinh dau cuoi)" -ForegroundColor Cyan
    Write-Host "    1. Gui file soc-agent-windows-$Version.zip"
    Write-Host "    2. Giai nen, double-click INSTALL.bat (Admin)"
    Write-Host "       -> Script tu hoi IP server + cai Windows Service"
    Write-Host ""
    Write-Host "  [AGENT - Linux]" -ForegroundColor Cyan
    Write-Host "    1. Gui file soc-agent-linux-$Version.zip"
    Write-Host "    2. unzip ... && sudo bash install-agent.sh"
}
Write-Host ""
Write-Host "  Server IP duoc nhung vao agent: $ServerIP" -ForegroundColor Green
Write-Host "  Secret Key: $SecretKey" -ForegroundColor Green
Write-Host ""
