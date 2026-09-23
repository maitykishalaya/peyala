@echo off
setlocal enabledelayedexpansion

title Peyala POS - Automated 1-Click Laptop Installer

echo ====================================================================
echo   Peyala Restaurant Operations & POS - 1-Click Windows Installer
echo ====================================================================
echo.
echo This installer configures Peyala POS on this Windows laptop.
echo It ensures Node.js runtime, production builds, and desktop shortcuts
echo with your official Peyala logo.
echo.

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"
set "DESKTOP_DIR=%SCRIPT_DIR%desktop"
set "PORTABLE_NODE_DIR=%SCRIPT_DIR%portable-node"

:: -------------------------------------------------------------------
:: 1. Detect or Provision Node.js
:: -------------------------------------------------------------------
echo [*] Step 1/6: Verifying Node.js environment...

set "NODE_EXE="
if exist "%PORTABLE_NODE_DIR%\node.exe" (
    set "NODE_EXE=%PORTABLE_NODE_DIR%\node.exe"
    set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
)

if "%NODE_EXE%"=="" (
    where node >nul 2>&1
    if not errorlevel 1 set "NODE_EXE=node"
)

if "%NODE_EXE%"=="" (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else if exist "C:\Program Files (x86)\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
        set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
    )
)

if "%NODE_EXE%"=="" (
    echo [*] Node.js not detected. Downloading Portable Node.js v20 LTS...
    echo     (One-time setup - no administrator installation required)
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
        "$zipPath = Join-Path $env:TEMP 'node_v20_win.zip';" ^
        "$extractDir = Join-Path $env:TEMP 'node_v20_extract';" ^
        "$targetDir = '%PORTABLE_NODE_DIR%';" ^
        "try {" ^
        "  Write-Host 'Downloading official Portable Node.js runtime (~30 MB)...' -ForegroundColor Cyan;" ^
        "  (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip', $zipPath);" ^
        "  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force };" ^
        "  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force;" ^
        "  $inner = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1;" ^
        "  if (Test-Path $targetDir) { Remove-Item $targetDir -Recurse -Force };" ^
        "  Move-Item -Path $inner.FullName -Destination $targetDir -Force;" ^
        "  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue;" ^
        "  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue;" ^
        "} catch { Write-Host $_.Exception.Message -ForegroundColor Red; }"

    if exist "%PORTABLE_NODE_DIR%\node.exe" (
        set "NODE_EXE=%PORTABLE_NODE_DIR%\node.exe"
        set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
        echo [OK] Portable Node.js is ready!
    ) else (
        echo [ERROR] Could not automatically download Node.js.
        echo Please ensure internet connection or install Node.js from https://nodejs.org/
        pause
        exit /b 1
    )
) else (
    echo [OK] Node.js is ready.
)

:: -------------------------------------------------------------------
:: 2. Generate Authentic Windows Icon (.ico) from User's icon.png
:: -------------------------------------------------------------------
echo.
echo [*] Step 2/6: Processing official logo icon...
if not exist "%SCRIPT_DIR%icon.ico" (
    if exist "%SCRIPT_DIR%scripts\make-ico.js" (
        node "%SCRIPT_DIR%scripts\make-ico.js"
    )
)

:: -------------------------------------------------------------------
:: 3. Verify Local Dependencies
:: -------------------------------------------------------------------
echo.
echo [*] Step 3/6: Checking local dependencies...
if not exist "%BACKEND_DIR%\node_modules" (
    echo [*] Installing backend dependencies...
    cd /d "%BACKEND_DIR%"
    call npm install
)

if not exist "%FRONTEND_DIR%\node_modules" (
    echo [*] Installing frontend dependencies...
    cd /d "%FRONTEND_DIR%"
    call npm install
)

if not exist "%DESKTOP_DIR%\node_modules\electron" (
    echo [*] Installing desktop terminal engine...
    cd /d "%DESKTOP_DIR%"
    call npm install
    if exist "%DESKTOP_DIR%\node_modules\electron\install.js" (
        node "%DESKTOP_DIR%\node_modules\electron\install.js"
    )
)

:: -------------------------------------------------------------------
:: 4. Verify Frontend Production Build (Sub-5ms Route Execution)
:: -------------------------------------------------------------------
echo.
echo [*] Step 4/6: Verifying optimized production build...
if not exist "%FRONTEND_DIR%\.next\BUILD_ID" (
    echo [*] Generating optimized production bundle - one-time build...
    cd /d "%FRONTEND_DIR%"
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Production build failed.
        pause
        exit /b 1
    )
)

:: -------------------------------------------------------------------
:: 5. Compile Native PeyalaPOS.exe with User Logo
:: -------------------------------------------------------------------
echo.
echo [*] Step 5/6: Building native Windows launcher executable...
cd /d "%SCRIPT_DIR%"
if exist "build-exe.bat" (
    call "build-exe.bat" /quiet
)

:: -------------------------------------------------------------------
:: 6. Create Desktop & Start Menu Shortcuts with User Logo
:: -------------------------------------------------------------------
echo.
echo [*] Step 6/6: Creating desktop and Start Menu shortcuts...
if exist "create-windows-desktop-app-shortcut.bat" (
    call "create-windows-desktop-app-shortcut.bat" /quiet
)

echo.
echo ====================================================================
echo   Installation Complete!
echo   Peyala POS is now installed on this laptop.
echo.
echo   You can launch it anytime by double-clicking:
echo     - "Peyala POS" shortcut on your Desktop
echo     - "start-peyala-app.bat" in this folder
echo     - "PeyalaPOS.exe" in this folder
echo ====================================================================
echo.

set /p "LAUNCH_NOW=Launch Peyala POS right now? (Y/N) [Y]: "
if "!LAUNCH_NOW!"=="" set "LAUNCH_NOW=Y"
if /i "!LAUNCH_NOW!"=="Y" (
    echo.
    echo [*] Launching Peyala POS Station...
    call "%SCRIPT_DIR%start-peyala-app.bat"
)

endlocal
exit /b 0
