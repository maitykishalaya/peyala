@echo off
setlocal enabledelayedexpansion

title Stop Peyala POS Local Servers

echo ======================================================
echo    Stopping Peyala Local Servers (Ports 3000 and 4000)
echo ======================================================
echo.

echo [*] Terminating server console windows...
taskkill /F /FI "WINDOWTITLE eq Peyala_Backend_API*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Peyala_Frontend_Next*" >nul 2>&1

echo [*] Freeing port 3000 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo     - Stopping PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo [*] Freeing port 4000 (Backend API)...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    echo     - Stopping PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [OK] All Peyala servers have been stopped. Ports 3000 and 4000 are free.
echo.
timeout /t 3
endlocal
exit /b 0
