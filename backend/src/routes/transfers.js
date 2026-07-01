const router = require('express').Router();
const Transfer = require('../models/Transfer');
const Account = require('../models/Account');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const transfers = await Transfer.find()
      .populate('fromAccount', 'name')
      .populate('toAccount', 'name')
      .sort('-date').limit(50);
    res.json(transfers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { fromAccount, toAccount, amount, description, date } = req.body;
    if (fromAccount === toAccount) return res.status(400).json({ message: 'Cannot transfer to same account' });
    const from = await Account.findById(fromAccount);
    if (!from || from.currentBalance < amount) return res.status(400).json({ message: 'Insufficient balance' });

    const transfer = await Transfer.create({ fromAccount, toAccount, amount, description, date, createdBy: req.user._id });
    await Account.findByIdAndUpdate(fromAccount, { $inc: { currentBalance: -amount } });
    await Account.findByIdAndUpdate(toAccount, { $inc: { currentBalance: amount } });

    const populated = await Transfer.findById(transfer._id).populate('fromAccount', 'name').populate('toAccount', 'name');
    res.status(201).json(populated);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

module.exports = router;
