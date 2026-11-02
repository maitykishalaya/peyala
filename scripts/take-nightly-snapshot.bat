@echo off
setlocal enabledelayedexpansion

title Peyala POS - Nightly 11:59 PM Closing Snapshot

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%..\"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "PORTABLE_NODE_DIR=%ROOT_DIR%portable-node"

:: 1. Locate Node.js
set "NODE_EXE="
if exist "%PORTABLE_NODE_DIR%\node.exe" (
    set "NODE_EXE=%PORTABLE_NODE_DIR%\node.exe"
)
if "!NODE_EXE!"=="" (
    where node >nul 2>&1
    if not errorlevel 1 set "NODE_EXE=node"
)
if "!NODE_EXE!"=="" (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    )
)

if "!NODE_EXE!"=="" (
    echo [ERROR] Node.js runtime not found.
    exit /b 1
)

cd /d "%BACKEND_DIR%"
"!NODE_EXE!" "scripts/take-nightly-snapshot.js" %*
exit /b %errorlevel%

