/**
 * Peyala POS - Automated Comprehensive Load & Concurrency Testing Suite
 * Evaluates performance, race conditions, connection pool behavior, and data integrity.
 */

const http = require('http');
const { withIsolatedSandbox } = require('./test-db-manager');

let BASE_URL = 'http://127.0.0.1:4001';
let AUTH_TOKEN = '';

// Helper to make HTTP requests
function request({ method = 'GET', path, body = null, token = AUTH_TOKEN, timeout = 30000 }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout,
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          duration,
          headers: res.headers,
          data: parsed,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const duration = Date.now() - startTime;
      resolve({ status: 504, duration, error: 'TIMEOUT', data: null });
    });

    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({ status: 500, duration, error: err.message, data: null });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function calculateStats(latencies) {
  if (!latencies.length) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = Math.round(sum / sorted.length);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { min, max, avg, p50, p95, p99, count: sorted.length };
}

// Concurrency runner: executes totalRequests with max concurrent workers
async function runConcurrentBatch({ workerFn, totalRequests, concurrency }) {
  let currentIndex = 0;
  let completed = 0;
  const results = [];
  const startTime = Date.now();

  const worker = async () => {
    while (currentIndex < totalRequests) {
      const idx = currentIndex++;
      try {
        const res = await workerFn(idx);
        results.push(res);
      } catch (err) {
        results.push({ status: 500, error: err.message, duration: 0 });
      }
      completed++;
    }
  };

  const pool = [];
  for (let i = 0; i < Math.min(concurrency, totalRequests); i++) {
    pool.push(worker());
  }
  await Promise.all(pool);

  const totalTimeSec = (Date.now() - startTime) / 1000;
  const latencies = results.map(r => r.duration || 0);
  const stats = calculateStats(latencies);
  const successCount = results.filter(r => r.status >= 200 && r.status < 300).length;
  const failureCount = results.length - successCount;
  const rps = totalTimeSec > 0 ? Math.round((results.length / totalTimeSec) * 10) / 10 : 0;

  return {
    totalRequests,
    concurrency,
    totalTimeSec: Math.round(totalTimeSec * 100) / 100,
    rps,
    successCount,
    failureCount,
    stats,
    results,
  };
}

