const router = require('express').Router();
const Payment = require('../models/Payment');
const Account = require('../models/Account');
const Supplier = require('../models/Supplier');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate + 'T23:59:59');
    }
    if (category) filter.category = category;
    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .populate('paidFrom', 'name type')
      .populate('createdBy', 'name')
      .populate('supplier', 'name')
      .populate('staff', 'name position')
      .sort('-date')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ payments, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const payment = await Payment.create({ ...req.body, createdBy: req.user._id });
    // Deduct from account
    await Account.findByIdAndUpdate(req.body.paidFrom, { $inc: { currentBalance: -req.body.amount } });
    // If supplier payment, update their paid total
    if (req.body.supplier) {
      await Supplier.findByIdAndUpdate(req.body.supplier, { $inc: { totalPaid: req.body.amount } });
    }
    const populated = await Payment.findById(payment._id).populate('paidFrom', 'name')
    .populate('createdBy', 'name').populate('supplier', 'name');
    await log({ user: req.user, action: 'CREATE', module: 'Payments', description: req.user.name + ' recorded payment to ' + req.body.payee + ' — ₹' + req.body.amount + ' [' + req.body.category + ']' });
    res.status(201).json(populated);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const old = await Payment.findById(req.params.id);
    // Reverse old amount, apply new
    await Account.findByIdAndUpdate(old.paidFrom, { $inc: { currentBalance: old.amount } });
    await Account.findByIdAndUpdate(req.body.paidFrom, { $inc: { currentBalance: -req.body.amount } });
    const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('paidFrom', 'name')
    .populate('createdBy', 'name');
    res.json(payment);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// router.delete('/:id', async (req, res) => {
//   try {
//     const payment = await Payment.findById(req.params.id);
//     await Account.findByIdAndUpdate(payment.paidFrom, { $inc: { currentBalance: payment.amount } });
//     if (payment.supplier) {
//       await Supplier.findByIdAndUpdate(payment.supplier, { $inc: { totalPaid: -payment.amount } });
//     }
//     await Payment.findByIdAndDelete(req.params.id);
//     await log({ user: req.user, action: 'DELETE', module: 'Payments', description: req.user.name + ' deleted payment of ₹' + payment.amount });
//     res.json({ message: 'Payment deleted' });
//   } catch (err) { res.status(500).json({ message: err.message }); }
// });
router.delete('/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // If this payment is linked to a purchase, don't allow deletion here
    if (payment.relatedPurchase) {
      return res.status(400).json({
        message: 'Delete this from Purchase Section'
      });
    }

    // Reverse account balance
    if (payment.paidFrom) {
      await Account.findByIdAndUpdate(payment.paidFrom, {
        $inc: { currentBalance: payment.amount }
      });
    }

    // Reverse supplier payment
    if (payment.supplier) {
      await Supplier.findByIdAndUpdate(payment.supplier, {
        $inc: { totalPaid: -payment.amount }
      });
    }

    await Payment.findByIdAndDelete(req.params.id);

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Payments',
      description: req.user.name + ' deleted payment of ₹' + payment.amount
    });

    res.json({ message: 'Payment deleted' });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
