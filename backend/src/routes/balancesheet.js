// ─────────────────────────────────────────────────────────────────
// Balance Sheet Route
// Handles reading and updating the balance sheet.
//
// Endpoints:
//   GET  /api/balancesheet          → full balance sheet with live totals
//   PUT  /api/balancesheet          → update config (accounts, GST, liabilities)
//   POST /api/balancesheet/pay-gst  → record GST payment, reset liability to 0
//   POST /api/balancesheet/add-gst  → manually add to GST (called from sales route)
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const BalanceSheet = require('../models/BalanceSheet');
const Account = require('../models/Account');
const Supplier = require('../models/Supplier');
const PurchaseEntry = require('../models/PurchaseEntry');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

// All routes require authentication
router.use(auth);


// ── GET /api/balancesheet ─────────────────────────────────────────
// Returns the full balance sheet with all calculated totals.
// This is what the frontend Balance Sheet page displays.
router.get('/', async (req, res) => {
  try {
    // Get or create the singleton balance sheet document
    const bs = await BalanceSheet.getSingleton();

    // ── ASSETS: fetch live balances for chosen accounts ──────────
    // We populate the account IDs to get their current balances
    const assetAccounts = await Account.find({
      _id: { $in: bs.assetAccountIds },
      isActive: true
    }).select('name type currentBalance color');

    // Sum up all asset account balances
    const totalAssets = assetAccounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

    // ── LIABILITIES: GST + supplier dues + custom ────────────────

    // 1. GST liability (stored value, auto-accumulated from sales)
    const gstLiability = bs.gstLiability;

    // 2. Supplier dues — sum of outstanding across all suppliers
    //    Only included if user has toggled includeSupplierDues = true
    let supplierDuesTotal = 0;
    let supplierDuesBreakdown = [];
    if (bs.includeSupplierDues) {
      const suppliers = await Supplier.find({ isActive: true });
      supplierDuesBreakdown = suppliers
        .map(s => ({
          name: s.name,
          // outstanding = opening balance + total purchased - total paid
          outstanding: (s.openingBalance || 0) + (s.totalPurchased || 0) - (s.totalPaid || 0)
        }))
        .filter(s => s.outstanding > 0); // only show suppliers with dues
      supplierDuesTotal = supplierDuesBreakdown.reduce((sum, s) => sum + s.outstanding, 0);
    }

    // 3. Custom liabilities added manually by user
    const customTotal = bs.customLiabilities.reduce((sum, l) => sum + l.amount, 0);

    // Total liabilities = GST + supplier dues + custom
    const totalLiabilities = gstLiability + supplierDuesTotal + customTotal;

    const gstPaidAggregate = await PurchaseEntry.aggregate([
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, totalGstPaid: { $sum: { $ifNull: ['$items.gstAmount', 0] } } } }
    ]);
    const purchaseGstPaidTotal = gstPaidAggregate[0]?.totalGstPaid || 0;

    // ── EQUITY: auto-calculated ──────────────────────────────────
    // Equity = Total Assets − Total Liabilities
    // Positive = business is solvent
    // Negative = liabilities exceed assets (warning state)
    const equity = totalAssets - totalLiabilities;

    // ── Return full balance sheet ────────────────────────────────
    res.json({
      // Config / stored data
      assetAccountIds: bs.assetAccountIds,          // which account IDs are selected
      includeSupplierDues: bs.includeSupplierDues,
      customLiabilities: bs.customLiabilities,
      gstLog: bs.gstLog.slice(-30),                 // last 30 GST entries for transparency

      // Live calculated data
      assets: {
        accounts: assetAccounts,                    // [{name, type, currentBalance, color}]
        total: totalAssets,
      },
      liabilities: {
        gst: gstLiability,                          // ₹ amount of accumulated GST
        supplierDues: {
          total: supplierDuesTotal,
          breakdown: supplierDuesBreakdown,         // per-supplier breakdown
        },
        custom: bs.customLiabilities,
        total: totalLiabilities,
      },
      purchaseGstPaidTotal,
      showPurchaseGstPaid: bs.showPurchaseGstPaid,
      equity: {
        value: equity,                              // Assets - Liabilities
        isPositive: equity >= 0,
      },
      lastUpdated: bs.lastUpdated,
      lastUpdatedBy: bs.lastUpdatedBy,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── PUT /api/balancesheet ─────────────────────────────────────────
// Update balance sheet configuration.
// Used when user:
//   - Adds/removes accounts from assets
//   - Manually edits GST liability amount
//   - Adds/removes custom liability rows
//   - Toggles supplier dues inclusion
router.put('/', async (req, res) => {
  try {
    const bs = await BalanceSheet.getSingleton();

    const {
      assetAccountIds,
      gstLiability,
      includeSupplierDues,
      customLiabilities,
      showPurchaseGstPaid,
    } = req.body;

    const mongoose = require('mongoose');

    // Cast assetAccountIds strings → ObjectIds so Account.find({ $in }) works correctly
    if (assetAccountIds !== undefined) {
      bs.assetAccountIds = assetAccountIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
    }
    if (gstLiability !== undefined) bs.gstLiability = Number(gstLiability);
    if (includeSupplierDues !== undefined) bs.includeSupplierDues = includeSupplierDues;
    if (showPurchaseGstPaid !== undefined) bs.showPurchaseGstPaid = !!showPurchaseGstPaid;
    if (customLiabilities !== undefined) bs.customLiabilities = customLiabilities;

    bs.lastUpdated = new Date();
    bs.lastUpdatedBy = req.user.name;

    await bs.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'BalanceSheet',
      description: `${req.user.name} updated balance sheet configuration`,
    });

    res.json({ message: 'Balance sheet updated', lastUpdated: bs.lastUpdated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


// ── POST /api/balancesheet/add-gst ───────────────────────────────
// Called automatically from the Sales route when outlet sales are saved.
// Adds 5% of outletSales to the GST liability.
// Also called manually if user wants to add a GST entry.
router.post('/add-gst', async (req, res) => {
  try {
    const { outletSales, salesEntryId, date, note } = req.body;

    // Calculate 5% GST on outlet sales
    const gstAmount = Math.round((outletSales * 0.05) * 100) / 100; // rounded to 2 decimals

    if (gstAmount <= 0) return res.json({ message: 'No GST to add', gstAdded: 0 });

    const bs = await BalanceSheet.getSingleton();

    // Add to accumulated GST liability
    bs.gstLiability += gstAmount;

    // Log this GST addition for audit trail
    bs.gstLog.push({
      date: date ? new Date(date) : new Date(),
      salesEntryId,
      outletSales,
      gstAdded: gstAmount,
      note: note || `Auto: 5% of ₹${outletSales} outlet sales`,
    });

    bs.lastUpdated = new Date();
    bs.lastUpdatedBy = req.user?.name || 'System';

    await bs.save();

    res.json({ message: 'GST added', gstAdded: gstAmount, totalGst: bs.gstLiability });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ── POST /api/balancesheet/pay-gst ───────────────────────────────
// Records a GST payment and resets the liability to zero.
// Also creates a Payment record so it shows in the Payments module.
router.post('/pay-gst', async (req, res) => {
  try {
    const { amount, paidFrom, date, notes } = req.body;

    const bs = await BalanceSheet.getSingleton();

    // The amount being paid (could be partial or full)
    const payAmount = amount || bs.gstLiability;

    // Reset GST liability to zero (or reduce by paid amount)
    bs.gstLiability = Math.max(0, bs.gstLiability - payAmount);

    // Log the GST payment in the gstLog
    bs.gstLog.push({
      date: date ? new Date(date) : new Date(),
      gstAdded: -payAmount,  // negative = reduction
      note: `GST Payment: ₹${payAmount} paid`,
    });

    bs.lastUpdated = new Date();
    bs.lastUpdatedBy = req.user.name;
    await bs.save();

    // Also create a payment record if paidFrom account is provided
    if (paidFrom) {
      const Payment = require('../models/Payment');
      const Account = require('../models/Account');
      await Payment.create({
        date: date ? new Date(date) : new Date(),
        paidFrom,
        payee: 'GST Department',
        category: 'GST Payment',
        description: notes || `GST payment — ₹${payAmount}`,
        amount: payAmount,
        paymentMode: 'bank_transfer',
        createdBy: req.user._id,
      });
      // Deduct from account
      await Account.findByIdAndUpdate(paidFrom, { $inc: { currentBalance: -payAmount } });
    }

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'BalanceSheet',
      description: `${req.user.name} recorded GST payment of ₹${payAmount}. Liability reset.`,
      metadata: { amount: payAmount, paidFrom },
    });

    res.json({
      message: 'GST payment recorded',
      amountPaid: payAmount,
      remainingGst: bs.gstLiability,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
