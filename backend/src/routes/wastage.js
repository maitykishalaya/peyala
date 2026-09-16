const router = require('express').Router();
const Wastage = require('../models/Wastage');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { getIstDayRange } = require('../utils/date');

router.use(auth);

// Helper for pagination
const normalizePagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  return { page, limit };
};

// ── GET /api/wastage: List entries with date filtering & summary ──
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, search } = req.query;
    const { page, limit } = normalizePagination(req.query);

    const filter = {};

    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate && String(startDate).trim()) {
        try {
          filter.date.$gte = getIstDayRange(String(startDate).trim()).start;
        } catch {
          filter.date.$gte = new Date(startDate);
        }
      }
      if (endDate && String(endDate).trim()) {
        try {
          filter.date.$lte = getIstDayRange(String(endDate).trim()).end;
        } catch {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.date.$lte = end;
        }
      }
    }

    // Search query by itemName or reason
    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { itemName: { $regex: q, $options: 'i' } },
        { reason: { $regex: q, $options: 'i' } },
      ];
    }

    // Fetch entries and aggregate period totals concurrently
    const [total, wastage, summaryAgg] = await Promise.all([
      Wastage.countDocuments(filter),
      Wastage.find(filter)
        .populate('createdBy', 'name role')
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Wastage.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalValue: { $sum: '$approxValue' },
            totalQty: { $sum: '$quantity' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const summary = summaryAgg[0] || { totalValue: 0, totalQty: 0, count: 0 };

    res.json({
      wastage,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      summary: {
        totalValue: summary.totalValue || 0,
        totalQty: summary.totalQty || 0,
        count: total,
      },
    });
  } catch (err) {
    console.error('Error fetching wastage entries:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch wastage entries' });
  }
});

