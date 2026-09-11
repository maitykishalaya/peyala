const router = require('express').Router();
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// ─────────────────────────────────────────────────────────────────
// MenuCategory Routes (under /categories)
// ─────────────────────────────────────────────────────────────────

// GET /api/menu/categories
router.get('/categories', async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const filter = includeInactive === 'true' ? {} : { isActive: true };
    const categories = await MenuCategory.find(filter).sort('sortOrder name');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/menu/categories
router.post('/categories', async (req, res) => {
  try {
    const { name, description, sortOrder, isActive } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const category = await MenuCategory.create({
      name: name.trim(),
      description: description?.trim(),
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive !== false,
    });

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Menu',
      description: `${req.user.name} created menu category "${category.name}"`,
    });

    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/menu/categories/:id
router.put('/categories/:id', async (req, res) => {
  try {
    const { name, description, sortOrder, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (description !== undefined) update.description = description.trim();
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) update.isActive = Boolean(isActive);

    const category = await MenuCategory.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Menu',
      description: `${req.user.name} updated menu category "${category.name}"`,
    });

    res.json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/menu/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    const category = await MenuCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const count = await MenuItem.countDocuments({ category: category._id });
    if (count > 0) {
      return res.status(400).json({
        message: `Cannot delete category "${category.name}" because it contains ${count} menu item(s). Reassign or delete the items first.`,
      });
    }

    await MenuCategory.findByIdAndDelete(req.params.id);

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Menu',
      description: `${req.user.name} deleted menu category "${category.name}"`,
    });

    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// MenuItem Routes
// ─────────────────────────────────────────────────────────────────

// GET /api/menu
router.get('/', async (req, res) => {
  try {
    const { category, availableOnly, search } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (availableOnly === 'true') filter.isAvailable = true;
    if (search && search.trim()) {
      filter.name = { $regex: search.trim(), $options: 'i' };
    }

    const items = await MenuItem.find(filter)
      .populate('category', 'name sortOrder isActive')
      .sort('name');

    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/menu/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id).populate('category', 'name sortOrder isActive');
    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/menu
router.post('/', async (req, res) => {
  try {
    const { name, category, price, isVeg, taxPercent, description, isAvailable } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Item name is required' });
    }
    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }
    if (price === undefined || price === null || Number(price) < 0) {
      return res.status(400).json({ message: 'A valid non-negative price is required' });
    }

    const item = await MenuItem.create({
      name: name.trim(),
      category,
      price: Number(price),
      isVeg: isVeg !== false,
      taxPercent: taxPercent !== undefined ? Number(taxPercent) : 5,
      description: description?.trim(),
      isAvailable: isAvailable !== false,
    });

    const populated = await MenuItem.findById(item._id).populate('category', 'name sortOrder isActive');

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Menu',
      description: `${req.user.name} added menu item "${item.name}" (₹${item.price})`,
    });

    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/menu/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, category, price, isVeg, taxPercent, description, isAvailable } = req.body;
    const update = {};

    if (name !== undefined) update.name = name.trim();
    if (category !== undefined) update.category = category;
    if (price !== undefined) update.price = Number(price);
    if (isVeg !== undefined) update.isVeg = Boolean(isVeg);
    if (taxPercent !== undefined) update.taxPercent = Number(taxPercent);
    if (description !== undefined) update.description = description.trim();
    if (isAvailable !== undefined) update.isAvailable = Boolean(isAvailable);

    const item = await MenuItem.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate('category', 'name sortOrder isActive');

    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Menu',
      description: `${req.user.name} updated menu item "${item.name}"`,
    });

    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/menu/:id/toggle-availability
router.patch('/:id/toggle-availability', async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    item.isAvailable = !item.isAvailable;
    await item.save();

    const populated = await MenuItem.findById(item._id).populate('category', 'name sortOrder isActive');

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Menu',
      description: `${req.user.name} ${item.isAvailable ? 'restored' : '86-ed (marked unavailable)'} item "${item.name}"`,
    });

    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/menu/:id
router.delete('/:id', async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    await MenuItem.findByIdAndDelete(req.params.id);

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Menu',
      description: `${req.user.name} deleted menu item "${item.name}"`,
    });

    res.json({ message: 'Menu item deleted' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
