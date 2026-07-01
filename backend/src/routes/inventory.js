const router = require('express').Router();
const InventoryCategory = require('../models/InventoryCategory');
const InventoryItem = require('../models/InventoryItem');
const { auth } = require('../middleware/auth');

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
    res.status(201).json(cat);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const cat = await InventoryCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(cat);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    await InventoryCategory.findByIdAndDelete(req.params.id);
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
    res.status(201).json(item);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/items/:id', async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(item);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/items/:id', async (req, res) => {
  try {
    await InventoryItem.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Item deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
