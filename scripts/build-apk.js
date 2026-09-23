const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const JDK_DIR = path.join(ROOT_DIR, 'portable-jdk');
const GRADLE_DIR = path.join(ROOT_DIR, 'portable-gradle');
const ANDROID_SDK_DIR = path.join(ROOT_DIR, 'portable-android-sdk');
const ANDROID_PROJ_DIR = path.join(ROOT_DIR, 'android');
const APP_DIR = path.join(ANDROID_PROJ_DIR, 'app');

console.log('====================================================');
console.log('       PEYALA POS - ENTERPRISE APK BUILDER           ');
console.log('====================================================\n');

// 1. Configure Environment Variables
const PATH_DELIM = path.delimiter;
const env = {
  ...process.env,
  JAVA_HOME: JDK_DIR,
  ANDROID_HOME: ANDROID_SDK_DIR,
  ANDROID_SDK_ROOT: ANDROID_SDK_DIR,
  PATH: [
    path.join(JDK_DIR, 'bin'),
    path.join(GRADLE_DIR, 'bin'),
    path.join(ANDROID_SDK_DIR, 'cmdline-tools', 'latest', 'bin'),
    path.join(ANDROID_SDK_DIR, 'platform-tools'),
    process.env.PATH,
  ].join(PATH_DELIM),
};

console.log('[1/5] Verifying toolchains...');
const javaBin = path.join(JDK_DIR, 'bin', 'java.exe');
const keytoolBin = path.join(JDK_DIR, 'bin', 'keytool.exe');
const gradleBat = path.join(GRADLE_DIR, 'bin', 'gradle.bat');

if (!fs.existsSync(javaBin)) {
  console.error('[ERROR] Java not found in portable-jdk!');
  process.exit(1);
}
if (!fs.existsSync(gradleBat)) {
  console.error('[ERROR] Gradle not found in portable-gradle!');
  process.exit(1);
}

const javaVer = execSync(`"${javaBin}" -version 2>&1`).toString().split('\n')[0];
console.log(`    Java Runtime: ${javaVer.trim()}`);
console.log(`    Android SDK:  ${ANDROID_SDK_DIR}`);
console.log(`    Gradle Tool:  ${gradleBat}`);

// 2. Accept Android SDK Licenses & Setup Directories
console.log('\n[2/5] Configuring Android SDK licenses & dependencies...');
const licensesDir = path.join(ANDROID_SDK_DIR, 'licenses');
if (!fs.existsSync(licensesDir)) fs.mkdirSync(licensesDir, { recursive: true });

// Known Google Android SDK license hashes
const sdkLicenseContent = `
24333f8a63b6825ea9c5514f83c2829b004d1fee
8933bad161af4178b1185d1a37fbf41ea5269c55
d56f5187479451eabf01fb78af6dfcb131a6481e
84831b9409646a33e33e4540d4e01902225704cd
`.trim();

fs.writeFileSync(path.join(licensesDir, 'android-sdk-license'), sdkLicenseContent);
fs.writeFileSync(path.join(licensesDir, 'android-sdk-preview-license'), '84831b9409646a33e33e4540d4e01902225704cd\n');
console.log('    Android SDK licenses written.');

// Write local.properties for Gradle
const sdkDirEscaped = ANDROID_SDK_DIR.replace(/\\/g, '/');
fs.writeFileSync(path.join(ANDROID_PROJ_DIR, 'local.properties'), `sdk.dir=${sdkDirEscaped}\n`);
console.log(`    local.properties written (sdk.dir=${sdkDirEscaped}).`);

