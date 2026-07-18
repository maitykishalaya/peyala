const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const { auth, adminOnly } = require('../middleware/auth');

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
    if (user) filter.userName = new RegExp(user, 'i');

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
