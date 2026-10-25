require('dotenv').config();
const mongoose = require('mongoose');

async function applyReconciliation() {
  const cashAccId = new mongoose.Types.ObjectId('6a45128e43474cf64bb06ee6');
  const currentAccId = new mongoose.Types.ObjectId('6a4512dd43474cf64bb06eef');

  const targetCashBalance = 3613.25; // 1985.25 + 1628 (today's cash sale)
  const targetCurrentBalance = 256625.11; // 251581.11 + 5044 (today's UPI sale)

  console.log('=== RECONCILING ATLAS (PRODUCTION) ===');
  await mongoose.connect(process.env.MONGODB_URI);
  
  const now = new Date();
  await mongoose.connection.collection('accounts').updateOne(
    { _id: cashAccId },
    { $set: { currentBalance: targetCashBalance, updatedAt: now } }
  );
  await mongoose.connection.collection('accounts').updateOne(
    { _id: currentAccId },
    { $set: { currentBalance: targetCurrentBalance, updatedAt: now } }
  );

  const updatedCashAtlas = await mongoose.connection.collection('accounts').findOne({ _id: cashAccId });
  const updatedCurrAtlas = await mongoose.connection.collection('accounts').findOne({ _id: currentAccId });
  console.log(`Atlas Cash Counter updated to: ₹${updatedCashAtlas.currentBalance}`);
  console.log(`Atlas Current Account updated to: ₹${updatedCurrAtlas.currentBalance}`);
  await mongoose.disconnect();

  console.log('\n=== RECONCILING LOCAL MONGODB ===');
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/peyala_local');
    await mongoose.connection.collection('accounts').updateOne(
      { _id: cashAccId },
      { $set: { currentBalance: targetCashBalance, updatedAt: now } }
    );
    await mongoose.connection.collection('accounts').updateOne(
      { _id: currentAccId },
      { $set: { currentBalance: targetCurrentBalance, updatedAt: now } }
    );

    const updatedCashLocal = await mongoose.connection.collection('accounts').findOne({ _id: cashAccId });
    const updatedCurrLocal = await mongoose.connection.collection('accounts').findOne({ _id: currentAccId });
    console.log(`Local Cash Counter updated to: ₹${updatedCashLocal.currentBalance}`);
    console.log(`Local Current Account updated to: ₹${updatedCurrLocal.currentBalance}`);
    await mongoose.disconnect();
  } catch (err) {
    console.warn('Local MongoDB notice:', err.message);
  }

  console.log('\nAccount balances successfully reconciled according to requirements!');
  process.exit(0);
}

applyReconciliation().catch(e => { console.error(e); process.exit(1); });
