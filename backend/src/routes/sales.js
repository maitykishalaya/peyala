// ─────────────────────────────────────────────────────────────────
// Sales Route
//
// Key behaviours:
//
// 1. OUTLET SALES FROM ORDERS ONLY
//    Outlet sales and paymentBreakdown (cash, upi, card, due, bankTransfer)
//    can ONLY be added/updated through settled POS Orders.
//    reconcileDailySales() automatically synchronizes the daily SalesEntry
//    with all settled orders in Indian Standard Time (IST).
//
// 2. NO MANUAL 4.77% GST CALCULATION
//    GST is calculated and logged strictly at the order level when orders
//    are settled or modified. Sales routes do not add 4.77% GST.
//
// 3. NON-OUTLET CHANNELS (Zomato, Fatafat, Other Sales)
//    Entered when payouts/receipts arrive.
//    Net settlements credit the designated accounts.
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const SalesEntry = require('../models/SalesEntry');
const Order = require('../models/Order');
const Account = require('../models/Account');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { getIstDayRange } = require('../utils/date');
const { reconcileDailySales } = require('../utils/salesReconciler');

router.use(auth);


// ── Helper: credit Zomato/Fatafat/other sales to chosen accounts ───
// multiplier = +1 for credit (new sale), -1 for reversal (edit/delete)
async function applyNonOutletCredits(sale, multiplier) {
  if (!sale) return;

  const platformCredits = [
    { amount: sale.zomato?.netSettlement || 0, accountId: sale.zomato?.receivedIn },
    { amount: sale.fatafat?.netSettlement || 0, accountId: sale.fatafat?.receivedIn },
  ];

  for (const credit of platformCredits) {
    if (credit.amount !== 0 && credit.accountId) {
      await Account.findByIdAndUpdate(credit.accountId, {
        $inc: { currentBalance: credit.amount * multiplier },
      });
    }
  }

  if ((sale.otherSales || 0) !== 0 && sale.otherSalesReceivedIn) {
    await Account.findByIdAndUpdate(sale.otherSalesReceivedIn, {
      $inc: { currentBalance: (sale.otherSales || 0) * multiplier },
    });
  }
}

function normalizeSaleAccountIds(data) {
  if (!data) return data;

  const normalized = { ...data };
  if (normalized.zomato) {
    normalized.zomato = { ...normalized.zomato };
    if (!normalized.zomato.receivedIn) normalized.zomato.receivedIn = undefined;
  }
  if (normalized.fatafat) {
    normalized.fatafat = { ...normalized.fatafat };
    if (!normalized.fatafat.receivedIn) normalized.fatafat.receivedIn = undefined;
  }
  if (!normalized.otherSalesReceivedIn) normalized.otherSalesReceivedIn = undefined;
  return normalized;
}


