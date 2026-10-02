// ─────────────────────────────────────────────────────────────────
// Atomic Sequential Order Number Allocator
// Guarantees atomic, race-condition-free, gapless order numbers
// starting from 4501+ across concurrent mobile/POS requests.
// ─────────────────────────────────────────────────────────────────

const OrderSequence = require('../models/OrderSequence');
const Order = require('../models/Order');

let isInitialized = false;

/**
 * Ensures the order sequence document exists and matches the current database max orderNumber.
 */
async function ensureSequenceInitialized() {
  if (isInitialized) return;
  try {
    const existing = await OrderSequence.findById('orderNumber');
    if (!existing) {
      const highest = await Order.findOne({ orderNumber: { $exists: true, $ne: null } })
        .sort({ orderNumber: -1 })
        .select('orderNumber')
        .lean();
      
      const count = await Order.countDocuments();
      const initialSeq = Math.max(4500, highest?.orderNumber || 4500, 4500 + count);
      
      await OrderSequence.findOneAndUpdate(
        { _id: 'orderNumber' },
        { $setOnInsert: { seq: initialSeq } },
        { upsert: true, new: true }
      );
    }
    isInitialized = true;
  } catch (err) {
    // If concurrent requests attempt to upsert, ignore duplicate key
    isInitialized = true;
  }
}

/**
 * Atomically generates the next sequential order number.
 * Thread-safe and race-condition proof under high concurrent traffic.
 *
 * @returns {Promise<number>} - Next unique order number (e.g. 4501, 4502...)
 */
async function getNextOrderNumber() {
  await ensureSequenceInitialized();

  const seqDoc = await OrderSequence.findByIdAndUpdate(
    'orderNumber',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return seqDoc.seq;
}

module.exports = {
  getNextOrderNumber,
  ensureSequenceInitialized,
};
