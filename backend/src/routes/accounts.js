// ─────────────────────────────────────────────────────────────────
// Accounts Route
// Added: GET /api/accounts/:id/ledger
// Returns ALL transactions for a specific account in chronological
// order — purchases paid from it, payments made from it, sales
// credited to it, and transfers in/out.
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const Account = require('../models/Account');
const PurchaseEntry = require('../models/PurchaseEntry');
const Payment = require('../models/Payment');
const Receipt = require('../models/Receipt');
const Transfer = require('../models/Transfer');
const SalesEntry = require('../models/SalesEntry');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// ── GET /api/accounts ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const accounts = await Account.find({ isActive: true }).sort('name');
    res.json(accounts);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/accounts/:id/payment-modes ───────────────────────────
router.get('/:id/payment-modes', async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json({
      allowedPaymentModes: account.allowedPaymentModes,
      defaultPaymentMode: account.defaultPaymentMode,
      accountType: account.type,
      accountName: account.name,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/accounts/:id/ledger ──────────────────────────────────
// Returns all transactions touching this account, sorted by date desc.
// Each transaction has: date, type, description, amount, direction (+/-)
router.get('/:id/ledger', async (req, res) => {
  try {
    const { page = 1, limit = 50, startDate, endDate } = req.query;
    const accountId = req.params.id;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate + 'T23:59:59');

    const dateQ = Object.keys(dateFilter).length ? { date: dateFilter } : {};

    // 1. Purchases paid FROM this account (money OUT)
    const purchases = await PurchaseEntry.find({ paidFrom: accountId, isPaid: true, ...dateQ })
      .populate('supplier', 'name')
      .select('date totalAmount supplier items paymentMode isPaid');

    // 2. Payments made FROM this account (money OUT)
    const payments = await Payment.find({ paidFrom: accountId, ...dateQ })
      .select('date amount payee category subcategory description paymentMode');

    // 3. Receipts INTO this account (money IN)
    const receipts = await Receipt.find({ receivedIn: accountId, ...dateQ })
      .select('date amount source category description');

    // 4. Transfers FROM this account (money OUT)
    const transfersOut = await Transfer.find({ fromAccount: accountId, ...dateQ })
      .populate('toAccount', 'name')
      .select('date amount toAccount description');

    // 5. Transfers INTO this account (money IN)
    const transfersIn = await Transfer.find({ toAccount: accountId, ...dateQ })
      .populate('fromAccount', 'name')
      .select('date amount fromAccount description');

    // 6. Sales credited to this account
    // Cash sales → cash-type accounts; digital sales → bank/digital accounts
    const account = await Account.findById(accountId);
    let salesCredits = [];
    if (account) {
      const allSales = await SalesEntry.find(dateQ).select('date paymentBreakdown outletSales totalRevenue');
      allSales.forEach(s => {
        const pb = s.paymentBreakdown || {};
        if (account.type === 'cash' && (pb).cash > 0) {
          salesCredits.push({ _id: s._id, date: s.date, amount: (pb).cash, description: 'Outlet Sales (Cash)', type: 'sale_credit' });
        } else if (['bank', 'digital'].includes(account.type)) {
          const digital = ((pb).upi || 0) + ((pb).card || 0) + ((pb).bankTransfer || 0);
          if (digital > 0) {
            salesCredits.push({ _id: s._id, date: s.date, amount: digital, description: 'Outlet Sales (UPI/Card/Bank)', type: 'sale_credit' });
          }
        }
      });
    }

    // Normalise all into a unified ledger format
    const ledger = [
      ...purchases.map((p) => ({
        id: p._id, date: p.date, type: 'purchase', direction: 'out',
        description: `Purchase from ${p.supplier?.name || 'Supplier'}`,
        amount: p.totalAmount, paymentMode: p.paymentMode,
        meta: `${p.items?.length || 0} items`,
      })),
      ...payments.map((p) => ({
        id: p._id, date: p.date, type: 'payment', direction: 'out',
        description: p.description || `Payment to ${p.payee}`,
        amount: p.amount, paymentMode: p.paymentMode,
        meta: `${p.category}${p.subcategory ? ' › ' + p.subcategory : ''}`,
      })),
      ...receipts.map((r) => ({
        id: r._id, date: r.date, type: 'receipt', direction: 'in',
        description: r.description || `Receipt from ${r.source}`,
        amount: r.amount, paymentMode: null,
        meta: r.category,
      })),
      ...transfersOut.map((t) => ({
        id: t._id, date: t.date, type: 'transfer_out', direction: 'out',
        description: `Transfer to ${t.toAccount?.name}`,
        amount: t.amount, paymentMode: null,
        meta: t.description || '',
      })),
      ...transfersIn.map((t) => ({
        id: t._id, date: t.date, type: 'transfer_in', direction: 'in',
        description: `Transfer from ${t.fromAccount?.name}`,
        amount: t.amount, paymentMode: null,
        meta: t.description || '',
      })),
      ...salesCredits.map((s) => ({
        id: s._id, date: s.date, type: 'sale_credit', direction: 'in',
        description: s.description,
        amount: s.amount, paymentMode: null,
        meta: 'Outlet Sales',
      })),
    ];

    // Sort by date descending (newest first)
    ledger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Paginate
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const total = ledger.length;
    const paginated = ledger.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    // Calculate running totals
    const totalIn = ledger.filter(l => l.direction === 'in').reduce((s, l) => s + l.amount, 0);
    const totalOut = ledger.filter(l => l.direction === 'out').reduce((s, l) => s + l.amount, 0);

    res.json({ ledger: paginated, total, page: pageNum, pages: Math.ceil(total / limitNum), totalIn, totalOut });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/accounts ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const account = await Account.create({ ...req.body, currentBalance: req.body.openingBalance || 0 });
    await log({ user: req.user, action: 'CREATE', module: 'Accounts', description: `${req.user.name} created account: ${account.name}` });
    res.status(201).json(account);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── PUT /api/accounts/:id ─────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existing = await Account.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Account not found' });

    const updateData = { ...req.body };

    // If openingBalance is being changed, adjust currentBalance by the same difference.
    // e.g. old opening = ₹0, new opening = ₹50,000
    //      currentBalance increases by ₹50,000 (the difference)
    // This preserves all transactions that have already moved the balance.
    if (req.body.openingBalance !== undefined) {
      const oldOpening = existing.openingBalance || 0;
      const newOpening = Number(req.body.openingBalance);
      const difference = newOpening - oldOpening;
      updateData.currentBalance = (existing.currentBalance || 0) + difference;
    }

    const account = await Account.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    await log({
      user: req.user, action: 'UPDATE', module: 'Accounts',
      description: `${req.user.name} updated account: ${account.name}` +
        (req.body.openingBalance !== undefined ? ` (opening balance changed to ₹${req.body.openingBalance})` : ''),
    });
    res.json(account);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── DELETE /api/accounts/:id ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const account = await Account.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    await log({ user: req.user, action: 'DELETE', module: 'Accounts', description: `${req.user.name} deactivated account: ${account.name}` });
    res.json({ message: 'Account deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
