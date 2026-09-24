const router = require('express').Router();
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { matchesSearch, sortBySearchRelevance } = require('../utils/search');

router.use(auth);

// ─────────────────────────────────────────────────────────────────
// MenuCategory Routes (under /categories)
// ─────────────────────────────────────────────────────────────────

// GET /api/menu/categories
router.get('/categories', async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const filter = includeInactive === 'true' ? {} : { isActive: true };
    const categories = await MenuCategory.find(filter)
      .populate('defaultAddons')
      .sort('sortOrder name');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/menu/categories
router.post('/categories', async (req, res) => {
  try {
    const { name, description, sortOrder, isActive, defaultAddons } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const category = await MenuCategory.create({
      name: name.trim(),
      description: description?.trim(),
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive !== false,
      defaultAddons: Array.isArray(defaultAddons) ? defaultAddons : [],
    });

    const populated = await MenuCategory.findById(category._id).populate('defaultAddons');

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Menu',
      description: `${req.user.name} created menu category "${category.name}"`,
    });

    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/menu/categories/:id
router.put('/categories/:id', async (req, res) => {
  try {
    const { name, description, sortOrder, isActive, defaultAddons } = req.body;
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (description !== undefined) update.description = description.trim();
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (defaultAddons !== undefined) update.defaultAddons = Array.isArray(defaultAddons) ? defaultAddons : [];

    const category = await MenuCategory.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate('defaultAddons');

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

    let items = await MenuItem.find(filter)
      .populate({
        path: 'category',
        select: 'name sortOrder isActive defaultAddons',
        populate: { path: 'defaultAddons', model: 'Addon' },
      })
      .populate('addons')
      .sort('name');

    if (search && search.trim()) {
      const matched = items.filter((item) =>
        matchesSearch([item.name, item.description, item.category?.name], search)
      );
      items = sortBySearchRelevance(matched, search, (item) => [
        item.name,
        item.description,
        item.category?.name,
      ]);
    }

    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/menu/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id)
      .populate({
        path: 'category',
        select: 'name sortOrder isActive defaultAddons',
        populate: { path: 'defaultAddons', model: 'Addon' },
      })
      .populate('addons');

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
    const { name, category, price, isVeg, taxPercent, description, isAvailable, hasVariants, variants, addons } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Item name is required' });
    }
    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }
    if (price === undefined || price === null || Number(price) < 0) {
      return res.status(400).json({ message: 'A valid non-negative price is required' });
    }

    const cleanVariants = Array.isArray(variants)
      ? variants
          .filter((v) => v && v.name && v.name.trim())
          .map((v) => ({
            name: v.name.trim(),
            price: Math.max(0, Number(v.price) || 0),
            isVeg: v.isVeg !== undefined ? Boolean(v.isVeg) : (isVeg !== false),
          }))
      : [];

    const item = await MenuItem.create({
      name: name.trim(),
      category,
      price: Number(price),
      isVeg: isVeg !== false,
      taxPercent: taxPercent !== undefined ? Number(taxPercent) : 5,
      description: description?.trim(),
      isAvailable: isAvailable !== false,
      hasVariants: Boolean(hasVariants) && cleanVariants.length > 0,
      variants: cleanVariants,
      addons: Array.isArray(addons) ? addons : [],
    });

    const populated = await MenuItem.findById(item._id)
      .populate({
        path: 'category',
        select: 'name sortOrder isActive defaultAddons',
        populate: { path: 'defaultAddons', model: 'Addon' },
      })
      .populate('addons');

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
    const { name, category, price, isVeg, taxPercent, description, isAvailable, hasVariants, variants, addons } = req.body;
    const update = {};

    if (name !== undefined) update.name = name.trim();
    if (category !== undefined) update.category = category;
    if (price !== undefined) update.price = Number(price);
    if (isVeg !== undefined) update.isVeg = Boolean(isVeg);
    if (taxPercent !== undefined) update.taxPercent = Number(taxPercent);
    if (description !== undefined) update.description = description.trim();
    if (isAvailable !== undefined) update.isAvailable = Boolean(isAvailable);
    if (hasVariants !== undefined) update.hasVariants = Boolean(hasVariants);
    if (variants !== undefined && Array.isArray(variants)) {
      update.variants = variants
        .filter((v) => v && v.name && v.name.trim())
        .map((v) => ({
          name: v.name.trim(),
          price: Math.max(0, Number(v.price) || 0),
          isVeg: v.isVeg !== undefined ? Boolean(v.isVeg) : true,
        }));
    }
    if (addons !== undefined) update.addons = Array.isArray(addons) ? addons : [];

    const item = await MenuItem.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    })
      .populate({
        path: 'category',
        select: 'name sortOrder isActive defaultAddons',
        populate: { path: 'defaultAddons', model: 'Addon' },
      })
      .populate('addons');

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
