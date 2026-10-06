@echo off
title SOC/EDR Agent Installer
color 0b

echo ==============================================================================
echo            SOC/EDR PYTHON AGENT INSTALLER (WINDOWS)
echo ==============================================================================
echo.

:: Kiem tra quyen Admin
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0c
    echo [Loi] Ban phai chay file nay duoi quyen Administrator (Run as administrator).
    pause
    exit /b 1
)

:: Yeu cau thong tin
set /p SERVER_URL="Nhap dia chi gRPC Server (vd: 192.168.1.100:50051, mac dinh: localhost:50051): "
if "%SERVER_URL%"=="" set SERVER_URL=localhost:50051

set /p AGENT_ID="Nhap Agent ID (de trong se tu sinh tu Hostname): "

set /p SECRET_KEY="Nhap Secret Key (mac dinh: soc-agent-secret-token-2026): "
if "%SECRET_KEY%"=="" set SECRET_KEY=soc-agent-secret-token-2026

echo.
echo [1/4] Kiem tra Python...
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0c
    echo [Loi] Khong tim thay Python. Vui long cai dat Python 3.10+ (nho tich Add to PATH) va thu lai.
    pause
    exit /b 1
)

set DIR=C:\SOC-Agent
echo [2/4] Sao chep Agent toi %DIR%...
if not exist "%DIR%" mkdir "%DIR%"
xcopy /E /I /Y . "%DIR%" >nul

cd /d "%DIR%"

echo [3/4] Cai dat dependencies (venv)...
python -m venv venv
call venv\Scripts\activate
python -m pip install --upgrade pip >nul
pip install -r requirements.txt >nul

echo [4/4] Tao file cau hinh config.json...
(
echo {
echo   "server_url": "%SERVER_URL%",
echo   "agent_id": "%AGENT_ID%",
echo   "agent_secret_key": "%SECRET_KEY%",
echo   "heartbeat_interval_seconds": 5,
echo   "metric_interval_seconds": 1,
echo   "fim_enabled": true
echo }
) > config.json

echo.
echo ==============================================================================
echo    CAI DAT THANH CONG! 
echo    Ban co the chay Agent bang cach chay run-agent.bat trong thu muc C:\SOC-Agent
echo    De dang ky chay ngam khi khoi dong, su dung Task Scheduler.
echo ==============================================================================
echo.
pause
