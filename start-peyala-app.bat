@echo off
setlocal enabledelayedexpansion

title Peyala POS - Dedicated Windows Desktop Application

echo ====================================================================
echo   Peyala POS - Dedicated Windows Desktop Application Terminal
echo ====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"
set "DESKTOP_DIR=%SCRIPT_DIR%desktop"
set "PORTABLE_NODE_DIR=%SCRIPT_DIR%portable-node"

:: 1. Check for Node.js runtime
where node >nul 2>&1
if not errorlevel 1 goto NODE_FOUND

if exist "%PORTABLE_NODE_DIR%\node.exe" (
    set "PATH=%PORTABLE_NODE_DIR%;!PATH!"
    goto NODE_FOUND
)

if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;!PATH!"
    goto NODE_FOUND
)

if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\nodejs;!PATH!"
    goto NODE_FOUND
)

echo [ERROR] Node.js was not found. Please run INSTALL-PEYALA-POS.bat first.
pause
exit /b 1

:NODE_FOUND
:: 2. Check Backend dependencies
if not exist "%BACKEND_DIR%\node_modules" (
    echo [*] Installing backend dependencies...
    cd /d "%BACKEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
)

:: 3. Check Frontend dependencies
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [*] Installing frontend dependencies...
    cd /d "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
)

:: 4. Verify Frontend Production Build exists - Guarantees instant page loads
if not exist "%FRONTEND_DIR%\.next\BUILD_ID" (
    echo [*] Compiling frontend production bundle - one-time build for instant execution...
    cd /d "%FRONTEND_DIR%"
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Frontend production build failed.
        pause
        exit /b 1
    )
)

:: 5. Check Desktop dependencies
if not exist "%DESKTOP_DIR%\node_modules\electron\dist\electron.exe" (
    echo [*] Preparing desktop runtime components...
    cd /d "%DESKTOP_DIR%"
    call npm install
    if exist "%DESKTOP_DIR%\node_modules\electron\install.js" (
        node "%DESKTOP_DIR%\node_modules\electron\install.js"
    )
)

:: 6. Launch Peyala POS Windows Desktop Application
echo [*] Clearing any stale desktop instances to ensure clean startup...
taskkill /F /IM electron.exe >nul 2>&1

echo [*] Launching Peyala POS Desktop Application...
cd /d "%DESKTOP_DIR%"
if exist "%DESKTOP_DIR%\node_modules\.bin\electron.cmd" (
    call "%DESKTOP_DIR%\node_modules\.bin\electron.cmd" .
) else (
    call npx electron .
)

if errorlevel 1 (
    echo.
    echo ====================================================================
    echo [ERROR] Peyala POS desktop runtime closed unexpectedly (Exit Code: %errorlevel%).
    echo ====================================================================
    echo.
    pause
)

endlocal
exit /b 0
