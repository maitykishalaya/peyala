require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/peyala_local');
  const cashAccId = new mongoose.Types.ObjectId('6a45128e43474cf64bb06ee6');
  const currentAccId = new mongoose.Types.ObjectId('6a4512dd43474cf64bb06eef');

  for (const acc of [
    { name: 'Cash Counter', id: cashAccId },
    { name: 'Current Account', id: currentAccId }
  ]) {
    const accDoc = await mongoose.connection.collection('accounts').findOne({ _id: acc.id });
    const payments = await mongoose.connection.collection('payments').aggregate([
      { $match: { paidFrom: acc.id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const receipts = await mongoose.connection.collection('receipts').aggregate([
      { $match: { receivedIn: acc.id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const transfersOut = await mongoose.connection.collection('transfers').aggregate([
      { $match: { fromAccount: acc.id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const transfersIn = await mongoose.connection.collection('transfers').aggregate([
      { $match: { toAccount: acc.id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();

    const payTotal = payments[0]?.total || 0;
    const recTotal = receipts[0]?.total || 0;
    const tOutTotal = transfersOut[0]?.total || 0;
    const tInTotal = transfersIn[0]?.total || 0;

    console.log(`=== ${acc.name} ===`);
    console.log('Opening Balance:', accDoc?.openingBalance);
    console.log('Stored currentBalance:', accDoc?.currentBalance);
    console.log('Receipts In (+):', recTotal);
    console.log('Transfers In (+):', tInTotal);
    console.log('Payments Out (-):', payTotal);
    console.log('Transfers Out (-):', tOutTotal);
    const balanceExcludingSales = (accDoc?.openingBalance || 0) + recTotal + tInTotal - payTotal - tOutTotal;
    console.log('Balance without Sales:', balanceExcludingSales);
    console.log('Difference (Stored currentBalance - Balance without Sales):', (accDoc?.currentBalance || 0) - balanceExcludingSales);
  }
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
