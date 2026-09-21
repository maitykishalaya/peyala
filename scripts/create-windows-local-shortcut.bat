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

> "%VBS_FILE%" echo Set oWS = WScript.CreateObject("WScript.Shell")
>> "%VBS_FILE%" echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\Peyala POS Station.lnk"
>> "%VBS_FILE%" echo Set oLink = oWS.CreateShortcut(sLinkFile)
>> "%VBS_FILE%" echo oLink.TargetPath = "%TARGET_FILE%"
>> "%VBS_FILE%" echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
>> "%VBS_FILE%" echo oLink.Description = "Launch Peyala POS Local Station"
>> "%VBS_FILE%" echo oLink.IconLocation = "shell32.dll,13"
>> "%VBS_FILE%" echo oLink.WindowStyle = 1
>> "%VBS_FILE%" echo oLink.Save

cscript //nologo "%VBS_FILE%" >nul 2>&1
if exist "%VBS_FILE%" del "%VBS_FILE%" >nul 2>&1

if "%QUIET%"=="0" (
    echo [SUCCESS] "Peyala POS Station" shortcut created on your Desktop!
    echo.
    echo Double-click the shortcut on your Desktop anytime to launch the POS!
    echo.
    pause
)

endlocal
exit /b 0
