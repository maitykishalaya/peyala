// ─────────────────────────────────────────────────────────────────
// Daily IST KOT Sequence Allocator
// Guarantees atomic, gapless sequential KOT numbers resetting to 1
// at 00:00:00 IST of each day so kitchen and cashier can track daily KOTs.
// ─────────────────────────────────────────────────────────────────

const KotSequence = require('../models/KotSequence');
const { getIstDayRange } = require('./date');

/**
 * Atomically generates the next sequential KOT number for the current IST day.
 * Starts from 1 at the beginning of each calendar day in Asia/Kolkata (+05:30).
 *
 * @param {Date} [date] - Reference timestamp (defaults to current time)
 * @returns {Promise<number>} - Sequential daily KOT number (1, 2, 3...)
 */
async function getNextDailyKotNumber(date = new Date()) {
  const { istDateStr } = getIstDayRange(date);
  const key = `KOT-${istDateStr}`;

  const seqDoc = await KotSequence.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return seqDoc.seq;
}

module.exports = {
  getNextDailyKotNumber,
};
