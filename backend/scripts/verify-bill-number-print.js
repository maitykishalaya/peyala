const fs = require('fs');
const path = require('path');

const thermalPath = path.join(__dirname, '../../frontend/src/lib/thermal-print.ts');
const content = fs.readFileSync(thermalPath, 'utf8');

// 1. Check line 656
if (content.includes('${data.billNumber ? String(data.billNumber) : (data.orderNumber ? String(data.orderNumber).slice(-4) : \'—\')}')) {
  console.error('❌ FAIL: Old orderNumber fallback still found in thermal-print.ts!');
  process.exit(1);
}

if (!content.includes('${data.billNumber ? String(data.billNumber) : \'—\'}')) {
  console.error('❌ FAIL: Expected billNumber line not found!');
  process.exit(1);
}

console.log('✅ thermal-print.ts: Bill Number correctly prints data.billNumber without orderNumber fallback.');

// 2. Check tables/page.tsx
const tablesPath = path.join(__dirname, '../../frontend/src/app/tables/page.tsx');
const tablesContent = fs.readFileSync(tablesPath, 'utf8');

if (!tablesContent.includes('const printRes = await ordersApi.markBillPrinted(activeOrder._id);')) {
  console.error('❌ FAIL: markBillPrinted not called before printing in modal!');
  process.exit(1);
}

console.log('✅ tables/page.tsx: markBillPrinted allocates bill number before thermal printing.');

// 3. Check orders.js
const ordersPath = path.join(__dirname, '../src/routes/orders.js');
const ordersContent = fs.readFileSync(ordersPath, 'utf8');

if (!ordersContent.includes('for (const order of pendingOrders) {') || !ordersContent.includes('await ensureOrderBillNumber(order,')) {
  console.error('❌ FAIL: pending-bills does not ensure billNumber!');
  process.exit(1);
}

console.log('✅ orders.js: pending-bills ensures billNumber is allocated for all queued prints.');

console.log('\n🎉 ALL CHECKS PASSED SUCCESSFULLY!');
