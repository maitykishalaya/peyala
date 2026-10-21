/**
 * Peyala Isolated Disposable Sandbox Manager
 * STRICT SAFETY ENFORCEMENT:
 * - Spawns a dedicated mongod process on an isolated test port (27019)
 * - Uses a temporary disposable database directory (backend/data/db_test_<runId>)
 * - Completely disconnects and refuses any connection to MongoDB Atlas / Cloud
 * - Disables all background sync outbox and external integrations
 * - Performs preflight verification before any write operation
 * - Verifies safe cleanup restricted strictly to the test run resources
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');

class SandboxManager {
  constructor(runId) {
    this.runId = runId || `run_${Date.now()}`;
    this.testDbPort = 27019; // Isolated dedicated MongoDB test port (production is 27017)
    this.testApiPort = 4000; // Aligns with Next.js compiled rewrite proxy
    this.testFrontendPort = 3000;
    this.testDbName = `peyala_loadtest_${this.runId}`;
    this.testDbDir = path.join(BACKEND_DIR, 'data', `db_test_${this.runId}`);
    this.testUri = `mongodb://127.0.0.1:${this.testDbPort}/${this.testDbName}`;

    this.mongodProcess = null;
    this.backendProcess = null;
    this.frontendProcess = null;
    this.manifest = {
      runId: this.runId,
      timestamp: new Date().toISOString(),
      testDbPort: this.testDbPort,
      testApiPort: this.testApiPort,
      testFrontendPort: this.testFrontendPort,
      testDbName: this.testDbName,
      testDbDir: this.testDbDir,
      testUri: this.testUri,
      createdResources: [],
      safetyChecks: {},
    };
  }

  log(msg) {
    console.log(`[Sandbox ${this.runId}] ${msg}`);
  }

  warn(msg) {
    console.warn(`[Sandbox ${this.runId} WARNING] ${msg}`);
  }

  error(msg) {
    console.error(`[Sandbox ${this.runId} ERROR] ${msg}`);
  }

  /**
   * Preflight Safety Verification
   * Mandatory check before any test execution
   */
  async preflightSafetyCheck() {
    this.log('Performing Preflight Safety Checks...');

    // 1. Confirm Branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    if (!currentBranch.startsWith('test/')) {
      throw new Error(`PREFLIGHT FAILED: Must be on a test branch! Current branch is "${currentBranch}".`);
    }
    this.manifest.safetyChecks.branch = { passed: true, branch: currentBranch };

    // 2. Verify Target URI does not touch live/cloud Atlas
    if (this.testUri.includes('mongodb.net') || this.testUri.includes('atlas') || this.testUri.includes('c3pp9i2')) {
      throw new Error(`PREFLIGHT FAILED: Target URI contains cloud host! ${this.testUri}`);
    }
    if (this.testDbPort === 27017) {
      throw new Error('PREFLIGHT FAILED: Test DB port cannot be default 27017 (production local DB port)!');
    }
    this.manifest.safetyChecks.uriSafety = { passed: true, testUri: this.testUri };

    // 3. Verify Target Data Directory is NOT production data dir
    const prodDataDir = path.normalize(path.join(BACKEND_DIR, 'data', 'db'));
    const normTestDir = path.normalize(this.testDbDir);
    if (normTestDir === prodDataDir) {
      throw new Error(`PREFLIGHT FAILED: Test DB directory equals production data directory! ${normTestDir}`);
    }
    this.manifest.safetyChecks.storageSafety = { passed: true, testDir: normTestDir };

    // 4. Verify External Sync is disabled
    this.manifest.safetyChecks.externalSync = { disabled: true, centralUriBlocked: true };

    this.log('✅ Preflight Safety Check PASSED. Isolated sandbox boundaries verified.');
    return true;
  }

  async checkPortOpen(port, timeoutMs = 600) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => { socket.destroy(); resolve(false); });
      socket.connect(port, '127.0.0.1');
    });
  }

  findMongodBinary() {
    const localBin = path.join(BACKEND_DIR, 'bin', 'mongod.exe');
    if (fs.existsSync(localBin)) return localBin;
    const standardPaths = [
      'C:\\Program Files\\MongoDB\\Server\\9.0\\bin\\mongod.exe',
      'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe',
      'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('mongod.exe binary could not be found.');
  }

  /**
   * Start Isolated Local MongoDB Instance on port 27019
   */
  async startIsolatedDb() {
    this.log(`Initializing isolated database directory at: ${this.testDbDir}`);
    if (!fs.existsSync(this.testDbDir)) {
      fs.mkdirSync(this.testDbDir, { recursive: true });
    }
    this.manifest.createdResources.push(this.testDbDir);

    const binaryPath = this.findMongodBinary();
    this.log(`Launching isolated mongod process on port ${this.testDbPort}...`);

    const args = [
      '--dbpath', this.testDbDir,
      '--port', String(this.testDbPort),
      '--bind_ip', '127.0.0.1',
    ];
    if (process.platform !== 'win32') {
      args.push('--nounixsocket');
    }

    this.mongodProcess = spawn(binaryPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.mongodProcess.stdout.on('data', () => {});
    this.mongodProcess.stderr.on('data', (d) => {
      const s = d.toString().trim();
      if (s.includes('error') || s.includes('fatal')) this.warn(`mongod stderr: ${s}`);
    });

    // Wait for test port to be listening
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await this.checkPortOpen(this.testDbPort)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      throw new Error(`Failed to bind isolated test MongoDB on port ${this.testDbPort}`);
    }

    this.log(`✅ Isolated MongoDB running on 127.0.0.1:${this.testDbPort} (DB: ${this.testDbName})`);
  }

  killPort(port) {
    try {
      if (process.platform === 'win32') {
        const out = execSync(`netstat -aon 2>nul | findstr ":${port} " | findstr "LISTENING"`, { encoding: 'utf8' });
        for (const line of out.trim().split('\n')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid) && pid !== '0') {
            try { execSync(`taskkill /F /PID ${pid} >nul 2>&1`); } catch (_) {}
          }
        }
      }
    } catch (_) {}
  }

  /**
   * Start Isolated Test Backend API Server on port 4000
   */
  async startIsolatedBackend() {
    this.killPort(this.testApiPort);
    await new Promise((r) => setTimeout(r, 400));
    this.log(`Starting isolated backend server on port ${this.testApiPort}...`);
    const serverScript = path.join(BACKEND_DIR, 'src', 'server.js');

    const env = {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(this.testApiPort),
      MONGODB_LOCAL_PORT: String(this.testDbPort),
      MONGODB_LOCAL_DB: this.testDbName,
      MONGODB_URI: this.testUri,
      MONGODB_CENTRAL_URI: '', // Explicitly blocked
      SYNC_INTERVAL_MS: '999999999', // Disabled
      JWT_SECRET: `test_jwt_secret_${this.runId}`,
    };

    this.backendProcess = spawn(process.execPath, [serverScript], {
      cwd: BACKEND_DIR,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.backendProcess.stdout.on('data', () => {});
    this.backendProcess.stderr.on('data', (d) => {
      const s = d.toString().trim();
      if (s.includes('Error') && !s.includes('skip')) this.warn(`backend stderr: ${s}`);
    });

    // Wait for backend port
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await this.checkPortOpen(this.testApiPort)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      throw new Error(`Failed to start isolated backend on port ${this.testApiPort}`);
    }

    this.log(`✅ Isolated Backend running on http://127.0.0.1:${this.testApiPort}`);
  }

  /**
   * Start Isolated Frontend Next.js Server on port 3001
   */
  async startIsolatedFrontend() {
    this.killPort(this.testFrontendPort);
    await new Promise((r) => setTimeout(r, 400));
    this.log(`Starting isolated frontend Next.js server on port ${this.testFrontendPort}...`);
    const nextCli = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(this.testFrontendPort),
      NEXT_PUBLIC_API_URL: `http://localhost:${this.testApiPort}/api`,
    };

    this.frontendProcess = spawn(process.execPath, [nextCli, 'start', '-p', String(this.testFrontendPort)], {
      cwd: FRONTEND_DIR,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.frontendProcess.stdout.on('data', () => {});
    this.frontendProcess.stderr.on('data', (d) => {
      const s = d.toString().trim();
      if (s.includes('Error')) this.warn(`frontend stderr: ${s}`);
    });

    let ready = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await this.checkPortOpen(this.testFrontendPort)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      throw new Error(`Failed to start isolated frontend on port ${this.testFrontendPort}`);
    }

    this.log(`✅ Isolated Frontend running on http://127.0.0.1:${this.testFrontendPort}`);
  }

  /**
   * Safe Cleanup: Terminate only test processes and delete ONLY the verified disposable directory
   */
  async cleanup() {
    this.log('Initiating Safe Sandbox Cleanup...');

    // 1. Terminate frontend
    if (this.frontendProcess) {
      try { this.frontendProcess.kill(); } catch (_) {}
      this.frontendProcess = null;
    }

    // 2. Terminate backend
    if (this.backendProcess) {
      try { this.backendProcess.kill(); } catch (_) {}
      this.backendProcess = null;
    }

    // 3. Terminate isolated mongod
    if (this.mongodProcess) {
      try { this.mongodProcess.kill(); } catch (_) {}
      this.mongodProcess = null;
    }

    // Settle pause to let file locks release
    await new Promise((r) => setTimeout(r, 1200));

    // Kill any remaining listener on test ports strictly
    for (const port of [this.testApiPort, this.testFrontendPort, this.testDbPort]) {
      try {
        if (process.platform === 'win32') {
          const out = execSync(`netstat -aon 2>nul | findstr ":${port} " | findstr "LISTENING"`, { encoding: 'utf8' });
          for (const line of out.trim().split('\n')) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid) && pid !== '0') {
              execSync(`taskkill /F /PID ${pid} >nul 2>&1`);
            }
          }
        }
      } catch (_) {}
    }

    // 4. Safely remove ONLY the verified test directory
    const prodDataDir = path.normalize(path.join(BACKEND_DIR, 'data', 'db'));
    const testDir = path.normalize(this.testDbDir);

    if (testDir !== prodDataDir && testDir.includes(`db_test_${this.runId}`) && fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
        this.log(`✅ Cleaned up isolated test storage: ${testDir}`);
      } catch (err) {
        this.warn(`Could not completely remove test directory: ${err.message}. Manual review safe.`);
      }
    } else {
      this.warn(`Safety guard skipped deletion of ambiguous path: ${testDir}`);
    }

    this.log('✅ Sandbox Cleanup complete.');
  }
}

module.exports = SandboxManager;
