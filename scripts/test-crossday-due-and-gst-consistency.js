// ─────────────────────────────────────────────────────────────────
// Cross-Day Due Settlement & GST Deduplication Consistency Test
// Tests:
// 1. Cross-day due settlement does NOT pollute Day 2 sales report
// 2. Customer balance decrements accurately
// 3. BalanceSheet GST log deduplication (no double tax under sync)
// 4. Bill sequence auto-healing against stale sequence documents
// ─────────────────────────────────────────────────────────────────

const http = require('http');
const path = require('path');
const backendDir = path.join(__dirname, '../backend');
const { MongoClient, ObjectId } = require(path.join(backendDir, 'node_modules/mongodb'));
const { withIsolatedSandbox, TEST_URI } = require('./test-db-manager');

let BASE_URL = 'http://127.0.0.1:4003';
let AUTH_TOKEN = '';

function request({ method = 'GET', path: reqPath, body = null, token = AUTH_TOKEN, timeout = 15000 }) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout: ${method} ${reqPath}`));
    });

    req.on('error', reject);

    if (postData) req.write(postData);
    req.end();
  });
}

async function runTestScenario({ baseUrl }) {
  BASE_URL = baseUrl;
  const testDbUri = TEST_URI;
  console.log('\n================================================================================');
  console.log('🧪 RUNNING CROSS-DAY DUE SETTLEMENT & GST DEDUPLICATION CONSISTENCY TEST');
  console.log(`🎯 Target Server: ${BASE_URL} / DB: ${testDbUri}`);
  console.log('================================================================================\n');

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

  const testDbClient = new MongoClient(testDbUri);
  await testDbClient.connect();
  const testDb = testDbClient.db();

  try {
    // 1. Authenticate as Admin
    console.log('[STEP 1] Authenticating...');
    const adminUser = await testDb.collection('users').findOne({ role: 'admin', isActive: true });
    const jwt = require(path.join(backendDir, 'node_modules/jsonwebtoken'));
    AUTH_TOKEN = jwt.sign(
      { id: adminUser._id, role: 'admin', name: adminUser.name },
      process.env.JWT_SECRET || 'peyala_super_secret_jwt_key_2024_change_in_production',
      { expiresIn: '1h' }
    );
    assert(Boolean(AUTH_TOKEN), 'Admin authentication token generated');

    // 2. Setup Customer & Menu Item
    console.log('\n[STEP 2] Setting up customer & test table...');
    const table = await testDb.collection('tables').findOne({ status: 'available' });
    const menuItem = await testDb.collection('menuitems').findOne({ isAvailable: true, price: { $gt: 50 } });
    assert(Boolean(table && menuItem), `Found Table (${table?.tableNumber}) and MenuItem (${menuItem?.name}, ₹${menuItem?.price})`);

    // Create unique test customer
    const custPhone = '99999' + Math.floor(10000 + Math.random() * 90000);
    const custRes = await request({
      method: 'POST',
      path: '/api/customers',
      body: {
        name: 'Test Khata Customer',
        phone: custPhone,
        address: 'Test Lane',
      },
    });
    const customer = custRes.data;
    assert(customer && customer.phone === custPhone, `Created test customer with phone: ${custPhone}`);

    // 3. Create Order on "Day 1" (Simulate Yesterday: 2026-10-27)
    console.log('\n[STEP 3] Placing order on Table and settling as DUE on Day 1 (Yesterday)...');
    const day1Date = new Date('2026-10-27T12:00:00.000Z');
    const orderRes = await request({
      method: 'POST',
      path: '/api/orders',
      body: {
        tableId: table._id,
        items: [{
          menuItemId: menuItem._id,
          quantity: 2,
          notes: 'Cross-day due test item',
        }],
        shouldPrint: false,
      },
    });
    const order = orderRes.data;
    assert(order && order._id, `Order #${order.orderNumber} placed on Table ${table.tableNumber} (Total: ₹${order.total})`);

    // Settle Order as DUE on Day 1
    const settleRes = await request({
      method: 'POST',
      path: `/api/orders/${order._id}/pay`,
      body: {
        paymentMethod: 'due',
        customerInfo: {
          name: customer.name,
          phone: customer.phone,
        },
      },
    });
    assert(settleRes.status === 200, `Order #${order.orderNumber} settled as DUE (₹${settleRes.data.settledAmount})`);

    // Force backdate the order to Day 1 (2026-10-27) in the database
    await testDb.collection('orders').updateOne(
      { _id: new ObjectId(order._id) },
      {
        $set: {
          billedAt: day1Date,
          billPrintedAt: day1Date,
          paidAt: day1Date,
          createdAt: day1Date,
          updatedAt: day1Date,
        }
      }
    );

    // 4. Verify Day 1 Sales Report
    console.log('\n[STEP 4] Checking Day 1 Sales Report (2026-10-27)...');
    const day1Report = await request({
      method: 'GET',
      path: '/api/reports/sales?startDate=2026-10-27&endDate=2026-10-27',
    });
    const day1Orders = day1Report.data.orders || [];
    const foundOnDay1 = day1Orders.find(o => String(o._id) === String(order._id));
    assert(Boolean(foundOnDay1), `Order #${order.orderNumber} (Bill #${foundOnDay1?.billNumber}) appears in Day 1 Sales Report`);
    const day1TotalBefore = day1Report.data.summary.totalSettled;
    const day1TaxBefore = day1Report.data.summary.totalTax;
    console.log(`   Day 1 Total Settled: ₹${day1TotalBefore}, Total Tax: ₹${day1TaxBefore}`);

    // 5. Verify Day 2 Sales Report BEFORE Settlement
    console.log('\n[STEP 5] Checking Day 2 Sales Report BEFORE Settlement (2026-10-28)...');
    const day2ReportBefore = await request({
      method: 'GET',
      path: '/api/reports/sales?startDate=2026-10-28&endDate=2026-10-28',
    });
    const day2OrdersBefore = day2ReportBefore.data.orders || [];
    const foundOnDay2Before = day2OrdersBefore.find(o => String(o._id) === String(order._id));
    assert(!foundOnDay2Before, `Order #${order.orderNumber} does NOT appear in Day 2 Sales Report prior to settlement`);
    const day2TotalBefore = day2ReportBefore.data.summary.totalSettled;
    const day2TaxBefore = day2ReportBefore.data.summary.totalTax;

    // 6. Settle the Customer Due on Day 2 (TODAY)
    console.log('\n[STEP 6] Settling customer due on Day 2 (TODAY) via Customer Due Payment...');
    const settleDueRes = await request({
      method: 'POST',
      path: `/api/customers/${customer._id}/collect-due`,
      body: {
        amount: order.total,
        paymentMethod: 'cash',
        notes: 'Settling due on Day 2',
      },
    });
    assert(settleDueRes.status === 200, `Successfully collected ₹${order.total} due from customer`);
    assert(settleDueRes.data.customer.totalDue === 0, `Customer remaining totalDue is 0`);

    // Verify order in DB now has dueSettled = true and dueSettledAt = Today
    const updatedOrderInDb = await testDb.collection('orders').findOne({ _id: new ObjectId(order._id) });
    assert(updatedOrderInDb.dueSettled === true, 'Order in DB is marked dueSettled: true');
    assert(Boolean(updatedOrderInDb.dueSettledAt), `Order in DB has dueSettledAt timestamp`);

    // 7. Verify Day 2 Sales Report AFTER Settlement — MUST NOT POLLUTE DAY 2 SALES!
    console.log('\n[STEP 7] Checking Day 2 Sales Report AFTER Settlement (2026-10-28)...');
    const day2ReportAfter = await request({
      method: 'GET',
      path: '/api/reports/sales?startDate=2026-10-28&endDate=2026-10-28',
    });
    const day2OrdersAfter = day2ReportAfter.data.orders || [];
    const foundOnDay2After = day2OrdersAfter.find(o => String(o._id) === String(order._id));
    assert(!foundOnDay2After, `SUCCESS: Order #${order.orderNumber} does NOT appear in Day 2 Sales Report! (Zero Cross-Day Duplication)`);

    const day2TotalAfter = day2ReportAfter.data.summary.totalSettled;
    const day2TaxAfter = day2ReportAfter.data.summary.totalTax;
    assert(day2TotalAfter === day2TotalBefore, `Day 2 sales total remained strictly unchanged: ₹${day2TotalBefore} === ₹${day2TotalAfter}`);
    assert(day2TaxAfter === day2TaxBefore, `Day 2 GST tax total remained strictly unchanged: ₹${day2TaxBefore} === ₹${day2TaxAfter}`);

    // 8. Verify Day 1 Sales Report is completely intact
    console.log('\n[STEP 8] Checking Day 1 Sales Report AFTER Settlement...');
    const day1ReportAfter = await request({
      method: 'GET',
      path: '/api/reports/sales?startDate=2026-10-27&endDate=2026-10-27',
    });
    assert(day1ReportAfter.data.summary.totalSettled === day1TotalBefore, 'Day 1 sales total is 100% intact');
    assert(day1ReportAfter.data.summary.totalTax === day1TaxBefore, 'Day 1 tax total is 100% intact');

    // 9. BalanceSheet GST Deduplication Test
    console.log('\n[STEP 9] Verifying BalanceSheet GST log deduplication...');
    const bs = await testDb.collection('balancesheets').findOne({});
    const orderGstLogs = (bs?.gstLog || []).filter(l => String(l.salesEntryId) === String(order._id));
    assert(orderGstLogs.length === 1, `Order #${order.orderNumber} has exactly 1 GST log entry (found: ${orderGstLogs.length})`);
    assert(orderGstLogs[0].gstAdded === order.taxAmount, `GST added (₹${orderGstLogs[0].gstAdded}) matches order tax (₹${order.taxAmount})`);

    // 10. BillSequence Auto-Healing Test
    console.log('\n[STEP 10] Testing BillSequence Auto-Healing under sequence corruption/rollback...');
    // Artificially corrupt BillSequence to a regressed number (seq: 100)
    await testDb.collection('billsequences').updateOne(
      { _id: 'FY2627-Q3' },
      { $set: { seq: 100 } }
    );
    console.log('   Artificially set FY2627-Q3 sequence to: 100 (while orders with bill 1000+ exist in DB)');

    // Place a new order and generate bill
    const healTable = await testDb.collection('tables').findOne({ status: 'available', _id: { $ne: table._id } });
    const healOrderRes = await request({
      method: 'POST',
      path: '/api/orders',
      body: {
        tableId: healTable._id,
        items: [{ menuItemId: menuItem._id, quantity: 1 }],
        shouldPrint: false,
      },
    });
    const billGenRes = await request({
      method: 'POST',
      path: `/api/orders/${healOrderRes.data._id}/bill`,
    });
    const assignedBillNumber = billGenRes.data.billNumber;
    assert(assignedBillNumber > 1000, `SUCCESS: Auto-healing worked! Assigned Bill #${assignedBillNumber} instead of regressing to 101`);

    // Verify BillSequence in DB was automatically fast-forwarded
    const healedSeq = await testDb.collection('billsequences').findOne({ _id: 'FY2627-Q3' });
    assert(healedSeq.seq >= assignedBillNumber, `BillSequence document healed to: ${healedSeq.seq}`);

    console.log('\n================================================================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================================\n');

    if (failed > 0) {
      throw new Error(`${failed} check(s) failed`);
    }
  } finally {
    await testDbClient.close();
  }
}

async function main() {
  await withIsolatedSandbox(runTestScenario, { port: 4003 });
}

main().catch(err => {
  console.error('\n❌ Fatal error during test execution:', err);
  process.exit(1);
});
