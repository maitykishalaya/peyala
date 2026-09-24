@echo off
setlocal enabledelayedexpansion

title Peyala POS - Windows Kiosk Print Station

echo ====================================================================
echo    Peyala POS - Dedicated Windows Kiosk and Silent Auto-Print Hub
echo ====================================================================
echo.

:: Hardcoded Vercel Production Portal
set "DEFAULT_URL=https://peyala.vercel.app/login"
set "USER_DATA_DIR=%LOCALAPPDATA%\PeyalaPOSChrome"

:: Check for windowed mode flag or custom URL override
set "APP_URL=%~1"
set "MODE=kiosk"

if /i "%~1"=="--windowed" (
    set "MODE=windowed"
    set "APP_URL=%~2"
) else if /i "%~2"=="--windowed" (
    set "MODE=windowed"
)

if "%APP_URL%"=="" (
    set "APP_URL=%DEFAULT_URL%"
)

:: 2. Locate Google Chrome
set "CHROME_BIN="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME_BIN=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_BIN=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

if "%CHROME_BIN%"=="" (
    echo [ERROR] Google Chrome was not found in standard installation paths.
    echo Please ensure Google Chrome is installed on this Windows laptop.
    echo Opening URL in default browser...
    start "" "%APP_URL%"
    exit /b 1
)

:: 3. Ensure isolated POS user-data-dir exists
if not exist "%USER_DATA_DIR%" (
    mkdir "%USER_DATA_DIR%"
)

echo * Target URL:   %APP_URL%
echo * Print Engine: Silent Auto-Print (--kiosk-printing)
echo * Printer:      Windows Default Thermal Printer
echo * Profile:      %USER_DATA_DIR%
if "%MODE%"=="windowed" (
    echo * Window Mode:  Clean App Window (--app)
) else (
    echo * Window Mode:  Full-Screen Kiosk (--kiosk)
    echo                 (Tip: Press Alt + F4 or F11 to exit Kiosk mode)
)
echo.
echo Launching Chrome POS Station...

set COMMON_ARGS=--kiosk-printing --user-data-dir="%USER_DATA_DIR%" --disable-features=Translate --no-first-run --no-default-browser-check --disable-pinch --overscroll-history-navigation=0 --disable-infobars

if "%MODE%"=="windowed" (
    start "" "%CHROME_BIN%" --app="%APP_URL%" %COMMON_ARGS%
) else (
    start "" "%CHROME_BIN%" --kiosk "%APP_URL%" %COMMON_ARGS%
)

echo [OK] Chrome Kiosk Print Station is running!
echo This window can now be closed.
timeout /t 3 >nul
endlocal
exit /b 0
