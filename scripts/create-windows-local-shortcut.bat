@echo off
setlocal enabledelayedexpansion

title Create Peyala POS Local Station Desktop Shortcut

set "SCRIPT_DIR=%~dp0"
set "QUIET=0"
if /i "%~1"=="/quiet" set "QUIET=1"

if "%QUIET%"=="0" (
    echo ======================================================
    echo   Creating Peyala POS Desktop Shortcut (Local Server)
    echo ======================================================
    echo.
)

set "TARGET_FILE=%SCRIPT_DIR%start-local-kiosk.bat"
if exist "%SCRIPT_DIR%PeyalaPOS.exe" (
    set "TARGET_FILE=%SCRIPT_DIR%PeyalaPOS.exe"
)

set "VBS_FILE=%TEMP%\create_pos_local_shortcut_%RANDOM%.vbs"

(
    echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
    echo sLinkFile = oWS.SpecialFolders^("Desktop"^) ^& "\Peyala POS Station.lnk"
    echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
    echo oLink.TargetPath = "%TARGET_FILE%"
    echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
    echo oLink.Description = "Launch Peyala POS in Kiosk Mode (Local Server)"
    echo oLink.IconLocation = "shell32.dll,13"
    echo oLink.WindowStyle = 1
    echo oLink.Save
) > "%VBS_FILE%"

cscript //nologo "%VBS_FILE%"
if exist "%VBS_FILE%" del "%VBS_FILE%"

if "%QUIET%"=="0" (
    echo [SUCCESS] "Peyala POS Station" shortcut created on your Desktop!
    echo.
    echo Double-click the shortcut on your Desktop anytime to launch the POS!
    echo.
    pause
)

endlocal
exit /b 0