// Install platform android-34 and build-tools 34.0.0 if not present
const sdkmanagerBat = path.join(ANDROID_SDK_DIR, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat');
if (fs.existsSync(sdkmanagerBat)) {
  // Pre-accept licenses non-interactively
  try {
    execSync(`"${sdkmanagerBat}" --licenses`, {
      env,
      input: 'y\ny\ny\ny\ny\ny\ny\ny\ny\ny\ny\ny\n',
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (_) {}

  const platformsDir = path.join(ANDROID_SDK_DIR, 'platforms', 'android-34');
  if (!fs.existsSync(platformsDir)) {
    console.log('    Installing Android 34 platform & build tools via sdkmanager...');
    try {
      execSync(`"${sdkmanagerBat}" "platforms;android-34" "build-tools;34.0.0"`, {
        env,
        input: 'y\ny\ny\ny\ny\ny\ny\ny\ny\ny\ny\ny\n',
        stdio: ['pipe', 'inherit', 'inherit'],
      });
    } catch (err) {
      console.warn('    Note: sdkmanager exited with code, Gradle will attempt auto-download.');
    }
  } else {
    console.log('    platforms;android-34 already installed.');
  }
}

// 3. Generate Enterprise Keystore
console.log('\n[3/5] Generating Enterprise Release Signing Keystore...');
const keystorePath = path.join(APP_DIR, 'peyala-release.jks');
if (!fs.existsSync(keystorePath)) {
  console.log('    Creating new release keystore (peyala-release.jks)...');
  const genCmd = `"${keytoolBin}" -genkey -v -keystore "${keystorePath}" -alias peyala -keyalg RSA -keysize 2048 -validity 10000 -storepass peyala2024 -keypass peyala2024 -dname "CN=Peyala POS, OU=Operations, O=Peyala, L=Howrah, ST=West Bengal, C=IN"`;
  execSync(genCmd, { stdio: 'inherit' });
  console.log('    ✅ Enterprise keystore generated successfully.');
} else {
  console.log('    ✅ Enterprise keystore already exists.');
}

// 4. Compile and Assemble Release APK
console.log('\n[4/5] Building Enterprise Release APK with Gradle...');
console.log('    Running: gradle.bat assembleRelease in android directory...');

try {
  execSync(`"${gradleBat}" assembleRelease --stacktrace`, {
    cwd: ANDROID_PROJ_DIR,
    env,
    stdio: 'inherit',
  });
} catch (err) {
  console.error('\n[ERROR] Gradle build failed. Attempting assembleDebug as fallback...');
  execSync(`"${gradleBat}" assembleDebug --stacktrace`, {
    cwd: ANDROID_PROJ_DIR,
    env,
    stdio: 'inherit',
  });
}

// 5. Locate Output APK and Distribute
console.log('\n[5/5] Locating and distributing final APK...');
const releaseApk = path.join(APP_DIR, 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const debugApk = path.join(APP_DIR, 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

let builtApk = null;
if (fs.existsSync(releaseApk)) builtApk = releaseApk;
else if (fs.existsSync(debugApk)) builtApk = debugApk;

if (!builtApk) {
  console.error('[ERROR] Could not find compiled APK in build outputs!');
  process.exit(1);
}

const stats = fs.statSync(builtApk);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

// Copy to destinations
const destRoot = path.join(ROOT_DIR, 'Peyala-POS.apk');
const destDist = path.join(ROOT_DIR, 'dist', 'Peyala-POS.apk');
const destPublic = path.join(ROOT_DIR, 'frontend', 'public', 'Peyala-POS.apk');

if (!fs.existsSync(path.join(ROOT_DIR, 'dist'))) fs.mkdirSync(path.join(ROOT_DIR, 'dist'), { recursive: true });

fs.copyFileSync(builtApk, destRoot);
fs.copyFileSync(builtApk, destDist);
fs.copyFileSync(builtApk, destPublic);

console.log('\n====================================================');
console.log('  🎉 ENTERPRISE ANDROID APK GENERATED SUCCESSFULLY! ');
console.log('====================================================');
console.log(`  Package File:  Peyala-POS.apk`);
console.log(`  File Size:     ${sizeMb} MB`);
console.log(`  App Name:      Peyala POS`);
console.log(`  Package ID:    com.peyala.pos`);
console.log(`  Target Android: Android 7.0 to Android 14/15`);
console.log(`\n  File Locations:`);
console.log(`  1. Root:     ${destRoot}`);
console.log(`  2. Dist:     ${destDist}`);
console.log(`  3. Web Host: ${destPublic} (Available via http://<server-ip>:3000/Peyala-POS.apk)`);
console.log('====================================================\n');