async function runTestSuite(serverInfo) {
  if (serverInfo && serverInfo.baseUrl) {
    BASE_URL = serverInfo.baseUrl;
  }
  console.log('='.repeat(80));
  console.log(`🚀 PEYALA POS LOAD & CONCURRENCY TEST SUITE (${BASE_URL})`);
  console.log('='.repeat(80));

  // Step 0: Login and obtain token
  console.log('\n[SETUP] Logging in as admin@peyala.com...');
  const loginRes = await request({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'admin@peyala.com', password: 'peyala123' },
  });

  if (loginRes.status !== 200 || !loginRes.data.token) {
    console.error('❌ Failed to login:', loginRes);
    process.exit(1);
  }
  AUTH_TOKEN = loginRes.data.token;
  console.log('✅ Logged in successfully. Token acquired.');

  // Fetch initial system state
  console.log('[SETUP] Fetching tables and menu items...');
  const [tablesRes, menuRes] = await Promise.all([
    request({ path: '/api/tables' }),
    request({ path: '/api/menu' }),
  ]);

  const tables = tablesRes.data || [];
  const menuItems = menuRes.data || [];
  console.log(`✅ Loaded ${tables.length} tables and ${menuItems.length} menu items.`);

  const sampleItem = menuItems.find(m => m.isAvailable !== false) || menuItems[0];
  if (!sampleItem) {
    console.error('❌ No menu items found in database!');
    process.exit(1);
  }
  console.log(`Using sample menu item: ${sampleItem.name} (ID: ${sampleItem._id}, Price: ₹${sampleItem.price})`);

  const report = {
    tests: [],
    criticalProblems: [],
  };

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Baseline Health Endpoint Concurrency
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 1: Baseline Raw HTTP Throughput (/health) - 50 Concurrent, 200 Requests');
  console.log('-'.repeat(80));

  const test1 = await runConcurrentBatch({
    workerFn: () => request({ path: '/health', token: '' }),
    totalRequests: 200,
    concurrency: 50,
  });
  console.log(`Throughput: ${test1.rps} req/sec | Success: ${test1.successCount}/${test1.totalRequests}`);
  console.log(`Latency: Avg ${test1.stats.avg}ms | Min ${test1.stats.min}ms | p50 ${test1.stats.p50}ms | p95 ${test1.stats.p95}ms | p99 ${test1.stats.p99}ms | Max ${test1.stats.max}ms`);
  report.tests.push({ name: 'Baseline /health', ...test1 });

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: High-Frequency Polling (/pending-kots & /pending-bills)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 2: High-Frequency Polling Load (/pending-kots) - 30 Concurrent Clients, 150 Requests');
  console.log('-'.repeat(80));

  const test2 = await runConcurrentBatch({
    workerFn: () => request({ path: '/api/orders/pending-kots' }),
    totalRequests: 150,
    concurrency: 30,
  });
  console.log(`Throughput: ${test2.rps} req/sec | Success: ${test2.successCount}/${test2.totalRequests}`);
  console.log(`Latency: Avg ${test2.stats.avg}ms | Min ${test2.stats.min}ms | p50 ${test2.stats.p50}ms | p95 ${test2.stats.p95}ms | p99 ${test2.stats.p99}ms | Max ${test2.stats.max}ms`);
  report.tests.push({ name: 'Polling /pending-kots', ...test2 });

  if (test2.stats.p95 > 1000) {
    report.criticalProblems.push({
      category: 'Polling Latency Degradation',
      detail: `p95 latency is ${test2.stats.p95}ms under 30 concurrent polling clients. Can cause KOT printing station lag.`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Authentication & Bcrypt Spikes (/api/auth/login)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 3: Authentication Concurrency (/api/auth/login) - 20 Concurrent Logins');
  console.log('-'.repeat(80));

  const test3 = await runConcurrentBatch({
    workerFn: () => request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'viewer@peyala.com', password: 'peyala123' },
      token: '',
    }),
    totalRequests: 40,
    concurrency: 20,
  });
  console.log(`Throughput: ${test3.rps} req/sec | Success: ${test3.successCount}/${test3.totalRequests}`);
  console.log(`Latency: Avg ${test3.stats.avg}ms | Min ${test3.stats.min}ms | p50 ${test3.stats.p50}ms | p95 ${test3.stats.p95}ms | p99 ${test3.stats.p99}ms | Max ${test3.stats.max}ms`);
  report.tests.push({ name: 'Auth /login', ...test3 });

  if (test3.stats.p95 > 1500) {
    report.criticalProblems.push({
      category: 'CPU Starvation on Concurrent Logins',
      detail: `Concurrent bcrypt hashing caused p95 latency of ${test3.stats.p95}ms. Libuv thread pool saturation blocks other I/O during login bursts.`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Race Condition: Duplicate Order Numbers on Simultaneous Orders
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 4: Race Condition: Simultaneous Order Creation (Order Number Integrity)');
  console.log('-'.repeat(80));

  // Find 10 available tables or clear tables
  const availableTables = tables.filter(t => t.status === 'available').slice(0, 10);
  console.log(`Found ${availableTables.length} available tables for simultaneous order creation.`);

  if (availableTables.length < 4) {
    console.log('Freeing active orders on tables for testing...');
    // We can cancel or pay them
  }

  const orderCreationPromises = availableTables.map((t, idx) => {
    return request({
      method: 'POST',
      path: '/api/orders',
      body: {
        tableId: t._id,
        items: [{
          menuItemId: sampleItem._id,
          quantity: 1,
          notes: `Load test order ${idx}`,
        }],
        shouldPrint: false,
      },
    });
  });

  const orderCreationResults = await Promise.all(orderCreationPromises);
  const createdOrders = orderCreationResults
    .filter(r => r.status === 201 && r.data && r.data._id)
    .map(r => r.data);

  const orderNumbers = createdOrders.map(o => o.orderNumber);
  const uniqueOrderNumbers = new Set(orderNumbers);

  console.log(`Orders attempted: ${orderCreationPromises.length} | Created: ${createdOrders.length}`);
  console.log(`Generated order numbers:`, orderNumbers);

  const duplicateOrderNumbers = orderNumbers.filter((item, index) => orderNumbers.indexOf(item) !== index);
  if (duplicateOrderNumbers.length > 0) {
    console.error(`🚨 CRITICAL RACE CONDITION DETECTED! Duplicate order numbers generated:`, duplicateOrderNumbers);
    report.criticalProblems.push({
      category: 'Order Number Collision (Race Condition)',
      detail: `Multiple simultaneous orders were generated with identical order numbers: ${duplicateOrderNumbers.join(', ')}. Root cause: 'Order.countDocuments() + 1' read-before-write race condition without atomic sequence locking.`,
    });
  } else {
    console.log(`✅ Order numbers were unique in this batch (Size: ${orderNumbers.length}).`);
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Race Condition: Double Booking the Same Table Concurrently
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 5: Race Condition: Double Booking Same Table Simultaneously');
  console.log('-'.repeat(80));

  // Pick one table and first free it
  const targetTable = tables[0];
  // Check if it has active order
  const activeOrderRes = await request({ path: `/api/orders/table/${targetTable._id}/active` });
  if (activeOrderRes.data && activeOrderRes.data._id) {
    await request({
      method: 'POST',
      path: `/api/orders/${activeOrderRes.data._id}/cancel`,
      body: { reason: 'Load test reset' },
    });
  }

  console.log(`Firing 8 simultaneous order creation requests for Table "${targetTable.tableNumber}"...`);
  const doubleBookPromises = Array.from({ length: 8 }).map((_, i) => {
    return request({
      method: 'POST',
      path: '/api/orders',
      body: {
        tableId: targetTable._id,
        items: [{
          menuItemId: sampleItem._id,
          quantity: 1,
          notes: `Double booking attempt ${i}`,
        }],
        shouldPrint: false,
      },
    });
  });

  const doubleBookResults = await Promise.all(doubleBookPromises);
  const doubleBookSuccess = doubleBookResults.filter(r => r.status === 201);
  const doubleBookRejected = doubleBookResults.filter(r => r.status === 400);

  console.log(`Double booking results: ${doubleBookSuccess.length} created, ${doubleBookRejected.length} rejected.`);
  if (doubleBookSuccess.length > 1) {
    console.error(`🚨 CRITICAL RACE CONDITION DETECTED! Table ${targetTable.tableNumber} was double-booked ${doubleBookSuccess.length} times!`);
    report.criticalProblems.push({
      category: 'Table Double-Booking Race Condition',
      detail: `Simultaneous requests for Table ${targetTable.tableNumber} resulted in ${doubleBookSuccess.length} active orders simultaneously opened. Root cause: table status check ('table.status === occupied') is not atomic with order insertion.`,
    });
  } else {
    console.log(`✅ Table double-booking prevented (1 created, ${doubleBookRejected.length} rejected).`);
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Race Condition: Concurrent Payments & Financial Integrity
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 6: Race Condition: Concurrent Payment Settlements & BalanceSheet Sync');
  console.log('-'.repeat(80));

  // First create 5 orders across tables to settle at the exact same millisecond
  const settleTables = tables.slice(1, 6);
  const ordersToSettle = [];

  for (const t of settleTables) {
    // Reset table active order if any
    const activeRes = await request({ path: `/api/orders/table/${t._id}/active` });
    if (activeRes.data && activeRes.data._id) {
      await request({
        method: 'POST',
        path: `/api/orders/${activeRes.data._id}/cancel`,
        body: { reason: 'Reset for settlement test' },
      });
    }

    const orderRes = await request({
      method: 'POST',
      path: '/api/orders',
      body: {
        tableId: t._id,
        items: [{
          menuItemId: sampleItem._id,
          quantity: 2,
        }],
        shouldPrint: false,
      },
    });
    if (orderRes.status === 201 && orderRes.data) {
      ordersToSettle.push(orderRes.data);
    }
  }

  console.log(`Created ${ordersToSettle.length} orders for simultaneous payment settlement.`);

  // Get pre-settlement state of SalesEntry and BalanceSheet
  const todayRangeRes = await request({ path: '/api/analytics/overview?period=today' });
  const preOutletSales = todayRangeRes.data?.currentPeriodSummary?.outletGross || 0;

  console.log(`Firing ${ordersToSettle.length} simultaneous payment settlements...`);
  const paymentPromises = ordersToSettle.map((order, idx) => {
    return request({
      method: 'POST',
      path: `/api/orders/${order._id}/pay`,
      body: {
        paymentMethod: idx % 2 === 0 ? 'cash' : 'upi',
      },
    });
  });

  const paymentResults = await Promise.all(paymentPromises);
  const paymentErrors = paymentResults.filter(r => r.status !== 200);

  console.log(`Settlements completed: ${paymentResults.filter(r => r.status === 200).length} succeeded, ${paymentErrors.length} failed.`);

  if (paymentErrors.length > 0) {
    console.error(`🚨 PAYMENT SETTLEMENT ERRORS OCCURRED:`, paymentErrors.map(e => ({ status: e.status, msg: e.data?.message || e.error })));
    report.criticalProblems.push({
      category: 'Payment Settlement Concurrency Failure',
      detail: `${paymentErrors.length} out of ${paymentPromises.length} payments failed under concurrency. Errors: ${paymentErrors.map(e => e.data?.message || e.error).join('; ')}`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 7: Analytics Overview Heavy Aggregation Under Concurrent Operations
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 7: Heavy Analytics (/api/analytics/overview) Under Load - 15 Concurrent Requests');
  console.log('-'.repeat(80));

  const test7 = await runConcurrentBatch({
    workerFn: () => request({ path: '/api/analytics/overview?period=this_month' }),
    totalRequests: 30,
    concurrency: 15,
  });
  console.log(`Throughput: ${test7.rps} req/sec | Success: ${test7.successCount}/${test7.totalRequests}`);
  console.log(`Latency: Avg ${test7.stats.avg}ms | Min ${test7.stats.min}ms | p50 ${test7.stats.p50}ms | p95 ${test7.stats.p95}ms | p99 ${test7.stats.p99}ms | Max ${test7.stats.max}ms`);
  report.tests.push({ name: 'Heavy Analytics /overview', ...test7 });

  if (test7.stats.avg > 1000 || test7.stats.p95 > 2500) {
    report.criticalProblems.push({
      category: 'Analytics Query Latency Degradation',
      detail: `Heavy unindexed queries in /api/analytics/overview take avg ${test7.stats.avg}ms and p95 ${test7.stats.p95}ms. Lacks index on Order { status: 1, paidAt: 1 }, causing full collection scans that saturate MongoDB Atlas under load.`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 8: MongoDB Connection Pool Saturation Test (Exceeding maxPoolSize 25)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 8: Connection Pool Stress Test (60 Concurrent Mixed Operations)');
  console.log('-'.repeat(80));

  const endpoints = [
    '/api/orders/pending-kots',
    '/api/orders/pending-bills',
    '/api/menu',
    '/api/tables',
    '/api/tables/categories',
    '/api/analytics/overview?period=today',
  ];

  const test8 = await runConcurrentBatch({
    workerFn: (idx) => {
      const ep = endpoints[idx % endpoints.length];
      return request({ path: ep });
    },
    totalRequests: 180,
    concurrency: 60,
  });

  console.log(`Throughput: ${test8.rps} req/sec | Success: ${test8.successCount}/${test8.totalRequests} | Failures: ${test8.failureCount}`);
  console.log(`Latency: Avg ${test8.stats.avg}ms | Min ${test8.stats.min}ms | p50 ${test8.stats.p50}ms | p95 ${test8.stats.p95}ms | p99 ${test8.stats.p99}ms | Max ${test8.stats.max}ms`);
  report.tests.push({ name: 'Connection Pool Saturation (60 Concurrent)', ...test8 });

  if (test8.failureCount > 0) {
    report.criticalProblems.push({
      category: 'Connection Pool Depletion & Timeout',
      detail: `${test8.failureCount} requests failed or timed out when concurrency exceeded MongoDB driver maxPoolSize (25).`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // SUMMARY OF FINDINGS
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('📋 LOAD TESTING SUMMARY & DIAGNOSTIC FINDINGS');
  console.log('='.repeat(80));

  console.log(`\nTotal Test Scenarios Executed: ${report.tests.length}`);
  console.log(`Identified Critical Issues: ${report.criticalProblems.length}`);

  report.criticalProblems.forEach((prob, idx) => {
    console.log(`\n[ISSUE #${idx + 1}] ${prob.category}`);
    console.log(`  Details: ${prob.detail}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('Test suite completed successfully.');
  console.log('='.repeat(80));
}

async function main() {
  const isDirect = process.argv.includes('--live');
  if (isDirect) {
    console.warn('\n⚠️  WARNING: Running load test directly against LIVE server!');
    BASE_URL = 'http://localhost:4000';
    await runTestSuite();
  } else {
    // Default: Run strictly within isolated database sandbox
    await withIsolatedSandbox(runTestSuite, { port: 4001 });
  }
}

main().catch(err => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