// ── GET /api/wastage/summary: Quick stats for Today & This Month ──
router.get('/summary', async (req, res) => {
  try {
    const todayRange = getIstDayRange(new Date());
    const [y, m] = todayRange.istDateStr.split('-').map(Number);
    const monthStart = getIstDayRange(`${y}-${String(m).padStart(2, '0')}-01`).start;

    const [todayAgg, monthAgg] = await Promise.all([
      Wastage.aggregate([
        { $match: { date: { $gte: todayRange.start, $lte: todayRange.end } } },
        {
          $group: {
            _id: null,
            totalValue: { $sum: '$approxValue' },
            totalQty: { $sum: '$quantity' },
            count: { $sum: 1 },
          },
        },
      ]),
      Wastage.aggregate([
        { $match: { date: { $gte: monthStart, $lte: todayRange.end } } },
        {
          $group: {
            _id: null,
            totalValue: { $sum: '$approxValue' },
            totalQty: { $sum: '$quantity' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      today: todayAgg[0] || { totalValue: 0, totalQty: 0, count: 0 },
      thisMonth: monthAgg[0] || { totalValue: 0, totalQty: 0, count: 0 },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/wastage/today-status: Check if wastage is recorded today ──
router.get('/today-status', async (req, res) => {
  try {
    const todayRange = getIstDayRange(new Date());
    const entries = await Wastage.find({
      date: { $gte: todayRange.start, $lte: todayRange.end },
    }).populate('createdBy', 'name role');

    const hasEntries = entries.length > 0;
    const hasZeroWastage = entries.some((e) => e.isZeroWastage);
    const totalValue = entries.reduce((s, e) => s + (e.approxValue || 0), 0);
    const totalQty = entries.reduce((s, e) => s + (e.quantity || 0), 0);

    res.json({
      recorded: hasEntries,
      count: entries.length,
      hasZeroWastage,
      totalValue,
      totalQty,
      entries,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/wastage/zero-wastage: Sign Zero Wastage for the day ──
router.post('/zero-wastage', async (req, res) => {
  try {
    const todayRange = getIstDayRange(new Date());

    // Check if zero wastage is already signed today
    const existing = await Wastage.findOne({
      date: { $gte: todayRange.start, $lte: todayRange.end },
      isZeroWastage: true,
    });

    if (existing) {
      return res.status(200).json({
        message: 'Zero wastage is already signed for today',
        entry: existing,
      });
    }

    const { notes } = req.body;
    const entry = new Wastage({
      itemName: 'Zero Wastage Verified',
      quantity: 0,
      unit: 'day',
      approxValue: 0,
      date: new Date(),
      reason: notes ? String(notes).trim() : 'Staff confirmed zero food or material wastage today',
      isZeroWastage: true,
      createdBy: req.user?._id,
    });

    await entry.save();
    await entry.populate('createdBy', 'name role');

    await log({
      user: req.user,
      action: 'create',
      module: 'wastage',
      description: `Signed Zero Wastage verification for today (${req.user?.name || 'Staff'})`,
      metadata: { wastageId: entry._id, isZeroWastage: true },
      ip: req.ip,
    });

    res.status(201).json({
      message: 'Zero wastage successfully verified and signed for today',
      entry,
    });
  } catch (err) {
    console.error('Error signing zero wastage:', err);
    res.status(500).json({ message: err.message || 'Failed to sign zero wastage' });
  }
});

// ── POST /api/wastage: Create a new wastage entry ──────────────────
router.post('/', async (req, res) => {
  try {
    const { itemName, quantity, approxValue, unit, date, reason } = req.body;

    // Validate the 3 core fields
    if (!itemName || !String(itemName).trim()) {
      return res.status(400).json({ message: 'Item name is required' });
    }

    const numQty = Number(quantity);
    if (Number.isNaN(numQty) || numQty <= 0) {
      return res.status(400).json({ message: 'Valid quantity greater than 0 is required' });
    }

    const numValue = Number(approxValue);
    if (Number.isNaN(numValue) || numValue < 0) {
      return res.status(400).json({ message: 'Valid approximate value (₹) is required' });
    }

    let entryDate = new Date();
    if (date) {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) {
        entryDate = parsed;
      }
    }

    const entry = new Wastage({
      itemName: String(itemName).trim(),
      quantity: numQty,
      unit: unit ? String(unit).trim() : 'units',
      approxValue: numValue,
      date: entryDate,
      reason: reason ? String(reason).trim() : '',
      createdBy: req.user?._id,
    });

    await entry.save();
    await entry.populate('createdBy', 'name role');

    await log({
      user: req.user,
      action: 'create',
      module: 'wastage',
      description: `Recorded wastage for "${entry.itemName}" (${entry.quantity} ${entry.unit}, approx ₹${entry.approxValue})`,
      metadata: { wastageId: entry._id, itemName: entry.itemName, approxValue: entry.approxValue },
      ip: req.ip,
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error('Error creating wastage entry:', err);
    res.status(500).json({ message: err.message || 'Failed to create wastage entry' });
  }
});

// ── PUT /api/wastage/:id: Update a wastage entry ───────────────────
router.put('/:id', async (req, res) => {
  try {
    const entry = await Wastage.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Wastage entry not found' });
    }

    const { itemName, quantity, approxValue, unit, date, reason } = req.body;

    if (itemName !== undefined) {
      if (!String(itemName).trim()) {
        return res.status(400).json({ message: 'Item name cannot be empty' });
      }
      entry.itemName = String(itemName).trim();
    }

    if (quantity !== undefined) {
      const numQty = Number(quantity);
      if (Number.isNaN(numQty) || numQty <= 0) {
        return res.status(400).json({ message: 'Quantity must be greater than 0' });
      }
      entry.quantity = numQty;
    }

    if (approxValue !== undefined) {
      const numValue = Number(approxValue);
      if (Number.isNaN(numValue) || numValue < 0) {
        return res.status(400).json({ message: 'Approximate value cannot be negative' });
      }
      entry.approxValue = numValue;
    }

    if (unit !== undefined) entry.unit = String(unit).trim();
    if (reason !== undefined) entry.reason = String(reason).trim();
    if (date) {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) entry.date = parsed;
    }

    await entry.save();
    await entry.populate('createdBy', 'name role');

    await log({
      user: req.user,
      action: 'update',
      module: 'wastage',
      description: `Updated wastage entry for "${entry.itemName}" (₹${entry.approxValue})`,
      metadata: { wastageId: entry._id },
      ip: req.ip,
    });

    res.json(entry);
  } catch (err) {
    console.error('Error updating wastage entry:', err);
    res.status(500).json({ message: err.message || 'Failed to update wastage entry' });
  }
});

// ── DELETE /api/wastage/:id: Remove a wastage entry ────────────────
router.delete('/:id', async (req, res) => {
  try {
    const entry = await Wastage.findById(req.params.id);
    if (!entry) {
      return res.status(404).json({ message: 'Wastage entry not found' });
    }

    await Wastage.findByIdAndDelete(req.params.id);

    await log({
      user: req.user,
      action: 'delete',
      module: 'wastage',
      description: `Deleted wastage entry for "${entry.itemName}" (₹${entry.approxValue})`,
      metadata: { wastageId: entry._id, itemName: entry.itemName },
      ip: req.ip,
    });

    res.json({ message: 'Wastage entry deleted successfully' });
  } catch (err) {
    console.error('Error deleting wastage entry:', err);
    res.status(500).json({ message: err.message || 'Failed to delete wastage entry' });
  }
});

module.exports = router;
