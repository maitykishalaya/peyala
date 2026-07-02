// ─────────────────────────────────────────────────────────────────
// Sales Route
//
// Key behaviours:
//
// 1. OUTLET SALES AUTO-CALCULATION
//    outletSales = cash + upi + card + bankTransfer (from paymentBreakdown)
//    totalRevenue = outletSales + zomato.netSettlement + fatafat.netSettlement + otherSales
//    Both calculated BEFORE saving so totalRevenue is never 0.
//
// 2. AUTO ACCOUNT CREDIT ON OUTLET SALES
//    When outlet sales are entered:
//      cash portion   → credited to the Cash account (type='cash')
//      upi/card/bank  → credited to the Bank/Digital account (type='bank' or 'digital')
//    We find accounts by type automatically — no manual account selection needed.
//    On UPDATE we reverse the old credits first, then apply new ones.
//    On DELETE we reverse all credits.
//
// 3. AUTO GST
//    4.77% of outletSales added to balance sheet GST liability (same as before).
//
// 4. Swiggy renamed to Fatafat throughout.
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const SalesEntry = require('../models/SalesEntry');
const Account = require('../models/Account');
const BalanceSheet = require('../models/BalanceSheet');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);


// ── Helper: apply GST delta to balance sheet ──────────────────────
// positive delta = add to GST, negative = reverse/reduce GST
async function applyGstDelta(delta, salesEntryId, date, userName, note) {
  if (delta === 0) return;
  const bs = await BalanceSheet.getSingleton();
  bs.gstLiability = Math.max(0, bs.gstLiability + delta);
  bs.gstLog.push({
    date: date ? new Date(date) : new Date(),
    salesEntryId,
    gstAdded: delta,
    note: note || `GST ${delta >= 0 ? 'added' : 'reversed'}: ₹${Math.abs(delta)}`,
  });
  bs.lastUpdated = new Date();
  bs.lastUpdatedBy = userName;
  await bs.save();
}


// ── Helper: credit outlet sales amounts to the right accounts ─────
// cash → first active 'cash' type account (Cash Counter)
// upi + card + bankTransfer → first active 'bank' or 'digital' account (Current Account)
// multiplier = +1 for credit (new sale), -1 for reversal (edit/delete)
async function applyAccountCredits(paymentBreakdown, multiplier) {
  const pb = paymentBreakdown || {};
  const cashAmount = (pb.cash || 0) * multiplier;
  const digitalAmount = ((pb.upi || 0) + (pb.card || 0) + (pb.bankTransfer || 0)) * multiplier;

  // Credit cash to the Cash Counter (first cash-type account)
  if (cashAmount !== 0) {
    const cashAccount = await Account.findOne({ type: 'cash', isActive: true }).sort('name');
    if (cashAccount) {
      await Account.findByIdAndUpdate(cashAccount._id, {
        $inc: { currentBalance: cashAmount }
      });
    }
  }

  // Credit UPI/Card/Bank to Current Account (first bank or digital account)
  if (digitalAmount !== 0) {
    const bankAccount = await Account.findOne({ type: { $in: ['bank', 'digital'] }, isActive: true }).sort('name');
    if (bankAccount) {
      await Account.findByIdAndUpdate(bankAccount._id, {
        $inc: { currentBalance: digitalAmount }
      });
    }
  }
}


