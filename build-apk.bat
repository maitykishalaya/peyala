@echo off
setlocal enabledelayedexpansion

title Peyala POS - Enterprise Android APK Builder

echo ====================================================================
echo    Peyala POS - Enterprise Android APK Builder for Staff Phones
echo ====================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: Check if portable node exists or use system node
set "NODE_BIN=node"
if exist "%SCRIPT_DIR%portable-node\node.exe" (
    set "NODE_BIN=%SCRIPT_DIR%portable-node\node.exe"
)

:: 1. Ensure build toolchain is ready
echo [*] Checking Android toolchain (JDK 17, Gradle, Android SDK)...
"%NODE_BIN%" scripts\setup-toolchain.js
if errorlevel 1 (
    echo [ERROR] Failed to set up Android toolchain.
    pause
    exit /b 1
)

:: 2. Ensure Android icons are generated
echo.
echo [*] Generating Android launcher icons...
"%NODE_BIN%" scripts\generate-icons.js

:: 3. Build & Sign the Enterprise APK
echo.
echo [*] Compiling and signing enterprise APK...
"%NODE_BIN%" scripts\build-apk.js
if errorlevel 1 (
    echo [ERROR] Failed to build APK.
    pause
    exit /b 1
)

echo.
echo [*] Build finished! Final APK is ready at:
echo     %SCRIPT_DIR%Peyala-POS.apk
echo.
pause
