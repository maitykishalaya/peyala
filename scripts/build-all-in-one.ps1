# ====================================================================
# Peyala POS - All-In-One Single-File Installer Compiler / Packager
# ====================================================================

param (
    [switch]$SkipFrontendBuild = $false,
    [switch]$SkipAndroidBuild = $false,
    [string]$ExistingPayload = ""
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "   PEYALA POS - ALL-IN-ONE SINGLE-FILE INSTALLER BUILDER" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "[*] Project root: $rootDir"

# 0. Compile / Update Latest Android APK Build (Peyala-POS.apk)
if (-not $SkipAndroidBuild) {
    Write-Host "[*] Compiling latest Android APK build (Peyala-POS.apk)..." -ForegroundColor Yellow
    $nodeExe = "node"
    $portableNode = Join-Path $rootDir "portable-node\node.exe"
    if (Test-Path $portableNode) { $nodeExe = $portableNode }
    $buildApkScript = Join-Path $rootDir "scripts\build-apk.js"
    & $nodeExe $buildApkScript
    $apkRoot = Join-Path $rootDir "Peyala-POS.apk"
    if (Test-Path $apkRoot) {
        $apkSizeMB = [math]::Round((Get-Item $apkRoot).Length / 1MB, 2)
        Write-Host "[OK] Latest Android build ready: $apkRoot ($apkSizeMB MB)" -ForegroundColor Green
    } else {
        Write-Warning "Android APK compilation did not output Peyala-POS.apk. Proceeding with existing build..."
    }
} else {
    Write-Host "[*] Skipping Android APK compilation (-SkipAndroidBuild specified)." -ForegroundColor Gray
}

# 1. Verify / Compile Frontend Production Build
$buildIdPath = Join-Path $rootDir "frontend\.next\BUILD_ID"
if (-not (Test-Path $buildIdPath) -and -not $SkipFrontendBuild) {
    Write-Host "[*] Compiling frontend production bundle (one-time build)..." -ForegroundColor Yellow
    Push-Location (Join-Path $rootDir "frontend")
    cmd.exe /c "call npm run build"
    Pop-Location
    if (-not (Test-Path $buildIdPath)) {
        Write-Error "Frontend production build failed. Could not locate BUILD_ID."
    }
} else {
    Write-Host "[OK] Frontend production build verified." -ForegroundColor Green
}

# 2. Verify / Compile Native PeyalaPOS.exe
$exePath = Join-Path $rootDir "PeyalaPOS.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "[*] Compiling native PeyalaPOS.exe launcher..." -ForegroundColor Yellow
    Push-Location $rootDir
    cmd.exe /c "call build-exe.bat /quiet"
    Pop-Location
}
if (Test-Path $exePath) {
    Write-Host "[OK] Native PeyalaPOS.exe verified." -ForegroundColor Green
}

# 3. Create Payload Zip using Windows tar.exe
$cleanupZip = $true
if ($ExistingPayload -and (Test-Path $ExistingPayload)) {
    $tempZip = $ExistingPayload
    $cleanupZip = $false
    Write-Host "[*] Reusing existing payload archive: $tempZip" -ForegroundColor Green
} else {
    $tempZip = Join-Path $env:TEMP ("peyala_payload_" + [System.Guid]::NewGuid().ToString("N") + ".zip")
    Write-Host "[*] Packaging clean application payload into archive..." -ForegroundColor Yellow
    Write-Host "    (Excluding dev caches, test databases, and Android SDKs to minimize size...)"

$excludeList = @(
    '--exclude=.git',
    '--exclude=./.git*',
    '--exclude=portable-android-sdk',
    '--exclude=./portable-android-sdk*',
    '--exclude=portable-gradle',
    '--exclude=./portable-gradle*',
    '--exclude=portable-jdk',
    '--exclude=./portable-jdk*',
    '--exclude=android',
    '--exclude=./android*',
    '--exclude=dist',
    '--exclude=./dist*',
    '--exclude=restore_points',
    '--exclude=./restore_points*',
    '--exclude=test-runner',
    '--exclude=./test-runner*',
    '--exclude=*/.next/cache*',
    '--exclude=*/.next/dev*',
    '--exclude=.next/cache*',
    '--exclude=.next/dev*',
    '--exclude=*db_test_run_*',
    '--exclude=*test_db*',
    '--exclude=*mongod.lock',
    '--exclude=*.log',
    '--exclude=*.tmp',
    '--exclude=Peyala-POS-Setup.exe',
    '--exclude=./Peyala-POS-Setup.exe',
    '--exclude=INSTALL-PEYALA-ALL-IN-ONE.bat',
    '--exclude=./INSTALL-PEYALA-ALL-IN-ONE.bat',
    '--exclude=Peyala-POS-AllInOne-Installer.exe',
    '--exclude=./Peyala-POS-AllInOne-Installer.exe'
)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & tar.exe -a -cf $tempZip $excludeList -C $rootDir .
    $sw.Stop()

    if (-not (Test-Path $tempZip)) {
        Write-Error "Failed to generate payload zip file."
    }
}

