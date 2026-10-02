/**
 * Peyala Isolated Test Database Manager
 * Creates an isolated sandbox database instance on the same MongoDB Atlas cluster,
 * clones live business data into it, runs tests safely with zero live impact,
 * and completely purges the test database after testing finishes.
 */

const path = require('path');
const http = require('http');
const { spawn, execSync } = require('child_process');

// Resolve packages from backend/node_modules
const backendDir = path.join(__dirname, '../backend');
const dotenv = require(path.join(backendDir, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backendDir, '.env') });

const { MongoClient } = require(path.join(backendDir, 'node_modules/mongodb'));

const LIVE_URI = process.env.MONGODB_URI;
if (!LIVE_URI) {
  throw new Error('MONGODB_URI is not defined in backend/.env');
}

// Derive Test URI pointing to isolated test database
function getTestDbUri(dbName = 'peyala_loadtest') {
  try {
    const u = new URL(LIVE_URI);
    u.pathname = `/${dbName}`;
    return u.toString();
  } catch (e) {
    if (LIVE_URI.includes('?')) {
      const parts = LIVE_URI.split('?');
      const base = parts[0].replace(/\/+$/, '');
      return `${base}/${dbName}?${parts[1]}`;
    }
    return `${LIVE_URI.replace(/\/+$/, '')}/${dbName}`;
  }
}

const TEST_DB_NAME = 'peyala_loadtest';
const TEST_URI = getTestDbUri(TEST_DB_NAME);

/**
 * Clones all business collections and indexes from Live DB to Test DB.
 */
async function cloneLiveToTestDb() {
  const client = new MongoClient(LIVE_URI, { family: 4 });
  await client.connect();

  try {
    const liveDb = client.db(); // Default live database ('test')
    const testDb = client.db(TEST_DB_NAME);

    console.log(`[TestDbManager] Live DB: "${liveDb.databaseName}" -> Target Test DB: "${TEST_DB_NAME}"`);

    // Clean existing test database if left from a previous run
    await testDb.dropDatabase().catch(() => {});
    console.log(`[TestDbManager] Cleaned previous test database "${TEST_DB_NAME}".`);

    const collections = await liveDb.listCollections().toArray();
    console.log(`[TestDbManager] Seeding ${collections.length} collections from live business data...`);

    let totalClonedDocs = 0;
    for (const col of collections) {
      const name = col.name;
      if (name.startsWith('system.')) continue;

      const liveCol = liveDb.collection(name);
      const testCol = testDb.collection(name);

      const docs = await liveCol.find({}).toArray();
      if (docs.length > 0) {
        await testCol.insertMany(docs);
        totalClonedDocs += docs.length;
      }

      // Clone indexes (excluding _id)
      try {
        const indexes = await liveCol.indexes();
        for (const idx of indexes) {
          if (idx.name === '_id_') continue;
          const options = { name: idx.name };
          if (idx.unique) options.unique = true;
          if (idx.sparse) options.sparse = true;
          await testCol.createIndex(idx.key, options);
        }
      } catch (idxErr) {
        // Continue if index clone encounters benign constraint
      }
    }

    console.log(`[TestDbManager] ✅ Successfully cloned ${totalClonedDocs} documents into "${TEST_DB_NAME}".`);
    return { testUri: TEST_URI, dbName: TEST_DB_NAME, totalClonedDocs };
  } finally {
    await client.close();
  }
}

/**
 * Drops the test database instance completely.
 */
async function purgeTestDb() {
  const client = new MongoClient(LIVE_URI, { family: 4 });
  await client.connect();
  try {
    const testDb = client.db(TEST_DB_NAME);
    await testDb.dropDatabase();
    console.log(`[TestDbManager] 🧹 Purged test database instance "${TEST_DB_NAME}". Live data remains untouched.`);
  } finally {
    await client.close();
  }
}

/**
 * Check if an HTTP endpoint responds with 200 OK.
 */
function checkHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Starts an isolated backend server connected strictly to TEST_URI.
 */
