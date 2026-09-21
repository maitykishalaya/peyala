@echo off
setlocal enabledelayedexpansion

title Peyala POS - EXE Builder

set "SCRIPT_DIR=%~dp0"
set "QUIET=0"
if /i "%~1"=="/quiet" set "QUIET=1"

if "%QUIET%"=="0" (
    echo ====================================================================
    echo   🍵 Compiling native PeyalaPOS.exe (Using built-in Windows C#)
    echo ====================================================================
    echo.
)

set "CSC="
if exist "%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
) else if exist "%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe" (
    set "CSC=%SystemRoot%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if "%CSC%"=="" (
    if "%QUIET%"=="0" (
        echo [ERROR] Microsoft .NET C# compiler (csc.exe) was not found.
        echo You can still run Peyala POS directly via start-local-kiosk.bat!
        pause
    )
    exit /b 1
)

"%CSC%" /nologo /target:winexe /r:System.Windows.Forms.dll,System.Drawing.dll /out:"%SCRIPT_DIR%PeyalaPOS.exe" "%SCRIPT_DIR%PeyalaLauncher.cs"

if errorlevel 1 (
    if "%QUIET%"=="0" (
        echo [ERROR] Compilation failed.
        pause
    )
    exit /b 1
)

if "%QUIET%"=="0" (
    echo [SUCCESS] PeyalaPOS.exe generated successfully!
    echo You can now double-click PeyalaPOS.exe to run the POS with system tray controls.
    echo.
    pause
)

endlocal
exit /b 0
