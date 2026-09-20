// ─────────────────────────────────────────────────────────────────
// Quarterly IST Bill Sequence Allocator
// Guarantees atomic, gapless sequential bill numbers resetting to 1
// at 00:00:00 IST of each quarter (April 1, July 1, Oct 1, Jan 1).
// ─────────────────────────────────────────────────────────────────

const BillSequence = require('../models/BillSequence');
const { getIstFiscalQuarter } = require('./date');

/**
 * Atomically generates the next sequential bill number for the current IST quarter.
 * Starts from 1 at the beginning of each quarter (April 1st, July 1st, Oct 1st, Jan 1st).
 *
 * @param {Date} [date] - Reference timestamp (defaults to current time)
 * @returns {Promise<{ billNumber: number, fiscalQuarter: string, quarter: string, fiscalYear: string }>}
 */
async function getNextBillNumber(date = new Date()) {
  const quarterInfo = getIstFiscalQuarter(date);

  const seqDoc = await BillSequence.findByIdAndUpdate(
    quarterInfo.quarterKey,
    {
      $inc: { seq: 1 },
      $setOnInsert: {
        quarter: quarterInfo.quarter,
        fiscalYear: quarterInfo.fiscalYear,
      },
    },
    { new: true, upsert: true }
  );

  return {
    billNumber: seqDoc.seq,
    fiscalQuarter: quarterInfo.quarterKey,
    quarter: quarterInfo.quarter,
    fiscalYear: quarterInfo.fiscalYear,
  };
}

/**
 * Ensures an Order has an official sequential bill number assigned.
 * - If order already has a billNumber, keeps it (no double numbering).
 * - If order does not have a billNumber, atomically assigns the next one in the IST quarter.
 *
 * @param {Object} order - Mongoose Order document
 * @param {Date} [date] - Reference timestamp
 * @returns {Promise<number>} - Assigned billNumber
 */
async function ensureOrderBillNumber(order, date = new Date()) {
  if (order.billNumber && Number(order.billNumber) > 0) {
    return order.billNumber;
  }

  const { billNumber, fiscalQuarter } = await getNextBillNumber(date);
  order.billNumber = billNumber;
  order.fiscalQuarter = fiscalQuarter;
  if (!order.billedAt) {
    order.billedAt = date;
  }

  return billNumber;
}

module.exports = {
  getNextBillNumber,
  ensureOrderBillNumber,
};