$zipSizeMB = [math]::Round((Get-Item $tempZip).Length / 1MB, 2)
Write-Host "[OK] Payload archive ready! Size: $zipSizeMB MB" -ForegroundColor Green

# 4. Generate Single-File Batch Installer (INSTALL-PEYALA-ALL-IN-ONE.bat)
Write-Host "[*] Generating single-file batch installer: INSTALL-PEYALA-ALL-IN-ONE.bat..." -ForegroundColor Yellow

$batHeaderCode = @'
@echo off
setlocal enabledelayedexpansion

title Peyala POS - Standalone 1-Click Laptop Installer

echo ====================================================================
echo      PEYALA RESTAURANT OPERATIONS & POS MANAGEMENT SUITE
echo          1-Click Standalone Laptop Installer (Single File)
echo ====================================================================
echo.
echo  This standalone installer contains the complete Peyala POS system:
echo    * Production Frontend & Real-Time Waiter Portal
echo    * Local-First Backend API & Offline Auth Vault
echo    * Embedded MongoDB Database Engine (Zero Cloud Dependency)
echo    * Portable Node.js Runtime (No pre-installed software required)
echo    * Dedicated Native Desktop Application & System Tray Controls
echo    * Direct Hardware Thermal Printing Subsystem
echo.
echo  Everything is embedded inside this single file. No other files needed!
echo ====================================================================
echo.

:: 1. Determine Target Directory
set "DEFAULT_DIR=C:\Peyala"
set "TARGET_DIR=%DEFAULT_DIR%"

echo Default installation location: %DEFAULT_DIR%
set /p "USER_INPUT_DIR=Press ENTER to install to %DEFAULT_DIR%, or type custom path: "
if not "!USER_INPUT_DIR!"=="" set "TARGET_DIR=!USER_INPUT_DIR!"

:: Strip any surrounding quotes
set "TARGET_DIR=%TARGET_DIR:"=%"

echo.
echo [*] Target installation directory: "!TARGET_DIR!"
if not exist "!TARGET_DIR!" (
    mkdir "!TARGET_DIR!" 2>nul
    if errorlevel 1 (
        echo [!] Could not create "!TARGET_DIR!". Trying user desktop folder...
        set "TARGET_DIR=%USERPROFILE%\Desktop\Peyala"
        mkdir "!TARGET_DIR!" 2>nul
    )
)

if not exist "!TARGET_DIR!" (
    echo [ERROR] Unable to create target directory "!TARGET_DIR!".
    echo Please run this installer as Administrator or choose another folder.
    pause
    exit /b 1
)

