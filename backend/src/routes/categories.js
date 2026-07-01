// ─────────────────────────────────────────────────────────────────
// Payment Categories Route
// Manage editable payment categories and subcategories.
// Also provides subcategory ledger (drill-down by subcategory).
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const PaymentCategory = require('../models/PaymentCategory');
const Payment = require('../models/Payment');
const { auth, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// ── GET /api/categories ───────────────────────────────────────────
// Returns all active payment categories with subcategories
router.get('/', async (req, res) => {
  try {
    const cats = await PaymentCategory.find({ isActive: true }).sort('order name');
    res.json(cats);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/categories/:id/ledger ───────────────────────────────
// Returns all payments under a category (or subcategory).
// Also calculates the total paid for this category/subcategory.
// This powers the "click on Joydev Mahato → see total paid" feature.
router.get('/:id/ledger', async (req, res) => {
  try {
    const { subcategory, page = 1, limit = 50, startDate, endDate } = req.query;
    const cat = await PaymentCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ message: 'Category not found' });

    // Build filter for payments in this category
    const filter = { category: cat.name };

    // If subcategory provided, filter to just that subcategory
    if (subcategory) filter.subcategory = subcategory;

    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate + 'T23:59:59');
    }

    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .populate('paidFrom', 'name')
      .sort('-date')
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    // Total paid across all time for this category/subcategory
    const totalPaid = await Payment.aggregate([
      { $match: { category: cat.name, ...(subcategory ? { subcategory } : {}) } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // If looking at a category (not subcategory), also return subcategory totals
    let subcategoryTotals = [];
    if (!subcategory) {
      subcategoryTotals = await Payment.aggregate([
        { $match: { category: cat.name, subcategory: { $exists: true, $ne: '' } } },
        { $group: { _id: '$subcategory', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]);
    }

    res.json({
      category: cat,
      payments,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      totalPaid: totalPaid[0]?.total || 0,
      subcategoryTotals,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/categories ──────────────────────────────────────────
// Create a new payment category
router.post('/', async (req, res) => {
  try {
    const cat = await PaymentCategory.create(req.body);
    await log({ user: req.user, action: 'CREATE', module: 'Categories', description: `${req.user.name} created category: ${cat.name}` });
    res.status(201).json(cat);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── PUT /api/categories/:id ───────────────────────────────────────
// Update a category (name, subcategories, icon, color)
router.put('/:id', async (req, res) => {
  try {
    const cat = await PaymentCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    await log({ user: req.user, action: 'UPDATE', module: 'Categories', description: `${req.user.name} updated category: ${cat.name}` });
    res.json(cat);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── POST /api/categories/:id/subcategories ────────────────────────
// Add a subcategory to an existing category
router.post('/:id/subcategories', async (req, res) => {
  try {
    const { name } = req.body;
    const cat = await PaymentCategory.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { subcategories: name } }, // $addToSet prevents duplicates
      { new: true }
    );
    res.json(cat);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── DELETE /api/categories/:id/subcategories/:name ────────────────
// Remove a subcategory from a category
router.delete('/:id/subcategories/:name', async (req, res) => {
  try {
    const cat = await PaymentCategory.findByIdAndUpdate(
      req.params.id,
      { $pull: { subcategories: req.params.name } }, // $pull removes the item
      { new: true }
    );
    res.json(cat);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DELETE /api/categories/:id ────────────────────────────────────
// Soft-delete a category
router.delete('/:id', async (req, res) => {
  try {
    const cat = await PaymentCategory.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    await log({ user: req.user, action: 'DELETE', module: 'Categories', description: `${req.user.name} deleted category: ${cat.name}` });
    res.json({ message: 'Category deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
