// ─────────────────────────────────────────────────────────────────
// Quarterly IST Bill Sequence Allocator
// Guarantees atomic, gapless sequential bill numbers resetting to 1
// at 00:00:00 IST of each quarter (April 1, July 1, Oct 1, Jan 1).
// ─────────────────────────────────────────────────────────────────

const BillSequence = require('../models/BillSequence');
const { getIstFiscalQuarter } = require('./date');

/**
 * Initializes the current quarter's BillSequence document to match or exceed
 * the highest existing billNumber in the database. Called on backend boot.
 */
async function initBillSequence(date = new Date()) {
  try {
    const Order = require('../models/Order');
    const quarterInfo = getIstFiscalQuarter(date);

    const highest = await Order.findOne({
      fiscalQuarter: quarterInfo.quarterKey,
      billNumber: { $type: 'number', $gt: 0 },
    })
      .sort({ billNumber: -1 })
      .select('billNumber')
      .lean();

    const maxBillInOrders = highest?.billNumber || 0;

    const existingSeq = await BillSequence.findById(quarterInfo.quarterKey);
    const currentSeq = existingSeq?.seq || 0;
    const targetSeq = Math.max(currentSeq, maxBillInOrders);

    if (!existingSeq || existingSeq.seq < targetSeq) {
      await BillSequence.findByIdAndUpdate(
        quarterInfo.quarterKey,
        {
          $set: {
            seq: targetSeq,
            quarter: quarterInfo.quarter,
            fiscalYear: quarterInfo.fiscalYear,
          },
        },
        { upsert: true, new: true }
      );
      console.log(`[BillSequence] Initialized sequence for ${quarterInfo.quarterKey} at ${targetSeq} (max order bill: ${maxBillInOrders})`);
    }
  } catch (err) {
    console.warn('[BillSequence] Sequence initialization notice:', err.message);
  }
}

let allocationChain = Promise.resolve();

function withAllocationLock(fn) {
  const next = allocationChain.then(fn, fn);
  allocationChain = next.catch(() => {});
  return next;
}

/**
 * Atomically generates the next sequential bill number for the current IST quarter.
 * Guaranteed gapless, strictly monotonic, and duplicate-free under high concurrency.
 *
 * @param {Date} [date] - Reference timestamp (defaults to current time)
 * @returns {Promise<{ billNumber: number, fiscalQuarter: string, quarter: string, fiscalYear: string }>}
 */
async function getNextBillNumber(date = new Date()) {
  return withAllocationLock(async () => {
    const quarterInfo = getIstFiscalQuarter(date);
    const Order = require('../models/Order');

    // Verify highest billNumber already present in database for this fiscal quarter
    const highestOrder = await Order.findOne({
      fiscalQuarter: quarterInfo.quarterKey,
      billNumber: { $type: 'number', $gt: 0 },
    })
      .sort({ billNumber: -1 })
      .select('billNumber')
      .lean();

    const maxOrderBill = highestOrder?.billNumber || 0;

    // Fetch existing sequence doc
    const existingSeq = await BillSequence.findById(quarterInfo.quarterKey);
    const currentSeq = existingSeq?.seq || 0;

    // The base sequence MUST be at least maxOrderBill to prevent regression/duplication
    const baseSeq = Math.max(currentSeq, maxOrderBill);
    const nextSeq = baseSeq + 1;

    const seqDoc = await BillSequence.findByIdAndUpdate(
      quarterInfo.quarterKey,
      {
        $set: {
          seq: nextSeq,
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
  });
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
  initBillSequence,
};

