@echo off
setlocal enabledelayedexpansion

title Peyala POS - Windows Kiosk Print Station

echo ====================================================================
echo   🍵 Peyala POS - Dedicated Windows Kiosk & Silent Auto-Print Hub
echo ====================================================================
echo.

set "CONFIG_FILE=%~dp0kiosk-url.txt"
set "USER_DATA_DIR=%LOCALAPPDATA%\PeyalaPOSChrome"

:: 1. Determine Target POS URL
set "APP_URL=%~1"

:: If first argument is --windowed or --fullscreen, shift it
set "MODE=kiosk"
if /i "%~1"=="--windowed" (
    set "MODE=windowed"
    set "APP_URL=%~2"
) else if /i "%~2"=="--windowed" (
    set "MODE=windowed"
)

:: If URL wasn't passed via argument, try reading from kiosk-url.txt
if "%APP_URL%"=="" (
    if exist "%CONFIG_FILE%" (
        set /p APP_URL=<"%CONFIG_FILE%"
    )
)

:: If still blank, prompt user
if "%APP_URL%"=="" (
    echo Please enter your Peyala POS website URL.
    echo (e.g. https://your-pos-app.vercel.app or http://localhost:3000)
    set /p "USER_INPUT=POS URL: "
    set "APP_URL=!USER_INPUT!"
    
    if not "!APP_URL!"=="" (
        echo !APP_URL!>"%CONFIG_FILE%"
        echo Saved URL to kiosk-url.txt for future one-click launches.
        echo.
    )
)

:: Fallback if user just hit Enter
if "%APP_URL%"=="" (
    set "APP_URL=http://localhost:3000/tables"
)

:: Ensure URL targets /tables with ?printStation=true
echo %APP_URL% | findstr /I "printStation" >nul
if errorlevel 1 (
    echo %APP_URL% | findstr /I "/tables" >nul
    if errorlevel 1 (
        :: Does not have /tables
        if "%APP_URL:~-1%"=="/" (
            set "APP_URL=%APP_URL%tables?printStation=true"
        ) else (
            set "APP_URL=%APP_URL%/tables?printStation=true"
        )
    ) else (
        :: Has /tables, append ?printStation=true
        echo %APP_URL% | findstr "?" >nul
        if errorlevel 1 (
            set "APP_URL=%APP_URL%?printStation=true"
        ) else (
            set "APP_URL=%APP_URL%&printStation=true"
        )
    )
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
    pause
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

:: 4. Launch Chrome with Kiosk & Silent Printing flags
if "%MODE%"=="windowed" (
    start "" "%CHROME_BIN%" ^
        --kiosk-printing ^
        --user-data-dir="%USER_DATA_DIR%" ^
        --disable-features=Translate ^
        --no-first-run ^
        --no-default-browser-check ^
        --disable-pinch ^
        --overscroll-history-navigation=0 ^
        --disable-infobars ^
        --app="%APP_URL%"
) else (
    start "" "%CHROME_BIN%" ^
        --kiosk ^
        --kiosk-printing ^
        --user-data-dir="%USER_DATA_DIR%" ^
        --disable-features=Translate ^
        --no-first-run ^
        --no-default-browser-check ^
        --disable-pinch ^
        --overscroll-history-navigation=0 ^
        --disable-infobars ^
        "%APP_URL%"
)

echo [OK] Chrome Kiosk Print Station is running!
echo This window can now be closed.
timeout /t 3 >nul
endlocal
exit /b 0
