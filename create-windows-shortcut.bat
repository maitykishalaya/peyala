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

:: Generate VBScript to create Desktop Shortcut (.lnk)
(
    echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
    echo sLinkFile = oWS.SpecialFolders^("Desktop"^) ^& "\Peyala POS Station.lnk"
    echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
    echo oLink.TargetPath = "%TARGET_BAT%"
    echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
    echo oLink.Description = "Launch Peyala POS in Kiosk Mode with Silent Auto-Printing"
    echo oLink.IconLocation = "shell32.dll,13"
    echo oLink.WindowStyle = 1
    echo oLink.Save
) > "%VBS_FILE%"

cscript //nologo "%VBS_FILE%"
if exist "%VBS_FILE%" del "%VBS_FILE%"

echo [SUCCESS] "Peyala POS Station" shortcut created on your Desktop!
echo.
echo You can now simply double-click the shortcut on your Desktop to:
echo  1. Launch Chrome in dedicated full-screen Kiosk mode
echo  2. Automatically connect to your Vercel POS station
echo  3. Silently auto-print all incoming mobile KOTs to your USB thermal printer
echo.
pause
