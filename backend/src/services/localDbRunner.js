const { MongoMemoryServer } = require('mongodb-memory-server');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

class LocalDbRunner {
  constructor() {
    this.server = null;
    this.isEmbedded = false;
    this.port = parseInt(process.env.MONGODB_LOCAL_PORT || '27017', 10);
    this.dbName = process.env.MONGODB_LOCAL_DB || 'peyala_local';
    this.dataDir = path.join(__dirname, '../../data/db');
  }

  /**
   * Check if a TCP port is open on localhost
   */
  async checkPortOpen(port, timeoutMs = 800) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, '127.0.0.1');
    });
  }

  /**
   * Search for an existing mongod executable on the local system
   */
  findMongodBinary() {
    const localBin = path.join(__dirname, '../../bin/mongod.exe');
    if (fs.existsSync(localBin)) return localBin;

    const standardPaths = [
      'C:\\Program Files\\MongoDB\\Server\\9.0\\bin\\mongod.exe',
      'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe',
      'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
      'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongod.exe',
      'C:\\Program Files\\MongoDB\\Server\\5.0\\bin\\mongod.exe',
    ];
    for (const p of standardPaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /**
   * Ensure local database is up and accepting connections
  /**
   * Remove stale lock files left behind by ungraceful shutdowns or power outages
   */
  cleanStaleLocks() {
    try {
      const lockFiles = [
        path.join(this.dataDir, 'mongod.lock'),
        path.join(this.dataDir, 'WiredTiger.lock'),
        path.join(this.dataDir, '_tmp', 'spilldb', 'WiredTiger.lock'),
      ];
      for (const lf of lockFiles) {
        if (fs.existsSync(lf)) {
          try {
            fs.unlinkSync(lf);
            console.log(`[LocalDbRunner] Cleaned stale lock file (${path.basename(lf)}) for fresh start.`);
          } catch (delErr) {
            console.warn(`[LocalDbRunner] Could not remove ${lf}:`, delErr.message);
          }
        }
      }
    } catch (e) {
      console.warn('[LocalDbRunner] Note on cleaning locks:', e.message);
    }
  }

  /**
   * Terminate any hung mongod process if it is not listening on the expected port
   */
  killOrphanedMongod() {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        execSync('taskkill /F /IM mongod.exe >nul 2>&1');
      }
    } catch (_) {}
  }

  /**
   * Ensure local database is up and accepting connections
   */
  async start() {
    // 1. Check if an external or already running MongoDB service is active on this port
    const isOpen = await this.checkPortOpen(this.port);
    if (isOpen) {
      console.log(`[LocalDbRunner] Detected active MongoDB running on 127.0.0.1:${this.port}`);
      this.isEmbedded = false;
      return this.getUri();
    }

    // 2. Port is closed: cleanup any orphaned zombie process and stale lock files
    this.killOrphanedMongod();
    await new Promise((r) => setTimeout(r, 200));

    console.log(`[LocalDbRunner] Port ${this.port} is free. Launching local MongoDB engine with WiredTiger persistence...`);
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.cleanStaleLocks();

    // 2a. Check if portable mongod.exe exists in backend/bin or Program Files
    const binaryPath = this.findMongodBinary();
    if (binaryPath) {
      process.env.MONGOMS_SYSTEM_BINARY = binaryPath;
      const attemptStartMongod = async (retryHeal = true) => {
        try {
          console.log(`[LocalDbRunner] Spawning standalone mongod with memory tuning from ${binaryPath}...`);
          const mongodArgs = [
            '--dbpath', this.dataDir,
            '--port', String(this.port),
            '--bind_ip', '127.0.0.1',
            '--wiredTigerCacheSizeGB', '0.25',
            '--syncdelay', '60',
            '--quiet',
          ];
          if (process.platform !== 'win32') {
            mongodArgs.push('--nounixsocket');
          }

          this.process = spawn(binaryPath, mongodArgs, {
            windowsHide: true,
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          let exitCode = null;
          let stderrLogs = '';

          this.process.stdout?.on('data', (d) => {
            const str = d.toString();
            if (str.includes('waiting for connections on port')) {
              console.log(`[LocalDbRunner] Standalone mongod is ready and listening on port ${this.port}`);
            }
          });

          this.process.stderr?.on('data', (d) => {
            const str = d.toString();
            stderrLogs += str;
            console.warn(`[LocalDbRunner stderr] ${str.trim()}`);
          });

          this.process.on('exit', (code) => {
            exitCode = code;
          });

          this.process.on('error', (err) => {
            console.warn('[LocalDbRunner] Spawning mongod binary error:', err.message);
          });

          // Wait up to 10 seconds for the port to accept connections
          for (let i = 0; i < 50; i++) {
            await new Promise((r) => setTimeout(r, 200));
            if (await this.checkPortOpen(this.port, 200)) {
              console.log(`[LocalDbRunner] Standalone MongoDB started successfully on port ${this.port} (Storage: ${this.dataDir})`);
              this.isEmbedded = true;
              return this.getUri();
            }

            // Early detection: If process already exited with incompatibility code 62 or format error
            if (exitCode !== null) {
              const isVersionIncompatible =
                exitCode === 62 ||
                exitCode === 100 ||
                stderrLogs.includes('featureCompatibilityVersion') ||
                stderrLogs.includes('WiredTiger version') ||
                stderrLogs.includes('corrupted') ||
                stderrLogs.includes('incompatible');

              if (retryHeal && isVersionIncompatible) {
                console.warn(`[LocalDbRunner] ⚠️ Detected incompatible/corrupted database format (Exit code ${exitCode}). Auto-healing for native MongoDB 9.0...`);
                this.killOrphanedMongod();
                const archivePath = `${this.dataDir}_incompatible_${Date.now()}`;
                try {
                  fs.renameSync(this.dataDir, archivePath);
                  fs.mkdirSync(this.dataDir, { recursive: true });
                  console.log(`[LocalDbRunner] ✅ Archived incompatible database to ${archivePath}. Spawning fresh instance...`);
                  return await attemptStartMongod(false);
                } catch (archiveErr) {
                  console.warn(`[LocalDbRunner] Database auto-heal archive notice: ${archiveErr.message}`);
                }
              }
              break;
            }
          }
          console.warn('[LocalDbRunner] Standalone mongod did not open port in 10s, attempting fallback...');
        } catch (spawnErr) {
          console.warn('[LocalDbRunner] Standalone mongod spawn failed:', spawnErr.message);
        }
        return null;
      };

      const uri = await attemptStartMongod(true);
      if (uri) return uri;
    }

    // 2b. Fallback to MongoMemoryServer with local system binary and constrained cache
    try {
      this.cleanStaleLocks();
      this.server = await MongoMemoryServer.create({
        instance: {
          port: this.port,
          dbPath: this.dataDir,
          storageEngine: 'wiredTiger',
          dbName: this.dbName,
          args: ['--wiredTigerCacheSizeGB', '0.25', '--syncdelay', '60'],
        },
        binary: binaryPath ? { systemBinary: binaryPath } : undefined,
        autoStart: true,
      });

      this.isEmbedded = true;
      const uri = this.server.getUri();
      console.log(`[LocalDbRunner] Embedded MongoDB started successfully at ${uri} (Storage: ${this.dataDir})`);
      return uri;
    } catch (err) {
      console.error(`[LocalDbRunner] Failed to start embedded engine: ${err.message}`);
      throw err;
    }
  }

  /**
   * Stop embedded engine if active
   */
  async stop() {
    if (this.process) {
      try {
        this.process.kill();
        this.process = null;
      } catch (_) {}
    }
    if (this.server && this.isEmbedded) {
      console.log('[LocalDbRunner] Stopping embedded MongoDB engine...');
      try {
        await this.server.stop();
        this.server = null;
        console.log('[LocalDbRunner] Embedded MongoDB stopped.');
      } catch (err) {
        console.warn('[LocalDbRunner] Error stopping server:', err.message);
      }
    }
  }

  getUri() {
    return `mongodb://127.0.0.1:${this.port}/${this.dbName}`;
  }

  getStatus() {
    return {
      running: true,
      port: this.port,
      dbName: this.dbName,
      isEmbedded: this.isEmbedded,
      dataDir: this.dataDir,
      uri: this.getUri(),
    };
  }
}

const localDbRunner = new LocalDbRunner();
module.exports = localDbRunner;
