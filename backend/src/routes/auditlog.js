const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const { auth, adminOnly } = require('../middleware/auth');

const { matchesSearch } = require('../utils/search');

router.use(auth);

// Get audit logs.
// Inventory logs are visible to admins AND managers; every other
// module stays admin-only.
router.get('/', async (req, res) => {
  try {
    const { module, user, search, q, page = 1, limit = 50 } = req.query;

    const isInventory = module === 'Inventory';
    const allowedRoles = isInventory ? ['admin', 'manager'] : ['admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: isInventory ? 'Admin or manager access required' : 'Admin access required' });
    }

    const baseFilter = {};
    if (module && module !== 'All') baseFilter.module = module;

    const searchTerm = (search || q || user || '').trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skipNum = (pageNum - 1) * limitNum;

    if (!searchTerm) {
      const total = await AuditLog.countDocuments(baseFilter);
      const logs = await AuditLog.find(baseFilter)
        .sort('-createdAt')
        .skip(skipNum)
        .limit(limitNum)
        .lean();
      return res.json({ logs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    }

    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const phraseRegex = new RegExp(escaped.replace(/\s+/g, '\\s+'), 'i');

    // 1. Direct contiguous phrase match across description, userName, module, action
    const phraseFilter = {
      ...baseFilter,
      $or: [
        { description: phraseRegex },
        { userName: phraseRegex },
        { module: phraseRegex },
        { action: phraseRegex },
      ],
    };

    const phraseCount = await AuditLog.countDocuments(phraseFilter);
    if (phraseCount > 0) {
      const logs = await AuditLog.find(phraseFilter)
        .sort('-createdAt')
        .skip(skipNum)
        .limit(limitNum)
        .lean();
      return res.json({ logs, total: phraseCount, page: pageNum, pages: Math.ceil(phraseCount / limitNum) });
    }

    // 2. If no direct phrase match, fall back to cross-field multi-token match (e.g. "Joydev Indoor 1")
    const tokens = searchTerm.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const tokenFilter = {
      ...baseFilter,
      $and: tokens.map((t) => ({
        $or: [
          { description: new RegExp(t, 'i') },
          { userName: new RegExp(t, 'i') },
          { module: new RegExp(t, 'i') },
          { action: new RegExp(t, 'i') },
        ],
      })),
    };

    const tokenCount = await AuditLog.countDocuments(tokenFilter);
    const logs = await AuditLog.find(tokenFilter)
      .sort('-createdAt')
      .skip(skipNum)
      .limit(limitNum)
      .lean();

    return res.json({ logs, total: tokenCount, page: pageNum, pages: Math.ceil(tokenCount / limitNum) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
