require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function createUniqueBillIndex(uri, name) {
  const conn = await mongoose.createConnection(uri).asPromise();
  const Order = conn.collection('orders');

  try {
    await Order.dropIndex('fiscalQuarter_1_billNumber_1');
    console.log(`Dropped old index on ${name}`);
  } catch (_) {}

  await Order.createIndex(
    { fiscalQuarter: 1, billNumber: 1 },
    {
      unique: true,
      partialFilterExpression: { billNumber: { $type: 'number' } },
      name: 'fiscalQuarter_1_billNumber_1_unique'
    }
  );
  console.log(`✅ Successfully created UNIQUE partial index on ${name}!`);
  await conn.close();
}

async function main() {
  await createUniqueBillIndex('mongodb://127.0.0.1:27017/peyala_local', 'Local MongoDB');
  await createUniqueBillIndex(process.env.MONGODB_URI, 'Central Atlas');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to create index:', err);
  process.exit(1);
});
