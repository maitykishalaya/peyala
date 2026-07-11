const router = require('express').Router();
const InventoryCategory = require('../models/InventoryCategory');
const InventoryItem = require('../models/InventoryItem');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// Categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await InventoryCategory.find().populate('parent').sort('name');
    res.json(cats);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/categories', async (req, res) => {
  try {
    const cat = await InventoryCategory.create(req.body);
    await log({ user: req.user, action: 'CREATE', module: 'Inventory', description: `${req.user.name} created category "${cat.name}"` });
    res.status(201).json(cat);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const oldCat = await InventoryCategory.findById(req.params.id);
    if (!oldCat) return res.status(404).json({ message: 'Category not found' });
    const cat = await InventoryCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (req.body.name !== undefined && req.body.name !== oldCat.name) {
      await log({ user: req.user, action: 'UPDATE', module: 'Inventory', description: `${req.user.name} renamed category "${oldCat.name}" to "${cat.name}"` });
    }
    res.json(cat);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const itemCount = await InventoryItem.countDocuments({ category: req.params.id });
    if (itemCount > 0) {
      return res.status(400).json({ message: `Cannot delete — ${itemCount} item(s) still use this category. Move or delete those items first.` });
    }
    const cat = await InventoryCategory.findByIdAndDelete(req.params.id);
    if (cat) {
      await log({ user: req.user, action: 'DELETE', module: 'Inventory', description: `${req.user.name} deleted category "${cat.name}"` });
    }
    res.json({ message: 'Category deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Items
router.get('/items', async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.lowStock === 'true') {
      const items = await InventoryItem.find(filter).populate('category preferredSupplier');
      return res.json(items.filter(i => i.currentStock <= i.minimumStock));
    }
    const items = await InventoryItem.find(filter).populate('category preferredSupplier').sort('name');
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/items/:id', async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id).populate('category preferredSupplier');
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/items', async (req, res) => {
  try {
    const item = await InventoryItem.create(req.body);
    await log({ user: req.user, action: 'CREATE', module: 'Inventory', description: `${req.user.name} added new item "${item.name}"` });
    res.status(201).json(item);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── PUT /api/inventory/items/:id ──────────────────────────────────
// Updates an item, and logs exactly what changed (name, category,
// quantity, minimum stock, unit, last purchase price) in plain
// human-readable terms so "Check Logs" shows a real before → after.
router.put('/items/:id', async (req, res) => {
  try {
    const oldItem = await InventoryItem.findById(req.params.id).populate('category', 'name');
    if (!oldItem) return res.status(404).json({ message: 'Item not found' });

    const item = await InventoryItem.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('category', 'name');

    const changes = [];
    if (req.body.name !== undefined && req.body.name !== oldItem.name) {
      changes.push(`name from "${oldItem.name}" to "${item.name}"`);
    }
    if (req.body.category !== undefined && String(oldItem.category?._id || '') !== String(item.category?._id || '')) {
      changes.push(`category from "${oldItem.category?.name || 'None'}" to "${item.category?.name || 'None'}"`);
    }
    if (req.body.currentStock !== undefined && Number(oldItem.currentStock) !== Number(item.currentStock)) {
      changes.push(`quantity from ${oldItem.currentStock} to ${item.currentStock}`);
    }
    if (req.body.minimumStock !== undefined && Number(oldItem.minimumStock) !== Number(item.minimumStock)) {
      changes.push(`minimum stock from ${oldItem.minimumStock} to ${item.minimumStock}`);
    }
    if (req.body.unit !== undefined && req.body.unit !== oldItem.unit) {
      changes.push(`unit from "${oldItem.unit}" to "${item.unit}"`);
    }
    if (req.body.lastPurchasePrice !== undefined && Number(oldItem.lastPurchasePrice) !== Number(item.lastPurchasePrice)) {
      changes.push(`last purchase price from ₹${oldItem.lastPurchasePrice} to ₹${item.lastPurchasePrice}`);
    }

    if (changes.length > 0) {
      await log({
        user: req.user,
        action: 'UPDATE',
        module: 'Inventory',
        description: `${req.user.name} changed ${item.name}'s ${changes.join(', ')}`,
      });
    }

    res.json(item);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (item) {
      await log({ user: req.user, action: 'DELETE', module: 'Inventory', description: `${req.user.name} removed item "${item.name}"` });
    }
    res.json({ message: 'Item deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
