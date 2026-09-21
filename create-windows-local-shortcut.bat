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

:: Create Desktop Shortcut (.lnk) using PowerShell (safe and direct)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $shortcut = $ws.CreateShortcut((Join-Path $desktop 'Peyala POS Station.lnk')); $shortcut.TargetPath = '%TARGET_FILE%'; $shortcut.WorkingDirectory = '%SCRIPT_DIR%'; $shortcut.Description = 'Launch Peyala POS Local Station'; $shortcut.IconLocation = 'shell32.dll,13'; $shortcut.Save()" >nul 2>&1

:: Fallback if PowerShell was restricted
if not exist "%USERPROFILE%\Desktop\Peyala POS Station.lnk" (
    set "VBS_FILE=%TEMP%\pos_local_sc_%RANDOM%.vbs"
    > "!VBS_FILE!" echo Set WshShell = CreateObject("WScript.Shell")
    >> "!VBS_FILE!" echo Set Shortcut = WshShell.CreateShortcut(WshShell.SpecialFolders("Desktop") + "\Peyala POS Station.lnk")
    >> "!VBS_FILE!" echo Shortcut.TargetPath = "%TARGET_FILE%"
    >> "!VBS_FILE!" echo Shortcut.WorkingDirectory = "%SCRIPT_DIR%"
    >> "!VBS_FILE!" echo Shortcut.Description = "Launch Peyala POS Local Station"
    >> "!VBS_FILE!" echo Shortcut.IconLocation = "shell32.dll,13"
    >> "!VBS_FILE!" echo Shortcut.Save
    cscript //nologo "!VBS_FILE!" >nul 2>&1
    if exist "!VBS_FILE!" del "!VBS_FILE!" >nul 2>&1
)

if "%QUIET%"=="0" (
    echo [SUCCESS] "Peyala POS Station" shortcut created on your Desktop!
    echo.
    echo Double-click the shortcut on your Desktop anytime to launch the POS!
    echo.
    pause
)

endlocal
exit /b 0