// ── Helper: credit Zomato/Fatafat/other sales to chosen accounts ───
async function applyNonOutletCredits(sale, multiplier) {
  if (!sale) return;

  const platformCredits = [
    { amount: sale.zomato?.netSettlement || 0, accountId: sale.zomato?.receivedIn },
    { amount: sale.fatafat?.netSettlement || 0, accountId: sale.fatafat?.receivedIn },
  ];

  for (const credit of platformCredits) {
    if (credit.amount !== 0 && credit.accountId) {
      await Account.findByIdAndUpdate(credit.accountId, {
        $inc: { currentBalance: credit.amount * multiplier }
      });
    }
  }

  if ((sale.otherSales || 0) !== 0 && sale.otherSalesReceivedIn) {
    await Account.findByIdAndUpdate(sale.otherSalesReceivedIn, {
      $inc: { currentBalance: (sale.otherSales || 0) * multiplier }
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
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate + 'T23:59:59');
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
    res.json({ sales, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── GET /api/sales/today ──────────────────────────────────────────
router.get('/today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const sales = await SalesEntry.findOne({ date: { $gte: today, $lt: tomorrow } })
      .populate('createdBy', 'name')
      .populate({ path: 'zomato.receivedIn', select: 'name' })
      .populate({ path: 'fatafat.receivedIn', select: 'name' })
      .populate({ path: 'otherSalesReceivedIn', select: 'name' });
    res.json(sales || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── POST /api/sales ───────────────────────────────────────────────
// Create a new sales entry.
// Auto-calculates outletSales and totalRevenue before saving.
// Credits account balances based on payment breakdown.
router.post('/', async (req, res) => {
  try {
    // STEP 1: Calculate outletSales and totalRevenue from the submitted data
    const payload = normalizeSaleAccountIds(req.body);
    const { outletSales, totalRevenue } = SalesEntry.calcTotals(payload);

    // STEP 2: Save with calculated totals overriding whatever was sent
    const sale = await SalesEntry.create({
      ...payload,
      outletSales,      // auto-calculated from payment breakdown
      totalRevenue,     // auto-calculated from all channels
      createdBy: req.user._id,
    });

    // STEP 3: Credit account balances from outlet payment breakdown
    // cash → Cash Counter, upi/card/bank → Current Account
    await applyAccountCredits(req.body.paymentBreakdown, +1);

    // STEP 4: Credit Zomato/Fatafat/Other sales into chosen accounts
    await applyNonOutletCredits({
      zomato: req.body.zomato,
      fatafat: req.body.fatafat,
      otherSales: req.body.otherSales,
      otherSalesReceivedIn: req.body.otherSalesReceivedIn,
    }, +1);

    // STEP 5: Add 4.77% GST on outlet sales to balance sheet
    if (outletSales > 0) {
      const gstToAdd = Math.round(outletSales * 0.0477 * 100) / 100;
      await applyGstDelta(gstToAdd, sale._id, req.body.date, req.user.name,
        `Auto: 4.77% GST on ₹${outletSales} outlet sales (${req.body.date})`);
    }

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Sales',
      description: `${req.user.name} added sales entry for ${req.body.date} — Total: ₹${totalRevenue} (Outlet: ₹${outletSales})`,
    });

    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// ── PUT /api/sales/:id ────────────────────────────────────────────
// Update an existing sales entry.
// Reverses old account credits and GST, applies new ones.
router.put('/:id', async (req, res) => {
  try {
    // Fetch the OLD entry before updating so we can reverse its effects
    const oldSale = await SalesEntry.findById(req.params.id);
    const oldOutletSales = oldSale?.outletSales || 0;

    // STEP 1: Reverse OLD account credits
    if (oldSale?.paymentBreakdown) {
      await applyAccountCredits(oldSale.paymentBreakdown, -1);
    }
    await applyNonOutletCredits(oldSale, -1);

    // STEP 2: Calculate new totals
    const payload = normalizeSaleAccountIds(req.body);
    const { outletSales, totalRevenue } = SalesEntry.calcTotals(payload);

    // STEP 3: Save updated entry with recalculated totals
    const sale = await SalesEntry.findByIdAndUpdate(
      req.params.id,
      { ...payload, outletSales, totalRevenue },
      { new: true, runValidators: true }
    );

    // STEP 4: Apply NEW account credits
    await applyAccountCredits(req.body.paymentBreakdown, +1);
    await applyNonOutletCredits({
      zomato: req.body.zomato,
      fatafat: req.body.fatafat,
      otherSales: req.body.otherSales,
      otherSalesReceivedIn: req.body.otherSalesReceivedIn,
    }, +1);

    // STEP 5: Adjust GST for difference in outlet sales
    const oldGst = Math.round(oldOutletSales * 0.0477 * 100) / 100;
    const newGst = Math.round(outletSales * 0.0477 * 100) / 100;
    const gstDelta = newGst - oldGst;
    if (gstDelta !== 0) {
      await applyGstDelta(gstDelta, sale._id, req.body.date, req.user.name,
        `Edit: GST adjusted ₹${gstDelta > 0 ? '+' : ''}${gstDelta} (outlet: ₹${oldOutletSales}→₹${outletSales})`);
    }

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Sales',
      description: `${req.user.name} updated sales — Total: ₹${totalRevenue} (Outlet: ₹${oldOutletSales}→₹${outletSales})`,
    });

    res.json(sale);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// ── DELETE /api/sales/:id ─────────────────────────────────────────
// Delete a sales entry.
// Reverses account credits and GST.
router.delete('/:id', async (req, res) => {
  try {
    const sale = await SalesEntry.findById(req.params.id);
    const outletSales = sale?.outletSales || 0;

    // Reverse account credits
    if (sale?.paymentBreakdown) {
      await applyAccountCredits(sale.paymentBreakdown, -1);
    }
    await applyNonOutletCredits(sale, -1);

    await SalesEntry.findByIdAndDelete(req.params.id);

    // Reverse GST
    if (outletSales > 0) {
      const gstToReverse = -(Math.round(outletSales * 0.0477 * 100) / 100);
      await applyGstDelta(gstToReverse, req.params.id, sale.date, req.user.name,
        `Reversal: sales entry deleted (outlet was ₹${outletSales})`);
    }

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Sales',
      description: `${req.user.name} deleted sales entry. GST reversed by ₹${Math.round(outletSales * 0.0477 * 100) / 100}`,
    });

    res.json({ message: 'Sales entry deleted, accounts reversed, GST reversed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
