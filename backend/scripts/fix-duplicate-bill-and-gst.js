const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ORDER_ID = new mongoose.Types.ObjectId('6ae0bb1b7d9d20272e6e3990');
const NEW_BILL_NUMBER = 1019;
const DUPLICATE_GST = 27.5;

async function fixDatabase(uri, label) {
  if (!uri) return;
  console.log(`\n========================================`);
  console.log(`[Fix] Connecting to ${label}...`);
  console.log(`========================================`);

  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();

  // 1. Update Order #5830 to billNumber 1019
  const orderBefore = await conn.collection('orders').findOne({ _id: ORDER_ID });
  if (orderBefore) {
    console.log(`[Order] Found Order #${orderBefore.orderNumber} with current billNumber: ${orderBefore.billNumber}`);
    await conn.collection('orders').updateOne(
      { _id: ORDER_ID },
      { $set: { billNumber: NEW_BILL_NUMBER, updatedAt: new Date() } }
    );
    console.log(`[Order] ✅ Successfully updated Order #${orderBefore.orderNumber} to billNumber: ${NEW_BILL_NUMBER}`);
  } else {
    console.log(`[Order] Order ${ORDER_ID} not found in ${label}`);
  }

  // 2. Update BillSequence FY2627-Q3 to at least 1019
  const billSeq = await conn.collection('billsequences').findOne({ _id: 'FY2627-Q3' });
  const targetSeq = Math.max(billSeq?.seq || 0, NEW_BILL_NUMBER);
  await conn.collection('billsequences').updateOne(
    { _id: 'FY2627-Q3' },
    {
      $set: {
        seq: targetSeq,
        quarter: 'Q3',
        fiscalYear: '2026-27',
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  console.log(`[BillSequence] ✅ Set FY2627-Q3 sequence to: ${targetSeq}`);

  // 3. Fix BalanceSheet duplicate GST log & liability
  const bs = await conn.collection('balancesheets').findOne({});
  if (bs && bs.gstLog && bs.gstLog.length > 0) {
    console.log(`[BalanceSheet] Initial gstLiability: ${bs.gstLiability}, total logs: ${bs.gstLog.length}`);
    const matchingLogs = bs.gstLog.filter(l => String(l.salesEntryId) === String(ORDER_ID));
    console.log(`[BalanceSheet] Found ${matchingLogs.length} GST log(s) for Order ${ORDER_ID}`);

    if (matchingLogs.length > 1) {
      // Remove one duplicate and update the remaining one
      let keptOne = false;
      const deduplicatedLogs = [];
      for (const log of bs.gstLog) {
        if (String(log.salesEntryId) === String(ORDER_ID)) {
          if (!keptOne) {
            keptOne = true;
            deduplicatedLogs.push({
              ...log,
              note: log.note ? log.note.replace('Bill #1002', `Bill #${NEW_BILL_NUMBER}`) : `Auto: GST on ₹578 POS Dine-in Order (Bill #${NEW_BILL_NUMBER})`,
            });
          }
          // skip second/subsequent duplicate
        } else {
          deduplicatedLogs.push(log);
        }
      }

      const correctedLiability = Math.max(0, Math.round(((bs.gstLiability || 0) - DUPLICATE_GST) * 100) / 100);
      await conn.collection('balancesheets').updateOne(
        { _id: bs._id },
        {
          $set: {
            gstLiability: correctedLiability,
            gstLog: deduplicatedLogs,
            lastUpdated: new Date(),
            lastUpdatedBy: 'System Auto-Repair (Duplicate GST Deduplication)',
          },
        }
      );
      console.log(`[BalanceSheet] ✅ Corrected gstLiability: ${bs.gstLiability} -> ${correctedLiability} (-₹${DUPLICATE_GST})`);
      console.log(`[BalanceSheet] ✅ Deduplicated gstLog count: ${bs.gstLog.length} -> ${deduplicatedLogs.length}`);
    } else if (matchingLogs.length === 1) {
      // Update note to Bill #1019
      const updatedLogs = bs.gstLog.map(l => {
        if (String(l.salesEntryId) === String(ORDER_ID)) {
          return {
            ...l,
            note: l.note ? l.note.replace('Bill #1002', `Bill #${NEW_BILL_NUMBER}`) : `Auto: GST on ₹578 POS Dine-in Order (Bill #${NEW_BILL_NUMBER})`,
          };
        }
        return l;
      });
      await conn.collection('balancesheets').updateOne(
        { _id: bs._id },
        { $set: { gstLog: updatedLogs, lastUpdated: new Date() } }
      );
      console.log(`[BalanceSheet] ✅ Updated GST log note to Bill #${NEW_BILL_NUMBER}`);
    }
  }

  // 4. Update AuditLog descriptions mentioning settled bill #1002 for Order #5830
  const auditRes = await conn.collection('auditlogs').updateMany(
    {
      $or: [
        { 'metadata.orderId': ORDER_ID },
        { description: { $regex: 'settled bill #1002 \\(₹578' } }
      ]
    },
    {
      $set: {
        'metadata.billNumber': NEW_BILL_NUMBER,
      }
    }
  );
  console.log(`[AuditLog] Updated metadata on ${auditRes.modifiedCount} audit logs`);

  // Also replace text in description if matching
  const matchingAudits = await conn.collection('auditlogs').find({
    description: { $regex: 'settled bill #1002 \\(₹578' }
  }).toArray();
  for (const aud of matchingAudits) {
    const updatedDesc = aud.description.replace('settled bill #1002', `settled bill #${NEW_BILL_NUMBER}`);
    await conn.collection('auditlogs').updateOne(
      { _id: aud._id },
      { $set: { description: updatedDesc } }
    );
  }
  console.log(`[AuditLog] ✅ Cleaned description on ${matchingAudits.length} audit logs`);

  // 5. Update CustomerDuePayment billsAffected
  const duePayments = await conn.collection('customerduepayments').find({
    'billsAffected.orderId': ORDER_ID
  }).toArray();
  for (const dp of duePayments) {
    const updatedBills = (dp.billsAffected || []).map(b => {
      if (String(b.orderId) === String(ORDER_ID)) {
        return { ...b, billNumber: NEW_BILL_NUMBER };
      }
      return b;
    });
    await conn.collection('customerduepayments').updateOne(
      { _id: dp._id },
      { $set: { billsAffected: updatedBills } }
    );
  }
  console.log(`[CustomerDuePayment] ✅ Updated ${duePayments.length} customer due payment records`);

  await conn.close();
}

async function main() {
  try {
    await fixDatabase('mongodb://127.0.0.1:27017/peyala_local', 'Local DB (127.0.0.1)');
    await fixDatabase(process.env.MONGODB_URI, 'Central DB Atlas');
    console.log('\n🎉 ALL REPAIRS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Fatal error during repair:', err);
  }
  process.exit(0);
}

main();
