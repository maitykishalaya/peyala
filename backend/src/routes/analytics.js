// ─────────────────────────────────────────────────────────────────
// Sales Analytics & Reporting Engine Routes
// Peyala v8 — Production Restaurant Intelligence & Decision Engine
// Accessible at /api/analytics
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const Order = require('../models/Order');
const SalesEntry = require('../models/SalesEntry');
const MenuItem = require('../models/MenuItem');
const MenuCategory = require('../models/MenuCategory');
const SalesAnalyticsConfig = require('../models/SalesAnalyticsConfig');
const { auth, managerOrAdmin } = require('../middleware/auth');
const { getIstDayRange, getIstFiscalQuarter } = require('../utils/date');
const { evaluateSalesSuggestions } = require('../utils/salesSuggestionEngine');
const { matchesSearch } = require('../utils/search');

router.use(auth);

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Helper to compute IST date range and comparison range
 */
function resolveDateRanges(period = 'this_month', startDate, endDate) {
  const now = new Date();
  const todayRange = getIstDayRange(now);
  let currentStart = todayRange.start;
  let currentEnd = todayRange.end;

  if (startDate && endDate) {
    currentStart = getIstDayRange(startDate).start;
    currentEnd = getIstDayRange(endDate).end;
  } else if (period === 'today') {
    currentStart = todayRange.start;
    currentEnd = todayRange.end;
  } else if (period === 'yesterday') {
    const yesterday = new Date(todayRange.start.getTime() - 86400000);
    const yRange = getIstDayRange(yesterday);
    currentStart = yRange.start;
    currentEnd = yRange.end;
  } else if (period === '7d') {
    const startMs = todayRange.end.getTime() - 7 * 86400000 + 1;
    currentStart = new Date(startMs);
    currentEnd = todayRange.end;
  } else if (period === '30d') {
    const startMs = todayRange.end.getTime() - 30 * 86400000 + 1;
    currentStart = new Date(startMs);
    currentEnd = todayRange.end;
  } else if (period === 'this_week') {
    const day = todayRange.start.getDay(); // 0 is Sunday
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(todayRange.start);
    monday.setDate(todayRange.start.getDate() + diff);
    currentStart = getIstDayRange(monday).start;
    currentEnd = todayRange.end;
  } else if (period === 'this_month') {
    const [year, month] = todayRange.istDateStr.split('-').map(Number);
    currentStart = getIstDayRange(`${year}-${String(month).padStart(2, '0')}-01`).start;
    currentEnd = todayRange.end;
  } else if (period === 'prev_month') {
    const [year, month] = todayRange.istDateStr.split('-').map(Number);
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
    currentStart = getIstDayRange(`${prevYear}-${String(prevMonth).padStart(2, '0')}-01`).start;
    currentEnd = getIstDayRange(`${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(daysInPrevMonth).padStart(2, '0')}`).end;
  }

  // Calculate previous comparison range of equal duration
  const durationMs = Math.max(86400000, currentEnd.getTime() - currentStart.getTime());
  let previousStart;
  let previousEnd;

  if (period === 'this_month') {
    const [year, month] = todayRange.istDateStr.split('-').map(Number);
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
    previousStart = getIstDayRange(`${prevYear}-${String(prevMonth).padStart(2, '0')}-01`).start;
    previousEnd = getIstDayRange(`${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(daysInPrevMonth).padStart(2, '0')}`).end;
  } else if (period === 'today') {
    const yesterday = new Date(todayRange.start.getTime() - 86400000);
    const yRange = getIstDayRange(yesterday);
    previousStart = yRange.start;
    previousEnd = yRange.end;
  } else {
    previousEnd = new Date(currentStart.getTime() - 1);
    previousStart = new Date(previousEnd.getTime() - durationMs + 1);
  }

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    currentDays: Math.max(1, Math.round(durationMs / 86400000)),
  };
}

