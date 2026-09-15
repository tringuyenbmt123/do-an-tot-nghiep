@echo off
title SOC/EDR All-in-One Server Installer
color 0b
echo ==============================================================================
echo        SOC/EDR ALL-IN-ONE PLATFORM - WINDOWS SERVER INSTALLER
echo        (Tu dong khoi chay MySQL, Redis, Go Backend va Web Dashboard)
echo ==============================================================================
echo.

:: Kiem tra Docker Desktop
where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0c
    echo [ERROR] Khong tim thay Docker Desktop tren may cua ban!
    echo         Hay cai dat Docker Desktop tu: https://www.docker.com/products/docker-desktop/
    echo         Sau do mo Docker Desktop va chay lai script nay.
    pause
    exit /b 1
)

echo [1/3] Dang dung cac container cu (neu co)...
docker compose down >nul 2>nul

echo [2/3] Dang build va khoi dong MySQL 8, Redis, Backend va Frontend...
docker compose up -d --build
if %ERRORLEVEL% neq 0 (
    color 0c
    echo.
    echo [ERROR] Build hoac khoi dong Docker Containers that bai!
    echo         Vui long kiem tra log loi o tren.
    pause
    exit /b 1
)

echo.
echo ==============================================================================
echo                      CAI DAT MAY CHU THANH CONG!
echo ==============================================================================
echo.
echo   - Web Dashboard:     http://localhost (hoac IP LAN cua may nay)
echo   - REST API:          http://localhost:8080
echo   - gRPC cho Agent:    localhost:50051
echo   - MySQL Database:    localhost:3306 (user: root, pass: 1, db: soc_edr_db)
echo   - Redis:             localhost:6379
echo.
echo   * Tai khoan dang nhap Dashboard mac dinh: admin / admin123
echo   * Co so du lieu khoi tao sach (Clean DB) - San sang ket noi Agent!
echo ==============================================================================
echo.
pause
