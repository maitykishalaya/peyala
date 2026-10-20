const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function reconcileAllCollections() {
  const centralUri = process.env.CENTRAL_MONGODB_URI || process.env.MONGODB_URI;
  const localUri = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/peyala_local';

  console.log('[Reconcile] Connecting to Central and Local DBs...');
  const cConn = await mongoose.createConnection(centralUri).asPromise();
  const lConn = await mongoose.createConnection(localUri).asPromise();

  const cCollections = await cConn.db.listCollections().toArray();
  const skipCollections = ['system.indexes', 'system.sessions', 'syncoutboxes'];

  console.log(`[Reconcile] Found ${cCollections.length} collections in Central DB.`);

  for (const col of cCollections) {
    const colName = col.name;
    if (skipCollections.includes(colName) || colName.startsWith('system.')) continue;

    const centralCol = cConn.db.collection(colName);
    const localCol = lConn.db.collection(colName);

    const totalCentral = await centralCol.countDocuments();
    process.stdout.write(`[Reconcile] Syncing '${colName}' (${totalCentral} docs)... `);

    if (totalCentral === 0) {
      console.log('empty, skipping.');
      continue;
    }

    // Pull all documents as native BSON
    const docs = await centralCol.find({}).toArray();

    // Prepare bulk write operations in batches of 500
    const batchSize = 500;
    for (let i = 0; i < docs.length; i += batchSize) {
      const slice = docs.slice(i, i + batchSize);
      const ops = slice.map(doc => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true
        }
      }));
      await localCol.bulkWrite(ops, { ordered: false });
    }

    const localCount = await localCol.countDocuments();
    console.log(`Done! Local count: ${localCount}`);
  }

  console.log('\n[Reconcile] Verifying BSON date types in Local DB...');
  const dateCols = ['payments', 'purchaseentries', 'salesentries', 'orders', 'attendances'];
  for (const name of dateCols) {
    const stringDates = await lConn.db.collection(name).countDocuments({ date: { $type: 'string' } });
    const stringPaidAt = await lConn.db.collection(name).countDocuments({ paidAt: { $type: 'string' } });
    const stringCreatedAt = await lConn.db.collection(name).countDocuments({ createdAt: { $type: 'string' } });
    console.log(`Local ${name}: string dates = ${stringDates}, string paidAt = ${stringPaidAt}, string createdAt = ${stringCreatedAt}`);
  }

  // Check month expenses
  const todayIst = new Date();
  const monthStart = new Date('2026-09-30T18:30:00.000Z');
  const monthEnd = new Date('2026-10-31T18:29:59.999Z');

  const lOctPayments = await lConn.db.collection('payments').find({
    date: { $gte: monthStart, $lte: monthEnd }
  }).toArray();
  const cOctPayments = await cConn.db.collection('payments').find({
    date: { $gte: monthStart, $lte: monthEnd }
  }).toArray();

  console.log(`\n[Reconcile] October Payments Verification:`);
  console.log(`Local Oct Payments: ${lOctPayments.length} (Total: ₹${lOctPayments.reduce((s, p) => s + (p.amount || 0), 0).toFixed(2)})`);
  console.log(`Central Oct Payments: ${cOctPayments.length} (Total: ₹${cOctPayments.reduce((s, p) => s + (p.amount || 0), 0).toFixed(2)})`);

  await cConn.close();
  await lConn.close();
  console.log('\n[Reconcile] All collections successfully reconciled!');
}

reconcileAllCollections().catch(console.error);
