const mongoose = require('mongoose');

// Default verified milestone anchors as of November 1, 2026 00:00:00 IST
const DEFAULT_ANCHOR_DATE = new Date('2026-11-01T00:00:00.000Z');

const VERIFIED_ANCHORS = {
  '6a45128e43474cf64bb06ee6': { name: 'Cash Counter', anchorBalance: 7905.25 },
  '6a4512dd43474cf64bb06eef': { name: 'Current Account', anchorBalance: 272231.56 },
  '6a47a86f2d773394ac1d3664': { name: 'Kishalaya Maity', anchorBalance: 86892.00 },
};

/**
 * Deterministically recalculates live account balances from immutable transaction ledgers.
 * Guarantees strict account isolation:
 * - Cash Counter: Only Cash Sales, Cash Dues, Receipts, Cash Payments, and Transfers.
 * - Current Account: Only Digital (UPI/Card/Bank) Sales, Bank Receipts, Bank Payments, and Transfers.
 * - Kishalaya Maity: Only explicit personal/director payments and transfers (Zero sales bleeding).
 * - Other accounts: Strictly transactions matching that account ID.
 *
 * Fully backdate-proof: Any transaction with past or future date is factored into the calculation.
 */
async function recalculateAccountBalances(customConn = null) {
  const db = customConn ? (customConn.db || customConn) : mongoose.connection.db;
  if (!db) return [];

  const accountsCol = db.collection('accounts');
  const paymentsCol = db.collection('payments');
  const transfersCol = db.collection('transfers');
  const receiptsCol = db.collection('receipts');
  const duesCol = db.collection('customerduepayments');
  const salesCol = db.collection('salesentries');

  const activeAccounts = await accountsCol.find({ isActive: true }).toArray();
  const results = [];

  for (const acc of activeAccounts) {
    const accId = acc._id;
    const accIdStr = accId.toString();

    // 1. Establish anchor
    const defaultAnchor = VERIFIED_ANCHORS[accIdStr];
    let anchorBalance = defaultAnchor
      ? defaultAnchor.anchorBalance
      : (typeof acc.anchorBalance === 'number' ? acc.anchorBalance : Number(acc.openingBalance) || 0);

    let anchorDate = acc.anchorDate ? new Date(acc.anchorDate) : DEFAULT_ANCHOR_DATE;

    // Transactions since anchor milestone:
    // 1. Any transaction with date >= anchorDate
    // 2. OR any backdated transaction entered after anchor was established (createdAt >= anchorDate)
    const dateQuery = {
      $or: [
        { date: { $gte: anchorDate } },
        { createdAt: { $gte: anchorDate } }
      ]
    };

    // 2. Outflows: Payments from this account
    const paymentsOut = await paymentsCol.aggregate([
      {
        $match: {
          paidFrom: accId,
          isPending: { $ne: true },
          ...dateQuery
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const totalPaymentsOut = paymentsOut[0]?.total || 0;

    // 3. Outflows: Transfers from this account
    const transfersOut = await transfersCol.aggregate([
      {
        $match: {
          fromAccount: accId,
          ...dateQuery
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const totalTransfersOut = transfersOut[0]?.total || 0;

    // 4. Inflows: Transfers into this account
    const transfersIn = await transfersCol.aggregate([
      {
        $match: {
          toAccount: accId,
          ...dateQuery
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const totalTransfersIn = transfersIn[0]?.total || 0;

    // 5. Inflows: Receipts into this account
    const receiptsIn = await receiptsCol.aggregate([
      {
        $match: {
          receivedIn: accId,
          ...dateQuery
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const totalReceiptsIn = receiptsIn[0]?.total || 0;

    // 6. Inflows: Customer Due Payments into this account
    const duesIn = await duesCol.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [
                { receivedIn: accId },
                { receivedIn: accIdStr },
                { receivedInAccount: accId },
                { receivedInAccount: accIdStr }
              ]
            },
            {
              $or: [
                { date: { $gte: anchorDate } },
                { paymentDate: { $gte: anchorDate } },
                { createdAt: { $gte: anchorDate } }
              ]
            }
          ]
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const totalDuesIn = duesIn[0]?.total || 0;

    // 7. Inflows: POS Sales (Strictly isolated: Cash -> Cash Counter, Digital -> Current Account, Zero for others)
    let totalSalesIn = 0;
    const isCashCounter = /cash counter/i.test(acc.name) && acc.type === 'cash';
    const isCurrentAccount = /current account/i.test(acc.name) && ['bank', 'digital'].includes(acc.type);

    if (isCashCounter || isCurrentAccount) {
      const salesEntries = await salesCol.find(dateQuery).toArray();
      for (const s of salesEntries) {
        const pb = s.paymentBreakdown || {};
        if (isCashCounter) {
          totalSalesIn += (Number(pb.cash) || Number(s.cash) || 0);
        } else if (isCurrentAccount) {
          totalSalesIn += (Number(pb.upi) || Number(s.upi) || 0) +
                          (Number(pb.card) || Number(s.card) || 0) +
                          (Number(pb.bankTransfer) || Number(s.online) || 0) +
                          (Number(pb.other) || Number(s.other) || 0);
        }
      }
    }

    // 8. Deterministic balance formula
    const finalBalance = Math.round(
      (anchorBalance + totalTransfersIn + totalReceiptsIn + totalDuesIn + totalSalesIn - totalPaymentsOut - totalTransfersOut) * 100
    ) / 100;

    // 9. Update account document
    await accountsCol.updateOne(
      { _id: accId },
      {
        $set: {
          currentBalance: finalBalance,
          anchorDate,
          anchorBalance,
          updatedAt: new Date()
        }
      }
    );

    results.push({
      _id: accId,
      name: acc.name,
      type: acc.type,
      currentBalance: finalBalance,
      anchorBalance,
      anchorDate,
      inflows: Math.round((totalTransfersIn + totalReceiptsIn + totalDuesIn + totalSalesIn) * 100) / 100,
      outflows: Math.round((totalPaymentsOut + totalTransfersOut) * 100) / 100,
    });
  }

  return results;
}

module.exports = {
  recalculateAccountBalances,
  DEFAULT_ANCHOR_DATE,
  VERIFIED_ANCHORS,
};
