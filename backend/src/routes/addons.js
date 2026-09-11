const router = require('express').Router();
const Addon = require('../models/Addon');
const MenuItem = require('../models/MenuItem');
const MenuCategory = require('../models/MenuCategory');
const { auth, managerOrAdmin, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// GET /api/addons — list all addons
router.get('/', async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const filter = includeInactive === 'true' ? {} : { isActive: true };
    const addons = await Addon.find(filter).sort('sortOrder name');
    res.json(addons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/addons — create addon
router.post('/', managerOrAdmin, async (req, res) => {
  try {
    const { name, price, isVeg, isActive, sortOrder } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Addon name is required' });
    }
    if (price === undefined || price === null || Number(price) < 0) {
      return res.status(400).json({ message: 'Valid non-negative price is required' });
    }

    const addon = await Addon.create({
      name: name.trim(),
      price: Number(price),
      isVeg: isVeg !== false,
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
    });

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Menu',
      description: `${req.user.name} created addon "${addon.name}" (₹${addon.price})`,
    });

    res.status(201).json(addon);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/addons/:id — update addon
router.put('/:id', managerOrAdmin, async (req, res) => {
  try {
    const { name, price, isVeg, isActive, sortOrder } = req.body;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (price !== undefined) update.price = Number(price);
    if (isVeg !== undefined) update.isVeg = Boolean(isVeg);
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;

    const addon = await Addon.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!addon) {
      return res.status(404).json({ message: 'Addon not found' });
    }

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Menu',
      description: `${req.user.name} updated addon "${addon.name}"`,
    });

    res.json(addon);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/addons/:id — delete addon
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const addon = await Addon.findById(req.params.id);
    if (!addon) {
      return res.status(404).json({ message: 'Addon not found' });
    }

    // Clean up references in MenuCategory and MenuItem
    await Promise.all([
      MenuCategory.updateMany({ defaultAddons: addon._id }, { $pull: { defaultAddons: addon._id } }),
      MenuItem.updateMany({ addons: addon._id }, { $pull: { addons: addon._id } }),
    ]);

    await Addon.findByIdAndDelete(req.params.id);

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Menu',
      description: `${req.user.name} deleted addon "${addon.name}"`,
    });

    res.json({ message: 'Addon deleted successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
