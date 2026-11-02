require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function run() {
  const local = await mongoose.createConnection('mongodb://127.0.0.1:27017/peyala_local').asPromise();
  const dupes = await local.collection('orders').aggregate([
    { $match: { fiscalQuarter: 'FY2627-Q3', billNumber: { $ne: null } } },
    { $group: { _id: '$billNumber', count: { $sum: 1 }, orders: { $push: '$$ROOT' } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();

  console.log('Detailed Duplicates in FY2627-Q3 (count:', dupes.length, '):');
  dupes.forEach(d => {
    console.log(`\n========================================`);
    console.log(`BILL #${d._id} (Count: ${d.count})`);
    console.log(`========================================`);
    d.orders.forEach(o => {
      console.log(`  Order #${o.orderNumber} | ID: ${o._id}`);
      console.log(`    Total: ₹${o.total} | Status: ${o.status} | PayMethod: ${o.paymentMethod}`);
      console.log(`    BilledAt: ${o.billedAt} | CreatedAt: ${o.createdAt}`);
      console.log(`    Customer: ${o.customerName || 'None'}`);
    });
  });

  await local.close();
}

run();
