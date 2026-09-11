// Reports Route — P&L and daily report
const router = require('express').Router();
const SalesEntry = require('../models/SalesEntry');
const Payment = require('../models/Payment');
const PurchaseEntry = require('../models/PurchaseEntry');
const InventoryItem = require('../models/InventoryItem');
const Order = require('../models/Order');
const Table = require('../models/Table');
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

// Inventory purchase report — per item, quantity bought and money spent
// within a date range. Reads straight from PurchaseEntry line items.
router.get('/inventory-purchases', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = new Date(startDate);
    const end = new Date(endDate + 'T23:59:59');

    const rows = await PurchaseEntry.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.item',
        totalQuantity: { $sum: '$items.quantity' },
        totalSpent: { $sum: '$items.totalPrice' },
        purchaseCount: { $sum: 1 },
      }},
      { $sort: { totalSpent: -1 } },
    ]);

    const itemIds = rows.map(r => r._id).filter(Boolean);
    const items = await InventoryItem.find({ _id: { $in: itemIds } })
      .populate('category', 'name')
      .select('name unit category');
    const itemMap = items.reduce((map, i) => { map[i._id.toString()] = i; return map; }, {});

    const result = rows.map(r => {
      const item = itemMap[r._id?.toString()];
      return {
        itemId: r._id,
        name: item?.name || 'Deleted item',
        unit: item?.unit || '',
        category: item?.category?.name || '',
        totalQuantity: r.totalQuantity,
        totalSpent: r.totalSpent,
        purchaseCount: r.purchaseCount,
      };
    });

    res.json({ period: { start, end }, items: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Detailed Sales Report (Per-Order Audit Log) ────────────────────
router.get('/sales', async (req, res) => {
  try {
    const { startDate, endDate, paymentMethod, status, search, limit = 100, page = 1 } = req.query;

    const filter = {};

    // Date range filter on createdAt
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const [y, m, d] = startDate.split('-').map(Number);
        filter.createdAt.$gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - (5.5 * 3600 * 1000));
      }
      if (endDate) {
        const [y, m, d] = endDate.split('-').map(Number);
        filter.createdAt.$lte = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - (5.5 * 3600 * 1000));
      }
    }

    // Status filter (default: show paid, but allow user to filter all, billed, cancelled, etc.)
    if (status && status !== 'all') {
      filter.status = status;
    } else if (!status) {
      filter.status = 'paid';
    }

    // Payment method filter
    if (paymentMethod && paymentMethod !== 'all') {
      filter.paymentMethod = paymentMethod;
    }

    // Populate order details
    const allMatchingOrders = await Order.find(filter)
      .populate('table', 'tableNumber capacity')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // In-memory search for order number / table number / staff / items
    let filteredOrders = allMatchingOrders;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredOrders = allMatchingOrders.filter(o => {
        const orderNo = String(o.orderNumber || '').toLowerCase();
        const tableNo = String(o.table?.tableNumber || '').toLowerCase();
        const staff = String(o.createdBy?.name || '').toLowerCase();
        const itemMatch = o.items?.some(it => String(it.name || '').toLowerCase().includes(q));
        return orderNo.includes(q) || tableNo.includes(q) || staff.includes(q) || itemMatch;
      });
    }

    // Summary calculation
    let totalGrossSales = 0;
    let totalTax = 0;
    let totalDiscount = 0;
    let totalWaived = 0;
    let totalSettled = 0;
    const paymentBreakdown = { cash: 0, upi: 0, card: 0, other: 0 };

    for (const ord of filteredOrders) {
      totalGrossSales += (ord.subtotal || 0);
      totalTax += (ord.taxAmount || 0);
      totalDiscount += (ord.discount || 0);
      totalWaived += (ord.waivedAmount || 0);
      const settled = ord.settledAmount !== null && ord.settledAmount !== undefined
        ? ord.settledAmount
        : ord.total;
      totalSettled += settled;

      if (ord.paymentMethod === 'part' && ord.paymentBreakdown) {
        paymentBreakdown.cash += (ord.paymentBreakdown.cash || 0);
        paymentBreakdown.upi += (ord.paymentBreakdown.upi || 0);
        paymentBreakdown.card += (ord.paymentBreakdown.card || 0);
        paymentBreakdown.other += (ord.paymentBreakdown.other || 0);
      } else if (ord.paymentMethod && paymentBreakdown[ord.paymentMethod] !== undefined) {
        paymentBreakdown[ord.paymentMethod] += settled;
      } else if (ord.paymentMethod) {
        paymentBreakdown.other += settled;
      }
    }

    // Pagination
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 100);
    const paginatedOrders = filteredOrders.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      summary: {
        totalOrders: filteredOrders.length,
        totalGrossSales: Math.round(totalGrossSales * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        totalWaived: Math.round(totalWaived * 100) / 100,
        totalSettled: Math.round(totalSettled * 100) / 100,
        paymentBreakdown: {
          cash: Math.round(paymentBreakdown.cash * 100) / 100,
          upi: Math.round(paymentBreakdown.upi * 100) / 100,
          card: Math.round(paymentBreakdown.card * 100) / 100,
          other: Math.round(paymentBreakdown.other * 100) / 100,
        },
      },
      orders: paginatedOrders,
      totalCount: filteredOrders.length,
      page: pageNum,
      totalPages: Math.ceil(filteredOrders.length / limitNum) || 1,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
