@echo off
setlocal enabledelayedexpansion

title Create Peyala POS Desktop Shortcut

set "SCRIPT_DIR=%~dp0"
set "QUIET=0"
if /i "%~1"=="/quiet" set "QUIET=1"

if "%QUIET%"=="0" (
    echo ======================================================
    echo   Creating Peyala POS Desktop Shortcut with Official Logo
    echo ======================================================
    echo.
)

:: Ensure icon.ico exists from icon.png
if not exist "%SCRIPT_DIR%icon.ico" (
    if exist "%SCRIPT_DIR%scripts\make-ico.js" (
        node "%SCRIPT_DIR%scripts\make-ico.js" >nul 2>&1
    )
)

if exist "%SCRIPT_DIR%PeyalaPOS.exe" (
    set "TARGET_FILE=%SCRIPT_DIR%PeyalaPOS.exe"
) else (
    set "TARGET_FILE=%SCRIPT_DIR%start-peyala-app.bat"
)
set "ICON_TARGET=%SCRIPT_DIR%icon.ico"
if not exist "%ICON_TARGET%" (
    if exist "%SCRIPT_DIR%PeyalaPOS.exe" set "ICON_TARGET=%SCRIPT_DIR%PeyalaPOS.exe"
)

:: Create/Update User & Public Desktop Shortcuts and Start Menu Shortcuts
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$paths = @( " ^
    "    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Peyala POS.lnk'), " ^
    "    (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Peyala POS.lnk'), " ^
    "    (Join-Path (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs') 'Peyala POS.lnk'), " ^
    "    (Join-Path (Join-Path ([Environment]::GetFolderPath('CommonStartMenu')) 'Programs') 'Peyala POS.lnk') " ^
    "); " ^
    "foreach ($scPath in $paths) { " ^
    "    try { " ^
    "        $shortcut = $ws.CreateShortcut($scPath); " ^
    "        $shortcut.TargetPath = '%TARGET_FILE%'; " ^
    "        $shortcut.WorkingDirectory = '%SCRIPT_DIR%'; " ^
    "        $shortcut.Description = 'Peyala Restaurant Operations and POS Station'; " ^
    "        if (Test-Path '%ICON_TARGET%') { $shortcut.IconLocation = '%ICON_TARGET%' }; " ^
    "        $shortcut.Save(); " ^
    "    } catch {} " ^
    "}" >nul 2>&1

if "%QUIET%"=="0" (
    echo [SUCCESS] Peyala POS shortcut created with your official logo!
    echo Locations: Windows Desktop and Start Menu
    echo.
    pause
)

endlocal
exit /b 0