async function startIsolatedServer({ port = 4001, verbose = false } = {}) {
  console.log(`[TestDbManager] Starting isolated backend on port ${port} pointing to DB: "${TEST_DB_NAME}"...`);

  // Kill anything previously occupying the test port just in case
  if (process.platform === 'win32') {
    try {
      const netstat = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = netstat.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
        }
      }
    } catch (e) {
      // Port is clean
    }
  }

  const env = Object.assign({}, process.env, {
    PORT: String(port),
    MONGODB_URI: TEST_URI,
    NODE_ENV: 'test',
  });

  const serverProc = spawn(process.execPath, ['src/server.js'], {
    cwd: backendDir,
    env,
    stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });

  if (!verbose && serverProc.stdout) {
    serverProc.stdout.on('data', (d) => {
      const str = d.toString();
      if (str.includes('Peyala Backend') || str.includes('running on port')) {
        console.log(`[IsolatedServer] ${str.trim()}`);
      }
    });
  }

  // Poll /health until server is ready
  const healthUrl = `http://127.0.0.1:${port}/health`;
  const startTime = Date.now();
  const timeoutMs = 25000;

  while (Date.now() - startTime < timeoutMs) {
    if (await checkHealth(healthUrl)) {
      console.log(`[TestDbManager] ✅ Isolated server is healthy and responding on ${healthUrl}`);
      return { proc: serverProc, port, baseUrl: `http://127.0.0.1:${port}` };
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // If we reach here, startup timed out
  stopIsolatedServer(serverProc);
  throw new Error(`Isolated test server failed to start within ${timeoutMs}ms on port ${port}.`);
}

/**
 * Cleanly stops the isolated test server.
 */
function stopIsolatedServer(proc) {
  if (!proc) return;
  console.log('[TestDbManager] Stopping isolated test server...');
  try {
    if (process.platform === 'win32' && proc.pid) {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (e) {
    // Process already exited
  }
  console.log('[TestDbManager] Isolated test server stopped.');
}

/**
 * Universal wrapper: clones live DB -> starts isolated server -> runs testFn -> terminates server -> drops test DB.
 */
async function withIsolatedSandbox(testFn, options = {}) {
  const port = options.port || 4001;
  let serverInfo = null;

  // Graceful exit handlers
  const cleanupHandler = async () => {
    console.log('\n[TestDbManager] Emergency cleanup triggered...');
    if (serverInfo && serverInfo.proc) {
      stopIsolatedServer(serverInfo.proc);
    }
    await purgeTestDb().catch(e => console.error('Purge error on exit:', e));
    process.exit(1);
  };

  process.once('SIGINT', cleanupHandler);
  process.once('SIGTERM', cleanupHandler);

  try {
    console.log('\n======================================================');
    console.log('🔄 INITIALIZING ISOLATED TEST SANDBOX');
    console.log('======================================================');
    await cloneLiveToTestDb();
    serverInfo = await startIsolatedServer({ port, verbose: options.verbose || false });

    console.log('\n======================================================');
    console.log(`⚡ RUNNING TESTS AGAINST ISOLATED SANDBOX (${serverInfo.baseUrl})`);
    console.log('======================================================\n');
    const result = await testFn(serverInfo);
    return result;
  } finally {
    console.log('\n======================================================');
    console.log('🧹 TEARING DOWN ISOLATED TEST SANDBOX');
    console.log('======================================================');
    if (serverInfo && serverInfo.proc) {
      stopIsolatedServer(serverInfo.proc);
    }
    await purgeTestDb();
    process.removeListener('SIGINT', cleanupHandler);
    process.removeListener('SIGTERM', cleanupHandler);
    console.log('✅ Sandbox completely dismantled. Live database was 100% protected.\n');
  }
}

module.exports = {
  cloneLiveToTestDb,
  purgeTestDb,
  startIsolatedServer,
  stopIsolatedServer,
  withIsolatedSandbox,
  getTestDbUri,
  TEST_DB_NAME,
  TEST_URI,
};

// Standalone execution support: node scripts/test-db-manager.js clone | purge | status
if (require.main === module) {
  const action = process.argv[2] || 'clone';
  if (action === 'clone') {
    cloneLiveToTestDb()
      .then(res => console.log('Clone complete:', res))
      .catch(console.error);
  } else if (action === 'purge') {
    purgeTestDb()
      .then(() => console.log('Purge complete.'))
      .catch(console.error);
  } else if (action === 'test-sandbox') {
    withIsolatedSandbox(async ({ baseUrl }) => {
      console.log(`Running sample test against ${baseUrl}...`);
      const healthy = await checkHealth(`${baseUrl}/health`);
      console.log(`Health check: ${healthy ? 'PASS' : 'FAIL'}`);
    }).catch(console.error);
  }
}
