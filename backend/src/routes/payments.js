const router = require('express').Router();
const Payment = require('../models/Payment');
const Account = require('../models/Account');
const Supplier = require('../models/Supplier');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizePagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Number(query.limit) || 20);
  return { page, limit };
};

const getPaymentAmount = (value) => {
  const amount = Number(value);
  return Number.isNaN(amount) ? null : amount;
};

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;
    const { page, limit } = normalizePagination(req.query);
    const filter = {};

    const gte = parseDate(startDate);
    const lte = parseDate(endDate);
    if (gte || lte) {
      filter.date = {};
      if (gte) filter.date.$gte = gte;
      if (lte) {
        const end = new Date(lte);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
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
      .limit(limit);

    res.json({ payments, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  const session = await Payment.startSession();
  session.startTransaction();

  try {
    const amount = getPaymentAmount(req.body.amount);
    if (amount === null || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const paymentData = {
      ...req.body,
      amount,
      createdBy: req.user._id,
    };

    const isDue = paymentData.paymentMode === 'due' || !paymentData.paidFrom;
    if (isDue) {
      paymentData.paidFrom = null;
      paymentData.isPending = true;
    } else if (!paymentData.paidFrom) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'paidFrom is required for non-due payments' });
    }

    const [payment] = await Payment.create([paymentData], { session });

    if (payment.paidFrom) {
      await Account.findByIdAndUpdate(payment.paidFrom, { $inc: { currentBalance: -payment.amount } }, { session });
    }

    if (payment.supplier) {
      await Supplier.findByIdAndUpdate(payment.supplier, { $inc: { totalPaid: payment.amount } }, { session });
    }

    await session.commitTransaction();
    session.endSession();

    const populated = await Payment.findById(payment._id)
      .populate('paidFrom', 'name')
      .populate('createdBy', 'name')
      .populate('supplier', 'name')
      .populate('staff', 'name position');

    log({
      user: req.user,
      action: 'CREATE',
      module: 'Payments',
      description: `${req.user.name} recorded payment to ${payment.payee} — ₹${payment.amount} [${payment.category}]`,
    }).catch(() => {});

    res.status(201).json(populated);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const session = await Payment.startSession();
  session.startTransaction();

  try {
    const oldPayment = await Payment.findById(req.params.id).session(session);
    if (!oldPayment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Payment not found' });
    }

    const oldAmount = oldPayment.amount;
    const oldPaidFrom = oldPayment.paidFrom ? oldPayment.paidFrom.toString() : null;
    const oldSupplier = oldPayment.supplier ? oldPayment.supplier.toString() : null;
    const oldMode = oldPayment.paymentMode;

    // ── Purchase-linked payments ──────────────────────────────────
    // For payments created from a Purchase (relatedPurchase set), the
    // account balance and supplier totalPaid are already fully managed
    // by the Purchases route (create / edit / clear-due / delete). If we
    // also let this route move money for these payments, the same
    // amount gets counted twice — that's the "double deduction from
    // supplier dues" bug. So for these payments, amount/paidFrom/supplier
    // are locked (edit the purchase itself instead) — only category,
    // subcategory, description, and notes remain freely editable, and
    // this route never touches Account or Supplier balances for them.
    if (oldPayment.relatedPurchase) {
      if (req.body.amount !== undefined && Number(req.body.amount) !== oldAmount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'This payment is linked to a purchase — edit the amount from the Purchases section instead.' });
      }
      if (req.body.paidFrom !== undefined && (req.body.paidFrom || null) !== oldPaidFrom) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'This payment is linked to a purchase — edit the payment account from the Purchases section instead.' });
      }
      if (req.body.supplier !== undefined && (req.body.supplier || null) !== oldSupplier) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'This payment is linked to a purchase — edit the supplier from the Purchases section instead.' });
      }

      const updatedPayment = {
        ...req.body,
        amount: oldAmount,
        paidFrom: oldPayment.paidFrom,
        supplier: oldPayment.supplier,
        paymentMode: oldMode,
        isPending: oldPayment.isPending,
      };

      const payment = await Payment.findByIdAndUpdate(req.params.id, updatedPayment, {
        new: true,
        runValidators: true,
        session,
      })
        .populate('paidFrom', 'name type')
        .populate('createdBy', 'name')
        .populate('supplier', 'name')
        .populate('staff', 'name position');

      await session.commitTransaction();
      session.endSession();

      log({
        user: req.user,
        action: 'UPDATE',
        module: 'Payments',
        description: `${req.user.name} updated payment to ${payment.payee} — ₹${payment.amount} [${payment.category}]`,
      }).catch(() => {});

      return res.json(payment);
    }

    const amount = req.body.amount !== undefined ? getPaymentAmount(req.body.amount) : oldAmount;
    if (amount === null || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const updatedPayment = {
      ...req.body,
      amount,
    };

    const newMode = req.body.paymentMode || oldMode;
    const shouldBeDue = newMode === 'due' || updatedPayment.paidFrom === null || (updatedPayment.paidFrom === undefined && oldPaidFrom === null);
    if (shouldBeDue) {
      updatedPayment.paidFrom = null;
      updatedPayment.isPending = true;
    } else if (!updatedPayment.paidFrom) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'paidFrom is required for non-due payments' });
    }

    const newPaidFrom = updatedPayment.paidFrom ? updatedPayment.paidFrom.toString() : null;
    const newSupplier = updatedPayment.supplier ? updatedPayment.supplier.toString() : null;

    if (oldPaidFrom && oldMode !== 'due') {
      await Account.findByIdAndUpdate(oldPaidFrom, { $inc: { currentBalance: oldAmount } }, { session });
    }

    if (newPaidFrom && newMode !== 'due') {
      await Account.findByIdAndUpdate(newPaidFrom, { $inc: { currentBalance: -amount } }, { session });
    }

    if (oldSupplier && oldSupplier !== newSupplier) {
      await Supplier.findByIdAndUpdate(oldSupplier, { $inc: { totalPaid: -oldAmount } }, { session });
    }

    if (newSupplier) {
      const supplierDelta = oldSupplier === newSupplier ? amount - oldAmount : amount;
      if (supplierDelta !== 0) {
        await Supplier.findByIdAndUpdate(newSupplier, { $inc: { totalPaid: supplierDelta } }, { session });
      }
    }

    const payment = await Payment.findByIdAndUpdate(req.params.id, updatedPayment, {
      new: true,
      runValidators: true,
      session,
    })
      .populate('paidFrom', 'name type')
      .populate('createdBy', 'name')
      .populate('supplier', 'name')
      .populate('staff', 'name position');

    await session.commitTransaction();
    session.endSession();

    log({
      user: req.user,
      action: 'UPDATE',
      module: 'Payments',
      description: `${req.user.name} updated payment to ${payment.payee} — ₹${payment.amount} [${payment.category}]`,
    }).catch(() => {});

    res.json(payment);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const session = await Payment.startSession();
  session.startTransaction();

  try {
    const payment = await Payment.findById(req.params.id).session(session);
    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.relatedPurchase) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Delete this from Purchase Section' });
    }

    if (payment.paidFrom) {
      await Account.findByIdAndUpdate(payment.paidFrom, { $inc: { currentBalance: payment.amount } }, { session });
    }

    if (payment.supplier) {
      await Supplier.findByIdAndUpdate(payment.supplier, { $inc: { totalPaid: -payment.amount } }, { session });
    }

    await Payment.findByIdAndDelete(req.params.id, { session });

    await session.commitTransaction();
    session.endSession();

    log({
      user: req.user,
      action: 'DELETE',
      module: 'Payments',
      description: `${req.user.name} deleted payment of ₹${payment.amount}`,
    }).catch(() => {});

    res.json({ message: 'Payment deleted' });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
