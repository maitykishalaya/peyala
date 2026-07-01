const router = require('express').Router();
const Receipt = require('../models/Receipt');
const Account = require('../models/Account');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate + 'T23:59:59');
    }
    const total = await Receipt.countDocuments(filter);
    const receipts = await Receipt.find(filter)
      .populate('receivedIn', 'name type')
      .populate('createdBy', 'name')
      .sort('-date')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ receipts, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const receipt = await Receipt.create({ ...req.body, createdBy: req.user._id });
    await Account.findByIdAndUpdate(req.body.receivedIn, { $inc: { currentBalance: req.body.amount } });
    const populated = await Receipt.findById(receipt._id).populate('receivedIn', 'name')
    .populate('createdBy', 'name');
    await log({ user: req.user, action: 'CREATE', module: 'Receipts', description: req.user.name + ' recorded receipt from ' + req.body.source + ' — ₹' + req.body.amount });
    res.status(201).json(populated);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const receipt = await Receipt.findById(req.params.id);
    await Account.findByIdAndUpdate(receipt.receivedIn, { $inc: { currentBalance: -receipt.amount } });
    await Receipt.findByIdAndDelete(req.params.id);
    await log({ user: req.user, action: 'DELETE', module: 'Receipts', description: req.user.name + ' deleted receipt of ₹' + receipt.amount });
    res.json({ message: 'Receipt deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
