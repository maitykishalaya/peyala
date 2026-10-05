/**
 * Peyala POS - Automated Billing Order & Security Validation Test
 * Verifies:
 * 1. Testing credential purge (admin/manager/staff rejected, viewer read-only)
 * 2. Bill number generation in order of billing time, not table creation time
 * 3. Reporting sales audit log reflects bill time, not table start time
 * 4. High-concurrency sequential bill number allocation under race conditions
 */

const http = require('http');
const path = require('path');
const { withIsolatedSandbox } = require('./test-db-manager');

let BASE_URL = 'http://127.0.0.1:4001';
let ADMIN_TOKEN = '';
let VIEWER_TOKEN = '';

function request({ method = 'GET', path: reqPath, body = null, token = ADMIN_TOKEN, timeout = 15000 }) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout,
    };

    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (postData) options.headers['Content-Length'] = Buffer.byteLength(postData);

    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        let parsed;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: res.statusCode, duration, data: parsed });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, error: 'TIMEOUT', duration: Date.now() - startTime });
    });
    req.on('error', (err) => {
      resolve({ status: 500, error: err.message, duration: Date.now() - startTime });
    });

    if (postData) req.write(postData);
    req.end();
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTestScenario(serverInfo) {
  if (serverInfo?.baseUrl) BASE_URL = serverInfo.baseUrl;
  console.log('\n' + '='.repeat(80));
  console.log('🧪 RUNNING COMPREHENSIVE BILLING ORDER & SECURITY LOAD TEST');
  console.log(`🎯 Target Server: ${BASE_URL}`);
  console.log('='.repeat(80) + '\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Security Cleanup Verification
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[TEST 1] Verifying Security Credential Purge...');
  
  const badLogins = [
    { email: 'admin@peyala.com', password: 'peyala123' },
    { email: 'manager@peyala.com', password: 'peyala123' },
    { email: 'staff@peyala.com', password: 'peyala123' },
  ];

  for (const cred of badLogins) {
    const res = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: cred,
      token: '',
    });
    assert(res.status === 401, `Insecure test account "${cred.email}" rejected with 401 (got ${res.status})`);
  }

  // Check demo viewer works
  const viewerRes = await request({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'viewer@peyala.com', password: 'peyala123' },
    token: '',
  });
  assert(viewerRes.status === 200 && viewerRes.data?.user?.role === 'viewer', 'Demo viewer logs in successfully with role "viewer"');
  VIEWER_TOKEN = viewerRes.data?.token || '';

  // Check demo viewer cannot mutate data
  const viewerMutate = await request({
    method: 'POST',
    path: '/api/orders',
    body: { tableId: 'dummy', items: [] },
    token: VIEWER_TOKEN,
  });
  assert(viewerMutate.status === 403, `Demo viewer is forbidden from mutating orders (got ${viewerMutate.status})`);

  // Admin login via sandbox ephemeral credentials
  const adminRes = await request({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'loadtest@peyala.com', password: 'testadmin123' },
    token: '',
  });
  assert(adminRes.status === 200 && adminRes.data?.token, 'Ephemeral admin token acquired');
  ADMIN_TOKEN = adminRes.data?.token || '';

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Billing Order vs Creation Order Verification
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Verifying Bill Number Order by Billing Time (Not Table Start Time)...');

  const [tablesRes, menuRes] = await Promise.all([
    request({ path: '/api/tables' }),
    request({ path: '/api/menu' }),
  ]);
  const tables = tablesRes.data || [];
  const menuItems = menuRes.data || [];
  const sampleItem = menuItems.find(m => m.isAvailable !== false) || menuItems[0];

  assert(tables.length >= 3, `Found ${tables.length} tables for test`);
  assert(!!sampleItem, `Found sample menu item: ${sampleItem?.name}`);

  // Create Table 1 order (First ordered)
  const o1Res = await request({
    method: 'POST',
    path: '/api/orders',
    body: { tableId: tables[0]._id, items: [{ menuItemId: sampleItem._id, quantity: 1 }], shouldPrint: false },
  });
  const order1 = o1Res.data;
  console.log(`  Order 1 created at ${order1.createdAt} (Table ${tables[0].tableNumber})`);
  await delay(100);

  // Create Table 2 order (Second ordered)
  const o2Res = await request({
    method: 'POST',
    path: '/api/orders',
    body: { tableId: tables[1]._id, items: [{ menuItemId: sampleItem._id, quantity: 2 }], shouldPrint: false },
  });
  const order2 = o2Res.data;
  console.log(`  Order 2 created at ${order2.createdAt} (Table ${tables[1].tableNumber})`);
  await delay(100);

  // Create Table 3 order (Third ordered)
  const o3Res = await request({
    method: 'POST',
    path: '/api/orders',
    body: { tableId: tables[2]._id, items: [{ menuItemId: sampleItem._id, quantity: 3 }], shouldPrint: false },
  });
  const order3 = o3Res.data;
  console.log(`  Order 3 created at ${order3.createdAt} (Table ${tables[2].tableNumber})`);
  await delay(150);

  // NOW BILL THEM IN REVERSE ORDER:
  // Order 3 (last created) is billed FIRST!
  console.log('\n  -> Billing Order 3 FIRST...');
  const b3Res = await request({ method: 'POST', path: `/api/orders/${order3._id}/bill` });
  const billed3 = b3Res.data;
  console.log(`     Order 3 assigned Bill #${billed3.billNumber}, billedAt: ${billed3.billedAt}`);
  await delay(100);

  // Order 1 (first created) is billed SECOND!
  console.log('  -> Billing Order 1 SECOND...');
  const b1Res = await request({ method: 'POST', path: `/api/orders/${order1._id}/bill` });
  const billed1 = b1Res.data;
  console.log(`     Order 1 assigned Bill #${billed1.billNumber}, billedAt: ${billed1.billedAt}`);
  await delay(100);

  // Order 2 is billed THIRD via mark-bill-printed
  console.log('  -> Billing Order 2 THIRD via print...');
  const b2Res = await request({ method: 'POST', path: `/api/orders/${order2._id}/mark-bill-printed` });
  const billed2 = b2Res.data;
  console.log(`     Order 2 assigned Bill #${billed2.billNumber}, billedAt: ${billed2.billedAt}`);

  // Assertions: First printed bill has the earlier number!
  assert(
    billed3.billNumber < billed1.billNumber,
    `Order 3 (billed 1st) has earlier bill number than Order 1 (billed 2nd): #${billed3.billNumber} < #${billed1.billNumber}`
  );
  assert(
    billed1.billNumber < billed2.billNumber,
    `Order 1 (billed 2nd) has earlier bill number than Order 2 (billed 3rd): #${billed1.billNumber} < #${billed2.billNumber}`
  );

  // Settle all three orders
  await request({ method: 'POST', path: `/api/orders/${order3._id}/pay`, body: { paymentMethod: 'cash' } });
  await request({ method: 'POST', path: `/api/orders/${order1._id}/pay`, body: { paymentMethod: 'upi' } });
  await request({ method: 'POST', path: `/api/orders/${order2._id}/pay`, body: { paymentMethod: 'card' } });

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Reports / Sales Audit Log Verification
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Verifying Detailed Sales Report Order & Effective Bill Time...');

  const salesRes = await request({ path: '/api/reports/sales?status=paid' });
  assert(salesRes.status === 200, 'Detailed sales report loaded successfully');

  const reportOrders = salesRes.data?.orders || [];
  const testOrderIds = new Set([order1._id, order2._id, order3._id]);
  const matchedInReport = reportOrders.filter(o => testOrderIds.has(o._id));

  assert(matchedInReport.length === 3, `Found all 3 test orders in sales report`);

  // Verify sort order: in descending order, Bill 2 (billed 3rd) > Bill 1 (billed 2nd) > Bill 3 (billed 1st)
  const idx2 = reportOrders.findIndex(o => o._id === order2._id);
  const idx1 = reportOrders.findIndex(o => o._id === order1._id);
  const idx3 = reportOrders.findIndex(o => o._id === order3._id);

  assert(idx2 < idx1 && idx1 < idx3, `Report sorts descending by billNumber: #${billed2.billNumber} before #${billed1.billNumber} before #${billed3.billNumber}`);

  // Verify billedAt / billPrintedAt timestamps are present
  matchedInReport.forEach(o => {
    const hasBillTime = !!(o.billedAt || o.billPrintedAt);
    assert(hasBillTime, `Order #${o.billNumber} includes effective billing timestamp (${o.billedAt || o.billPrintedAt})`);
  });

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: High-Concurrency Sequential Bill Number Allocation
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[TEST 4] High-Concurrency Race Condition Load Test on Bill Generation (15 Concurrent Bills)...');

  const concurrentOrders = [];
  for (let i = 0; i < 15; i++) {
    const t = tables[i % tables.length];
    const cr = await request({
      method: 'POST',
      path: '/api/orders',
      body: { tableId: t._id, items: [{ menuItemId: sampleItem._id, quantity: 1 }], shouldPrint: false },
    });
    if (cr.data?._id) concurrentOrders.push(cr.data);
  }

  assert(concurrentOrders.length === 15, `Created 15 orders for simultaneous billing load`);

  // Settle / Bill all 15 concurrently at the exact same millisecond
  const billPromises = concurrentOrders.map(o => request({
    method: 'POST',
    path: `/api/orders/${o._id}/pay`,
    body: { paymentMethod: 'cash' },
  }));

  const billResults = await Promise.all(billPromises);
  const successfulBills = billResults.filter(r => r.status === 200 && r.data?.billNumber);

  assert(successfulBills.length === 15, `All 15 concurrent bills succeeded without failure`);

  const assignedBillNumbers = successfulBills.map(b => b.data.billNumber);
  const uniqueBillNumbers = new Set(assignedBillNumbers);

  assert(
    uniqueBillNumbers.size === 15,
    `Zero duplicate bill numbers allocated under concurrency (15 unique out of 15: [${assignedBillNumbers.join(', ')}])`
  );

  // Check sequential continuity
  const sortedNumbers = [...assignedBillNumbers].sort((a, b) => a - b);
  let isStrictlySequential = true;
  for (let i = 1; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] !== sortedNumbers[i - 1] + 1) {
      isStrictlySequential = false;
      break;
    }
  }
  assert(isStrictlySequential, `Bill numbers are strictly sequential without gaps: ${sortedNumbers[0]} to ${sortedNumbers[sortedNumbers.length - 1]}`);

  // ─────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80) + '\n');

  if (failed > 0) {
    throw new Error(`${failed} test checks failed!`);
  }
}

async function main() {
  await withIsolatedSandbox(runTestScenario, { port: 4002 });
}

main().catch(err => {
  console.error('\n❌ Fatal error during test execution:', err);
  process.exit(1);
});
