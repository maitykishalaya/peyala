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

:: 1. Check for Node.js in PATH and standard installation directories
set "NODE_EXE="

where node >nul 2>&1
if not errorlevel 1 (
    set "NODE_EXE=node"
)

if "%NODE_EXE%"=="" (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

if "%NODE_EXE%"=="" (
    if exist "C:\Program Files (x86)\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
        set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
    )
)

if "%NODE_EXE%"=="" (
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    )
)

if "%NODE_EXE%"=="" (
    if exist "%PORTABLE_NODE_DIR%\node.exe" (
        set "NODE_EXE=%PORTABLE_NODE_DIR%\node.exe"
        set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
    )
)

if not "%NODE_EXE%"=="" (
    echo [OK] Detected Node.js:
    node -v
    call npm -v
    goto NODE_READY
)

echo [*] Node.js was not detected on this Windows laptop.
echo [*] Attempting automatic download of Portable Node.js v20 LTS...
echo     (This requires internet access on this laptop)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
    "$zipPath = Join-Path $env:TEMP 'node_v20_win.zip';" ^
    "$extractDir = Join-Path $env:TEMP 'node_v20_extract';" ^
    "$targetDir = '%PORTABLE_NODE_DIR%';" ^
    "try {" ^
    "  Write-Host 'Downloading official Portable Node.js (~30 MB)...' -ForegroundColor Cyan;" ^
    "  (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip', $zipPath);" ^
    "  Write-Host 'Extracting Node.js into portable-node folder...' -ForegroundColor Cyan;" ^
    "  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force };" ^
    "  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force;" ^
    "  $innerFolder = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1;" ^
    "  if (Test-Path $targetDir) { Remove-Item $targetDir -Recurse -Force };" ^
    "  Move-Item -Path $innerFolder.FullName -Destination $targetDir -Force;" ^
    "  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue;" ^
    "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
    "  Write-Host 'Portable Node.js installed successfully!' -ForegroundColor Green;" ^
    "} catch {" ^
    "  Write-Host ('Download or extraction failed: ' + $_.Exception.Message) -ForegroundColor Red;" ^
    "}"

if exist "%PORTABLE_NODE_DIR%\node.exe" (
    set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
    echo [SUCCESS] Portable Node.js is ready!
    "%PORTABLE_NODE_DIR%\node.exe" -v
    goto NODE_READY
)

echo.
echo ====================================================================
echo [ERROR] Node.js is required but could not be installed automatically.
echo.
echo Please do one of the following:
echo   1. Connect this laptop to the internet and run setup-windows.bat again.
echo   2. OR Download and install official Node.js (LTS version) manually:
echo      https://nodejs.org/
echo ====================================================================
echo.
pause
exit /b 1

:NODE_READY
echo.

:: 2. Install backend dependencies
echo [*] Checking Backend dependencies...
if not exist "%BACKEND_DIR%" (
    echo [ERROR] Backend folder not found at %BACKEND_DIR%
    pause
    exit /b 1
)
cd /d "%BACKEND_DIR%"
call npm install
if errorlevel 1 (
    echo [WARNING] "npm install" in backend encountered an issue.
    echo Retrying with --force flag...
    call npm install --force
)

:: 3. Install frontend dependencies
echo.
echo [*] Checking Frontend dependencies (Windows binaries)...
if not exist "%FRONTEND_DIR%" (
    echo [ERROR] Frontend folder not found at %FRONTEND_DIR%
    pause
    exit /b 1
)
cd /d "%FRONTEND_DIR%"
call npm install
if errorlevel 1 (
    echo [WARNING] "npm install" in frontend encountered an issue.
    echo Retrying with --force flag...
    call npm install --force
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
set "LAUNCH_NOW="
set /p "LAUNCH_NOW=Would you like to launch Peyala POS in Kiosk Mode right now? (Y/N) [Y]: "
if "!LAUNCH_NOW!"=="" set "LAUNCH_NOW=Y"
if /i "!LAUNCH_NOW!"=="Y" (
    echo.
    echo [*] Launching Peyala POS Station...
    call "%SCRIPT_DIR%start-local-kiosk.bat"
    exit /b 0
)
pause
endlocal
exit /b 0
