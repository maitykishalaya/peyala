// ─────────────────────────────────────────────────────────────────
// GST Daily History Utility
// Peyala v8 — Production Restaurant Intelligence & Accounting
//
// Calculates day-wise GST Collection for the last N calendar days (default 30)
// strictly based on actual POS Order transactions (status: 'paid'),
// SalesEntry daily records, and BalanceSheet payments/adjustments.
//
// Compliant with Indian GST regulations (5% composite restaurant rate:
// 2.5% Central GST + 2.5% State GST).
// All calculations use integer-paise precision to eliminate floating-point drift.
// ─────────────────────────────────────────────────────────────────

const Order = require('../models/Order');
const SalesEntry = require('../models/SalesEntry');
const BalanceSheet = require('../models/BalanceSheet');
const { getIstDayRange } = require('./date');

/**
 * Returns audit-grade, day-wise GST Collection for the last N calendar days (default 30).
 * Consistent with actual Order tax data, SalesEntry records, and BalanceSheet payments.
 *
 * @param {number} [windowDays=30] - Number of past calendar days to aggregate (default 30)
 * @returns {Promise<{ summary: Object, days: Array<Object> }>}
 */
async function getGstDailyHistory(windowDays = 30) {
  const safeDays = Math.min(Math.max(Number(windowDays) || 30, 1), 90);
  const now = new Date();
  const todayRange = getIstDayRange(now);

  // Range begins (safeDays - 1) days ago at 00:00:00 IST and ends today at 23:59:59.999 IST
  const startWindowMs = todayRange.start.getTime() - (safeDays - 1) * 86400000;
  const startWindowDate = new Date(startWindowMs);
  const endWindowDate = todayRange.end;

  // 1. Single aggregate query over paid Orders in the window
  const orderAgg = await Order.aggregate([
    {
      $match: {
        status: 'paid',
        paidAt: { $gte: startWindowDate, $lte: endWindowDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$paidAt',
            timezone: '+05:30',
          },
        },
        orderCount: { $sum: 1 },
        taxableSales: {
          $sum: {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ['$subtotal', 0] },
                  { $ifNull: ['$discount', 0] },
                ],
              },
            ],
          },
        },
        totalGst: { $sum: { $ifNull: ['$taxAmount', 0] } },
        grossSales: {
          $sum: {
            $ifNull: ['$settledAmount', { $ifNull: ['$total', 0] }],
          },
        },
        minBill: { $min: { $ifNull: ['$billNumber', '$orderNumber'] } },
        maxBill: { $max: { $ifNull: ['$billNumber', '$orderNumber'] } },
      },
    },
  ]);

  const orderMap = new Map();
  orderAgg.forEach((row) => {
    orderMap.set(row._id, row);
  });

  // 2. Query SalesEntry for days where orders might have been entered as bulk daily entries
  const salesEntries = await SalesEntry.find({
    date: {
      $gte: new Date(startWindowMs - 86400000),
      $lte: new Date(endWindowDate.getTime() + 86400000),
    },
  }).lean();

  const salesEntryMap = new Map();
  salesEntries.forEach((entry) => {
    const dStr = getIstDayRange(entry.date).istDateStr;
    salesEntryMap.set(dStr, entry);
  });

  // 3. BalanceSheet gstLog for payments to government
  const bs = await BalanceSheet.getSingleton();
  const logMap = new Map();
  if (bs && bs.gstLog) {
    bs.gstLog.forEach((log) => {
      if (!log.date) return;
      const logDate = new Date(log.date);
      if (logDate >= startWindowDate && logDate <= endWindowDate) {
        const dStr = getIstDayRange(logDate).istDateStr;
        if (!logMap.has(dStr)) {
          logMap.set(dStr, { gstPaidPaise: 0, payments: [] });
        }
        const bucket = logMap.get(dStr);
        if (
          log.gstAdded < 0 &&
          (log.note?.toLowerCase().includes('payment') ||
            log.note?.toLowerCase().includes('paid'))
        ) {
          const pPaise = Math.round(Math.abs(log.gstAdded) * 100);
          bucket.gstPaidPaise += pPaise;
          bucket.payments.push({
            amount: pPaise / 100,
            note: log.note,
          });
        }
      }
    });
  }

  // 4. Build exactly safeDays continuous days descending from today
  const days = [];
  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalGstCollectedPaise = 0;
  let totalGrossPaise = 0;
  let totalOrders = 0;
  let totalGstPaidPaise = 0;

  for (let i = 0; i < safeDays; i++) {
    const curDate = new Date(todayRange.start.getTime() - i * 86400000);
    const { istDateStr, canonicalDate } = getIstDayRange(curDate);

    const orderData = orderMap.get(istDateStr);
    const salesData = salesEntryMap.get(istDateStr);
    const logData = logMap.get(istDateStr) || { gstPaidPaise: 0, payments: [] };

    let orderCount = 0;
    let taxablePaise = 0;
    let gstPaise = 0;
    let grossPaise = 0;
    let invoiceRange = null;

    if (orderData && orderData.orderCount > 0) {
      orderCount = orderData.orderCount;
      taxablePaise = Math.round(orderData.taxableSales * 100);
      gstPaise = Math.round(orderData.totalGst * 100);
      grossPaise = Math.round(orderData.grossSales * 100);
      if (orderData.minBill != null && orderData.maxBill != null) {
        invoiceRange =
          orderData.minBill === orderData.maxBill
            ? `#${orderData.minBill}`
            : `#${orderData.minBill} – #${orderData.maxBill}`;
      }
    } else if (salesData && salesData.outletSales > 0) {
      grossPaise = Math.round(salesData.outletSales * 100);
      taxablePaise = Math.round((grossPaise / 1.05));
      gstPaise = grossPaise - taxablePaise;
    }

    // Integer-paise split: CGST 50% + SGST 50%, guaranteed sum equals totalGst
    const cgstPaise = Math.round(gstPaise / 2);
    const sgstPaise = gstPaise - cgstPaise;
    const paidPaise = logData.gstPaidPaise;

    totalTaxablePaise += taxablePaise;
    totalCgstPaise += cgstPaise;
    totalSgstPaise += sgstPaise;
    totalGstCollectedPaise += gstPaise;
    totalGrossPaise += grossPaise;
    totalOrders += orderCount;
    totalGstPaidPaise += paidPaise;

    days.push({
      date: istDateStr,
      canonicalDate,
      orderCount,
      taxableSales: taxablePaise / 100,
      cgst: cgstPaise / 100,
      sgst: sgstPaise / 100,
      totalGst: gstPaise / 100,
      grossSales: grossPaise / 100,
      invoiceRange,
      gstPaid: paidPaise / 100,
      payments: logData.payments,
      isToday: i === 0,
      isYesterday: i === 1,
    });
  }

  return {
    summary: {
      windowDays: safeDays,
      totalOrders,
      taxableSales: totalTaxablePaise / 100,
      cgst: totalCgstPaise / 100,
      sgst: totalSgstPaise / 100,
      totalGstCollected: totalGstCollectedPaise / 100,
      totalGrossSales: totalGrossPaise / 100,
      totalGstPaid: totalGstPaidPaise / 100,
      netLiabilityAccumulated: (totalGstCollectedPaise - totalGstPaidPaise) / 100,
      startDate: days[days.length - 1]?.date,
      endDate: days[0]?.date,
    },
    days,
  };
}

module.exports = { getGstDailyHistory };
