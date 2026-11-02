const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getIstDayRange } = require('../src/utils/date');

async function auditSalesFor(conn, label) {
  console.log(`\n======================================================`);
  console.log(`📊 AUDITING SALES: ${label}`);
  console.log(`======================================================`);

  const Order = conn.collection('orders');
  const SalesEntry = conn.collection('salesentries');

  // 1. Inspect Order #5830
  const order5830 = await Order.findOne({ orderNumber: 5830 });
  console.log('\n[1] Order #5830 Details:');
  if (order5830) {
    console.log(JSON.stringify({
      orderNumber: order5830.orderNumber,
      billNumber: order5830.billNumber,
      status: order5830.status,
      total: order5830.total,
      settledAmount: order5830.settledAmount,
      taxAmount: order5830.taxAmount,
      paymentMethod: order5830.paymentMethod,
      paymentBreakdown: order5830.paymentBreakdown,
      dueAmount: order5830.dueAmount,
      dueSettled: order5830.dueSettled,
      dueSettledAmount: order5830.dueSettledAmount,
      billedAt_UTC: order5830.billedAt?.toISOString(),
      billedAt_IST: order5830.billedAt ? new Date(order5830.billedAt.getTime() + 5.5 * 3600000).toISOString() : null,
      paidAt_UTC: order5830.paidAt?.toISOString(),
      paidAt_IST: order5830.paidAt ? new Date(order5830.paidAt.getTime() + 5.5 * 3600000).toISOString() : null,
      dueSettledAt_UTC: order5830.dueSettledAt?.toISOString(),
      dueSettledAt_IST: order5830.dueSettledAt ? new Date(order5830.dueSettledAt.getTime() + 5.5 * 3600000).toISOString() : null,
    }, null, 2));
  } else {
    console.log('Order #5830 not found!');
  }

  // 2. Audit 27th October 2026
  console.log('\n[2] Audit for 27th October 2026 (IST):');
  const oct27Range = getIstDayRange('2026-10-27');
  console.log(`   IST Day Range: ${oct27Range.start.toISOString()} -> ${oct27Range.end.toISOString()}`);

  const salesEntry27 = await SalesEntry.findOne({ date: { $gte: oct27Range.start, $lte: oct27Range.end } });
  console.log('   SalesEntry (27th Oct):', salesEntry27 ? {
    outletSales: salesEntry27.outletSales,
    totalRevenue: salesEntry27.totalRevenue,
    paymentBreakdown: salesEntry27.paymentBreakdown,
  } : 'None');

  // Orders counted in 27th Oct SalesEntry via reconciler logic
  const oct27PaidOrders = await Order.find({
    status: 'paid',
    $or: [
      { paidAt: { $gte: oct27Range.start, $lte: oct27Range.end } },
      { paidAt: null, createdAt: { $gte: oct27Range.start, $lte: oct27Range.end } },
    ]
  }).toArray();
  const includes5830_27 = oct27PaidOrders.some(o => o.orderNumber === 5830);
  console.log(`   Paid Orders on 27th Oct: ${oct27PaidOrders.length} orders, Sum: ₹${oct27PaidOrders.reduce((s, o) => s + (o.settledAmount || o.total), 0)}`);
  console.log(`   👉 Is Order #5830 in 27th Oct SalesEntry? ${includes5830_27 ? 'YES ✅ (Correctly counted as 27th Oct Due Sale)' : 'NO ❌'}`);

  // 3. Audit 28th October 2026
  console.log('\n[3] Audit for 28th October 2026 (IST):');
  const oct28Range = getIstDayRange('2026-10-28');
  console.log(`   IST Day Range: ${oct28Range.start.toISOString()} -> ${oct28Range.end.toISOString()}`);

  const salesEntry28 = await SalesEntry.findOne({ date: { $gte: oct28Range.start, $lte: oct28Range.end } });
  console.log('   SalesEntry (28th Oct):', salesEntry28 ? {
    outletSales: salesEntry28.outletSales,
    totalRevenue: salesEntry28.totalRevenue,
    paymentBreakdown: salesEntry28.paymentBreakdown,
  } : 'None');

  // Orders counted in 28th Oct SalesEntry via reconciler logic
  const oct28PaidOrders = await Order.find({
    status: 'paid',
    $or: [
      { paidAt: { $gte: oct28Range.start, $lte: oct28Range.end } },
      { paidAt: null, createdAt: { $gte: oct28Range.start, $lte: oct28Range.end } },
    ]
  }).toArray();
  const includes5830_28 = oct28PaidOrders.some(o => o.orderNumber === 5830);
  console.log(`   Paid Orders on 28th Oct: ${oct28PaidOrders.length} orders, Sum: ₹${oct28PaidOrders.reduce((s, o) => s + (o.settledAmount || o.total), 0)}`);
  console.log(`   👉 Is Order #5830 in 28th Oct SalesEntry? ${includes5830_28 ? 'YES ❌ (INCORRECT: Double Counted!)' : 'NO ✅ (CORRECT: Not in 28th Oct SalesEntry)'}`);

  // 4. Audit Detailed Sales Report (/api/reports/sales)
  console.log('\n[4] Audit for Detailed Sales Report (/api/reports/sales):');
  
  function getReportFilter(startDate, endDate) {
    const range = {
      start: getIstDayRange(startDate).start,
      end: getIstDayRange(endDate).end,
    };
    return {
      status: 'paid',
      $or: [
        { billedAt: { $ne: null, $gte: range.start, $lte: range.end } },
        { billedAt: null, billPrintedAt: { $ne: null, $gte: range.start, $lte: range.end } },
        { billedAt: null, billPrintedAt: null, paidAt: { $ne: null, $gte: range.start, $lte: range.end } },
        { billedAt: null, billPrintedAt: null, paidAt: null, createdAt: { $gte: range.start, $lte: range.end } }
      ]
    };
  }

  const report27Orders = await Order.find(getReportFilter('2026-10-27', '2026-10-27')).toArray();
  const inReport27 = report27Orders.some(o => o.orderNumber === 5830);
  const report27Total = report27Orders.reduce((s, o) => s + (o.settledAmount || o.total), 0);
  const report27Tax = report27Orders.reduce((s, o) => s + (o.taxAmount || 0), 0);

  const report28Orders = await Order.find(getReportFilter('2026-10-28', '2026-10-28')).toArray();
  const inReport28 = report28Orders.some(o => o.orderNumber === 5830);
  const report28Total = report28Orders.reduce((s, o) => s + (o.settledAmount || o.total), 0);
  const report28Tax = report28Orders.reduce((s, o) => s + (o.taxAmount || 0), 0);

  console.log(`   27th Oct Report: ${report27Orders.length} orders | Total Settled: ₹${report27Total} | Total Tax: ₹${report27Tax}`);
  console.log(`   👉 Is Order #5830 in 27th Oct Sales Report? ${inReport27 ? 'YES ✅ (Counted in 27th Oct Report)' : 'NO ❌'}`);

  console.log(`   28th Oct Report: ${report28Orders.length} orders | Total Settled: ₹${report28Total} | Total Tax: ₹${report28Tax}`);
  console.log(`   👉 Is Order #5830 in 28th Oct Sales Report? ${inReport28 ? 'YES ❌ (INCORRECT: Double Counted!)' : 'NO ✅ (CORRECT: Not in 28th Oct Report)'}`);

  if (report28Orders.length > 0) {
    console.log('   Orders actually in 28th Oct Report:', report28Orders.map(o => ({ order: o.orderNumber, bill: o.billNumber, total: o.total, tax: o.taxAmount, pay: o.paymentMethod })));
  }
}

async function main() {
  try {
    const localConn = await mongoose.createConnection('mongodb://127.0.0.1:27017/peyala_local').asPromise();
    await auditSalesFor(localConn, 'Local Database (127.0.0.1)');
    await localConn.close();

    const centralConn = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
    await auditSalesFor(centralConn, 'Central Cloud Database (Atlas)');
    await centralConn.close();
  } catch (err) {
    console.error('Audit failed:', err);
  }
  process.exit(0);
}

main();
