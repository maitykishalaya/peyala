@echo off
setlocal enabledelayedexpansion

title Peyala POS - Local Server and Dedicated Windows Kiosk Station

echo ====================================================================
echo    Peyala POS - Local Server and Dedicated Windows Kiosk Station
echo ====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"
set "PORTABLE_NODE_DIR=%SCRIPT_DIR%portable-node"
set "USER_DATA_DIR=%LOCALAPPDATA%\PeyalaPOSProfile"
set "DEFAULT_URL=http://localhost:3000/"
set "MODE=kiosk"

:: Parse command line flags
:PARSE_ARGS
if "%~1"=="" goto ARGS_DONE
if /i "%~1"=="--windowed" (
    set "MODE=windowed"
) else if /i "%~1"=="--kiosk" (
    set "MODE=kiosk"
) else if /i "%~1"=="--url" (
    set "DEFAULT_URL=%~2"
    shift
)
shift
goto PARSE_ARGS
:ARGS_DONE

:: 1. Check for Node.js in portable directory, PATH, and standard Windows install locations
set "NODE_EXE="

if exist "%PORTABLE_NODE_DIR%\node.exe" (
    set "NODE_EXE=%PORTABLE_NODE_DIR%\node.exe"
    set "PATH=%PORTABLE_NODE_DIR%;!PATH!"
    echo [*] Using portable Node.js runtime from %PORTABLE_NODE_DIR%
)

if "!NODE_EXE!"=="" (
    where node >nul 2>&1
    if not errorlevel 1 set "NODE_EXE=node"
)

if "!NODE_EXE!"=="" (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
        set "PATH=C:\Program Files\nodejs;!PATH!"
    )
)

if "!NODE_EXE!"=="" (
    if exist "C:\Program Files (x86)\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
        set "PATH=C:\Program Files (x86)\nodejs;!PATH!"
    )
)

if "!NODE_EXE!"=="" (
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
        set "PATH=%LOCALAPPDATA%\Programs\nodejs;!PATH!"
    )
)

if "!NODE_EXE!"=="" (
    echo [ERROR] Node.js was not found in PATH or standard installation folders.
    echo.
    echo To run the local server directly on this Windows laptop:
    echo   1. Run setup-windows.bat in this folder to automatically
    echo      download portable Node.js, OR
    echo   2. Download and install Node.js from https://nodejs.org/
    echo.
    set /p "RUN_SETUP=Would you like to run setup-windows.bat now? (Y/N): "
    if /i "!RUN_SETUP!"=="Y" (
        call "%SCRIPT_DIR%setup-windows.bat"
        if exist "%PORTABLE_NODE_DIR%\node.exe" (
            set "PATH=%PORTABLE_NODE_DIR%;!PATH!"
            set "NODE_EXE=%PORTABLE_NODE_DIR%\node.exe"
        ) else (
            pause
            exit /b 1
        )
    ) else (
        pause
        exit /b 1
    )
)

:: 3. Verify dependencies exist for Windows
if not exist "%BACKEND_DIR%\node_modules" (
    echo [*] Installing backend dependencies first time setup...
    cd /d "%BACKEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
)

:: If node_modules was copied from Mac, Next.js Windows native binary may be missing
set "NEED_FRONTEND_INSTALL=0"
if not exist "%FRONTEND_DIR%\node_modules" (
    set "NEED_FRONTEND_INSTALL=1"
) else if not exist "%FRONTEND_DIR%\node_modules\@next\swc-win32-x64-msvc" (
    echo [*] Detected cross-platform copy from Mac. Updating Windows binaries for Next.js...
    set "NEED_FRONTEND_INSTALL=1"
)

if "!NEED_FRONTEND_INSTALL!"=="1" (
    echo [*] Installing frontend dependencies for Windows...
    cd /d "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
)

:: 4. Locate Browser: Google Chrome or Microsoft Edge
set "BROWSER_BIN="
set "BROWSER_NAME="

:: Try Google Chrome
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
    set "BROWSER_NAME=Google Chrome"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_BIN=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    set "BROWSER_NAME=Google Chrome"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
    set "BROWSER_NAME=Google Chrome"
)

