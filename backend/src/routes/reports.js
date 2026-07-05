// Reports Route — P&L and daily report
const router = require('express').Router();
const SalesEntry = require('../models/SalesEntry');
const Payment = require('../models/Payment');
const PurchaseEntry = require('../models/PurchaseEntry');
const { auth } = require('../middleware/auth');

router.use(auth);

// P&L for a date range
router.get('/pnl', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate + 'T23:59:59');

    const salesAgg = await SalesEntry.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: {
        _id: null,
        outlet: { $sum: '$outletSales' },
        zomato: { $sum: '$zomato.netSettlement' },
        fatafat: { $sum: '$fatafat.netSettlement' },
        other: { $sum: '$otherSales' },
        total: { $sum: '$totalRevenue' }
      }}
    ]);

    const expensesByCat = await Payment.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]);

    // Raw Materials cost comes from Payments now (every purchase already
    // creates a matching Payment record under 'Raw Materials'), so we
    // read it from here instead of summing PurchaseEntry separately —
    // summing both was double-counting the same money.
    const totalExpenses = expensesByCat.reduce((s, e) => s + e.total, 0);
    const rawMaterialsEntry = expensesByCat.find(e => e._id === 'Raw Materials');
    const rawMaterials = rawMaterialsEntry?.total || 0;
    const sales = salesAgg[0] || { outlet: 0, zomato: 0, fatafat: 0, other: 0, total: 0 };
    const grossProfit = sales.total - rawMaterials;
    const netProfit = sales.total - totalExpenses;

    res.json({
      period: { start, end },
      income: {
        outlet: sales.outlet,
        zomato: sales.zomato,
        fatafat: sales.fatafat,
        other: sales.other,
        total: sales.total
      },
      expenses: { rawMaterials, byCategory: expensesByCat, total: totalExpenses },
      grossProfit,
      netProfit,
      grossMargin: sales.total > 0 ? ((grossProfit / sales.total) * 100).toFixed(1) : 0,
      netMargin: sales.total > 0 ? ((netProfit / sales.total) * 100).toFixed(1) : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message }); }
});

// Daily report
router.get('/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const day = new Date(date); day.setHours(0, 0, 0, 0);
    const next = new Date(day); next.setDate(next.getDate() + 1);

    const [sales, purchases, payments] = await Promise.all([
      SalesEntry.findOne({ date: { $gte: day, $lt: next } }),
      PurchaseEntry.find({ date: { $gte: day, $lt: next } }).populate('supplier', 'name').populate('items.item', 'name'),
      Payment.find({ date: { $gte: day, $lt: next } }).populate('paidFrom', 'name'),
    ]);

    const totalExpenses = payments.reduce((s, p) => s + p.amount, 0) + purchases.reduce((s, p) => s + p.totalAmount, 0);
    res.json({
      date,
      sales,
      purchases,
      payments,
      totalRevenue: sales?.totalRevenue || 0,
      totalExpenses,
      netProfit: (sales?.totalRevenue || 0) - totalExpenses
    });
  } catch (err) {
    res.status(500).json({ message: err.message }); }
});

module.exports = router;
