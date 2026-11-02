require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const { getIstDayRange } = require('../src/utils/date');

async function auditDatabase(uri, dbName) {
  console.log(`\n======================================================`);
  console.log(`🔎 DETAILED AUDIT FOR: ${dbName}`);
  console.log(`======================================================`);

  const conn = await mongoose.createConnection(uri).asPromise();
  const Order = conn.collection('orders');
  const SalesEntry = conn.collection('salesentries');
  const GSTLog = conn.collection('gstlogs');
  const CustomerLedger = conn.collection('customerledgers');

  // Target Bill / Order:
  const order = await Order.findOne({ orderNumber: 5830 });
  console.log(`\n1. Target Order #5830 (Bill #${order?.billNumber}):`);
  console.log(`   - Order ID: ${order?._id}`);
  console.log(`   - Customer: ${order?.customerName} (ID: ${order?.customer})`);
  console.log(`   - Total Amount: ₹${order?.total}`);
  console.log(`   - Tax Amount: ₹${order?.taxAmount}`);
  console.log(`   - Status: ${order?.status}`);
  console.log(`   - Payment Method: ${order?.paymentMethod}`);
  console.log(`   - Payment Breakdown: ${JSON.stringify(order?.paymentBreakdown)}`);
  console.log(`   - Billed At: ${order?.billedAt} (IST: ${new Date(order.billedAt.getTime() + 5.5 * 3600000).toISOString()})`);
  console.log(`   - Paid At: ${order?.paidAt} (IST: ${new Date(order.paidAt.getTime() + 5.5 * 3600000).toISOString()})`);
  console.log(`   - Due Settled At: ${order?.dueSettledAt} (IST: ${order?.dueSettledAt ? new Date(order.dueSettledAt.getTime() + 5.5 * 3600000).toISOString() : 'none'})`);

  const oct27 = getIstDayRange('2026-10-27');
  const oct28 = getIstDayRange('2026-10-28');

  // --- A. SalesEntry ---
  const se27 = await SalesEntry.findOne({ date: { $gte: oct27.start, $lte: oct27.end } });
  const se28 = await SalesEntry.findOne({ date: { $gte: oct28.start, $lte: oct28.end } });

  console.log(`\n2. Consolidated SalesEntry Records:`);
  console.log(`   [27th Oct 2026]`);
  console.log(`     - outletSales: ₹${se27?.outletSales}`);
  console.log(`     - totalRevenue: ₹${se27?.totalRevenue}`);
  console.log(`     - cash: ₹${se27?.paymentBreakdown?.cash}, upi: ₹${se27?.paymentBreakdown?.upi}, due: ₹${se27?.paymentBreakdown?.due}`);
  console.log(`   [28th Oct 2026]`);
  console.log(`     - outletSales: ₹${se28?.outletSales}`);
  console.log(`     - totalRevenue: ₹${se28?.totalRevenue}`);
  console.log(`     - cash: ₹${se28?.paymentBreakdown?.cash}, upi: ₹${se28?.paymentBreakdown?.upi}, due: ₹${se28?.paymentBreakdown?.due}`);

  // Check which SalesEntry counts Order #5830:
  // Reconciler logic: status: 'paid', paidAt in range (or createdAt if paidAt is null)
  const isPaidAt27 = order.paidAt >= oct27.start && order.paidAt <= oct27.end;
  const isPaidAt28 = order.paidAt >= oct28.start && order.paidAt <= oct28.end;
  console.log(`   👉 Counted in 27th Oct SalesEntry? ${isPaidAt27 ? 'YES ✅ (in paymentBreakdown.due)' : 'NO ❌'}`);
  console.log(`   👉 Counted in 28th Oct SalesEntry? ${isPaidAt28 ? 'YES ❌ (DUPLICATE)' : 'NO ✅ (Clean)'}`);

  // --- B. Detailed Sales Report ---
  // Filter used by /api/reports/sales:
  function getReportQuery(range) {
    return {
      status: 'paid',
      $or: [
        { billedAt: { $ne: null, $gte: range.start, $lte: range.end } },
        { billedAt: null, billPrintedAt: { $ne: null, $gte: range.start, $lte: range.end } },
        { billedAt: null, billPrintedAt: null, paidAt: { $ne: null, $gte: range.start, $lte: range.end } },
        { billedAt: null, billPrintedAt: null, paidAt: null, createdAt: { $gte: range.start, $lte: range.end } },
      ],
    };
  }

  const report27 = await Order.find(getReportQuery(oct27)).toArray();
  const report28 = await Order.find(getReportQuery(oct28)).toArray();

  const inReport27 = report27.some(o => o.orderNumber === 5830);
  const inReport28 = report28.some(o => o.orderNumber === 5830);

  console.log(`\n3. Detailed Sales Report (/api/reports/sales):`);
  console.log(`   [27th Oct 2026]`);
  console.log(`     - Total Orders: ${report27.length}`);
  console.log(`     - Total Gross/Settled: ₹${report27.reduce((s, o) => s + (o.settledAmount || o.total), 0)}`);
  console.log(`     - Total Tax: ₹${report27.reduce((s, o) => s + (o.taxAmount || 0), 0)}`);
  console.log(`     - Contains Order #5830? ${inReport27 ? 'YES ✅' : 'NO ❌'}`);

  console.log(`   [28th Oct 2026]`);
  console.log(`     - Total Orders: ${report28.length}`);
  console.log(`     - Total Gross/Settled: ₹${report28.reduce((s, o) => s + (o.settledAmount || o.total), 0)}`);
  console.log(`     - Total Tax: ₹${report28.reduce((s, o) => s + (o.taxAmount || 0), 0)}`);
  console.log(`     - Contains Order #5830? ${inReport28 ? 'YES ❌ (DUPLICATE)' : 'NO ✅ (Clean)'}`);

  // --- C. GST Logs ---
  const BalanceSheet = conn.collection('balancesheets');
  const bs = await BalanceSheet.findOne({});
  const gstLogs = (bs?.gstLog || []).filter(l => String(l.salesEntryId) === String(order._id));
  console.log(`\n4. GST Log Records for Order #5830:`);
  console.log(`   - Count of GST logs: ${gstLogs.length} (Expected: exactly 1)`);
  gstLogs.forEach(g => {
    console.log(`     - Date: ${g.date} | GST Added: ₹${g.gstAdded} | Outlet Sales: ₹${g.outletSales} | Note: ${g.note}`);
  });

  // --- D. Customer Due Settlement Ledger ---
  const customerIdObj = order.customer ? (typeof order.customer === 'string' ? new mongoose.Types.ObjectId(order.customer) : order.customer) : null;
  const ledgers = await CustomerLedger.find({
    customerId: { $in: [order.customer, customerIdObj] },
    createdAt: { $gte: oct27.start }
  }).sort({ createdAt: 1 }).toArray();

  console.log(`\n5. Customer Ledger Entries for Customer (${order.customerName}):`);
  ledgers.forEach(l => {
    console.log(`   - Type: ${l.type} | Amount: ₹${l.amount} | Date: ${l.createdAt.toISOString()} | Desc: ${l.description || l.notes}`);
  });

  await conn.close();
}

async function main() {
  await auditDatabase('mongodb://127.0.0.1:27017/peyala_local', 'Local MongoDB (127.0.0.1:27017)');
  await auditDatabase(process.env.MONGODB_URI, 'Central MongoDB Atlas');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