// ─────────────────────────────────────────────────────────────────
// 1. GET /api/analytics/overview
// ─────────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const { period = 'this_month', startDate, endDate } = req.query;
    const { currentStart, currentEnd, previousStart, previousEnd, currentDays } = resolveDateRanges(period, startDate, endDate);

    const now = new Date();
    const todayRange = getIstDayRange(now);

    // Run parallel aggregation queries
    const [
      config,
      currentSalesEntries,
      prevSalesEntries,
      currentPaidOrders,
      prevPaidOrders,
      todayPaidOrders,
      todaySalesEntry,
      historicalSalesForTargets,
      menuCategories,
    ] = await Promise.all([
      SalesAnalyticsConfig.getSingleton(),
      SalesEntry.find({ date: { $gte: currentStart, $lte: currentEnd } }).sort({ date: 1 }).lean(),
      SalesEntry.find({ date: { $gte: previousStart, $lte: previousEnd } }).sort({ date: 1 }).lean(),
      Order.find({
        status: 'paid',
        paidAt: { $gte: currentStart, $lte: currentEnd },
      }).lean(),
      Order.find({
        status: 'paid',
        paidAt: { $gte: previousStart, $lte: previousEnd },
      }).lean(),
      Order.find({
        status: 'paid',
        paidAt: { $gte: todayRange.start, $lte: todayRange.end },
      }).lean(),
      SalesEntry.findOne({ date: { $gte: todayRange.start, $lte: todayRange.end } }).lean(),
      SalesEntry.find({ date: { $lt: todayRange.start } }).sort({ date: -1 }).limit(90).lean(),
      MenuCategory.find({ isActive: true }).lean(),
    ]);

    // ── Current Period Financial Aggregations ─────────────────────
    let totalTaxableSales = 0;
    let totalGst = 0;
    let totalDiscount = 0;
    let totalOrdersCount = currentPaidOrders.length;

    // Daily buckets map for timeline & highest/lowest day
    const dailyMap = new Map();

    // 1. Process SalesEntry (covers all channels: outlet, Zomato, Fatafat, other)
    currentSalesEntries.forEach((se) => {
      const dateStr = getIstDayRange(se.date).istDateStr;
      const outlet = Number(se.outletSales) || 0;
      const zomatoGross = Number(se.zomato?.grossSales) || 0;
      const zomatoGst = Number(se.zomato?.gst) || 0;
      const zomatoNet = Number(se.zomato?.netSettlement) || 0;
      const fatafatGross = Number(se.fatafat?.grossSales) || 0;
      const fatafatGst = Number(se.fatafat?.gst) || 0;
      const fatafatNet = Number(se.fatafat?.netSettlement) || 0;
      const other = Number(se.otherSales) || 0;

      const dayGross = outlet + zomatoGross + fatafatGross + other;
      const dayPlatformGst = zomatoGst + fatafatGst;

      dailyMap.set(dateStr, {
        date: dateStr,
        grossSales: dayGross,
        outletSales: outlet,
        zomatoGross,
        zomatoNet,
        fatafatGross,
        fatafatNet,
        otherSales: other,
        orders: 0,
        discounts: 0,
        gst: dayPlatformGst,
        sales: 0,
        netSales: 0,
        aov: 0,
      });

      totalGst += dayPlatformGst;
    });

    // 2. Process paid orders in period (provides granular subtotal, taxAmount, discounts)
    currentPaidOrders.forEach((o) => {
      const paidDate = o.paidAt || o.createdAt;
      const dateStr = getIstDayRange(paidDate).istDateStr;

      const subtotal = Number(o.subtotal) || 0;
      const tax = Number(o.taxAmount) || 0;
      const disc = Number(o.discount) || 0;
      const orderGross = Number(o.settledAmount ?? o.total) || (subtotal - disc + tax);

      totalTaxableSales += subtotal;
      totalGst += tax;
      totalDiscount += disc;

      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, {
          date: dateStr,
          grossSales: orderGross,
          outletSales: orderGross,
          zomatoGross: 0,
          zomatoNet: 0,
          fatafatGross: 0,
          fatafatNet: 0,
          otherSales: 0,
          orders: 1,
          discounts: disc,
          gst: tax,
          sales: 0,
          netSales: 0,
          aov: 0,
        });
      } else {
        const dayRecord = dailyMap.get(dateStr);
        dayRecord.orders += 1;
        dayRecord.discounts += disc;
        dayRecord.gst += tax;
      }
    });

    // 3. For any historical SalesEntry days without Order documents,
    // estimate outlet GST at standard 5% restaurant GST (5/105)
    dailyMap.forEach((dayRecord) => {
      if (dayRecord.orders === 0 && dayRecord.outletSales > 0) {
        const estOutletGst = Math.round((dayRecord.outletSales * 5 / 105) * 100) / 100;
        dayRecord.gst += estOutletGst;
        totalGst += estOutletGst;
      }
      // CRITICAL: Net Sales = Gross Sales - GST Collected
      dayRecord.netSales = Math.max(0, Math.round((dayRecord.grossSales - dayRecord.gst) * 100) / 100);
      dayRecord.sales = dayRecord.netSales;
      dayRecord.aov = dayRecord.orders > 0 ? Math.round(dayRecord.netSales / dayRecord.orders) : dayRecord.netSales;
    });

    // CRITICAL: Total Net Sales = Total Gross Sales - Total GST Collected
    const totalGrossSales = Math.round(Array.from(dailyMap.values()).reduce((sum, d) => sum + d.grossSales, 0) * 100) / 100;
    totalGst = Math.round(totalGst * 100) / 100;
    const totalNetSales = Math.max(0, Math.round((totalGrossSales - totalGst) * 100) / 100);

    // ── Previous Period Financial Aggregations ────────────────────
    let prevOrdersCount = prevPaidOrders.length;
    let prevDiscount = 0;
    let prevGst = 0;
    const prevDailyMap = new Map();

    prevSalesEntries.forEach((se) => {
      const dateStr = getIstDayRange(se.date).istDateStr;
      const outlet = Number(se.outletSales) || 0;
      const zomatoGross = Number(se.zomato?.grossSales) || 0;
      const zomatoGst = Number(se.zomato?.gst) || 0;
      const fatafatGross = Number(se.fatafat?.grossSales) || 0;
      const fatafatGst = Number(se.fatafat?.gst) || 0;
      const other = Number(se.otherSales) || 0;

      const dayGross = outlet + zomatoGross + fatafatGross + other;
      const dayPlatformGst = zomatoGst + fatafatGst;

      prevDailyMap.set(dateStr, {
        grossSales: dayGross,
        outletSales: outlet,
        gst: dayPlatformGst,
        orders: 0,
      });
      prevGst += dayPlatformGst;
    });

    prevPaidOrders.forEach((o) => {
      const paidDate = o.paidAt || o.createdAt;
      const dateStr = getIstDayRange(paidDate).istDateStr;
      const subtotal = Number(o.subtotal) || 0;
      const tax = Number(o.taxAmount) || 0;
      const disc = Number(o.discount) || 0;
      const orderGross = Number(o.settledAmount ?? o.total) || (subtotal - disc + tax);

      prevGst += tax;
      prevDiscount += disc;

      if (!prevDailyMap.has(dateStr)) {
        prevDailyMap.set(dateStr, {
          grossSales: orderGross,
          outletSales: orderGross,
          gst: tax,
          orders: 1,
        });
      } else {
        const dayRecord = prevDailyMap.get(dateStr);
        dayRecord.orders += 1;
        dayRecord.gst += tax;
      }
    });

    prevDailyMap.forEach((dayRecord) => {
      if (dayRecord.orders === 0 && dayRecord.outletSales > 0) {
        const estOutletGst = Math.round((dayRecord.outletSales * 5 / 105) * 100) / 100;
        dayRecord.gst += estOutletGst;
        prevGst += estOutletGst;
      }
      dayRecord.netSales = Math.max(0, Math.round((dayRecord.grossSales - dayRecord.gst) * 100) / 100);
    });

    const prevGrossSales = Math.round(Array.from(prevDailyMap.values()).reduce((sum, d) => sum + d.grossSales, 0) * 100) / 100;
    prevGst = Math.round(prevGst * 100) / 100;
    const prevNetSales = Math.max(0, Math.round((prevGrossSales - prevGst) * 100) / 100);

    // AOV (Average Order Value based on Net Sales)
    const aov = totalOrdersCount > 0 ? totalNetSales / totalOrdersCount : (dailyMap.size > 0 ? totalNetSales / dailyMap.size : 0);
    const prevAov = prevOrdersCount > 0 ? prevNetSales / prevOrdersCount : 0;

    const aovGrowthPct = prevAov > 0 ? ((aov - prevAov) / prevAov) * 100 : 0;
    const salesGrowthPct = prevNetSales > 0 ? ((totalNetSales - prevNetSales) / prevNetSales) * 100 : 0;
    const ordersGrowthPct = prevOrdersCount > 0 ? ((totalOrdersCount - prevOrdersCount) / prevOrdersCount) * 100 : 0;

    // Daily Sales Timeline Array
    const salesTrend = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Highest and Lowest Sales Day
    let highestSalesDay = null;
    let lowestSalesDay = null;
    if (salesTrend.length > 0) {
      const sortedBySales = [...salesTrend].sort((a, b) => b.sales - a.sales);
      highestSalesDay = sortedBySales[0];
      lowestSalesDay = sortedBySales[sortedBySales.length - 1];
    }

    const averageDailySales = salesTrend.length > 0 ? totalNetSales / salesTrend.length : 0;

    // CGST and SGST exact 50-50 split
    const totalCgst = Math.round((totalGst / 2) * 100) / 100;
    const totalSgst = Math.round((totalGst / 2) * 100) / 100;

    // ── Day of Week (DOW) Analysis ─────────────────────────────────
    // Aggregate by day of week across all entries in the date range
    const dowBuckets = Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i, // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      dayName: DOW_NAMES[i],
      totalSales: 0,
      daysCount: 0,
      orders: 0,
      avgSales: 0,
      aov: 0,
    }));

    dailyMap.forEach((dayRecord) => {
      const [y, m, d] = dayRecord.date.split('-').map(Number);
      const dayIdx = new Date(y, m - 1, d).getDay();
      dowBuckets[dayIdx].totalSales += dayRecord.netSales;
      dowBuckets[dayIdx].daysCount += 1;
      dowBuckets[dayIdx].orders += dayRecord.orders;
    });

    dowBuckets.forEach((b) => {
      b.totalSales = Math.round(b.totalSales);
      b.avgSales = b.daysCount > 0 ? Math.round(b.totalSales / b.daysCount) : 0;
      b.aov = b.orders > 0 ? Math.round(b.totalSales / b.orders) : b.avgSales;
    });

    // Arrange DOW array starting from Monday (1) through Sunday (0)
    const sortedDow = [
      dowBuckets[1], // Mon
      dowBuckets[2], // Tue
      dowBuckets[3], // Wed
      dowBuckets[4], // Thu
      dowBuckets[5], // Fri
      dowBuckets[6], // Sat
      dowBuckets[0], // Sun
    ];

    // ── Hourly Sales Analysis (00:00 to 23:00 IST) ────────────────
    const hourlyBuckets = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i % 12 || 12} ${i >= 12 ? 'PM' : 'AM'}`,
      orders: 0,
      sales: 0,
      aov: 0,
    }));

    currentPaidOrders.forEach((o) => {
      const d = new Date(o.paidAt || o.createdAt);
      // Determine hour in Asia/Kolkata (+05:30)
      const istHour = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;
      const orderGross = Number(o.settledAmount ?? o.total) || 0;
      const orderTax = Number(o.taxAmount) || 0;
      const orderNet = Math.max(0, orderGross - orderTax);

      hourlyBuckets[istHour].orders += 1;
      hourlyBuckets[istHour].sales += orderNet;
    });

    hourlyBuckets.forEach((h) => {
      h.sales = Math.round(h.sales);
      h.aov = h.orders > 0 ? Math.round(h.sales / h.orders) : 0;
    });

    // Identify Peak, Slow, and Opportunity Hours
    const activeHours = hourlyBuckets.filter((h) => h.orders > 0);
    let peakHour = null;
    let slowHour = null;
    if (activeHours.length > 0) {
      const sortedHours = [...activeHours].sort((a, b) => b.sales - a.sales);
      peakHour = sortedHours[0];
      slowHour = sortedHours[sortedHours.length - 1];
    }

    // ── Channel Breakdown ──────────────────────────────────────────
    let outletGross = 0;
    let outletCash = 0;
    let outletUpi = 0;
    let outletCard = 0;
    let outletDue = 0;

    let zomatoGross = 0;
    let zomatoNet = 0;
    let zomatoRestDisc = 0;
    let zomatoPlatDisc = 0;
    let zomatoComm = 0;
    let zomatoGst = 0;

    let fatafatGross = 0;
    let fatafatNet = 0;
    let fatafatRestDisc = 0;
    let fatafatPlatDisc = 0;
    let fatafatComm = 0;
    let fatafatGst = 0;

    let otherSalesTotal = 0;

    currentSalesEntries.forEach((se) => {
      outletGross += Number(se.outletSales) || 0;
      outletCash += Number(se.paymentBreakdown?.cash) || 0;
      outletUpi += Number(se.paymentBreakdown?.upi) || 0;
      outletCard += Number(se.paymentBreakdown?.card) || 0;
      outletDue += Number(se.paymentBreakdown?.due) || 0;

      zomatoGross += Number(se.zomato?.grossSales) || 0;
      zomatoNet += Number(se.zomato?.netSettlement) || 0;
      zomatoRestDisc += Number(se.zomato?.restaurantDiscount) || 0;
      zomatoPlatDisc += Number(se.zomato?.platformDiscount) || 0;
      zomatoComm += Number(se.zomato?.commission) || 0;
      zomatoGst += Number(se.zomato?.gst) || 0;

      fatafatGross += Number(se.fatafat?.grossSales) || 0;
      fatafatNet += Number(se.fatafat?.netSettlement) || 0;
      fatafatRestDisc += Number(se.fatafat?.restaurantDiscount) || 0;
      fatafatPlatDisc += Number(se.fatafat?.platformDiscount) || 0;
      fatafatComm += Number(se.fatafat?.commission) || 0;
      fatafatGst += Number(se.fatafat?.gst) || 0;

      otherSalesTotal += Number(se.otherSales) || 0;
    });

    // If order items were recorded for days without sales entries, add to outlet gross
    currentPaidOrders.forEach((o) => {
      const paidDate = o.paidAt || o.createdAt;
      const dateStr = getIstDayRange(paidDate).istDateStr;
      if (!currentSalesEntries.some((se) => getIstDayRange(se.date).istDateStr === dateStr)) {
        outletGross += Number(o.settledAmount ?? o.total) || 0;
      }
    });

    const outletGst = Array.from(dailyMap.values()).reduce((sum, d) => sum + (d.orders > 0 ? (d.gst - (d.zomatoGross > 0 ? (d.zomatoGross * 0.05 / 1.05) : 0)) : (d.outletSales > 0 ? Math.round(d.outletSales * 5 / 105 * 100) / 100 : 0)), 0);
    const outletNet = Math.max(0, Math.round((outletGross - Math.max(0, outletGst)) * 100) / 100);
    const zomatoNetSales = Math.max(0, Math.round((zomatoGross - zomatoGst) * 100) / 100);
    const fatafatNetSales = Math.max(0, Math.round((fatafatGross - fatafatGst) * 100) / 100);
    const otherGst = Math.round(otherSalesTotal * (5 / 105) * 100) / 100;
    const otherNetSales = Math.max(0, Math.round((otherSalesTotal - otherGst) * 100) / 100);

    const channelStats = [
      {
        channel: 'Outlet / Dine-In',
        grossSales: Math.round(outletGross),
        netSales: outletNet,
        orders: totalOrdersCount,
        aov: totalOrdersCount > 0 ? Math.round(outletNet / totalOrdersCount) : outletNet,
        discounts: totalDiscount,
        commission: 0,
        netSettlement: outletGross,
        percentageOfTotal: totalNetSales > 0 ? Math.round((outletNet / totalNetSales) * 100) : 0,
        breakdown: { cash: outletCash, upi: outletUpi, card: outletCard, due: outletDue },
      },
      {
        channel: 'Zomato',
        grossSales: Math.round(zomatoGross),
        netSales: zomatoNetSales,
        orders: 0, // platform orders count not tracked in raw sales entry
        aov: 0,
        discounts: zomatoRestDisc + zomatoPlatDisc,
        commission: zomatoComm,
        netSettlement: zomatoNet,
        percentageOfTotal: totalNetSales > 0 ? Math.round((zomatoNetSales / totalNetSales) * 100) : 0,
      },
      {
        channel: 'Fatafat',
        grossSales: Math.round(fatafatGross),
        netSales: fatafatNetSales,
        orders: 0,
        aov: 0,
        discounts: fatafatRestDisc + fatafatPlatDisc,
        commission: fatafatComm,
        netSettlement: fatafatNet,
        percentageOfTotal: totalNetSales > 0 ? Math.round((fatafatNetSales / totalNetSales) * 100) : 0,
      },
      {
        channel: 'Other Sales',
        grossSales: Math.round(otherSalesTotal),
        netSales: otherNetSales,
        orders: 0,
        aov: 0,
        discounts: 0,
        commission: 0,
        netSettlement: otherSalesTotal,
        percentageOfTotal: totalNetSales > 0 ? Math.round((otherNetSales / totalNetSales) * 100) : 0,
      },
    ].filter((c) => c.grossSales > 0 || c.netSales > 0);

    // ── Delivery Platform Performance ──────────────────────────────
    const deliveryStats = [];
    if (zomatoGross > 0 || zomatoNet > 0) {
      const deductions = Math.max(0, zomatoGross - zomatoNet);
      const effectiveDeductionPct = zomatoGross > 0 ? (deductions / zomatoGross) * 100 : 0;
      deliveryStats.push({
        platformName: 'Zomato',
        grossSales: zomatoGross,
        restaurantDiscount: zomatoRestDisc,
        platformDiscount: zomatoPlatDisc,
        commission: zomatoComm,
        otherDeductions: zomatoGst,
        netSettlement: zomatoNet,
        effectiveDeductionPct: Math.round(effectiveDeductionPct * 10) / 10,
      });
    }

    if (fatafatGross > 0 || fatafatNet > 0) {
      const deductions = Math.max(0, fatafatGross - fatafatNet);
      const effectiveDeductionPct = fatafatGross > 0 ? (deductions / fatafatGross) * 100 : 0;
      deliveryStats.push({
        platformName: 'Fatafat',
        grossSales: fatafatGross,
        restaurantDiscount: fatafatRestDisc,
        platformDiscount: fatafatPlatDisc,
        commission: fatafatComm,
        otherDeductions: fatafatGst,
        netSettlement: fatafatNet,
        effectiveDeductionPct: Math.round(effectiveDeductionPct * 10) / 10,
      });
    }

    // ── Item-Wise Performance Summary ──────────────────────────────
    const itemMap = new Map();
    currentPaidOrders.forEach((o) => {
      const orderDiscPct = (Number(o.subtotal) || 0) > 0 ? (Number(o.discount) || 0) / Number(o.subtotal) : 0;
      o.items?.forEach((it) => {
        if (it.status === 'cancelled') return;
        const key = it.name || 'Unnamed Item';
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0;
        const lineBase = qty * price;
        const disc = Math.round(lineBase * orderDiscPct * 100) / 100;
        const lineNet = Math.max(0, lineBase - disc);
        const taxRate = Number(it.taxPercent) || 5;
        const lineTax = Math.round(((lineNet * taxRate) / 100) * 100) / 100;
        const lineGross = lineNet + lineTax;

        if (!itemMap.has(key)) {
          itemMap.set(key, {
            itemId: it.menuItem ? String(it.menuItem) : key,
            name: key,
            quantitySold: 0,
            grossSales: 0,
            gst: 0,
            netSales: 0,
            taxPercent: taxRate,
          });
        }
        const record = itemMap.get(key);
        record.quantitySold += qty;
        record.grossSales += lineGross;
        record.gst += lineTax;
        record.netSales += lineNet;
      });
    });

    const itemStats = Array.from(itemMap.values()).sort((a, b) => b.netSales - a.netSales);
    const topSellingByRevenue = [...itemStats].slice(0, 5);
    const topSellingByQuantity = [...itemStats].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 5);
    const slowMovingItems = [...itemStats].filter((it) => it.quantitySold <= config.lowItemSalesThresholdQty).slice(0, 5);

    // ── Today's Business Status Calculation ────────────────────────
    let todayActual = Number(todaySalesEntry?.totalRevenue) || 0;
    if (todayActual === 0 && todayPaidOrders.length > 0) {
      todayActual = todayPaidOrders.reduce((sum, o) => sum + (Number(o.settledAmount ?? o.total) || 0), 0);
    }

    // Determine today's configured target or dynamic suggested target
    const todayDayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    let target = null;
    let isSuggested = false;

    if (todayDayOfWeek === 0 || todayDayOfWeek === 6) {
      // Weekend
      if (typeof config.weekendTarget === 'number' && config.weekendTarget > 0) {
        target = config.weekendTarget;
      }
    } else {
      // Weekday
      const dowKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const key = dowKeys[todayDayOfWeek];
      if (config.weekdayTargets && typeof config.weekdayTargets[key] === 'number' && config.weekdayTargets[key] > 0) {
        target = config.weekdayTargets[key];
      }
    }

    if (!target && typeof config.dailyTarget === 'number' && config.dailyTarget > 0) {
      target = config.dailyTarget;
    }

    // If no target set, calculate suggested target from historical comparable days
    if (!target) {
      isSuggested = true;
      const matchingHistorical = historicalSalesForTargets.filter((se) => {
        const d = new Date(se.date);
        return d.getDay() === todayDayOfWeek;
      });

      if (matchingHistorical.length > 0) {
        const avgHist = matchingHistorical.reduce((sum, se) => sum + (Number(se.totalRevenue) || 0), 0) / matchingHistorical.length;
        const growthMult = 1 + (Number(config.suggestedGrowthPct) || 10) / 100;
        target = Math.round(avgHist * growthMult);
      } else {
        target = 10000; // sensible default
      }
    }

    const todayRemaining = Math.max(0, target - todayActual);
    const todayAchievementPct = target > 0 ? (todayActual / target) * 100 : 0;

    const todayStatus = {
      dateStr: todayRange.istDateStr,
      target,
      actual: todayActual,
      remaining: todayRemaining,
      achievementPct: Math.round(todayAchievementPct * 10) / 10,
      isSuggested,
      targetType: isSuggested ? 'suggested' : 'configured',
    };

    // ── Evaluate Suggestion Rule Engine ────────────────────────────
    const mainKpis = {
      grossSales: totalGrossSales,
      netSales: totalNetSales,
      orders: totalOrdersCount,
      aov: Math.round(aov),
      discounts: totalDiscount,
      gst: totalGst,
      prevGrossSales,
      prevNetSales,
      prevOrders: prevOrdersCount,
      prevAov: Math.round(prevAov),
      aovGrowthPct: Math.round(aovGrowthPct * 10) / 10,
      salesGrowthPct: Math.round(salesGrowthPct * 10) / 10,
      ordersGrowthPct: Math.round(ordersGrowthPct * 10) / 10,
    };

    const { suggestions, top3Actions } = evaluateSalesSuggestions({
      kpis: mainKpis,
      todayStatus,
      dowStats: sortedDow,
      hourlyStats: hourlyBuckets,
      channelStats,
      deliveryStats,
      itemStats,
      config,
    });

    // ── Data Quality Summary ───────────────────────────────────────
    let unTaxedCount = 0;
    let missingTaxRateCount = 0;
    let taxMismatchCount = 0;

    currentPaidOrders.forEach((o) => {
      if (Number(o.subtotal) > 0 && (Number(o.taxAmount) || 0) === 0) {
        unTaxedCount += 1;
      }
      o.items?.forEach((it) => {
        if (it.taxPercent === undefined || it.taxPercent === null) {
          missingTaxRateCount += 1;
        }
      });
      // Verification: taxAmount should be roughly subtotal * 0.05
      const expectedTax = Math.round(((Number(o.subtotal) || 0) * 0.05) * 100) / 100;
      if (Math.abs(expectedTax - (Number(o.taxAmount) || 0)) > 2) {
        taxMismatchCount += 1;
      }
    });

    const dataQuality = {
      status: taxMismatchCount === 0 && unTaxedCount === 0 ? 'good' : (taxMismatchCount < 5 ? 'review' : 'problem'),
      unTaxedOrders: unTaxedCount,
      missingTaxRates: missingTaxRateCount,
      taxMismatches: taxMismatchCount,
      totalOrdersChecked: currentPaidOrders.length,
      hasItemLevelData: currentPaidOrders.length > 0,
    };

    res.json({
      period: {
        startDate: currentStart,
        endDate: currentEnd,
        previousStart,
        previousEnd,
        days: currentDays,
      },
      kpis: {
        ...mainKpis,
        taxableSales: totalTaxableSales,
        cgst: totalCgst,
        sgst: totalSgst,
        averageDailySales: Math.round(averageDailySales),
        highestSalesDay,
        lowestSalesDay,
        targetAchievementPct: todayStatus.achievementPct,
      },
      todayStatus,
      top3Actions,
      suggestions,
      salesTrend,
      dayOfWeek: sortedDow,
      hourlySales: hourlyBuckets,
      peakHour,
      slowHour,
      channelStats,
      deliveryStats,
      topSelling: {
        byRevenue: topSellingByRevenue,
        byQuantity: topSellingByQuantity,
      },
      slowMovingItems,
      dataQuality,
      config: {
        targetAov: config.targetAov,
        dailyTarget: config.dailyTarget,
        weakDayThresholdPct: config.weakDayThresholdPct,
        deliveryDeductionThresholdPct: config.deliveryDeductionThresholdPct,
      },
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 2. GET /api/analytics/items — Item-Wise Sales Report
// ─────────────────────────────────────────────────────────────────
router.get('/items', async (req, res) => {
  try {
    const { period = 'this_month', startDate, endDate, category, search, sortBy = 'revenue_desc' } = req.query;
    const { currentStart, currentEnd } = resolveDateRanges(period, startDate, endDate);

    // Fetch paid orders in the date range
    const orders = await Order.find({
      status: 'paid',
      paidAt: { $gte: currentStart, $lte: currentEnd },
    }).lean();

    // Fetch all menu items to get categories
    const menuItems = await MenuItem.find().populate('category', 'name').lean();
    const menuItemMap = new Map();
    menuItems.forEach((m) => {
      menuItemMap.set(String(m._id), m);
    });

    // Aggregate line items
    const aggregated = new Map();

    orders.forEach((o) => {
      const orderDiscPct = (Number(o.subtotal) || 0) > 0 ? (Number(o.discount) || 0) / Number(o.subtotal) : 0;

      o.items?.forEach((it) => {
        if (it.status === 'cancelled') return;
        const key = it.name?.trim() || 'Unnamed Item';
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0;
        const lineBase = qty * price;
        const disc = Math.round(lineBase * orderDiscPct * 100) / 100;
        const net = Math.max(0, lineBase - disc);
        const taxRate = Number(it.taxPercent) || 5;
        const gst = Math.round(((net * taxRate) / 100) * 100) / 100;
        const grossWithGst = Math.round((net + gst) * 100) / 100;

        const menuItemId = it.menuItem ? String(it.menuItem) : null;
        const meta = menuItemId ? menuItemMap.get(menuItemId) : null;
        const catName = meta?.category?.name || 'Food & Beverages';

        if (!aggregated.has(key)) {
          aggregated.set(key, {
            itemId: menuItemId || key,
            name: key,
            category: catName,
            isVeg: meta ? Boolean(meta.isVeg) : true,
            quantitySold: 0,
            grossSales: 0,
            discounts: 0,
            netSales: 0,
            taxPercent: taxRate,
            gst: 0,
            totalWithGst: 0,
            ordersCount: 0,
          });
        }

        const entry = aggregated.get(key);
        entry.quantitySold += qty;
        entry.grossSales += grossWithGst; // Gross sales = Total invoiced amount including tax
        entry.discounts += disc;
        entry.netSales += net; // Net sales = Gross sales - GST
        entry.gst += gst;
        entry.totalWithGst += grossWithGst;
        entry.ordersCount += 1;
      });
    });

    let items = Array.from(aggregated.values()).map((it) => ({
      ...it,
      averageSellingPrice: it.quantitySold > 0 ? Math.round(it.grossSales / it.quantitySold) : 0,
      grossSales: Math.round(it.grossSales),
      discounts: Math.round(it.discounts),
      netSales: Math.round(it.netSales),
      gst: Math.round(it.gst * 100) / 100,
      totalWithGst: Math.round(it.totalWithGst),
    }));

    // Filter by Category
    if (category && category !== 'all') {
      items = items.filter((it) => it.category.toLowerCase() === String(category).toLowerCase());
    }

    // Filter by Search Query
    if (search && String(search).trim()) {
      items = items.filter((it) => matchesSearch([it.name, it.category], search));
    }

    // Sort items
    if (sortBy === 'revenue_desc') {
      items.sort((a, b) => b.netSales - a.netSales);
    } else if (sortBy === 'revenue_asc') {
      items.sort((a, b) => a.netSales - b.netSales);
    } else if (sortBy === 'qty_desc') {
      items.sort((a, b) => b.quantitySold - a.quantitySold);
    } else if (sortBy === 'qty_asc') {
      items.sort((a, b) => a.quantitySold - b.quantitySold);
    } else if (sortBy === 'name_asc') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Summary totals
    const totalQty = items.reduce((s, it) => s + it.quantitySold, 0);
    const totalGross = items.reduce((s, it) => s + it.grossSales, 0);
    const totalNet = items.reduce((s, it) => s + it.netSales, 0);
    const totalGst = items.reduce((s, it) => s + it.gst, 0);

    res.json({
      period: { startDate: currentStart, endDate: currentEnd },
      summary: {
        itemCount: items.length,
        totalQuantitySold: totalQty,
        totalGrossSales: totalGross,
        totalNetSales: totalNet,
        totalGst: Math.round(totalGst * 100) / 100,
      },
      items,
    });
  } catch (err) {
    console.error('Item sales report error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 3. GET /api/analytics/item/:id — Single Item Deep Dive
// ─────────────────────────────────────────────────────────────────
router.get('/item/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { period = 'this_month', startDate, endDate } = req.query;
    const { currentStart, currentEnd } = resolveDateRanges(period, startDate, endDate);

    // Look up menu item if it's an ObjectId
    let menuItem = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      menuItem = await MenuItem.findById(id).populate('category', 'name').lean();
    }

    const itemName = menuItem ? menuItem.name : decodeURIComponent(id);

    // Fetch paid orders in the date range containing this item
    const orders = await Order.find({
      status: 'paid',
      paidAt: { $gte: currentStart, $lte: currentEnd },
      'items.name': itemName,
    }).lean();

    let totalQuantity = 0;
    let totalGross = 0;
    let totalDiscount = 0;
    let totalNet = 0;
    let totalTax = 0;

    const dailyMap = new Map();
    const dowBuckets = Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      dayName: DOW_NAMES[i],
      quantity: 0,
      revenue: 0,
    }));
    const hourlyBuckets = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i % 12 || 12} ${i >= 12 ? 'PM' : 'AM'}`,
      quantity: 0,
      revenue: 0,
    }));
    const variantMap = new Map();

    orders.forEach((o) => {
      const paidDate = o.paidAt || o.createdAt;
      const dateStr = getIstDayRange(paidDate).istDateStr;
      const dayIdx = new Date(paidDate).getDay();
      const d = new Date(paidDate);
      const istHour = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;

      const orderDiscPct = (Number(o.subtotal) || 0) > 0 ? (Number(o.discount) || 0) / Number(o.subtotal) : 0;

      o.items?.forEach((it) => {
        if (it.status === 'cancelled' || it.name !== itemName) return;
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0;
        const lineBase = qty * price;
        const disc = lineBase * orderDiscPct;
        const net = Math.max(0, lineBase - disc);
        const tax = (net * (Number(it.taxPercent) || 5)) / 100;
        const gross = net + tax;

        totalQuantity += qty;
        totalGross += gross;
        totalDiscount += disc;
        totalNet += net;
        totalTax += tax;

        // Daily trend
        if (!dailyMap.has(dateStr)) {
          dailyMap.set(dateStr, { date: dateStr, quantity: 0, revenue: 0 });
        }
        const dayRec = dailyMap.get(dateStr);
        dayRec.quantity += qty;
        dayRec.revenue += Math.round(net);

        // Day of Week
        dowBuckets[dayIdx].quantity += qty;
        dowBuckets[dayIdx].revenue += Math.round(net);

        // Hourly
        hourlyBuckets[istHour].quantity += qty;
        hourlyBuckets[istHour].revenue += Math.round(net);

        // Variants
        const vName = it.variant?.name || 'Standard';
        variantMap.set(vName, (variantMap.get(vName) || 0) + qty);
      });
    });

    const dailyTrend = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const sortedDow = [
      dowBuckets[1], // Mon
      dowBuckets[2], // Tue
      dowBuckets[3], // Wed
      dowBuckets[4], // Thu
      dowBuckets[5], // Fri
      dowBuckets[6], // Sat
      dowBuckets[0], // Sun
    ];

    const variants = Array.from(variantMap.entries()).map(([name, qty]) => ({ name, quantity: qty }));

    res.json({
      item: {
        id: menuItem?._id || id,
        name: itemName,
        category: menuItem?.category?.name || 'Food & Beverages',
        basePrice: menuItem?.price || (totalQuantity > 0 ? Math.round(totalGross / totalQuantity) : 0),
        isVeg: menuItem ? Boolean(menuItem.isVeg) : true,
      },
      period: { startDate: currentStart, endDate: currentEnd },
      summary: {
        totalQuantitySold: totalQuantity,
        totalGrossSales: Math.round(totalGross),
        totalDiscount: Math.round(totalDiscount),
        totalNetSales: Math.round(totalNet),
        totalTax: Math.round(totalTax * 100) / 100,
        averageSellingPrice: totalQuantity > 0 ? Math.round(totalGross / totalQuantity) : 0,
      },
      dailyTrend,
      dayOfWeek: sortedDow,
      hourlySales: hourlyBuckets,
      variants,
      profitabilityNote: 'Profitability unavailable — recipe/ingredient cost data is not currently available.',
    });
  } catch (err) {
    console.error('Item deep-dive error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 4. GET /api/analytics/gst — Comprehensive GST Collection Report
// ─────────────────────────────────────────────────────────────────
router.get('/gst', async (req, res) => {
  try {
    const { period = 'this_month', startDate, endDate, filingMonth } = req.query;
    let currentStart;
    let currentEnd;

    if (filingMonth && /^\d{4}-\d{2}$/.test(filingMonth.trim())) {
      const [y, m] = filingMonth.trim().split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      currentStart = getIstDayRange(`${y}-${String(m).padStart(2, '0')}-01`).start;
      currentEnd = getIstDayRange(`${y}-${String(m).padStart(2, '0')}-${String(days).padStart(2, '0')}`).end;
    } else {
      const resolved = resolveDateRanges(period, startDate, endDate);
      currentStart = resolved.currentStart;
      currentEnd = resolved.currentEnd;
    }

    // Fetch paid orders in period
    const orders = await Order.find({
      status: 'paid',
      paidAt: { $gte: currentStart, $lte: currentEnd },
    }).lean();

    // Fetch menu items for category mapping
    const menuItems = await MenuItem.find().populate('category', 'name').lean();
    const itemMap = new Map();
    menuItems.forEach((m) => itemMap.set(String(m._id), m));

    let grossSalesTotal = 0;
    let taxableSalesTotal = 0;
    let exemptSalesTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let totalGst = 0;
    let totalInvoiceValue = 0;

    // Rate wise map: taxPercent -> { rate, taxable, cgst, sgst, totalGst, invoiceValue }
    const rateWiseMap = new Map();

    // Item wise map: itemName -> { name, category, quantity, taxable, rate, cgst, sgst, totalGst, invoiceValue }
    const itemWiseMap = new Map();

    // Daily GST map: dateStr -> { date, taxable, cgst, sgst, totalGst, totalSales, orderCount, minInvoice, maxInvoice }
    const dailyGstMap = new Map();

    // Reconciliation discrepancies array
    const discrepancies = [];

    // Track period-wide invoice number range
    let periodMinInvoice = null;
    let periodMaxInvoice = null;

    orders.forEach((o) => {
      const paidDate = o.paidAt || o.createdAt;
      const dateStr = getIstDayRange(paidDate).istDateStr;
      const orderSubtotal = Number(o.subtotal) || 0;
      const orderDiscount = Number(o.discount) || 0;
      const orderTax = Number(o.taxAmount) || 0;
      const orderTotal = Number(o.settledAmount ?? o.total) || 0;
      const orderTaxable = Math.max(0, orderSubtotal - orderDiscount);

      // Determine invoice / bill number (prefers quarterly billNumber, fallbacks to orderNumber)
      const invoiceNum = o.billNumber != null ? o.billNumber : (o.orderNumber != null ? o.orderNumber : null);

      if (invoiceNum != null) {
        if (periodMinInvoice == null || invoiceNum < periodMinInvoice) periodMinInvoice = invoiceNum;
        if (periodMaxInvoice == null || invoiceNum > periodMaxInvoice) periodMaxInvoice = invoiceNum;
      }

      grossSalesTotal += orderSubtotal + orderTax;
      taxableSalesTotal += orderTaxable;
      totalGst += orderTax;
      totalInvoiceValue += orderTotal;

      const orderCgst = Math.round((orderTax / 2) * 100) / 100;
      const orderSgst = Math.round((orderTax / 2) * 100) / 100;
      cgstTotal += orderCgst;
      sgstTotal += orderSgst;

      // Daily table accumulation
      if (!dailyGstMap.has(dateStr)) {
        dailyGstMap.set(dateStr, {
          date: dateStr,
          taxableSales: 0,
          cgst: 0,
          sgst: 0,
          totalGst: 0,
          totalSales: 0,
          orderCount: 0,
          minInvoice: invoiceNum,
          maxInvoice: invoiceNum,
        });
      }
      const dayRow = dailyGstMap.get(dateStr);
      dayRow.taxableSales += orderTaxable;
      dayRow.cgst += orderCgst;
      dayRow.sgst += orderSgst;
      dayRow.totalGst += orderTax;
      dayRow.totalSales += orderTotal;
      dayRow.orderCount += 1;

      if (invoiceNum != null) {
        if (dayRow.minInvoice == null || invoiceNum < dayRow.minInvoice) {
          dayRow.minInvoice = invoiceNum;
        }
        if (dayRow.maxInvoice == null || invoiceNum > dayRow.maxInvoice) {
          dayRow.maxInvoice = invoiceNum;
        }
      }

      // Item level breakdown (proportional discount applied to each line item)
      const orderDiscPct = orderSubtotal > 0 ? orderDiscount / orderSubtotal : 0;
      o.items?.forEach((it) => {
        if (it.status === 'cancelled') return;
        const qty = Number(it.quantity) || 1;
        const price = Number(it.price) || 0;
        const lineBase = qty * price;
        const lineTaxable = Math.round(Math.max(0, lineBase * (1 - orderDiscPct)) * 100) / 100;
        const rate = Number(it.taxPercent) || 5;
        const lineGst = Math.round(((lineTaxable * rate) / 100) * 100) / 100;
        const lineCgst = Math.round((lineGst / 2) * 100) / 100;
        const lineSgst = Math.round((lineGst / 2) * 100) / 100;
        const lineInvoice = lineTaxable + lineGst;

        // Rate breakdown
        if (!rateWiseMap.has(rate)) {
          rateWiseMap.set(rate, {
            rate: `${rate}%`,
            rateNum: rate,
            taxableValue: 0,
            cgst: 0,
            sgst: 0,
            totalGst: 0,
            invoiceValue: 0,
          });
        }
        const rEntry = rateWiseMap.get(rate);
        rEntry.taxableValue += lineTaxable;
        rEntry.cgst += lineCgst;
        rEntry.sgst += lineSgst;
        rEntry.totalGst += lineGst;
        rEntry.invoiceValue += lineInvoice;

        // Item breakdown
        const itKey = it.name?.trim() || 'Item';
        const meta = it.menuItem ? itemMap.get(String(it.menuItem)) : null;
        const catName = meta?.category?.name || 'Food';

        if (!itemWiseMap.has(itKey)) {
          itemWiseMap.set(itKey, {
            name: itKey,
            category: catName,
            quantity: 0,
            taxableValue: 0,
            gstRate: `${rate}%`,
            cgst: 0,
            sgst: 0,
            totalGst: 0,
            invoiceValue: 0,
          });
        }
        const itEntry = itemWiseMap.get(itKey);
        itEntry.quantity += qty;
        itEntry.taxableValue += lineTaxable;
        itEntry.cgst += lineCgst;
        itEntry.sgst += lineSgst;
        itEntry.totalGst += lineGst;
        itEntry.invoiceValue += lineInvoice;
      });

      // Discrepancy check: expected tax vs recorded tax
      const expectedTax = Math.round(((orderTaxable * 0.05) * 100) / 100);
      if (Math.abs(expectedTax - orderTax) > 1) {
        discrepancies.push({
          orderId: o._id,
          orderNumber: o.orderNumber || o.billNumber || 'Order',
          date: dateStr,
          subtotal: orderSubtotal,
          recordedTax: orderTax,
          expectedTax,
          difference: Math.round((orderTax - expectedTax) * 100) / 100,
          reason: 'Tax calculation deviates by > ₹1 from standard 5% restaurant rate',
        });
      }
    });

    let periodInvoiceRange = 'N/A';
    if (periodMinInvoice != null && periodMaxInvoice != null) {
      periodInvoiceRange = periodMinInvoice === periodMaxInvoice
        ? `#${periodMinInvoice}`
        : `#${periodMinInvoice} – #${periodMaxInvoice}`;
    }

    const rateWiseReport = Array.from(rateWiseMap.values()).sort((a, b) => a.rateNum - b.rateNum);
    const itemWiseReport = Array.from(itemWiseMap.values()).sort((a, b) => b.taxableValue - a.taxableValue);
    const dailyReport = Array.from(dailyGstMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => {
        let invoiceRange = 'N/A';
        if (day.minInvoice != null && day.maxInvoice != null) {
          invoiceRange = day.minInvoice === day.maxInvoice ? `#${day.minInvoice}` : `#${day.minInvoice} – #${day.maxInvoice}`;
        }
        return {
          ...day,
          startInvoice: day.minInvoice ?? null,
          endInvoice: day.maxInvoice ?? null,
          invoiceRange,
          taxableSales: Math.round(day.taxableSales * 100) / 100,
          cgst: Math.round(day.cgst * 100) / 100,
          sgst: Math.round(day.sgst * 100) / 100,
          totalGst: Math.round(day.totalGst * 100) / 100,
          totalSales: Math.round(day.totalSales * 100) / 100,
        };
      });

    res.json({
      period: { startDate: currentStart, endDate: currentEnd },
      summary: {
        grossSales: Math.round(grossSalesTotal),
        taxableSales: Math.round(taxableSalesTotal),
        exemptSales: exemptSalesTotal,
        cgst: Math.round(cgstTotal * 100) / 100,
        sgst: Math.round(sgstTotal * 100) / 100,
        totalGst: Math.round(totalGst * 100) / 100,
        totalInvoiceValue: Math.round(totalInvoiceValue),
        invoiceCount: orders.length,
        startInvoice: periodMinInvoice,
        endInvoice: periodMaxInvoice,
        invoiceRange: periodInvoiceRange,
      },
      rateWiseReport,
      itemWiseReport,
      dailyReport,
      reconciliation: {
        discrepanciesCount: discrepancies.length,
        isReconciled: discrepancies.length === 0,
        discrepancies,
      },
    });
  } catch (err) {
    console.error('GST report error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 5. GET & PUT /api/analytics/config — Configurable Targets & Thresholds
// ─────────────────────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const config = await SalesAnalyticsConfig.getSingleton();
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/config', managerOrAdmin, async (req, res) => {
  try {
    const {
      dailyTarget,
      weekdayTargets,
      weekendTarget,
      targetAov,
      weakDayThresholdPct,
      deliveryDeductionThresholdPct,
      lowItemSalesThresholdQty,
      suggestedGrowthPct,
    } = req.body;

    const config = await SalesAnalyticsConfig.getSingleton();

    if (dailyTarget !== undefined) config.dailyTarget = dailyTarget === null ? null : Number(dailyTarget);
    if (weekdayTargets !== undefined) config.weekdayTargets = weekdayTargets;
    if (weekendTarget !== undefined) config.weekendTarget = weekendTarget === null ? null : Number(weekendTarget);
    if (targetAov !== undefined) config.targetAov = Number(targetAov) || 150;
    if (weakDayThresholdPct !== undefined) config.weakDayThresholdPct = Number(weakDayThresholdPct) || 20;
    if (deliveryDeductionThresholdPct !== undefined) config.deliveryDeductionThresholdPct = Number(deliveryDeductionThresholdPct) || 35;
    if (lowItemSalesThresholdQty !== undefined) config.lowItemSalesThresholdQty = Number(lowItemSalesThresholdQty) || 5;
    if (suggestedGrowthPct !== undefined) config.suggestedGrowthPct = Number(suggestedGrowthPct) || 10;

    config.lastUpdatedBy = req.user?._id;
    await config.save();

    res.json(config);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 6. POST /api/analytics/suggestions/:id/action — Action Handlers
// ─────────────────────────────────────────────────────────────────
router.post('/suggestions/:id/action', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, snoozeDays = 3 } = req.body; // 'complete' | 'dismiss' | 'snooze'

    const config = await SalesAnalyticsConfig.getSingleton();
    const existingIdx = config.suggestionActions.findIndex((a) => a.actionId === id);

    let status = 'active';
    let snoozedUntil = null;
    let completedAt = null;

    if (action === 'complete') {
      status = 'completed';
      completedAt = new Date();
    } else if (action === 'dismiss') {
      status = 'dismissed';
    } else if (action === 'snooze') {
      status = 'snoozed';
      snoozedUntil = new Date(Date.now() + Math.max(1, Number(snoozeDays) || 3) * 86400000);
    }

    const actionData = {
      actionId: id,
      status,
      snoozedUntil,
      completedAt,
      updatedAt: new Date(),
    };

    if (existingIdx !== -1) {
      config.suggestionActions[existingIdx] = actionData;
    } else {
      config.suggestionActions.push(actionData);
    }

    await config.save();
    res.json({ message: `Suggestion action updated to ${status}`, action: actionData });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 7. GET /api/analytics/data-quality — Data Quality & Integrity Audit
// ─────────────────────────────────────────────────────────────────
router.get('/data-quality', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(500).lean();
    const salesEntries = await SalesEntry.find().sort({ date: -1 }).limit(100).lean();

    const issues = [];
    let goodCount = 0;

    orders.forEach((o) => {
      let hasIssue = false;
      if (o.status === 'paid' && Number(o.subtotal) > 0 && (Number(o.taxAmount) || 0) === 0) {
        issues.push({
          severity: 'medium',
          type: 'UNTAXED_PAID_ORDER',
          orderNumber: o.orderNumber || o.billNumber,
          date: o.paidAt || o.createdAt,
          message: `Paid order #${o.orderNumber || o.billNumber} has subtotal ${o.subtotal} but ₹0 tax recorded.`,
        });
        hasIssue = true;
      }

      if (o.items?.some((it) => it.taxPercent === undefined || it.taxPercent === null)) {
        issues.push({
          severity: 'low',
          type: 'MISSING_ITEM_TAX_RATE',
          orderNumber: o.orderNumber || o.billNumber,
          date: o.createdAt,
          message: `Order #${o.orderNumber || o.billNumber} has items without explicit tax percent tag.`,
        });
        hasIssue = true;
      }

      if (!hasIssue) goodCount += 1;
    });

    salesEntries.forEach((se) => {
      if (Number(se.zomato?.grossSales) > 0 && Number(se.zomato?.netSettlement) > Number(se.zomato?.grossSales)) {
        issues.push({
          severity: 'high',
          type: 'INVALID_DELIVERY_SETTLEMENT',
          date: se.date,
          message: `Zomato net settlement exceeds gross sales on ${getIstDayRange(se.date).istDateStr}.`,
        });
      }
    });

    const status = issues.filter((i) => i.severity === 'high').length > 0 ? 'problem' : (issues.length > 0 ? 'review' : 'good');

    res.json({
      status,
      totalOrdersAudited: orders.length,
      totalSalesEntriesAudited: salesEntries.length,
      cleanOrdersCount: goodCount,
      issuesCount: issues.length,
      issues: issues.slice(0, 50),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
