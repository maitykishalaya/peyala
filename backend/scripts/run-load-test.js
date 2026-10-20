/**
 * 2-Minute High-Frequency Load Test Harness
 * 
 * Target: Isolated Test Database `peyala_loadtest`
 * Business Data Safety: 100% isolated. Zero impact on `peyala_local` or Cloud Atlas.
 * 
 * Operations executed every 3 seconds:
 * 1. Create Order on available table
 * 2. Move table to another available table
 * 3. Merge table into another occupied table (intermittent)
 * 4. Settle / Pay order on occupied table
 * 5. Poll tables status (simulating multiple POS / mobile devices)
 */

const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const TEST_DB_URI = process.env.TEST_DB_URI || 'mongodb://127.0.0.1:27017/peyala_loadtest';
const TEST_PORT = parseInt(process.env.TEST_PORT || '4005', 10);
const DURATION_SECONDS = parseInt(process.env.TEST_DURATION || '180', 10); // 3 minutes (180s)

// Performance metrics store
const metrics = {
  createOrder: [],
  moveTable: [],
  mergeTable: [],
  settleOrder: [],
  getTables: [],
  errors: [],
};

let serverProcess = null;

function calculateStats(arr) {
  if (!arr || arr.length === 0) return { count: 0, min: 0, max: 0, avg: 0, p95: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    count: sorted.length,
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
    avg: Math.round(sum / sorted.length),
    p95: Math.round(sorted[p95Idx]),
  };
}

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const duration = Date.now() - startTime;
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {
          json = body;
        }
        resolve({
          statusCode: res.statusCode,
          duration,
          data: json,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function setupTestDatabase() {
  console.log(`[LoadTest] Connecting to ISOLATED test database: ${TEST_DB_URI}`);
  const conn = await mongoose.createConnection(TEST_DB_URI).asPromise();
  
  console.log('[LoadTest] Resetting test database collections...');
  const collections = ['tables', 'orders', 'menuitems', 'tablecategories', 'users', 'accounts', 'balancesheets', 'syncoutboxes'];
  for (const c of collections) {
    try {
      await conn.db.collection(c).drop();
    } catch (_) {}
  }

  // 1. Seed Admin User
  const adminId = new mongoose.Types.ObjectId();
  const bcrypt = require('bcryptjs');
  const hashed = await bcrypt.hash('loadtest123', 8);
  await conn.db.collection('users').insertOne({
    _id: adminId,
    name: 'Load Test Admin',
    email: 'loadtest@peyala.com',
    password: hashed,
    role: 'admin',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 2. Seed Accounts
  const cashAccountId = new mongoose.Types.ObjectId();
  await conn.db.collection('accounts').insertOne({
    _id: cashAccountId,
    name: 'Cash Drawer (Counter)',
    type: 'cash',
    currentBalance: 5000,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 3. Seed Menu Items
  const menuItems = [];
  for (let i = 1; i <= 6; i++) {
    const mid = new mongoose.Types.ObjectId();
    menuItems.push({
      _id: mid,
      name: `Test Dish ${i}`,
      price: 100 + i * 20,
      taxPercent: 5,
      isAvailable: true,
      category: 'Food',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  await conn.db.collection('menuitems').insertMany(menuItems);

  // 4. Seed Tables (12 tables)
  const tables = [];
  for (let i = 1; i <= 12; i++) {
    const tid = new mongoose.Types.ObjectId();
    tables.push({
      _id: tid,
      tableNumber: `LT-${i}`,
      capacity: 4,
      status: 'available',
      category: i <= 6 ? 'Indoor' : 'Outdoor',
      activeOrder: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  await conn.db.collection('tables').insertMany(tables);

  // 5. Seed BalanceSheet
  await conn.db.collection('balancesheets').insertOne({
    gstLiability: 0,
    gstLog: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await conn.close();
  console.log('[LoadTest] Test database initialized with 12 tables and 6 menu items.');
  return { adminId, menuItems };
}

async function startIsolatedServer() {
  console.log(`[LoadTest] Launching isolated backend server on port ${TEST_PORT}...`);
  process.env.PORT = String(TEST_PORT);
  process.env.MONGODB_LOCAL_DB = 'peyala_loadtest';
  process.env.MONGODB_URI = TEST_DB_URI;
  process.env.SYNC_ENABLED = 'false'; // Strictly disable cloud sync for load testing!
  process.env.DISABLE_CLOUD_SYNC = 'true';
  process.env.JWT_SECRET = 'load_test_secret_key_2026';
  process.env.JWT_EXPIRES_IN = '7d';

  const express = require('express');
  const cors = require('cors');
  const connectDB = require('../src/config/db');

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Connect to test db
  await mongoose.connect(TEST_DB_URI);

  // Load routes
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/tables', require('../src/routes/tables'));
  app.use('/api/orders', require('../src/routes/orders'));
  app.use('/api/menu', require('../src/routes/menu'));
  app.use('/api/accounts', require('../src/routes/accounts'));
  app.use('/api/dashboard', require('../src/routes/dashboard'));

  return new Promise((resolve) => {
    const srv = app.listen(TEST_PORT, () => {
      console.log(`[LoadTest] Isolated test server ready on http://127.0.0.1:${TEST_PORT}`);
      resolve(srv);
    });
  });
}

async function runLoadTest() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('  PEYALA POS - POST-OPTIMIZATION 180s LOAD & STRESS BENCHMARK       ');
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`Duration: ${DURATION_SECONDS} seconds (180s)`);
  console.log('Frequency: Operations executed every 3 seconds');
  console.log('Target DB: peyala_loadtest (Zero impact on business data)');
  console.log('────────────────────────────────────────────────────────────────────\n');

  const { adminId, menuItems } = await setupTestDatabase();
  const server = await startIsolatedServer();

  // Authenticate via /api/auth/login to get official token
  console.log('[LoadTest] Authenticating test admin user...');
  const loginRes = await httpRequest(
    {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'loadtest@peyala.com', password: 'loadtest123' }
  );

  const token = loginRes.data?.data?.token || loginRes.data?.token;
  if (!token) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
  }
  console.log('[LoadTest] Successfully authenticated! JWT Token acquired.');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const startTime = Date.now();
  const endTime = startTime + DURATION_SECONDS * 1000;
  let cycle = 0;

  const memSnapshots = [];
  const startMem = process.memoryUsage();

  console.log('[LoadTest] Beginning 2-minute cycle...');

  while (Date.now() < endTime) {
    cycle++;
    const cycleStart = Date.now();
    const remainingSec = Math.round((endTime - Date.now()) / 1000);

    // 1. Fetch current tables state
    let tables = [];
    try {
      const res = await httpRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/tables',
        method: 'GET',
        headers: authHeaders,
      });
      metrics.getTables.push(res.duration);
      tables = res.data || [];
    } catch (err) {
      metrics.errors.push(`getTables: ${err.message}`);
    }

    const availableTables = tables.filter((t) => t.status === 'available');
    const occupiedTables = tables.filter((t) => t.status === 'occupied' && t.activeOrder);

    // 2. Action: Create Order for a new table
    if (availableTables.length > 0) {
      const targetTable = availableTables[0];
      const dish1 = menuItems[cycle % menuItems.length];
      const dish2 = menuItems[(cycle + 1) % menuItems.length];

      try {
        const orderPayload = {
          tableId: targetTable._id,
          shouldPrint: false,
          items: [
            {
              menuItemId: dish1._id,
              quantity: 2,
              notes: 'LoadTest item 1',
            },
            {
              menuItemId: dish2._id,
              quantity: 1,
              notes: 'LoadTest item 2',
            },
          ],
        };

        const res = await httpRequest(
          {
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path: '/api/orders',
            method: 'POST',
            headers: authHeaders,
          },
          orderPayload
        );

        if (res.statusCode === 201 || res.statusCode === 200) {
          metrics.createOrder.push(res.duration);
        } else {
          metrics.errors.push(`createOrder failed: HTTP ${res.statusCode} ${JSON.stringify(res.data)}`);
        }
      } catch (err) {
        metrics.errors.push(`createOrder exception: ${err.message}`);
      }
    }

    // 3. Action: Move Table or Merge Table
    // Refresh table state after order creation
    let refreshedTables = [];
    try {
      const r = await httpRequest({
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/tables',
        method: 'GET',
        headers: authHeaders,
      });
      refreshedTables = r.data || [];
    } catch (_) {}

    const nowOccupied = refreshedTables.filter((t) => t.status === 'occupied' && t.activeOrder);
    const nowAvailable = refreshedTables.filter((t) => t.status === 'available');

    // Intermittently (every 3rd cycle), merge tables if at least 2 tables are occupied!
    if (cycle % 3 === 0 && nowOccupied.length >= 2) {
      const source = nowOccupied[0];
      const target = nowOccupied[1];
      const sourceOrderId = typeof source.activeOrder === 'object' ? source.activeOrder._id : source.activeOrder;

      try {
        const res = await httpRequest(
          {
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path: `/api/orders/${sourceOrderId}/transfer`,
            method: 'POST',
            headers: authHeaders,
          },
          {
            targetTableId: target._id,
            transferType: 'table',
          }
        );

        if (res.statusCode === 200) {
          metrics.mergeTable.push(res.duration);
        } else {
          metrics.errors.push(`mergeTable failed: HTTP ${res.statusCode} ${JSON.stringify(res.data)}`);
        }
      } catch (err) {
        metrics.errors.push(`mergeTable exception: ${err.message}`);
      }
    } else if (nowOccupied.length > 0 && nowAvailable.length > 0) {
      // Normal Move Table
      const source = nowOccupied[0];
      const target = nowAvailable[0];
      const sourceOrderId = typeof source.activeOrder === 'object' ? source.activeOrder._id : source.activeOrder;

      try {
        const res = await httpRequest(
          {
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path: `/api/orders/${sourceOrderId}/transfer`,
            method: 'POST',
            headers: authHeaders,
          },
          {
            targetTableId: target._id,
            transferType: 'table',
          }
        );

        if (res.statusCode === 200) {
          metrics.moveTable.push(res.duration);
        } else {
          metrics.errors.push(`moveTable failed: HTTP ${res.statusCode} ${JSON.stringify(res.data)}`);
        }
      } catch (err) {
        metrics.errors.push(`moveTable exception: ${err.message}`);
      }
    }

    // 4. Action: Settle / Pay an Order (Keep cycle healthy so tables free up)
    if (cycle % 2 === 0) {
      try {
        const check = await httpRequest({
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/tables',
          method: 'GET',
          headers: authHeaders,
        });
        const currentOcc = (check.data || []).filter((t) => t.status === 'occupied' && t.activeOrder);
        if (currentOcc.length > 0) {
          const settleTarget = currentOcc[currentOcc.length - 1];
          const orderId = typeof settleTarget.activeOrder === 'object' ? settleTarget.activeOrder._id : settleTarget.activeOrder;

          const res = await httpRequest(
            {
              hostname: '127.0.0.1',
              port: TEST_PORT,
              path: `/api/orders/${orderId}/pay`,
              method: 'POST',
              headers: authHeaders,
            },
            {
              paymentMethod: 'cash',
            }
          );

          if (res.statusCode === 200) {
            metrics.settleOrder.push(res.duration);
          } else {
            metrics.errors.push(`settleOrder failed: HTTP ${res.statusCode} ${JSON.stringify(res.data)}`);
          }
        }
      } catch (err) {
        metrics.errors.push(`settleOrder exception: ${err.message}`);
      }
    }

    // Record memory snapshot
    const currentMem = process.memoryUsage();
    memSnapshots.push({
      sec: Math.round((Date.now() - startTime) / 1000),
      heapUsedMb: Math.round(currentMem.heapUsed / 1024 / 1024),
      rssMb: Math.round(currentMem.rss / 1024 / 1024),
    });

    process.stdout.write(`\r[Cycle ${cycle}] Remaining: ${remainingSec}s | Created: ${metrics.createOrder.length} | Moved: ${metrics.moveTable.length} | Merged: ${metrics.mergeTable.length} | Settled: ${metrics.settleOrder.length} | Errors: ${metrics.errors.length}`);

    // Wait until 3 seconds have passed for this cycle
    const cycleDuration = Date.now() - cycleStart;
    const waitMs = Math.max(0, 3000 - cycleDuration);
    if (waitMs > 0 && Date.now() + waitMs < endTime) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  console.log('\n\n[LoadTest] 2-Minute Load Testing Completed! Compiling analysis...\n');

  // Compute Statistics
  const createStats = calculateStats(metrics.createOrder);
  const moveStats = calculateStats(metrics.moveTable);
  const mergeStats = calculateStats(metrics.mergeTable);
  const settleStats = calculateStats(metrics.settleOrder);
  const getTablesStats = calculateStats(metrics.getTables);

  const endMem = process.memoryUsage();
  const peakHeap = Math.max(...memSnapshots.map((m) => m.heapUsedMb));
  const peakRss = Math.max(...memSnapshots.map((m) => m.rssMb));

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('                   BENCHMARK ANALYSIS REPORT                        ');
  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`Total Cycles Run:          ${cycle}`);
  console.log(`Total Errors Encountered:   ${metrics.errors.length}`);
  console.log('────────────────────────────────────────────────────────────────────');
  console.log('OPERATION               COUNT   AVG (ms)   P95 (ms)   MIN-MAX (ms)');
  console.log('────────────────────────────────────────────────────────────────────');
  console.log(`Create Order           ${String(createStats.count).padEnd(7)} ${String(createStats.avg).padEnd(10)} ${String(createStats.p95).padEnd(10)} ${createStats.min}-${createStats.max}ms`);
  console.log(`Move Table             ${String(moveStats.count).padEnd(7)} ${String(moveStats.avg).padEnd(10)} ${String(moveStats.p95).padEnd(10)} ${moveStats.min}-${moveStats.max}ms`);
  console.log(`Merge Tables           ${String(mergeStats.count).padEnd(7)} ${String(mergeStats.avg).padEnd(10)} ${String(mergeStats.p95).padEnd(10)} ${mergeStats.min}-${mergeStats.max}ms`);
  console.log(`Settle Order           ${String(settleStats.count).padEnd(7)} ${String(settleStats.avg).padEnd(10)} ${String(settleStats.p95).padEnd(10)} ${settleStats.min}-${settleStats.max}ms`);
  console.log(`Get Tables (Polling)   ${String(getTablesStats.count).padEnd(7)} ${String(getTablesStats.avg).padEnd(10)} ${String(getTablesStats.p95).padEnd(10)} ${getTablesStats.min}-${getTablesStats.max}ms`);
  console.log('────────────────────────────────────────────────────────────────────');
  console.log('MEMORY USAGE & RESOURCE FOOTPRINT:');
  console.log(`Initial Heap:              ${Math.round(startMem.heapUsed / 1024 / 1024)} MB (RSS: ${Math.round(startMem.rss / 1024 / 1024)} MB)`);
  console.log(`Peak Heap / RSS:           ${peakHeap} MB / ${peakRss} MB`);
  console.log(`Final Heap:                ${Math.round(endMem.heapUsed / 1024 / 1024)} MB (RSS: ${Math.round(endMem.rss / 1024 / 1024)} MB)`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  if (metrics.errors.length > 0) {
    console.log('First 5 Errors encountered:');
    metrics.errors.slice(0, 5).forEach((e, idx) => console.log(` [${idx + 1}] ${e}`));
  }

  // Cleanup
  await mongoose.disconnect();
  server.close();
  console.log('[LoadTest] Cleanup complete. Isolated test database disconnected.');
  process.exit(0);
}

runLoadTest().catch((err) => {
  console.error('[LoadTest Error]', err);
  process.exit(1);
});
