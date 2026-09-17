// Reports Route — P&L and daily report
const router = require('express').Router();
const SalesEntry = require('../models/SalesEntry');
const Payment = require('../models/Payment');
const PurchaseEntry = require('../models/PurchaseEntry');
const InventoryItem = require('../models/InventoryItem');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Wastage = require('../models/Wastage');
const { auth } = require('../middleware/auth');
const { getIstDayRange } = require('../utils/date');

router.use(auth);

// P&L for a date range
router.get('/pnl', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const nowRange = getIstDayRange(new Date());
    const [y, m] = nowRange.istDateStr.split('-').map(Number);
    const defaultStart = getIstDayRange(`${y}-${String(m).padStart(2, '0')}-01`).start;
    const defaultEnd = nowRange.end;

    let start = defaultStart;
    if (startDate && String(startDate).trim()) {
      try {
        start = getIstDayRange(String(startDate).trim()).start;
      } catch {
        start = new Date(startDate);
      }
    }

    let end = defaultEnd;
    if (endDate && String(endDate).trim()) {
      try {
        end = getIstDayRange(String(endDate).trim()).end;
      } catch {
        end = new Date(String(endDate).trim() + 'T23:59:59.999');
      }
    }

    const [salesAgg, expensesByCat, dailySalesAgg, wastageAgg] = await Promise.all([
      SalesEntry.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: {
          _id: null,
          outlet: { $sum: '$outletSales' },
          zomato: { $sum: '$zomato.netSettlement' },
          fatafat: { $sum: '$fatafat.netSettlement' },
          other: { $sum: '$otherSales' },
          total: { $sum: '$totalRevenue' }
        }}
      ]),
      Payment.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),
      SalesEntry.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: '+05:30' } },
          outlet: { $sum: '$outletSales' },
          zomato: { $sum: '$zomato.netSettlement' },
          fatafat: { $sum: '$fatafat.netSettlement' },
          other: { $sum: '$otherSales' },
          total: { $sum: '$totalRevenue' }
        }},
        { $sort: { _id: 1 } }
      ]),
      Wastage.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: {
          _id: null,
          total: { $sum: '$approxValue' },
          totalQty: { $sum: '$quantity' },
          count: { $sum: 1 }
        }}
      ])
    ]);

    const wastageResult = wastageAgg[0] || { total: 0, totalQty: 0, count: 0 };
    const wastage = {
      total: wastageResult.total || 0,
      totalQty: wastageResult.totalQty || 0,
      count: wastageResult.count || 0
    };

    // Build complete daily sales timeline for the selected period
    const dailyMap = new Map();
    dailySalesAgg.forEach(d => {
      if (d._id) dailyMap.set(d._id, d);
    });

    let dailySales = [];
    if (startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(startDate).trim()) && /^\d{4}-\d{2}-\d{2}$/.test(String(endDate).trim())) {
      const [sy, sm, sd] = String(startDate).trim().split('-').map(Number);
      const [ey, em, ed] = String(endDate).trim().split('-').map(Number);
      const startUtc = Date.UTC(sy, sm - 1, sd);
      const endUtc = Date.UTC(ey, em - 1, ed);
      const diffDays = Math.round((endUtc - startUtc) / 86400000) + 1;

      if (diffDays > 0 && diffDays <= 62) {
        for (let i = 0; i < diffDays; i++) {
          const dObj = new Date(startUtc + i * 86400000);
          const dateStr = dObj.toISOString().split('T')[0];
          const entry = dailyMap.get(dateStr);
          dailySales.push({
            date: dateStr,
            total: entry?.total || 0,
            outlet: entry?.outlet || 0,
            zomato: entry?.zomato || 0,
            fatafat: entry?.fatafat || 0,
            other: entry?.other || 0
          });
        }
      } else {
        dailySales = dailySalesAgg.map(d => ({
          date: d._id,
          total: d.total || 0,
          outlet: d.outlet || 0,
          zomato: d.zomato || 0,
          fatafat: d.fatafat || 0,
          other: d.other || 0
        }));
      }
    } else {
      dailySales = dailySalesAgg.map(d => ({
        date: d._id,
        total: d.total || 0,
        outlet: d.outlet || 0,
        zomato: d.zomato || 0,
        fatafat: d.fatafat || 0,
        other: d.other || 0
      }));
    }

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

    const isViewer = req.user?.role === 'viewer';

    if (isViewer) {
      return res.json({
        period: { start, end },
        income: {
          outlet: null,
          zomato: null,
          fatafat: null,
          other: null,
          total: null,
        },
        expenses: {
          rawMaterials: null,
          byCategory: [],
          total: null,
        },
        wastage: { total: null, count: wastage?.count || 0, totalQty: wastage?.totalQty || 0 },
        dailySales: [],
        grossProfit: null,
        netProfit: null,
        grossMargin: null,
        netMargin: null,
        isViewerDemo: true,
      });
    }

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
      wastage,
      dailySales,
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
    const { start, end } = getIstDayRange(date || new Date());

    const [sales, purchases, payments] = await Promise.all([
      SalesEntry.findOne({ date: { $gte: start, $lte: end } }),
      PurchaseEntry.find({ date: { $gte: start, $lte: end } }).populate('supplier', 'name').populate('items.item', 'name'),
      Payment.find({ date: { $gte: start, $lte: end } }).populate('paidFrom', 'name'),
    ]);

    const totalExpenses = payments.reduce((s, p) => s + p.amount, 0) + purchases.reduce((s, p) => s + p.totalAmount, 0);
    const isViewer = req.user?.role === 'viewer';

    if (isViewer) {
      return res.json({
        date,
        sales: null,
        purchases: purchases.map(p => ({
          ...p.toObject(),
          totalAmount: null,
          items: p.items.map(it => ({ ...it.toObject(), price: null, totalPrice: null }))
        })),
        payments: payments.map(p => ({
          ...p.toObject(),
          amount: null,
        })),
        totalRevenue: null,
        totalExpenses: null,
        netProfit: null,
        isViewerDemo: true,
      });
    }

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

    const isViewer = req.user?.role === 'viewer';

    const safeOrders = isViewer
      ? paginatedOrders.map(o => ({
          ...o,
          subtotal: null,
          taxAmount: null,
          discount: null,
          waivedAmount: null,
          total: null,
          settledAmount: null,
          items: o.items?.map(it => ({
            ...it,
            price: null,
            totalPrice: null,
          })),
        }))
      : paginatedOrders;

    const safeSummary = isViewer
      ? {
          totalOrders: filteredOrders.length,
          totalGrossSales: null,
          totalTax: null,
          totalDiscount: null,
          totalWaived: null,
          totalSettled: null,
          paymentBreakdown: {
            cash: null,
            upi: null,
            card: null,
            other: null,
          },
        }
      : {
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
        };

    res.json({
      summary: safeSummary,
      orders: safeOrders,
      totalCount: filteredOrders.length,
      page: pageNum,
      totalPages: Math.ceil(filteredOrders.length / limitNum) || 1,
      isViewerDemo: isViewer,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
