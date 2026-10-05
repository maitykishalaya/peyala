const Order = require('../models/Order');
const SalesEntry = require('../models/SalesEntry');
const { getIstDayRange } = require('./date');

/**
 * Reconciles and synchronizes the daily SalesEntry outlet sales & payment breakdown
 * strictly from settled POS orders for that calendar day in Indian Standard Time (IST).
 *
 * @param {string|Date} dateInput - Calendar date or Date instance
 * @param {string|import('mongoose').Types.ObjectId} [userId] - Optional user ID for creator attribution
 * @returns {Promise<SalesEntry|null>}
 */
async function reconcileDailySales(dateInput = new Date(), userId = null) {
  const { start, end, canonicalDate } = getIstDayRange(dateInput);

  // 1. Fetch all paid/settled orders whose payment falls on this IST calendar day
  const orders = await Order.find({
    status: 'paid',
    $or: [
      { paidAt: { $gte: start, $lte: end } },
      { paidAt: null, createdAt: { $gte: start, $lte: end } },
      { paidAt: { $exists: false }, createdAt: { $gte: start, $lte: end } },
    ],
  }).lean();

  let cash = 0;
  let upi = 0;
  let card = 0;
  let due = 0;
  let bankTransfer = 0;
  let outletSales = 0;

  for (const ord of orders) {
    const settled = ord.settledAmount !== null && ord.settledAmount !== undefined
      ? ord.settledAmount
      : (ord.total || 0);
    outletSales += settled;

    if (ord.paymentMethod === 'part' && ord.paymentBreakdown) {
      cash += (ord.paymentBreakdown.cash || 0);
      upi += (ord.paymentBreakdown.upi || 0);
      card += (ord.paymentBreakdown.card || 0);
      due += (ord.paymentBreakdown.due || 0);
      bankTransfer += (ord.paymentBreakdown.other || 0);
    } else {
      const pm = (ord.paymentMethod || 'other').toLowerCase();
      if (pm === 'cash') cash += settled;
      else if (pm === 'upi') upi += settled;
      else if (pm === 'card') card += settled;
      else if (pm === 'due') due += settled;
      else bankTransfer += settled;
    }
  }

  cash = Math.round(cash * 100) / 100;
  upi = Math.round(upi * 100) / 100;
  card = Math.round(card * 100) / 100;
  due = Math.round(due * 100) / 100;
  bankTransfer = Math.round(bankTransfer * 100) / 100;
  outletSales = Math.round(outletSales * 100) / 100;

  // 2. Find existing SalesEntry for this IST calendar day
  let salesEntry = await SalesEntry.findOne({ date: { $gte: start, $lte: end } });

  if (!salesEntry) {
    // If no orders and no sales entry exists, don't create an empty orphan row
    if (orders.length === 0) {
      return null;
    }
    salesEntry = new SalesEntry({
      date: canonicalDate,
      createdBy: userId,
    });
  }

  // 3. Atomically overwrite outlet sales & breakdown with real order figures
  salesEntry.paymentBreakdown = { cash, upi, card, due, bankTransfer };
  salesEntry.outletSales = outletSales;

  // Normalize canonical date so it sits at noon IST (06:30 UTC), preventing client off-by-one shifts
  if (!salesEntry.date || salesEntry.date < start || salesEntry.date > end) {
    salesEntry.date = canonicalDate;
  }

  // 4. Total revenue auto-recalculation
  const totalRevenue = outletSales
    + (salesEntry.zomato?.netSettlement || 0)
    + (salesEntry.fatafat?.netSettlement || 0)
    + (salesEntry.otherSales || 0);
  salesEntry.totalRevenue = Math.round(totalRevenue * 100) / 100;

  salesEntry.markModified('paymentBreakdown');
  await salesEntry.save();

  return salesEntry;
}

module.exports = {
  reconcileDailySales,
};