:: 2. Check for running processes on ports 3000 & 4000
echo [*] Checking for conflicting background services...
for %%P in (3000 4000) do (
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r /c:":%%P .*LISTENING"') do (
        echo [*] Stopping conflicting process on port %%P (PID %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
)

:: 3. Extract Embedded Archive
echo.
echo [*] Extracting all application components into "!TARGET_DIR!"...
echo     (This takes only ~15 to 30 seconds - please wait...)
echo.

set "EXTRACT_OK=0"
where tar.exe >nul 2>&1
if not errorlevel 1 (
    tar.exe -xf "%~f0" -C "!TARGET_DIR!"
    if not errorlevel 1 set "EXTRACT_OK=1"
)

if "!EXTRACT_OK!"=="0" (
    echo [*] Using PowerShell fallback extraction engine...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$src = '%~f0'; $dest = '!TARGET_DIR!';" ^
        "Add-Type -AssemblyName System.IO.Compression.FileSystem;" ^
        "$fs = [System.IO.File]::OpenRead($src);" ^
        "$fs.Seek(8192, [System.IO.SeekOrigin]::Begin) | Out-Null;" ^
        "$tmpZip = Join-Path $env:TEMP ('peyala_extract_' + [System.Guid]::NewGuid().ToString('N') + '.zip');" ^
        "$outStream = [System.IO.File]::Create($tmpZip);" ^
        "$fs.CopyTo($outStream);" ^
        "$fs.Close(); $outStream.Close();" ^
        "[System.IO.Compression.ZipFile]::ExtractToDirectory($tmpZip, $dest);" ^
        "Remove-Item $tmpZip -Force;"
    if not errorlevel 1 set "EXTRACT_OK=1"
)

if "!EXTRACT_OK!"=="0" (
    echo.
    echo [ERROR] Extraction failed. Please ensure sufficient disk space (at least 1 GB)
    echo and write permissions on "!TARGET_DIR!".
    pause
    exit /b 1
)

echo.
echo [OK] All system files extracted successfully!

:: 4. Post-Extraction Configuration
echo.
echo [*] Configuring database and runtime security...
if exist "!TARGET_DIR!\backend\data\db\mongod.lock" (
    del /f /q "!TARGET_DIR!\backend\data\db\mongod.lock" >nul 2>&1
)

:: Ensure native launcher is compiled with logo
if exist "!TARGET_DIR!\build-exe.bat" (
    pushd "!TARGET_DIR!"
    call build-exe.bat /quiet >nul 2>&1
    popd
)

:: 5. Create Desktop and Start Menu Shortcuts
echo [*] Creating Desktop and Start Menu shortcuts with official Peyala logo...
if exist "!TARGET_DIR!\create-windows-shortcut.bat" (
    pushd "!TARGET_DIR!"
    call create-windows-shortcut.bat /quiet
    popd
)

echo.
echo ====================================================================
echo   Peyala POS Installation Completed Successfully!
echo ====================================================================
echo.
echo   Application installed at: !TARGET_DIR!
echo   Desktop Shortcut:        "Peyala POS" on your Windows Desktop
echo   Default Credentials:     admin@peyala.com / peyala123
echo.
echo ====================================================================
echo.

set /p "LAUNCH_NOW=Would you like to launch Peyala POS right now? (Y/N) [Y]: "
if "!LAUNCH_NOW!"=="" set "LAUNCH_NOW=Y"
if /i "!LAUNCH_NOW!"=="Y" (
    echo.
    echo [*] Starting Peyala Restaurant Operations & POS Station...
    cd /d "!TARGET_DIR!"
    if exist "!TARGET_DIR!\PeyalaPOS.exe" (
        start "" "!TARGET_DIR!\PeyalaPOS.exe"
    ) else if exist "!TARGET_DIR!\start-peyala-app.bat" (
        start "" "!TARGET_DIR!\start-peyala-app.bat"
    )
)

echo.
echo You can close this installer window at any time.
pause
exit /b 0
'@

$headerBytes = [System.Text.Encoding]::ASCII.GetBytes($batHeaderCode)
if ($headerBytes.Length -gt 8190) {
    Write-Error "Batch header code is too long ($($headerBytes.Length) bytes). Must be under 8190 bytes."
}

# Pad header to exactly 8192 bytes
$paddedHeader = New-Object byte[] 8192
[Array]::Copy($headerBytes, $paddedHeader, $headerBytes.Length)
for ($i = $headerBytes.Length; $i -lt 8192; $i++) {
    $paddedHeader[$i] = 32 # space
}
$paddedHeader[8190] = 13 # CR
$paddedHeader[8191] = 10 # LF

$outBat = Join-Path $rootDir "INSTALL-PEYALA-ALL-IN-ONE.bat"
if (Test-Path $outBat) {
    Remove-Item $outBat -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250
}
$batStream = [System.IO.File]::Create($outBat)
$batStream.Write($paddedHeader, 0, 8192)

# Stream copy payload zip directly
$zipReadStream = [System.IO.File]::OpenRead($tempZip)
$zipReadStream.CopyTo($batStream)
$zipReadStream.Close()
$batStream.Close()

$batSizeMB = [math]::Round((Get-Item $outBat).Length / 1MB, 2)
Write-Host "[OK] Single-file Batch Installer created: $outBat ($batSizeMB MB)" -ForegroundColor Green

# 5. Generate Standalone Windows Executable Installer (Peyala-POS-AllInOne-Installer.exe)
Write-Host "[*] Compiling standalone Windows executable installer: Peyala-POS-AllInOne-Installer.exe..." -ForegroundColor Yellow

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

$outExe = Join-Path $rootDir "Peyala-POS-AllInOne-Installer.exe"
$stubSource = Join-Path $rootDir "scripts\InstallerStub.cs"
$iconPath = Join-Path $rootDir "icon.ico"
$tempStubExe = Join-Path $env:TEMP "PeyalaStub.exe"

if (Test-Path $csc) {
    $cscArgs = @("/nologo", "/target:exe", "/out:$tempStubExe")
    if (Test-Path $iconPath) {
        $cscArgs += "/win32icon:$iconPath"
    }
    $cscArgs += $stubSource

    & $csc $cscArgs
    if (Test-Path $tempStubExe) {
        # Combine stub exe with zip payload
        $stubBytes = [System.IO.File]::ReadAllBytes($tempStubExe)
        if (Test-Path $outExe) {
            Remove-Item $outExe -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 250
        }
        $exeStream = [System.IO.File]::Create($outExe)
        $exeStream.Write($stubBytes, 0, $stubBytes.Length)
        
        $zipReadStream2 = [System.IO.File]::OpenRead($tempZip)
        $zipReadStream2.CopyTo($exeStream)
        $zipReadStream2.Close()
        $exeStream.Close()
        
        Remove-Item $tempStubExe -Force -ErrorAction SilentlyContinue

        $exeSizeMB = [math]::Round((Get-Item $outExe).Length / 1MB, 2)
        Write-Host "[OK] Standalone Executable Installer created: $outExe ($exeSizeMB MB)" -ForegroundColor Green
    }
} else {
    Write-Host "[!] C# compiler csc.exe not found. Skipped .exe builder." -ForegroundColor Yellow
}

# 6. Cleanup temporary zip if generated this run
if ($cleanupZip -and (Test-Path $tempZip)) {
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
}

# 7. Auto-Mirror to C:\Desktop\Peyala_v8 if present
$mirrorDir = "C:\Desktop\Peyala_v8"
if (Test-Path $mirrorDir) {
    Write-Host "[*] Mirroring installers and APK to $mirrorDir..." -ForegroundColor Yellow
    Copy-Item $outBat -Destination $mirrorDir -Force -ErrorAction SilentlyContinue
    if (Test-Path $outExe) {
        Copy-Item $outExe -Destination $mirrorDir -Force -ErrorAction SilentlyContinue
    }
    $apkPath = Join-Path $rootDir "Peyala-POS.apk"
    if (Test-Path $apkPath) {
        Copy-Item $apkPath -Destination $mirrorDir -Force -ErrorAction SilentlyContinue
        $mirrorPublic = Join-Path $mirrorDir "frontend\public"
        if (Test-Path $mirrorPublic) {
            Copy-Item $apkPath -Destination $mirrorPublic -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "[OK] Mirrored latest installers and APK to $mirrorDir." -ForegroundColor Green
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "   BUILD COMPLETE! SINGLE-FILE INSTALLERS & APK ARE READY!" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Write-Host " You can now copy EITHER of these single files onto a pendrive:"
Write-Host "   1. [BATCH] INSTALL-PEYALA-ALL-IN-ONE.bat ($batSizeMB MB)" -ForegroundColor Cyan
if (Test-Path $outExe) {
    Write-Host "   2. [EXE]   Peyala-POS-AllInOne-Installer.exe ($exeSizeMB MB)" -ForegroundColor Cyan
}
$finalApk = Join-Path $rootDir "Peyala-POS.apk"
if (Test-Path $finalApk) {
    $finalApkSizeMB = [math]::Round((Get-Item $finalApk).Length / 1MB, 2)
    Write-Host "   3. [APK]   Peyala-POS.apk ($finalApkSizeMB MB) [Waiters / Mobile Devices]" -ForegroundColor Cyan
}
Write-Host ""
Write-Host " On target Windows laptop, just double-click that ONE installer file."
Write-Host " For Android waiter tablets, install Peyala-POS.apk directly."
Write-Host "====================================================================" -ForegroundColor Green
