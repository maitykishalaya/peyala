/**
 * IN-DEPTH LOAD TESTING SUITE
 * 1. Concurrency test on bill numbers (check for duplicate bill numbers under heavy load)
 * 2. Concurrency test on sequence corruption/rollback auto-healing
 * 3. Concurrency test on order payment settlement (zero duplicate account credits / zero duplicate GST)
 * 4. Concurrency test on customer due collection (zero duplicate account increments)
 * 5. Partial due collections under concurrency
 * 6. Cross-day due settlement zero double-counting
 *
 * Runs strictly against an isolated sandbox database instance (peyala_loadtest).
 */

const path = require('path');
const http = require('http');
const { withIsolatedSandbox, TEST_URI } = require('./test-db-manager');
const backendDir = path.join(__dirname, '../backend');
const { MongoClient, ObjectId } = require(path.join(backendDir, 'node_modules/mongodb'));

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode, data: json, raw: body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

async function runLoadTests({ baseUrl, port }) {
  console.log(`\n================================================================================`);
  console.log(`🧪 RUNNING IN-DEPTH LOAD TEST ON ISOLATED DATABASE`);
  console.log(`🎯 Base URL: ${baseUrl} | Port: ${port}`);
  console.log(`================================================================================\n`);

  const client = new MongoClient(TEST_URI, { family: 4 });
  await client.connect();
  const db = client.db();

  let passCount = 0;
  let failCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passCount++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failCount++;
    }
  }

  // --- Step 1: Admin Token ---
  console.log('[STEP 1] Generating Admin Token for testing...');
  const jwt = require(path.join(backendDir, 'node_modules/jsonwebtoken'));
  const testUser = await db.collection('users').findOne({ role: 'admin' });
  const jwtSecret = process.env.JWT_SECRET || 'peyala_super_secret_jwt_key_2024_change_in_production';
  const token = jwt.sign(
    { id: testUser._id.toString(), role: 'admin', name: testUser.name },
    jwtSecret,
    { expiresIn: '1h' }
  );
  assert(Boolean(token), 'Admin JWT generated successfully');

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // --- Step 2: 100 Concurrent Bill Number Allocations ---
  console.log('\n[STEP 2] Testing 100 Simultaneous Concurrent Bill Number Allocations...');
  // Find a table and menu item to place orders on
  const table = await db.collection('tables').findOne({ status: 'available' }) || await db.collection('tables').findOne({});
  const menuItem = await db.collection('menuitems').findOne({ price: { $gt: 0 } });

  // Create 100 test orders in DB
  const orderIds = [];
  for (let i = 0; i < 100; i++) {
    const oRes = await db.collection('orders').insertOne({
      table: table._id,
      items: [{
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        taxPercent: menuItem.taxPercent || 5,
        quantity: 1,
        status: 'served',
        roundNumber: 1,
        effectiveTime: new Date()
      }],
      status: 'served',
      subtotal: menuItem.price,
      taxAmount: Math.round(menuItem.price * 0.05 * 100) / 100,
      total: menuItem.price + Math.round(menuItem.price * 0.05 * 100) / 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    orderIds.push(oRes.insertedId);
  }

  // Now trigger bill generation simultaneously on all 100 orders
  console.log('   Dispatching 100 concurrent bill generation requests...');
  const billPromises = orderIds.map(id => {
    return httpRequest({
      hostname: '127.0.0.1',
      port,
      path: `/api/orders/${id}/bill`,
      method: 'POST',
      headers: authHeaders,
    });
  });

  const billResponses = await Promise.all(billPromises);
  const allocatedBills = [];
  let successfulBills = 0;

  console.log('   Sample response:', { status: billResponses[0]?.status, data: billResponses[0]?.data, raw: billResponses[0]?.raw });
  for (const res of billResponses) {
    if (res.status === 200 && res.data && res.data.billNumber) {
      allocatedBills.push(res.data.billNumber);
      successfulBills++;
    }
  }

  assert(successfulBills === 100, `All 100 concurrent bill generation requests succeeded (succeeded: ${successfulBills}/100)`);

  const uniqueBills = new Set(allocatedBills);
  assert(uniqueBills.size === allocatedBills.length, `ZERO DUPLICATE BILLS: Generated ${allocatedBills.length} bills, unique count is ${uniqueBills.size}`);

  // Check monotonicity: sorted bills should have difference of exactly 1
  const sortedBills = [...allocatedBills].sort((a, b) => a - b);
  let isGapless = true;
  for (let i = 1; i < sortedBills.length; i++) {
    if (sortedBills[i] !== sortedBills[i - 1] + 1) {
      isGapless = false;
      break;
    }
  }
  assert(isGapless, `Bills are strictly sequential and gapless (${sortedBills[0]} -> ${sortedBills[sortedBills.length - 1]})`);

  // --- Step 3: Sequence Rollback / Corruption Auto-Healing under High Concurrency ---
  console.log('\n[STEP 3] Testing Sequence Rollback / Corruption Auto-Healing under Concurrency...');
  const maxBillBefore = sortedBills[sortedBills.length - 1];
  console.log(`   Current highest bill in DB: ${maxBillBefore}`);

  // Corrupt sequence to 100
  await db.collection('billsequences').updateOne(
    { _id: 'FY2627-Q3' },
    { $set: { seq: 100, updatedAt: new Date() } }
  );
  console.log('   Artificially corrupted FY2627-Q3 sequence to 100 in DB!');

  // Create 30 more orders and allocate bills concurrently
  const corruptTestOrderIds = [];
  for (let i = 0; i < 30; i++) {
    const oRes = await db.collection('orders').insertOne({
      table: table._id,
      items: [{ menuItem: menuItem._id, name: menuItem.name, price: menuItem.price, taxPercent: 5, quantity: 1, status: 'served', roundNumber: 1, effectiveTime: new Date() }],
      status: 'served',
      subtotal: menuItem.price,
      taxAmount: 5,
      total: menuItem.price + 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    corruptTestOrderIds.push(oRes.insertedId);
  }

  const healPromises = corruptTestOrderIds.map(id => {
    return httpRequest({
      hostname: '127.0.0.1',
      port,
      path: `/api/orders/${id}/bill`,
      method: 'POST',
      headers: authHeaders,
    });
  });

  const healResponses = await Promise.all(healPromises);
  const healedBills = healResponses.map(r => r.data?.billNumber).filter(Boolean);
  const uniqueHealed = new Set(healedBills);

  assert(healedBills.length === 30, `All 30 orders after corruption received bills (received: ${healedBills.length})`);
  assert(uniqueHealed.size === 30, `ZERO DUPLICATES after corruption: 30 unique numbers generated (count: ${uniqueHealed.size})`);
  
  const minHealed = Math.min(...healedBills);
  assert(minHealed === maxBillBefore + 1, `Auto-healing started strictly at maxBill + 1 (${maxBillBefore + 1}), got min: ${minHealed}`);

  // --- Step 4: Concurrent Order Settlement (Zero Duplicate Account / GST Increments) ---
  console.log('\n[STEP 4] Testing Concurrent Order Settlement (Double Pay Prevention)...');
  // Create an order to pay
  const orderToPay = await db.collection('orders').insertOne({
    table: table._id,
    orderNumber: 9991,
    items: [{ menuItem: menuItem._id, name: 'Burger Test', price: 200, taxPercent: 5, quantity: 1, status: 'served', roundNumber: 1, effectiveTime: new Date() }],
    status: 'billed',
    subtotal: 200,
    taxAmount: 10,
    total: 210,
    billedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Record initial cash account balance & GST liability (matching active cash account)
  const cashAccBefore = await db.collection('accounts').findOne({ name: /cash counter/i, type: 'cash', isActive: true });
  const bsBefore = await db.collection('balancesheets').findOne({});
  const initCashBal = cashAccBefore?.currentBalance || 0;
  const initGstLiab = bsBefore?.gstLiability || 0;

  console.log(`   Initial Cash Balance (Account: ${cashAccBefore.name} [${cashAccBefore._id}]): ₹${initCashBal} | Initial GST Liability: ₹${initGstLiab}`);
  console.log('   Firing 20 simultaneous concurrent payment requests for Order #9991...');

  const payPromises = [];
  for (let i = 0; i < 20; i++) {
    payPromises.push(httpRequest({
      hostname: '127.0.0.1',
      port,
      path: `/api/orders/${orderToPay.insertedId}/pay`,
      method: 'POST',
      headers: authHeaders,
    }, {
      paymentMethod: 'cash',
      settlementAmount: 210
    }));
  }

  const payResponses = await Promise.all(payPromises);
  const successPays = payResponses.filter(r => r.status === 200);
  const rejectedPays = payResponses.filter(r => r.status === 400 || r.status === 409);

  console.log(`   Results: ${successPays.length} succeeded, ${rejectedPays.length} rejected`);
  assert(successPays.length === 1, `Exactly 1 concurrent pay request succeeded (expected 1, got ${successPays.length})`);
  assert(rejectedPays.length === 19, `All 19 other concurrent pay requests were safely rejected (got ${rejectedPays.length})`);

  // Check Cash Account Balance
  const cashAccAfter = await db.collection('accounts').findOne({ _id: cashAccBefore._id });
  const cashDelta = Math.round((cashAccAfter.currentBalance - initCashBal) * 100) / 100;
  assert(cashDelta === 210, `Cash Account was incremented EXACTLY ONCE by ₹210 (actual delta: ₹${cashDelta})`);

  // Check GST Liability
  const bsAfter = await db.collection('balancesheets').findOne({});
  const gstDelta = Math.round((bsAfter.gstLiability - initGstLiab) * 100) / 100;
  assert(gstDelta === 10, `GST Liability was incremented EXACTLY ONCE by ₹10 (actual delta: ₹${gstDelta})`);

  // --- Step 5: Concurrent Customer Due Collection (Zero Duplicate Account Increments) ---
  console.log('\n[STEP 5] Testing Concurrent Customer Due Collection (Zero Duplicate Account Increments)...');
  // Create customer with ₹500 due
  const testCustomer = await db.collection('customers').insertOne({
    name: 'Concurrent Due Test Customer',
    phone: '8888877777',
    totalDue: 500,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create an unpaid due order attached to customer
  await db.collection('orders').insertOne({
    table: table._id,
    customer: testCustomer.insertedId,
    orderNumber: 9992,
    billNumber: 8881,
    status: 'paid',
    paymentMethod: 'due',
    dueAmount: 500,
    dueSettled: false,
    dueSettledAmount: 0,
    total: 500,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const cashBeforeDue = await db.collection('accounts').findOne({ _id: cashAccBefore._id });
  const cashBalBeforeDue = cashBeforeDue?.currentBalance || 0;
  console.log(`   Customer Due: ₹500 | Current Cash Balance: ₹${cashBalBeforeDue}`);
  console.log('   Firing 20 simultaneous concurrent collect-due requests for ₹500...');

  const duePromises = [];
  for (let i = 0; i < 20; i++) {
    duePromises.push(httpRequest({
      hostname: '127.0.0.1',
      port,
      path: `/api/customers/${testCustomer.insertedId}/collect-due`,
      method: 'POST',
      headers: authHeaders,
    }, {
      amount: 500,
      paymentMethod: 'cash',
      accountId: cashAccBefore._id.toString()
    }));
  }

  const dueResponses = await Promise.all(duePromises);
  const successDues = dueResponses.filter(r => r.status === 200);
  const rejectedDues = dueResponses.filter(r => r.status === 400 || r.status === 409);

  console.log(`   Results: ${successDues.length} succeeded, ${rejectedDues.length} rejected`);
  if (successDues.length === 0) {
    console.log('   Debug dueResponses:', dueResponses.slice(0, 3).map(r => ({ status: r.status, data: r.data, raw: r.raw })));
  }
  assert(successDues.length === 1, `Exactly 1 concurrent due collection request succeeded (expected 1, got ${successDues.length})`);
  assert(rejectedDues.length === 19, `All 19 other concurrent due collection requests were safely rejected`);

  // Verify Customer Total Due is 0
  const custAfter = await db.collection('customers').findOne({ _id: testCustomer.insertedId });
  assert(custAfter.totalDue === 0, `Customer totalDue is exactly 0 (actual: ${custAfter.totalDue})`);

  // Verify Cash Account Balance incremented by exactly ₹500
  const cashAfterDue = await db.collection('accounts').findOne({ _id: cashAccBefore._id });
  const dueCashDelta = Math.round((cashAfterDue.currentBalance - cashBalBeforeDue) * 100) / 100;
  assert(dueCashDelta === 500, `Cash Account was incremented EXACTLY ONCE by ₹500 (actual delta: ₹${dueCashDelta})`);

  // Verify CustomerDuePayment records count is exactly 1
  const paymentRecordsCount = await db.collection('customerduepayments').countDocuments({ customer: testCustomer.insertedId });
  assert(paymentRecordsCount === 1, `Exactly 1 CustomerDuePayment record was created (count: ${paymentRecordsCount})`);

  // --- Step 6: Partial Due Collections under Concurrency ---
  console.log('\n[STEP 6] Testing Partial Due Collections under Concurrency...');
  const partialCustomer = await db.collection('customers').insertOne({
    name: 'Partial Due Customer',
    phone: '7777766666',
    totalDue: 300,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const cashBeforePartial = await db.collection('accounts').findOne({ _id: cashAccBefore._id });
  const cashBalBeforePartial = cashBeforePartial?.currentBalance || 0;

  console.log('   Customer Due: ₹300. Firing 10 concurrent requests to collect ₹100 each...');
  const partialPromises = [];
  for (let i = 0; i < 10; i++) {
    partialPromises.push(httpRequest({
      hostname: '127.0.0.1',
      port,
      path: `/api/customers/${partialCustomer.insertedId}/collect-due`,
      method: 'POST',
      headers: authHeaders,
    }, {
      amount: 100,
      paymentMethod: 'cash',
      accountId: cashAccBefore._id.toString()
    }));
  }

  const partialResponses = await Promise.all(partialPromises);
  const successPartials = partialResponses.filter(r => r.status === 200);
  const rejectedPartials = partialResponses.filter(r => r.status === 400 || r.status === 409);

  console.log(`   Results: ${successPartials.length} succeeded, ${rejectedPartials.length} rejected`);
  assert(successPartials.length === 3, `Exactly 3 concurrent collections of ₹100 succeeded for ₹300 due (got ${successPartials.length})`);
  assert(rejectedPartials.length === 7, `Remaining 7 collections were safely rejected (got ${rejectedPartials.length})`);

  const partialCustAfter = await db.collection('customers').findOne({ _id: partialCustomer.insertedId });
  assert(partialCustAfter.totalDue === 0, `Customer remaining totalDue is 0 (actual: ${partialCustAfter.totalDue})`);

  const cashAfterPartial = await db.collection('accounts').findOne({ _id: cashAccBefore._id });
  const partialCashDelta = Math.round((cashAfterPartial.currentBalance - cashBalBeforePartial) * 100) / 100;
  assert(partialCashDelta === 300, `Cash Account was incremented by exactly ₹300 (actual delta: ₹${partialCashDelta})`);

  // --- Step 7: Final Database Scan for Any Duplicate Bill Numbers in Sandbox ---
  console.log('\n[STEP 7] Scanning Sandbox Database for ANY duplicate bill numbers created...');
  const allQuarterOrders = await db.collection('orders').find({
    fiscalQuarter: 'FY2627-Q3',
    billNumber: { $gt: maxBillBefore }
  }).toArray();

  const finalBillMap = {};
  for (const o of allQuarterOrders) {
    finalBillMap[o.billNumber] = (finalBillMap[o.billNumber] || 0) + 1;
  }
  const duplicateBillsFound = Object.entries(finalBillMap).filter(([b, c]) => c > 1);
  assert(duplicateBillsFound.length === 0, `ZERO duplicate bills found among newly allocated orders (found: ${duplicateBillsFound.length})`);

  console.log(`\n================================================================================`);
  console.log(`📊 LOAD TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log(`================================================================================\n`);

  await client.close();

  if (failCount > 0) {
    throw new Error(`Load tests failed: ${failCount} assertions failed.`);
  }
  return { passCount, failCount };
}

if (require.main === module) {
  withIsolatedSandbox(runLoadTests, { port: 4004 })
    .then(() => {
      console.log('✅ Isolated load testing finished with 100% SUCCESS.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Load testing failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runLoadTests };
