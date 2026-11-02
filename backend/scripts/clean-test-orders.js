require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function cleanTestOrders(uri, name) {
  console.log(`\n--- Cleaning test orders from ${name} ---`);
  const conn = await mongoose.createConnection(uri).asPromise();
  const Order = conn.collection('orders');
  const BillSeq = conn.collection('billsequences');

  // Find test orders where orderNumber is null/undefined and billNumber >= 1020
  const testOrders = await Order.find({
    fiscalQuarter: 'FY2627-Q3',
    billNumber: { $gte: 1020 },
    $or: [{ orderNumber: null }, { orderNumber: { $exists: false } }]
  }).toArray();

  console.log(`Found ${testOrders.length} test orders to remove in ${name}:`, testOrders.map(o => ({ id: o._id, bill: o.billNumber })));

  if (testOrders.length > 0) {
    const ids = testOrders.map(o => o._id);
    await Order.deleteMany({ _id: { $in: ids } });
    console.log(`Deleted ${testOrders.length} test orders from ${name}.`);
  }

  // Check highest remaining bill
  const highest = await Order.find({
    fiscalQuarter: 'FY2627-Q3',
    billNumber: { $type: 'number', $gt: 0 }
  }).sort({ billNumber: -1 }).limit(1).toArray();
  const maxBill = highest[0]?.billNumber || 1019;
  console.log(`Highest remaining bill in ${name}: ${maxBill}`);

  await BillSeq.updateOne(
    { _id: 'FY2627-Q3' },
    { $set: { seq: maxBill, updatedAt: new Date() } }
  );
  console.log(`Set ${name} BillSequence FY2627-Q3 to ${maxBill}`);

  await conn.close();
}

async function main() {
  await cleanTestOrders('mongodb://127.0.0.1:27017/peyala_local', 'Local MongoDB');
  await cleanTestOrders(process.env.MONGODB_URI, 'Central Atlas');
  process.exit(0);
}

main().catch(console.error);
