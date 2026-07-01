const router = require('express').Router();
const Supplier = require('../models/Supplier');
const PurchaseEntry = require('../models/PurchaseEntry');
const Payment = require('../models/Payment');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const suppliers = await Supplier.find({ isActive: true }).sort('name');
    res.json(suppliers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    const purchases = await PurchaseEntry.find({ supplier: req.params.id }).populate('items.item').sort('-date').limit(20);
    res.json({ supplier, purchases });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const supplier = await Supplier.create(req.body);
    res.status(201).json(supplier);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(supplier);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await Supplier.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Supplier deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
