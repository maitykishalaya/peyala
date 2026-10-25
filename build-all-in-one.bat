@echo off
setlocal

title Peyala POS - Build Single-File All-In-One Installers

echo ====================================================================
echo   Peyala POS - Build Single-File All-In-One Installers
echo ====================================================================
echo.
echo This tool compiles all Peyala POS components into a single file installer:
echo   1. INSTALL-PEYALA-ALL-IN-ONE.bat (Single-file batch installer)
echo   2. Peyala-POS-AllInOne-Installer.exe (Single-file executable installer)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-all-in-one.ps1" %*

if errorlevel 1 (
    echo.
    echo [ERROR] Packaging failed.
    pause
    exit /b 1
)

echo.
pause
endlocal
exit /b 0
