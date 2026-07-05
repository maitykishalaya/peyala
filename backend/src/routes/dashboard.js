// Dashboard Route — aggregated stats for the main dashboard
const router = require('express').Router();
const SalesEntry = require('../models/SalesEntry');
const Payment = require('../models/Payment');
const PurchaseEntry = require('../models/PurchaseEntry');
const Account = require('../models/Account');
const InventoryItem = require('../models/InventoryItem');
const Supplier = require('../models/Supplier');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/summary', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    // Yesterday's date range (for the dashboard summary banner)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    // tomorrow is reused as today's exclusive end, so yesterday's range is [yesterday, today)

    // Yesterday's sales entry
    const yesterdaySales = await SalesEntry.findOne({ date: { $gte: yesterday, $lt: today } });

    // Yesterday's purchases (all entries, summed)
    const yesterdayPurchasesAgg = await PurchaseEntry.aggregate([
      { $match: { date: { $gte: yesterday, $lt: today } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ]);
    const yesterdayPurchases = await PurchaseEntry.find({ date: { $gte: yesterday, $lt: today } })
      .populate('supplier', 'name')
      .select('supplier totalAmount isPaid');

    // Today's sales entry
    const todaySales = await SalesEntry.findOne({ date: { $gte: today, $lt: tomorrow } });

    // This month's sales totals
    const monthSalesAgg = await SalesEntry.aggregate([
      { $match: { date: { $gte: monthStart, $lt: tomorrow } } },
      { $group: {
        _id: null,
        total: { $sum: '$totalRevenue' },
        outlet: { $sum: '$outletSales' },
        zomato: { $sum: '$zomato.netSettlement' },
        fatafat: { $sum: '$fatafat.netSettlement' },
        other: { $sum: '$otherSales' }
      }}
    ]);

    // Today's expenses by category
    const todayExpenses = await Payment.aggregate([
      { $match: { date: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } }
    ]);

    // Month total expenses
    const monthExpenses = await Payment.aggregate([
      { $match: { date: { $gte: monthStart, $lt: tomorrow } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Note: month total expenses now comes purely from Payments (below) —
    // every purchase already creates a matching Payment record under
    // 'Raw Materials', so summing PurchaseEntry separately here would
    // double-count the same money.

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

    // 30-day sales trend
    const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const salesTrend = await SalesEntry.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo, $lt: tomorrow } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        revenue: { $sum: '$totalRevenue' },
        outlet: { $sum: '$outletSales' },
        zomato: { $sum: '$zomato.netSettlement' },
        fatafat: { $sum: '$fatafat.netSettlement' }
      }},
      { $sort: { _id: 1 } }
    ]);

    // 30-day expense trend
    const expenseTrend = await Payment.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo, $lt: tomorrow } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, amount: { $sum: '$amount' } } },
      { $sort: { _id: 1 } }
    ]);

    // Expense by category this month
    const expenseByCategory = await Payment.aggregate([
      { $match: { date: { $gte: monthStart, $lt: tomorrow } } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } }
    ]);

    const monthSales = monthSalesAgg[0] || { total: 0, outlet: 0, zomato: 0, fatafat: 0, other: 0 };
    const totalMonthExpenses = monthExpenses[0]?.total || 0;
    const rawMaterialsThisMonth = expenseByCategory.find(e => e._id === 'Raw Materials')?.total || 0;

    res.json({
      today: {
        sales: todaySales ? {
          outlet: todaySales.outletSales,
          zomato: todaySales.zomato?.netSettlement || 0,
          fatafat: todaySales.fatafat?.netSettlement || 0,
          other: todaySales.otherSales,
          total: todaySales.totalRevenue,
          paymentBreakdown: todaySales.paymentBreakdown,
        } : null,
        expenses: todayExpenses,
      },
      // ── Yesterday summary for the dashboard banner ─────────────
      yesterday: {
        date: yesterday,
        sales: yesterdaySales ? {
          outlet: yesterdaySales.outletSales,
          zomato: yesterdaySales.zomato?.netSettlement || 0,
          fatafat: yesterdaySales.fatafat?.netSettlement || 0,
          other: yesterdaySales.otherSales,
          total: yesterdaySales.totalRevenue,
        } : null,
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
      },
      accounts,
      inventoryValue,
      lowStockCount,
      supplierDues: supplierDues[0]?.total || 0,
      charts: { salesTrend, expenseTrend, expenseByCategory }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;