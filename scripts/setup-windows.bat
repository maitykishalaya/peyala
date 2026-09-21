@echo off
setlocal enabledelayedexpansion

title Peyala POS - Windows Setup & Preparation

echo ====================================================================
echo   🍵 Peyala POS - Windows Pendrive Initial Setup Wizard
echo ====================================================================
echo.
echo This wizard configures this folder to run locally on your Windows laptop.
echo It prepares Node.js, installs local dependencies, and creates shortcuts.
echo.

set "SCRIPT_DIR=%~dp0"
set "PORTABLE_NODE_DIR=%SCRIPT_DIR%portable-node"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"

:: 1. Check Node.js
where node >nul 2>&1
if not errorlevel 1 (
    echo [OK] Detected system-wide Node.js installation:
    node -v
    npm -v
    goto NODE_READY
)

if exist "%PORTABLE_NODE_DIR%\node.exe" (
    echo [OK] Detected existing portable Node.js in %PORTABLE_NODE_DIR%
    set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
    goto NODE_READY
)

echo [*] Node.js is not installed on this machine.
echo [*] Downloading official Portable Node.js v20 LTS for Windows (x64)...
echo     This allows running the POS entirely from this folder without admin rights.
echo.

set "NODE_ZIP=%TEMP%\node_portable_%RANDOM%.zip"
set "NODE_URL=https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"

powershell -NoProfile -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
    "Write-Host 'Downloading Node.js (~30 MB)...';" ^
    "(New-Object System.Net.WebClient).DownloadFile('%NODE_URL%', '%NODE_ZIP%');" ^
    "Write-Host 'Extracting to portable-node folder...';" ^
    "Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '%TEMP%\node_extract_%RANDOM%' -Force;"

:: Locate extracted folder and move to portable-node
for /d %%D in ("%TEMP%\node_extract_*\node-v*") do (
    move /y "%%D" "%PORTABLE_NODE_DIR%" >nul 2>&1
)

if exist "%NODE_ZIP%" del "%NODE_ZIP%" >nul 2>&1

if not exist "%PORTABLE_NODE_DIR%\node.exe" (
    echo [WARNING] Automatic portable download failed or requires internet.
    echo Please install Node.js manually from https://nodejs.org/ (LTS version).
    pause
    exit /b 1
)

set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
echo [SUCCESS] Portable Node.js configured successfully!
"%PORTABLE_NODE_DIR%\node.exe" -v

:NODE_READY
echo.

:: 2. Install backend dependencies
echo [*] Checking Backend dependencies...
cd /d "%BACKEND_DIR%"
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies.
    pause
    exit /b 1
)

:: 3. Install frontend dependencies
echo.
echo [*] Checking Frontend dependencies (Windows binaries)...
cd /d "%FRONTEND_DIR%"
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install frontend dependencies.
    pause
    exit /b 1
)

:: 4. Build PeyalaPOS.exe launcher using Windows csc.exe
cd /d "%SCRIPT_DIR%"
if exist "build-exe.bat" (
    echo.
    echo [*] Compiling native PeyalaPOS.exe launcher...
    call "build-exe.bat" /quiet
)

:: 5. Create Desktop Shortcut
if exist "create-windows-local-shortcut.bat" (
    echo.
    echo [*] Creating Desktop Shortcut...
    call "create-windows-local-shortcut.bat" /quiet
)

echo.
echo ====================================================================
echo   ✅ Setup Complete!
echo   You can now launch Peyala POS anytime by double-clicking:
echo     - "start-local-kiosk.bat" (in this folder), OR
echo     - "Peyala POS Station" (on your Windows Desktop)
echo ====================================================================
echo.
pause
endlocal
exit /b 0
