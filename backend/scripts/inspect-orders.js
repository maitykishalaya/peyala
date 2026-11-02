require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function check(uri, name) {
  const conn = await mongoose.createConnection(uri).asPromise();
  const dupes = await conn.collection('orders').aggregate([
    { $match: { fiscalQuarter: 'FY2627-Q3', billNumber: { $ne: null } } },
    { $group: { _id: '$billNumber', count: { $sum: 1 }, orders: { $push: { orderNumber: '$orderNumber', total: '$total', billedAt: '$billedAt' } } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  console.log(name, 'duplicates:', dupes.map(d => ({ bill: d._id, count: d.count, orders: d.orders.map(o => o.orderNumber) })));
  await conn.close();
}

(async () => {
  await check('mongodb://127.0.0.1:27017/peyala_local', 'Local');
  await check(process.env.MONGODB_URI, 'Central');
})();
