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

set "TARGET_FILE=%SCRIPT_DIR%start-peyala-app.bat"
set "ICON_TARGET=%SCRIPT_DIR%icon.ico"
if not exist "%ICON_TARGET%" (
    if exist "%SCRIPT_DIR%PeyalaPOS.exe" set "ICON_TARGET=%SCRIPT_DIR%PeyalaPOS.exe"
)

:: Create Desktop Shortcut
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
    "$scPath = Join-Path $desktop 'Peyala POS.lnk'; " ^
    "$shortcut = $ws.CreateShortcut($scPath); " ^
    "$shortcut.TargetPath = '%TARGET_FILE%'; " ^
    "$shortcut.WorkingDirectory = '%SCRIPT_DIR%'; " ^
    "$shortcut.Description = 'Peyala Restaurant Operations and POS Terminal'; " ^
    "if (Test-Path '%ICON_TARGET%') { $shortcut.IconLocation = '%ICON_TARGET%' }; " ^
    "$shortcut.Save()" >nul 2>&1

:: Create Start Menu Shortcut
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; " ^
    "$startMenu = [Environment]::GetFolderPath('StartMenu'); " ^
    "$programs = Join-Path $startMenu 'Programs'; " ^
    "$scPath = Join-Path $programs 'Peyala POS.lnk'; " ^
    "$shortcut = $ws.CreateShortcut($scPath); " ^
    "$shortcut.TargetPath = '%TARGET_FILE%'; " ^
    "$shortcut.WorkingDirectory = '%SCRIPT_DIR%'; " ^
    "$shortcut.Description = 'Peyala Restaurant Operations and POS Terminal'; " ^
    "if (Test-Path '%ICON_TARGET%') { $shortcut.IconLocation = '%ICON_TARGET%' }; " ^
    "$shortcut.Save()" >nul 2>&1

if "%QUIET%"=="0" (
    echo [SUCCESS] Peyala POS shortcut created with your official logo!
    echo Locations: Windows Desktop and Start Menu
    echo.
    pause
)

endlocal
exit /b 0