:: Fallback to Microsoft Edge (built-in on all Windows 10 and 11 laptops)
if "%BROWSER_BIN%"=="" (
    if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
        set "BROWSER_BIN=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        set "BROWSER_NAME=Microsoft Edge"
    ) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
        set "BROWSER_BIN=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        set "BROWSER_NAME=Microsoft Edge"
    ) else if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
        set "BROWSER_BIN=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
        set "BROWSER_NAME=Microsoft Edge"
    )
)

if "%BROWSER_BIN%"=="" (
    echo [WARNING] Neither Google Chrome nor Microsoft Edge was found in standard locations.
    echo Local servers will still start, and default browser will open.
)

:: 5. Free stale ports 3000 and 4000 if occupied
echo [*] Freeing ports 3000 and 4000...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: 5.5 Verify Frontend Production Build exists
if not exist "%FRONTEND_DIR%\.next\BUILD_ID" (
    echo [*] First-time production optimization: compiling frontend...
    cd /d "%FRONTEND_DIR%"
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Frontend production build failed.
        pause
        exit /b 1
    )
)

:: 6. Launch Backend API (Port 4000) in Production Mode
echo [*] Starting Backend API on port 4000 (Production Mode)...
start "Peyala_Backend_API" /d "%BACKEND_DIR%" /min cmd /c "npm start"

:: 7. Launch Frontend Next.js (Port 3000) in Production Mode
echo [*] Starting Frontend Next.js on port 3000 (Production Mode - Instant Load)...
start "Peyala_Frontend_Next" /d "%FRONTEND_DIR%" /min cmd /c "npm start"

:: 8. Wait for local server to be responsive
echo [*] Waiting for local server to become ready (http://localhost:3000)...
powershell -NoProfile -Command "$timeout = 60; $sw = [System.Diagnostics.Stopwatch]::StartNew(); $ok = $false; while ($sw.Elapsed.TotalSeconds -lt $timeout) { try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('127.0.0.1', 3000); $tcp.Close(); $ok = $true; break } catch { Start-Sleep -Milliseconds 800; [Console]::Write('.') } }; if ($ok) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo.
    echo [WARNING] Server startup took longer than 60 seconds. Launching kiosk anyway...
) else (
    echo.
    echo [OK] Local server is online!
)

:: Small settle pause
timeout /t 2 >nul

:: 9. Ensure isolated profile directory exists
if not exist "%USER_DATA_DIR%" mkdir "%USER_DATA_DIR%"

:: Detect active LAN IP for mobile staff devices
set "LAN_IP="
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Virtual' -and $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress"`) do (
    set "LAN_IP=%%i"
)

echo.
echo ====================================================================
echo   Station Status: Active and Serving
echo   Local Portal:   %DEFAULT_URL%
if not "!LAN_IP!"=="" (
echo   Mobile Waiter:  http://!LAN_IP!:3000
)
echo   Print Engine:   Silent Auto-Print (--kiosk-printing)
echo   Browser Engine: %BROWSER_NAME%
if "%MODE%"=="windowed" (
echo   Window Mode:    Windowed App (--app)
) else (
echo   Window Mode:    Full-Screen Kiosk
echo                   Tip: Press Alt + F4 or F11 to exit Kiosk mode
)
echo ====================================================================
echo.
echo When you close the kiosk window, this script will stop local servers.
echo.

:: 10. Launch Browser
set "COMMON_ARGS=--kiosk-printing --user-data-dir=\"%USER_DATA_DIR%\" --disable-features=Translate --no-first-run --no-default-browser-check --disable-pinch --overscroll-history-navigation=0 --disable-infobars"

if "%BROWSER_BIN%"=="" (
    start "" "%DEFAULT_URL%"
    echo Servers are running. Press any key to stop servers and exit.
    pause >nul
) else if "%MODE%"=="windowed" (
    "%BROWSER_BIN%" --app="%DEFAULT_URL%" %COMMON_ARGS%
) else (
    "%BROWSER_BIN%" --kiosk "%DEFAULT_URL%" %COMMON_ARGS%
)

:: 11. Cleanup upon exit
echo.
echo [*] Kiosk window closed. Stopping local servers...
taskkill /F /FI "WINDOWTITLE eq Peyala_Backend_API*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Peyala_Frontend_Next*" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":4000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [OK] All local servers stopped cleanly.
timeout /t 3 >nul
endlocal
exit /b 0
