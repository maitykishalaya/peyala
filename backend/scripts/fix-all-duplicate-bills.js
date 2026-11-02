require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

const CORRECTIONS = [
  { orderNumber: 5830, newBillNumber: 1020, note: 'Order #5830 (27th Oct due, Somprava Patra) -> Bill #1020' },
  { orderNumber: 5827, newBillNumber: 1021, note: 'Order #5827 (27th Oct cash) -> Bill #1021' },
  { orderNumber: 5452, newBillNumber: 1022, note: 'Order #5452 (20th Oct due, Somprava Patra) -> Bill #1022' },
  { orderNumber: 5405, newBillNumber: 1023, note: 'Order #5405 (20th Oct due, ratnadeep parya) -> Bill #1023' },
  { orderNumber: 5356, orderIdStr: '6ad8a3f274209f0507588431', newBillNumber: 1024, note: 'Order #5356 (21st Oct due, Soumyadeep Dey) -> Bill #1024' },
  { orderNumber: 5357, orderIdStr: '6ad9e78acfcccc3d3a254cf1', newBillNumber: 1025, note: 'Order #5357 (22nd Oct due, Soumyadeep Dey) -> Bill #1025' },
  { orderNumber: 5694, newBillNumber: 1026, note: 'Order #5694 (23rd Oct due, Sudhanil Sarkar) -> Bill #1026' },
  { orderNumber: 5783, newBillNumber: 1027, note: 'Order #5783 (25th Oct due, Sudhanil Sarkar) -> Bill #1027' },
];

async function fixDuplicatesOnDb(uri, dbLabel) {
  console.log(`\n======================================================`);
  console.log(`🛠️ FIXING DUPLICATE BILL NUMBERS ON: ${dbLabel}`);
  console.log(`======================================================`);

  const conn = await mongoose.createConnection(uri).asPromise();
  const Order = conn.collection('orders');
  const BillSeq = conn.collection('billsequences');
  const BalanceSheet = conn.collection('balancesheets');

  for (const c of CORRECTIONS) {
    const query = c.orderIdStr ? { _id: new mongoose.Types.ObjectId(c.orderIdStr) } : { orderNumber: c.orderNumber };
    const ord = await Order.findOne(query);
    if (ord) {
      const oldBill = ord.billNumber;
      await Order.updateOne(query, {
        $set: {
          billNumber: c.newBillNumber,
          updatedAt: new Date()
        }
      });
      console.log(`  ✅ ${c.note} (was #${oldBill})`);

      // If order 5830, also update note in BalanceSheet gstLog
      if (c.orderNumber === 5830) {
        const bs = await BalanceSheet.findOne({});
        if (bs && bs.gstLog) {
          const updatedLogs = bs.gstLog.map(l => {
            if (String(l.salesEntryId) === String(ord._id)) {
              return {
                ...l,
                note: `Auto: GST on ₹${ord.settledAmount || ord.total} POS Dine-in Order (Bill #${c.newBillNumber} - Somprava Patra)`
              };
            }
            return l;
          });
          await BalanceSheet.updateOne({ _id: bs._id }, { $set: { gstLog: updatedLogs, lastUpdated: new Date() } });
          console.log(`     Updated BalanceSheet gstLog note for Order #5830 to Bill #${c.newBillNumber}`);
        }
      }
    } else {
      console.warn(`  ⚠️ Order ${c.orderNumber || c.orderIdStr} not found!`);
    }
  }

  // Update BillSequence for FY2627-Q3
  await BillSeq.updateOne(
    { _id: 'FY2627-Q3' },
    { $set: { seq: 1027, updatedAt: new Date() } }
  );
  console.log(`  ✅ Set ${dbLabel} BillSequence FY2627-Q3 seq to 1027`);

  // Verify that ZERO duplicates remain in FY2627-Q3
  const dupesRemaining = await Order.aggregate([
    { $match: { fiscalQuarter: 'FY2627-Q3', billNumber: { $ne: null } } },
    { $group: { _id: '$billNumber', count: { $sum: 1 }, orders: { $push: '$orderNumber' } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (dupesRemaining.length === 0) {
    console.log(`  🎉 ZERO DUPLICATE BILL NUMBERS REMAINING on ${dbLabel}!`);

    // Build unique compound index on { fiscalQuarter: 1, billNumber: 1 }
    try {
      await Order.createIndex(
        { fiscalQuarter: 1, billNumber: 1 },
        { unique: true, sparse: true, background: true }
      );
      console.log(`  🔒 Successfully created UNIQUE index on { fiscalQuarter: 1, billNumber: 1 } on ${dbLabel}!`);
    } catch (idxErr) {
      console.warn(`  Notice on index creation:`, idxErr.message);
    }
  } else {
    console.error(`  ❌ Still found ${dupesRemaining.length} duplicates:`, dupesRemaining);
  }

  await conn.close();
}

async function main() {
  await fixDuplicatesOnDb('mongodb://127.0.0.1:27017/peyala_local', 'Local MongoDB (127.0.0.1:27017)');
  await fixDuplicatesOnDb(process.env.MONGODB_URI, 'Central Cloud MongoDB (Atlas)');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
