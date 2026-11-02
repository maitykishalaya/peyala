require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function run() {
  const central = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
  const orders = await central.collection('orders').find({
    billNumber: { $gte: 1015 }
  }).sort({ billNumber: 1 }).toArray();

  console.log('Orders with billNumber >= 1015 in Central Atlas:');
  orders.forEach(o => {
    console.log(`Order: #${o.orderNumber || 'none'} | Bill: #${o.billNumber} | Total: ₹${o.total} | BilledAt: ${o.billedAt} | Customer: ${o.customerName || 'None'}`);
  });
  await central.close();
}

run();