// ── GET /api/sales ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = getIstDayRange(startDate).start;
      if (endDate) filter.date.$lte = getIstDayRange(endDate).end;
    }
    const total = await SalesEntry.countDocuments(filter);
    const sales = await SalesEntry.find(filter)
      .populate('createdBy', 'name')
      .populate({ path: 'zomato.receivedIn', select: 'name' })
      .populate({ path: 'fatafat.receivedIn', select: 'name' })
      .populate({ path: 'otherSalesReceivedIn', select: 'name' })
      .sort('-date')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const isViewer = req.user?.role === 'viewer';
    const safeSales = isViewer
      ? sales.map(s => {
          const obj = s.toObject ? s.toObject() : { ...s };
          return {
            ...obj,
            outletSales: null,
            otherSales: null,
            totalRevenue: null,
            paymentBreakdown: {
              cash: null,
              upi: null,
              card: null,
              bankTransfer: null,
              due: null,
            },
            zomato: obj.zomato ? {
              ...obj.zomato,
              grossSales: null,
              platformDiscount: null,
              restaurantDiscount: null,
              commission: null,
              gst: null,
              netSettlement: null,
            } : obj.zomato,
            fatafat: obj.fatafat ? {
              ...obj.fatafat,
              grossSales: null,
              platformDiscount: null,
              restaurantDiscount: null,
              commission: null,
              gst: null,
              netSettlement: null,
            } : obj.fatafat,
          };
        })
      : sales;

    res.json({ sales: safeSales, total, page: Number(page), pages: Math.ceil(total / limit), isViewerDemo: isViewer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── GET /api/sales/today ──────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    const { start, end } = getIstDayRange(new Date());

    // Keep today's SalesEntry freshly synchronized with today's orders
    await reconcileDailySales(new Date(), req.user?._id);

    const sales = await SalesEntry.findOne({ date: { $gte: start, $lte: end } })
      .populate('createdBy', 'name')
      .populate({ path: 'zomato.receivedIn', select: 'name' })
      .populate({ path: 'fatafat.receivedIn', select: 'name' })
      .populate({ path: 'otherSalesReceivedIn', select: 'name' });

    if (req.user?.role === 'viewer') {
      return res.json(null);
    }
    res.json(sales || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── POST /api/sales ───────────────────────────────────────────────
// Create or update non-outlet sales channels for a day (Zomato, Fatafat, Other sales).
// Outlet sales can ONLY come from orders.
router.post('/', async (req, res) => {
  try {
    const targetDate = req.body.date || new Date();
    const { start, end, canonicalDate } = getIstDayRange(targetDate);

    // Synchronize outlet sales and breakdown from orders for this calendar day
    await reconcileDailySales(targetDate, req.user._id);

    // Locate the entry for this day
    const existingEntry = await SalesEntry.findOne({ date: { $gte: start, $lte: end } });
    const payload = normalizeSaleAccountIds(req.body);

    if (existingEntry) {
      // Reverse old non-outlet credits
      await applyNonOutletCredits(existingEntry, -1);

      const outletSales = existingEntry.outletSales || 0;
      const totalRevenue = Math.round(
        (outletSales
          + (payload.zomato?.netSettlement || 0)
          + (payload.fatafat?.netSettlement || 0)
          + (payload.otherSales || 0)) * 100
      ) / 100;

      const updated = await SalesEntry.findByIdAndUpdate(
        existingEntry._id,
        {
          zomato: payload.zomato,
          fatafat: payload.fatafat,
          otherSales: payload.otherSales || 0,
          otherSalesReceivedIn: payload.otherSalesReceivedIn,
          otherSalesDescription: payload.otherSalesDescription,
          notes: payload.notes,
          date: canonicalDate,
          totalRevenue,
        },
        { new: true, runValidators: true }
      );

      // Apply new non-outlet credits
      await applyNonOutletCredits(payload, +1);

      await log({
        user: req.user,
        action: 'UPDATE',
        module: 'Sales',
        description: `${req.user.name} updated sales entry for ${req.body.date} — Total: ₹${totalRevenue} (Outlet: ₹${outletSales})`,
      });

      return res.status(200).json(updated);
    }

    // No existing entry for this day -> create new
    const totalRevenue = Math.round(
      ((payload.zomato?.netSettlement || 0)
        + (payload.fatafat?.netSettlement || 0)
        + (payload.otherSales || 0)) * 100
    ) / 100;

    const sale = await SalesEntry.create({
      date: canonicalDate,
      outletSales: 0,
      paymentBreakdown: { cash: 0, upi: 0, card: 0, due: 0, bankTransfer: 0 },
      zomato: payload.zomato,
      fatafat: payload.fatafat,
      otherSales: payload.otherSales || 0,
      otherSalesReceivedIn: payload.otherSalesReceivedIn,
      otherSalesDescription: payload.otherSalesDescription,
      notes: payload.notes,
      totalRevenue,
      createdBy: req.user._id,
    });

    await applyNonOutletCredits(payload, +1);

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Sales',
      description: `${req.user.name} added sales entry for ${req.body.date} — Total: ₹${totalRevenue}`,
    });

    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// ── PUT /api/sales/:id ────────────────────────────────────────────
// Update an existing sales entry (Zomato, Fatafat, Other sales, Notes).
// Outlet sales are preserved from orders.
router.put('/:id', async (req, res) => {
  try {
    const oldSale = await SalesEntry.findById(req.params.id);
    if (!oldSale) {
      return res.status(404).json({ message: 'Sales entry not found' });
    }

    // Reverse old non-outlet credits
    await applyNonOutletCredits(oldSale, -1);

    // Reconcile outlet sales from orders for this entry's date
    await reconcileDailySales(oldSale.date, req.user._id);
    const freshSale = await SalesEntry.findById(req.params.id);

    const payload = normalizeSaleAccountIds(req.body);
    const outletSales = freshSale ? freshSale.outletSales : (oldSale.outletSales || 0);
    const paymentBreakdown = freshSale ? freshSale.paymentBreakdown : oldSale.paymentBreakdown;

    const totalRevenue = Math.round(
      (outletSales
        + (payload.zomato?.netSettlement || 0)
        + (payload.fatafat?.netSettlement || 0)
        + (payload.otherSales || 0)) * 100
    ) / 100;

    const sale = await SalesEntry.findByIdAndUpdate(
      req.params.id,
      {
        zomato: payload.zomato,
        fatafat: payload.fatafat,
        otherSales: payload.otherSales || 0,
        otherSalesReceivedIn: payload.otherSalesReceivedIn,
        otherSalesDescription: payload.otherSalesDescription,
        notes: payload.notes,
        outletSales,
        paymentBreakdown,
        totalRevenue,
      },
      { new: true, runValidators: true }
    );

    // Apply new non-outlet credits
    await applyNonOutletCredits(payload, +1);

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Sales',
      description: `${req.user.name} updated sales entry — Total: ₹${totalRevenue} (Outlet: ₹${outletSales})`,
    });

    res.json(sale);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// ── DELETE /api/sales/:id ─────────────────────────────────────────
// Cleans up non-outlet sales for this entry.
// If POS orders exist for this day, outlet sales are retained.
router.delete('/:id', async (req, res) => {
  try {
    const sale = await SalesEntry.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Entry not found' });

    // Reverse non-outlet credits
    await applyNonOutletCredits(sale, -1);

    // Check if orders exist for this day
    const { start, end } = getIstDayRange(sale.date);
    const orderCount = await Order.countDocuments({
      status: 'paid',
      $or: [
        { paidAt: { $gte: start, $lte: end } },
        { paidAt: null, createdAt: { $gte: start, $lte: end } },
        { paidAt: { $exists: false }, createdAt: { $gte: start, $lte: end } },
      ],
    });

    if (orderCount > 0) {
      // Re-sync with orders and reset non-outlet channels
      sale.zomato = undefined;
      sale.fatafat = undefined;
      sale.otherSales = 0;
      sale.otherSalesReceivedIn = undefined;
      sale.otherSalesDescription = '';
      sale.notes = '';
      sale.totalRevenue = sale.outletSales;
      await sale.save();
    } else {
      await SalesEntry.findByIdAndDelete(req.params.id);
    }

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Sales',
      description: `${req.user.name} removed non-outlet sales channels for ${sale.date}`,
    });

    res.json({ message: 'Sales entry updated/deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
