const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const JDK_DIR = path.join(ROOT_DIR, 'portable-jdk');
const GRADLE_DIR = path.join(ROOT_DIR, 'portable-gradle');
const ANDROID_SDK_DIR = path.join(ROOT_DIR, 'portable-android-sdk');

console.log('=== Peyala Android Build Toolchain Installer ===\n');

// 1. Setup OpenJDK 17
if (!fs.existsSync(path.join(JDK_DIR, 'bin', 'javac.exe'))) {
  console.log('[1/3] Downloading Microsoft OpenJDK 17 (~177 MB)...');
  const jdkZip = path.join(ROOT_DIR, 'jdk.zip');
  execSync(`curl.exe -L -# -o "${jdkZip}" "https://aka.ms/download-jdk/microsoft-jdk-17.0.10-windows-x64.zip"`, { stdio: 'inherit' });

  console.log('[1/3] Extracting OpenJDK 17...');
  const tempExtract = path.join(ROOT_DIR, 'jdk_temp');
  if (fs.existsSync(tempExtract)) fs.rmSync(tempExtract, { recursive: true, force: true });
  execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${jdkZip}' -DestinationPath '${tempExtract}' -Force"`);
  
  const innerDirName = fs.readdirSync(tempExtract)[0];
  const innerPath = path.join(tempExtract, innerDirName);
  
  if (!fs.existsSync(JDK_DIR)) fs.mkdirSync(JDK_DIR, { recursive: true });
  // Move contents of innerPath into JDK_DIR
  for (const file of fs.readdirSync(innerPath)) {
    fs.renameSync(path.join(innerPath, file), path.join(JDK_DIR, file));
  }
  
  fs.rmSync(tempExtract, { recursive: true, force: true });
  fs.rmSync(jdkZip, { force: true });
  console.log('✅ OpenJDK 17 ready at:', JDK_DIR);
} else {
  console.log('✅ OpenJDK 17 already present at:', JDK_DIR);
}

// Verify JDK
const javacVer = execSync(`"${path.join(JDK_DIR, 'bin', 'javac.exe')}" -version`).toString().trim();
console.log('    Compiler:', javacVer);

// 2. Setup Gradle 8.5
if (!fs.existsSync(path.join(GRADLE_DIR, 'bin', 'gradle.bat'))) {
  console.log('\n[2/3] Downloading Gradle 8.5 (~120 MB)...');
  const gradleZip = path.join(ROOT_DIR, 'gradle.zip');
  execSync(`curl.exe -L -# -o "${gradleZip}" "https://services.gradle.org/distributions/gradle-8.5-bin.zip"`, { stdio: 'inherit' });

  console.log('[2/3] Extracting Gradle 8.5...');
  const tempExtract = path.join(ROOT_DIR, 'gradle_temp');
  if (fs.existsSync(tempExtract)) fs.rmSync(tempExtract, { recursive: true, force: true });
  execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${gradleZip}' -DestinationPath '${tempExtract}' -Force"`);

  const innerDirName = fs.readdirSync(tempExtract)[0];
  const innerPath = path.join(tempExtract, innerDirName);

  if (!fs.existsSync(GRADLE_DIR)) fs.mkdirSync(GRADLE_DIR, { recursive: true });
  for (const file of fs.readdirSync(innerPath)) {
    fs.renameSync(path.join(innerPath, file), path.join(GRADLE_DIR, file));
  }

  fs.rmSync(tempExtract, { recursive: true, force: true });
  fs.rmSync(gradleZip, { force: true });
  console.log('✅ Gradle 8.5 ready at:', GRADLE_DIR);
} else {
  console.log('✅ Gradle 8.5 already present at:', GRADLE_DIR);
}

// 3. Setup Android SDK Command Line Tools
const cmdlineToolsBin = path.join(ANDROID_SDK_DIR, 'cmdline-tools', 'latest', 'bin');
if (!fs.existsSync(path.join(cmdlineToolsBin, 'sdkmanager.bat'))) {
  console.log('\n[3/3] Downloading Android SDK Command-Line Tools (~148 MB)...');
  const sdkZip = path.join(ROOT_DIR, 'cmdline-tools.zip');
  if (fs.existsSync(sdkZip)) fs.rmSync(sdkZip, { force: true });
  execSync(`curl.exe -L -# -o "${sdkZip}" "https://dl.google.com/android/repository/commandlinetools-win-10406996_latest.zip"`, { stdio: 'inherit' });

  console.log('[3/3] Extracting Android SDK Tools with tar...');
  const tempExtract = path.join(ROOT_DIR, 'sdk_temp');
  if (fs.existsSync(tempExtract)) fs.rmSync(tempExtract, { recursive: true, force: true });
  fs.mkdirSync(tempExtract, { recursive: true });
  execSync(`tar.exe -xf "${sdkZip}" -C "${tempExtract}"`, { stdio: 'inherit' });

  const targetLatest = path.join(ANDROID_SDK_DIR, 'cmdline-tools', 'latest');
  fs.mkdirSync(path.dirname(targetLatest), { recursive: true });

  const innerSource = path.join(tempExtract, 'cmdline-tools');
  if (fs.existsSync(targetLatest)) fs.rmSync(targetLatest, { recursive: true, force: true });
  fs.renameSync(innerSource, targetLatest);

  fs.rmSync(tempExtract, { recursive: true, force: true });
  fs.rmSync(sdkZip, { force: true });
  console.log('✅ Android SDK Tools ready at:', targetLatest);
} else {
  console.log('✅ Android SDK Tools already present at:', cmdlineToolsBin);
}

console.log('\n🎉 ALL TOOLCHAIN COMPONENTS READY FOR BUILDING APK!\n');
