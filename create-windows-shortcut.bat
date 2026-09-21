@echo off
setlocal enabledelayedexpansion

title Create Peyala POS Desktop Shortcut

echo ======================================================
echo   Creating Peyala POS Desktop Shortcut (Windows)
echo ======================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "TARGET_BAT=%SCRIPT_DIR%start-kiosk.bat"
set "VBS_FILE=%TEMP%\create_pos_shortcut_%RANDOM%.vbs"

if not exist "%TARGET_BAT%" (
    echo [ERROR] Could not find start-kiosk.bat in %SCRIPT_DIR%
    pause
    exit /b 1
)

:: Create Desktop Shortcut (.lnk) using PowerShell (safe and direct)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $shortcut = $ws.CreateShortcut((Join-Path $desktop 'Peyala POS Station.lnk')); $shortcut.TargetPath = '%TARGET_BAT%'; $shortcut.WorkingDirectory = '%SCRIPT_DIR%'; $shortcut.Description = 'Launch Peyala POS in Kiosk Mode with Silent Auto-Printing'; $shortcut.IconLocation = 'shell32.dll,13'; $shortcut.Save()" >nul 2>&1

:: Fallback if PowerShell was restricted
if not exist "%USERPROFILE%\Desktop\Peyala POS Station.lnk" (
    set "VBS_FILE=%TEMP%\pos_cloud_sc_%RANDOM%.vbs"
    > "!VBS_FILE!" echo Set WshShell = CreateObject("WScript.Shell")
    >> "!VBS_FILE!" echo Set Shortcut = WshShell.CreateShortcut(WshShell.SpecialFolders("Desktop") + "\Peyala POS Station.lnk")
    >> "!VBS_FILE!" echo Shortcut.TargetPath = "%TARGET_BAT%"
    >> "!VBS_FILE!" echo Shortcut.WorkingDirectory = "%SCRIPT_DIR%"
    >> "!VBS_FILE!" echo Shortcut.Description = "Launch Peyala POS in Kiosk Mode with Silent Auto-Printing"
    >> "!VBS_FILE!" echo Shortcut.IconLocation = "shell32.dll,13"
    >> "!VBS_FILE!" echo Shortcut.Save
    cscript //nologo "!VBS_FILE!" >nul 2>&1
    if exist "!VBS_FILE!" del "!VBS_FILE!" >nul 2>&1
)

echo [SUCCESS] "Peyala POS Station" shortcut created on your Desktop!
echo.
echo You can now simply double-click the shortcut on your Desktop to:
echo  1. Launch Chrome in dedicated full-screen Kiosk mode
echo  2. Automatically connect to your Vercel POS station
echo  3. Silently auto-print all incoming mobile KOTs to your USB thermal printer
echo.
pause
