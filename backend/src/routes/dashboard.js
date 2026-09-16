// Dashboard Route — aggregated stats for the main dashboard
const router = require('express').Router();
const SalesEntry = require('../models/SalesEntry');
const Payment = require('../models/Payment');
const PurchaseEntry = require('../models/PurchaseEntry');
const Account = require('../models/Account');
const InventoryItem = require('../models/InventoryItem');
const Supplier = require('../models/Supplier');
const Order = require('../models/Order');
const OwnerNote = require('../models/OwnerNote');
const { auth } = require('../middleware/auth');
const { getIstDayRange } = require('../utils/date');

router.use(auth);

router.get('/summary', async (req, res) => {
  try {
    // 1. Precise Indian Standard Time (IST / Asia:Kolkata) Date Ranges
    const todayRange = getIstDayRange(new Date());
    const yesterdayDate = new Date(todayRange.start.getTime() - 1000);
    const yesterdayRange = getIstDayRange(yesterdayDate);

    const [currentYear, currentMonth, currentDay] = todayRange.istDateStr.split('-').map(Number);
    const monthStartRange = getIstDayRange(`${currentYear}-${String(currentMonth).padStart(2, '0')}-01`);
    const monthStart = monthStartRange.start;

    const thirtyDaysAgoMs = todayRange.start.getTime() - (29 * 24 * 3600 * 1000);
    const thirtyDaysAgoRange = getIstDayRange(new Date(thirtyDaysAgoMs));
    const thirtyDaysAgo = thirtyDaysAgoRange.start;

    // 2. Yesterday's sales & purchases in IST
    const yesterdaySales = await SalesEntry.findOne({
      date: { $gte: yesterdayRange.start, $lte: yesterdayRange.end }
    });

    const yesterdayOrdersAgg = await Order.aggregate([
      {
        $match: {
          status: 'paid',
          $or: [
            { paidAt: { $gte: yesterdayRange.start, $lte: yesterdayRange.end } },
            { updatedAt: { $gte: yesterdayRange.start, $lte: yesterdayRange.end } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$settledAmount' },
          count: { $sum: 1 },
          cash: { $sum: '$paymentBreakdown.cash' },
          upi: { $sum: '$paymentBreakdown.upi' },
          card: { $sum: '$paymentBreakdown.card' },
          other: { $sum: '$paymentBreakdown.other' },
        },
      },
    ]);

    let yesterdaySalesData = null;
    if (yesterdaySales) {
      const ordTotal = yesterdayOrdersAgg[0]?.total || 0;
      const outletAmount = (yesterdaySales.outletSales || 0) > 0 ? yesterdaySales.outletSales : ordTotal;
      const totalRev = (yesterdaySales.totalRevenue || 0) > 0
        ? yesterdaySales.totalRevenue
        : outletAmount + (yesterdaySales.zomato?.netSettlement || 0) + (yesterdaySales.fatafat?.netSettlement || 0) + (yesterdaySales.otherSales || 0);

      yesterdaySalesData = {
        outlet: outletAmount,
        zomato: yesterdaySales.zomato?.netSettlement || 0,
        fatafat: yesterdaySales.fatafat?.netSettlement || 0,
        other: yesterdaySales.otherSales || 0,
        total: totalRev,
        paymentBreakdown: yesterdaySales.paymentBreakdown || (yesterdayOrdersAgg[0] ? {
          cash: yesterdayOrdersAgg[0].cash || 0,
          upi: yesterdayOrdersAgg[0].upi || 0,
          card: yesterdayOrdersAgg[0].card || 0,
          bankTransfer: yesterdayOrdersAgg[0].other || 0,
        } : {}),
      };
    } else if (yesterdayOrdersAgg[0] && yesterdayOrdersAgg[0].total > 0) {
      yesterdaySalesData = {
        outlet: yesterdayOrdersAgg[0].total,
        zomato: 0,
        fatafat: 0,
        other: 0,
        total: yesterdayOrdersAgg[0].total,
        paymentBreakdown: {
          cash: yesterdayOrdersAgg[0].cash || 0,
          upi: yesterdayOrdersAgg[0].upi || 0,
          card: yesterdayOrdersAgg[0].card || 0,
          bankTransfer: yesterdayOrdersAgg[0].other || 0,
        },
      };
    }

    // Yesterday's purchases (all entries, summed)
    const yesterdayPurchasesAgg = await PurchaseEntry.aggregate([
      { $match: { date: { $gte: yesterdayRange.start, $lte: yesterdayRange.end } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ]);
    const yesterdayPurchases = await PurchaseEntry.find({ date: { $gte: yesterdayRange.start, $lte: yesterdayRange.end } })
      .populate('supplier', 'name')
      .select('supplier totalAmount isPaid');

    // 3. Today's sales & expenses in IST
    const todaySales = await SalesEntry.findOne({
      date: { $gte: todayRange.start, $lte: todayRange.end }
    });

    const todayOrdersAgg = await Order.aggregate([
      {
        $match: {
          status: 'paid',
          $or: [
            { paidAt: { $gte: todayRange.start, $lte: todayRange.end } },
            { updatedAt: { $gte: todayRange.start, $lte: todayRange.end } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$settledAmount' },
          count: { $sum: 1 },
          cash: { $sum: '$paymentBreakdown.cash' },
          upi: { $sum: '$paymentBreakdown.upi' },
          card: { $sum: '$paymentBreakdown.card' },
          other: { $sum: '$paymentBreakdown.other' },
        },
      },
    ]);

    let todaySalesData = null;
    if (todaySales) {
      const ordTotal = todayOrdersAgg[0]?.total || 0;
      const outletAmount = (todaySales.outletSales || 0) > 0 ? todaySales.outletSales : ordTotal;
      const totalRev = (todaySales.totalRevenue || 0) > 0
        ? todaySales.totalRevenue
        : outletAmount + (todaySales.zomato?.netSettlement || 0) + (todaySales.fatafat?.netSettlement || 0) + (todaySales.otherSales || 0);

      todaySalesData = {
        outlet: outletAmount,
        zomato: todaySales.zomato?.netSettlement || 0,
        fatafat: todaySales.fatafat?.netSettlement || 0,
        other: todaySales.otherSales || 0,
        total: totalRev,
        paymentBreakdown: todaySales.paymentBreakdown || (todayOrdersAgg[0] ? {
          cash: todayOrdersAgg[0].cash || 0,
          upi: todayOrdersAgg[0].upi || 0,
          card: todayOrdersAgg[0].card || 0,
          bankTransfer: todayOrdersAgg[0].other || 0,
        } : {}),
      };
    } else if (todayOrdersAgg[0] && todayOrdersAgg[0].total > 0) {
      todaySalesData = {
        outlet: todayOrdersAgg[0].total,
        zomato: 0,
        fatafat: 0,
        other: 0,
        total: todayOrdersAgg[0].total,
        paymentBreakdown: {
          cash: todayOrdersAgg[0].cash || 0,
          upi: todayOrdersAgg[0].upi || 0,
          card: todayOrdersAgg[0].card || 0,
          bankTransfer: todayOrdersAgg[0].other || 0,
        },
      };
    }

    // Today's expenses by category
    const todayExpenses = await Payment.aggregate([
      { $match: { date: { $gte: todayRange.start, $lte: todayRange.end } } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } }
    ]);

    // 4. This month's sales totals in IST
    const monthSalesAgg = await SalesEntry.aggregate([
      { $match: { date: { $gte: monthStart, $lte: todayRange.end } } },
      { $group: {
        _id: null,
        total: { $sum: '$totalRevenue' },
        outlet: { $sum: '$outletSales' },
        zomato: { $sum: '$zomato.netSettlement' },
        fatafat: { $sum: '$fatafat.netSettlement' },
        other: { $sum: '$otherSales' }
      }}
    ]);

    // Month total expenses in IST
    const monthExpenses = await Payment.aggregate([
      { $match: { date: { $gte: monthStart, $lte: todayRange.end } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // All active accounts
    const accounts = await Account.find({ isActive: true });

    // Inventory value and low stock count
    const inventoryItems = await InventoryItem.find({ isActive: true });
    const inventoryValue = inventoryItems.reduce((sum, i) => sum + (i.currentStock * i.averageCost), 0);
    const lowStockCount = inventoryItems.filter(i => i.currentStock <= i.minimumStock).length;

    // Supplier outstanding dues (including opening balance)
    const supplierDues = await Supplier.aggregate([
      { $group: { _id: null, total: { $sum: { $add: ['$openingBalance', { $subtract: ['$totalPurchased', '$totalPaid'] }] } } } }
    ]);

    // 30-day sales trend in IST
    const salesTrend = await SalesEntry.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo, $lte: todayRange.end } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: '+05:30' } },
        revenue: { $sum: '$totalRevenue' },
        outlet: { $sum: '$outletSales' },
        zomato: { $sum: '$zomato.netSettlement' },
        fatafat: { $sum: '$fatafat.netSettlement' }
      }},
      { $sort: { _id: 1 } }
    ]);

    // 30-day expense trend in IST
    const expenseTrend = await Payment.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo, $lte: todayRange.end } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: '+05:30' } }, amount: { $sum: '$amount' } } },
      { $sort: { _id: 1 } }
    ]);

    // Expense by category this month
    const expenseByCategory = await Payment.aggregate([
      { $match: { date: { $gte: monthStart, $lte: todayRange.end } } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } }
    ]);

    const monthSales = monthSalesAgg[0] || { total: 0, outlet: 0, zomato: 0, fatafat: 0, other: 0 };
    const totalMonthExpenses = monthExpenses[0]?.total || 0;
    const rawMaterialsThisMonth = expenseByCategory.find(e => e._id === 'Raw Materials')?.total || 0;

    // Current month day progress & daily averages
    const daysElapsed = Math.max(1, currentDay);
    const totalDaysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const dailyAverage = {
      revenue: Math.round((monthSales.total || 0) / daysElapsed),
      outlet: Math.round((monthSales.outlet || 0) / daysElapsed),
      zomato: Math.round((monthSales.zomato || 0) / daysElapsed),
      fatafat: Math.round((monthSales.fatafat || 0) / daysElapsed),
      other: Math.round((monthSales.other || 0) / daysElapsed),
      expenses: Math.round((totalMonthExpenses || 0) / daysElapsed),
    };

    // 5. Owner Note singleton
    const ownerNoteDoc = await OwnerNote.getSingleton();
    const ownerNoteText = ownerNoteDoc?.text || '';

    res.json({
      today: {
        sales: todaySalesData,
        expenses: todayExpenses,
      },
      // ── Yesterday summary for the dashboard banner ─────────────
      yesterday: {
        date: yesterdayRange.canonicalDate,
        sales: yesterdaySalesData,
        purchases: {
          total: yesterdayPurchasesAgg[0]?.total || 0,
          count: yesterdayPurchasesAgg[0]?.count || 0,
          entries: yesterdayPurchases.map(p => ({
            supplier: p.supplier?.name || 'Unknown',
            amount: p.totalAmount,
            isPaid: p.isPaid,
          })),
        },
      },
      month: {
        revenue: monthSales.total,
        outlet: monthSales.outlet,
        zomato: monthSales.zomato,
        fatafat: monthSales.fatafat,
        other: monthSales.other,
        expenses: totalMonthExpenses,
        grossProfit: monthSales.total - rawMaterialsThisMonth,
        netProfit: monthSales.total - totalMonthExpenses,
        daysElapsed,
        totalDaysInMonth,
        dailyAverage,
      },
      accounts,
      inventoryValue,
      lowStockCount,
      supplierDues: supplierDues[0]?.total || 0,
      charts: { salesTrend, expenseTrend, expenseByCategory },
      ownerNote: ownerNoteText,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
