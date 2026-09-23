@echo off
setlocal enabledelayedexpansion

title Peyala POS - Windows Desktop Installer / EXE Packager

echo ====================================================================
echo    Peyala POS - Building Standalone Windows Executable / Installer
echo ====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"
set "DESKTOP_DIR=%SCRIPT_DIR%desktop"

:: 1. Build frontend production assets
echo [*] Step 1/3: Compiling optimized frontend production assets...
cd /d "%FRONTEND_DIR%"
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)

:: 2. Ensure desktop dependencies are installed
echo.
echo [*] Step 2/3: Checking desktop packaging tools...
cd /d "%DESKTOP_DIR%"
if not exist "%DESKTOP_DIR%\node_modules\electron-builder" (
    echo [*] Installing electron-builder...
    call npm install --save-dev electron-builder
)

:: 3. Run electron-builder to generate installer and portable .exe
echo.
echo [*] Step 3/3: Packaging Windows Desktop Application (.exe)...
call npm run dist

if errorlevel 1 (
    echo [ERROR] Packaging failed.
    pause
    exit /b 1
)

echo.
echo ====================================================================
echo    Standalone Windows App packaged successfully!
echo   Location: "%SCRIPT_DIR%dist"
echo ====================================================================
echo.
pause

endlocal
exit /b 0
