# ==============================================================================
# SOC/EDR Unified Security Platform — Đóng gói Release
# Tạo các file .zip phân phối cho Server và Agent (Linux/Windows)
# ==============================================================================

$Version = "v1.0.0"
$DistDir = "dist"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host " Đang dong goi SOC/EDR Platform Release $Version" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

if (Test-Path $DistDir) {
    Remove-Item -Path "$DistDir\*" -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}

# --- 1. DONG GOI SERVER ---
Write-Host "[1/3] Dong goi SOC Server & Frontend..." -ForegroundColor Yellow
$ServerZip = "$DistDir\soc-server-$Version.zip"
$ServerFiles = Get-ChildItem -Path "soc-server-python", "soc-frontend", "docker-compose.yml", "install-server.sh", "install-server.bat", "install-server.ps1", "README.md", ".env.example" -Recurse | Where-Object {
    $_.FullName -notmatch "\\venv\\" -and
    $_.FullName -notmatch "\\__pycache__\\" -and
    $_.FullName -notmatch "\\node_modules\\" -and
    $_.FullName -notmatch "\\dist\\" -and
    $_.FullName -notmatch "\\\.git\\"
}
Compress-Archive -Path $ServerFiles.FullName -DestinationPath $ServerZip -Force

# --- 2. DONG GOI AGENT (Windows) ---
Write-Host "[2/3] Dong goi SOC Agent (Windows)..." -ForegroundColor Yellow
$AgentWinZip = "$DistDir\soc-agent-windows-$Version.zip"
$AgentFiles = Get-ChildItem -Path "soc-agent-python" -Recurse | Where-Object {
    $_.FullName -notmatch "\\venv\\" -and
    $_.FullName -notmatch "\\__pycache__\\" -and
    $_.Name -notmatch "install-agent\.sh" -and
    $_.Name -notmatch ".*\.zip$" -and
    $_.Name -notmatch ".*\.tar\.gz$"
}
Compress-Archive -Path $AgentFiles.FullName -DestinationPath $AgentWinZip -Force

# --- 3. DONG GOI AGENT (Linux) ---
# Tren Windows mac dinh khong co lenh zip/tar nhu tren bash.
# De pack tar.gz tu Windows PowerShell, can dung cong cu khac hoac WSL.
Write-Host "[3/3] De dong goi Linux Agent thanh .tar.gz, ban nen chay package.sh tren WSL hoac Linux." -ForegroundColor Yellow


Write-Host "========================================================================" -ForegroundColor Green
Write-Host " HOAN TAT DONG GOI!" -ForegroundColor Green
Write-Host " Cac file duoc luu tai thu muc $DistDir:" -ForegroundColor Green
Get-ChildItem -Path $DistDir | Select-Object Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length / 1MB, 2)}} | Format-Table
Write-Host "========================================================================" -ForegroundColor Green
