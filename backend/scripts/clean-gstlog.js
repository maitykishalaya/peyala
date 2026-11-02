require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

async function cleanGstLogForDb(uri, label) {
  console.log(`\n--- Cleaning BalanceSheet gstLog for ${label} ---`);
  const conn = await mongoose.createConnection(uri).asPromise();
  const bsCol = conn.collection('balancesheets');

  const bs = await bsCol.findOne({});
  if (!bs) {
    console.log('No BalanceSheet found!');
    await conn.close();
    return;
  }

  const salesIdStr = '6ae0bb1b7d9d20272e6e3990';
  const matching = (bs.gstLog || []).filter(l => String(l.salesEntryId) === salesIdStr);
  console.log(`Found ${matching.length} logs for order ${salesIdStr}`);

  if (matching.length > 1) {
    // Keep the one that references Bill #1019 or the first one, discard the second
    let kept = false;
    const filteredLogs = [];
    for (const log of bs.gstLog) {
      if (String(log.salesEntryId) === salesIdStr) {
        if (!kept) {
          filteredLogs.push({
            date: log.date,
            salesEntryId: log.salesEntryId,
            outletSales: 578,
            gstAdded: 27.5,
            note: 'Auto: GST on ₹578 POS Dine-in Order (Bill #1019 - Somprava Patra)'
          });
          kept = true;
        } else {
          console.log('Removing duplicate gstLog entry:', log);
        }
      } else {
        filteredLogs.push(log);
      }
    }

    await bsCol.updateOne(
      { _id: bs._id },
      { $set: { gstLog: filteredLogs, lastUpdated: new Date() } }
    );
    console.log(`Updated ${label} BalanceSheet: gstLog now has ${filteredLogs.length} entries (1 for order 5830).`);
  } else {
    console.log(`Already exactly ${matching.length} log for order 5830.`);
  }

  await conn.close();
}

async function main() {
  await cleanGstLogForDb('mongodb://127.0.0.1:27017/peyala_local', 'Local MongoDB');
  await cleanGstLogForDb(process.env.MONGODB_URI, 'Central Cloud MongoDB');
  process.exit(0);
}

main().catch(console.error);
