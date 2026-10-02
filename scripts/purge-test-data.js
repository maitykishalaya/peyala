const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const connectDB = require('../backend/src/config/db');
const Order = require('../backend/src/models/Order');
const SalesEntry = require('../backend/src/models/SalesEntry');
const BalanceSheet = require('../backend/src/models/BalanceSheet');
const Account = require('../backend/src/models/Account');
const AuditLog = require('../backend/src/models/AuditLog');
const BillSequence = require('../backend/src/models/BillSequence');
const OrderSequence = require('../backend/src/models/OrderSequence');
const Table = require('../backend/src/models/Table');
const { getIstDayRange } = require('../backend/src/utils/date');

async function purgeTestData() {
  await connectDB();
  console.log('='.repeat(80));
  console.log('🧹 PURGING UNWANTED TEST DATA GENERATED ON 2ND OCTOBER 2026');
  console.log('='.repeat(80));

  const { start, end } = getIstDayRange(new Date('2026-10-02T12:00:00+05:30'));

  // 1. Delete all test orders on Oct 2 created by Peyala Admin
  const testOrders = await Order.find({
    createdAt: { $gte: start, $lte: end },
    createdBy: '6ab11ce7d841efe6382b10f3' // Peyala Admin
  });
  console.log(`[1/8] Found ${testOrders.length} test orders to remove.`);

  const testOrderIds = testOrders.map(o => o._id);
  if (testOrderIds.length > 0) {
    const deleteOrdersResult = await Order.deleteMany({ _id: { $in: testOrderIds } });
    console.log(`   ✅ Deleted ${deleteOrdersResult.deletedCount} test orders.`);
  }

  // 2. Delete all SalesEntry documents for Oct 2
  const deleteSalesResult = await SalesEntry.deleteMany({
    date: { $gte: start, $lte: end }
  });
  console.log(`[2/8] ✅ Deleted ${deleteSalesResult.deletedCount} test SalesEntry document(s) on 2nd October.`);

  // 3. Revert Account Balances (Cash Counter and Current Account)
  // Cash credited during test: ₹5,231
  // UPI credited during test: ₹4,034
  const cashAccount = await Account.findById('6a45128e43474cf64bb06ee6');
  if (cashAccount) {
    const oldBalance = cashAccount.currentBalance;
    cashAccount.currentBalance = Math.round((cashAccount.currentBalance - 5231) * 100) / 100;
    await cashAccount.save();
    console.log(`[3/8] ✅ Reverted Cash Counter (${cashAccount.name}): ₹${oldBalance} -> ₹${cashAccount.currentBalance} (-₹5,231)`);
  }

  const bankAccount = await Account.findById('6a4512dd43474cf64bb06eef');
  if (bankAccount) {
    const oldBalance = bankAccount.currentBalance;
    bankAccount.currentBalance = Math.round((bankAccount.currentBalance - 4034) * 100) / 100;
    await bankAccount.save();
    console.log(`   ✅ Reverted Current Account (${bankAccount.name}): ₹${oldBalance} -> ₹${bankAccount.currentBalance} (-₹4,034)`);
  }

  // 4. Revert BalanceSheet GST Liability & remove test gstLog entries
  const bs = await BalanceSheet.findOne();
  if (bs) {
    const oldGstLiability = bs.gstLiability;
    const initialLogLength = bs.gstLog.length;

    // Filter out gstLog entries created on Oct 2 during test
    bs.gstLog = bs.gstLog.filter(entry => {
      const isOct2 = entry.date && entry.date >= start && entry.date <= end;
      const isAutoTest = entry.note && entry.note.startsWith('Auto: GST on ₹');
      return !(isOct2 && isAutoTest);
    });

    const removedLogsCount = initialLogLength - bs.gstLog.length;
    bs.gstLiability = Math.max(0, Math.round((bs.gstLiability - 441) * 100) / 100);
    bs.lastUpdated = new Date();
    bs.lastUpdatedBy = 'Kishalaya Maity';
    await bs.save();

    console.log(`[4/8] ✅ Reverted BalanceSheet GST Liability: ₹${oldGstLiability} -> ₹${bs.gstLiability} (-₹441)`);
    console.log(`   ✅ Removed ${removedLogsCount} test entries from BalanceSheet gstLog.`);
  }

  // 5. Reset BillSequence for FY2627-Q3 back to 17 (last real bill on Oct 1)
  const billSeq = await BillSequence.findByIdAndUpdate(
    'FY2627-Q3',
    { $set: { seq: 17 } },
    { new: true }
  );
  console.log(`[5/8] ✅ Reset BillSequence for FY2627-Q3 back to: ${billSeq?.seq}`);

  // 6. Reset OrderSequence back to 4783 (last real order on Oct 1)
  const orderSeq = await OrderSequence.findByIdAndUpdate(
    'orderNumber',
    { $set: { seq: 4783 } },
    { new: true }
  );
  console.log(`[6/8] ✅ Reset OrderSequence back to: ${orderSeq?.seq}`);

  // 7. Clean up test AuditLog entries
  const deleteAuditResult = await AuditLog.deleteMany({
    createdAt: { $gte: start, $lte: end },
    userName: 'Peyala Admin'
  });
  console.log(`[7/8] ✅ Removed ${deleteAuditResult.deletedCount} test AuditLog entries by Peyala Admin on 2nd October.`);

  // 8. Reset any table status if pointing to test orders
  const allTables = await Table.find({});
  let resetTablesCount = 0;
  for (const t of allTables) {
    if (t.activeOrder && testOrderIds.some(id => id.toString() === t.activeOrder.toString())) {
      t.status = 'available';
      t.activeOrder = null;
      await t.save();
      resetTablesCount++;
    } else if (t.status === 'occupied' && !t.activeOrder) {
      t.status = 'available';
      await t.save();
      resetTablesCount++;
    }
  }
  console.log(`[8/8] ✅ Reset ${resetTablesCount} table(s) to clean available state.`);

  console.log('='.repeat(80));
  console.log('✨ ALL UNWANTED TEST DATA HAS BEEN COMPLETELY AND SAFELY REMOVED!');
  console.log('='.repeat(80));

  process.exit(0);
}

purgeTestData().catch(err => {
  console.error('Error during purge:', err);
  process.exit(1);
});
