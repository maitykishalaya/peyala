const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getIstDayRange } = require('../src/utils/date');

async function testReports() {
  const conn = await mongoose.createConnection('mongodb://127.0.0.1:27017/peyala_local').asPromise();
  const Order = conn.collection('orders');

  async function querySales(startDate, endDate, paymentMethod = 'all') {
    const filter = {};
    let startRange = null;
    let endRange = null;
    if (startDate) startRange = getIstDayRange(startDate).start;
    if (endDate) endRange = getIstDayRange(endDate).end;

    filter.$or = [
      { billedAt: { $ne: null, ...(startRange ? { $gte: startRange } : {}), ...(endRange ? { $lte: endRange } : {}) } },
      { billedAt: null, billPrintedAt: { $ne: null, ...(startRange ? { $gte: startRange } : {}), ...(endRange ? { $lte: endRange } : {}) } },
      { billedAt: null, billPrintedAt: null, paidAt: { $ne: null, ...(startRange ? { $gte: startRange } : {}), ...(endRange ? { $lte: endRange } : {}) } },
      { billedAt: null, billPrintedAt: null, paidAt: null, createdAt: { ...(startRange ? { $gte: startRange } : {}), ...(endRange ? { $lte: endRange } : {}) } }
    ];

    filter.status = 'paid';

    const orders = await Order.find(filter).toArray();
    let totalSettled = 0;
    let totalTax = 0;
    orders.forEach(o => {
      totalSettled += (o.settledAmount || o.total || 0);
      totalTax += (o.taxAmount || 0);
    });

    return { count: orders.length, totalSettled, totalTax, orders: orders.map(o => ({ order: o.orderNumber, bill: o.billNumber, total: o.total, pay: o.paymentMethod })) };
  }

  const yesterday = await querySales('2026-10-27', '2026-10-27');
  console.log(`\nYesterday (2026-10-27): ${yesterday.count} orders, Total: ₹${yesterday.totalSettled}, Tax: ₹${yesterday.totalTax}`);
  const yesterday1002 = yesterday.orders.filter(o => o.bill === 1002);
  const yesterday1019 = yesterday.orders.filter(o => o.bill === 1019);
  console.log('Bills matching 1002 yesterday:', yesterday1002);
  console.log('Bills matching 1019 yesterday:', yesterday1019);

  const today = await querySales('2026-10-28', '2026-10-28');
  console.log(`\nToday (2026-10-28): ${today.count} orders, Total: ₹${today.totalSettled}, Tax: ₹${today.totalTax}`);
  const today1002 = today.orders.filter(o => o.bill === 1002);
  const today1019 = today.orders.filter(o => o.bill === 1019);
  console.log('Bills matching 1002 today:', today1002);
  console.log('Bills matching 1019 today:', today1019);

  await conn.close();
}

testReports();
