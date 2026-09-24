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
    const { module, user, page = 1, limit = 50 } = req.query;

    const isInventory = module === 'Inventory';
    const allowedRoles = isInventory ? ['admin', 'manager'] : ['admin'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: isInventory ? 'Admin or manager access required' : 'Admin access required' });
    }

    const filter = {};
    if (module) filter.module = module;

    let total = 0;
    let logs = [];

    if (user && user.trim()) {
      const allLogs = await AuditLog.find(filter).sort('-createdAt').lean();
      const matched = allLogs.filter((l) => matchesSearch(l.userName, user));
      total = matched.length;
      logs = matched.slice((page - 1) * limit, page * limit);
    } else {
      total = await AuditLog.countDocuments(filter);
      logs = await AuditLog.find(filter)
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(Number(limit));
    }

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
