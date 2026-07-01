// ─────────────────────────────────────────────────────────────────
// Staff Route
//
// Payment types for staff:
//   'salary'  — full or partial monthly salary → adds to totalSalaryPaid
//   'advance' — advance against future salary  → adds to totalAdvancePaid
//   'bonus'   — bonus/incentive payment        → adds to totalBonusPaid
//
// All payment types:
//   - Create a Payment record (so it appears in Payments section)
//   - Deduct from the chosen account
//   - Reflect on the staff card (total paid, remaining)
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const Staff = require('../models/Staff');
const Payment = require('../models/Payment');
const Account = require('../models/Account');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// ── GET /api/staff ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const staff = await Staff.find().sort('name');
    res.json(staff);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/staff/:id ────────────────────────────────────────────
// Returns staff member + their full payment history
router.get('/:id', async (req, res) => {
  try {
    const member = await Staff.findById(req.params.id);
    const payments = await Payment.find({ staff: req.params.id })
      .populate('paidFrom', 'name')
      .sort('-date');
    res.json({ member, payments });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/staff ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const member = await Staff.create(req.body);
    await log({ user: req.user, action: 'CREATE', module: 'Staff', description: `${req.user.name} added staff member: ${req.body.name}` });
    res.status(201).json(member);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── PUT /api/staff/:id ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const member = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(member);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── POST /api/staff/:id/pay ───────────────────────────────────────
// Unified payment endpoint for salary, advance, and bonus.
// paymentType: 'salary' | 'advance' | 'bonus'
//
// How it affects account balance:
//   cash payment     → deducts from Cash Counter (type='cash')
//   upi/card/bank    → deducts from specified paidFrom account
//
// How it affects staff record:
//   salary  → totalSalaryPaid += amount
//   advance → totalAdvancePaid += amount
//   bonus   → totalBonusPaid += amount
router.post('/:id/pay', async (req, res) => {
  try {
    const { amount, paidFrom, paymentType = 'salary', paymentMode = 'cash', description, date, notes } = req.body;
    const member = await Staff.findById(req.params.id);
    if (!member) return res.status(404).json({ message: 'Staff not found' });

    // Build description based on payment type
    const typeLabels = { salary: 'Salary', advance: 'Advance', bonus: 'Bonus' };
    const typeLabel = typeLabels[paymentType] || 'Payment';
    const payDesc = description || `${typeLabel} — ${member.name}`;

    // Create payment record (shows in Payments section)
    const payment = await Payment.create({
      date: date ? new Date(date) : new Date(),
      paidFrom,
      payee: member.name,
      category: 'Staff Expenses',
      subcategory: member.name,
      description: payDesc,
      amount: +amount,
      paymentMode,
      staff: member._id,
      notes,
      createdBy: req.user._id,
    });

    // Deduct from account
    await Account.findByIdAndUpdate(paidFrom, { $inc: { currentBalance: -amount } });

    // Update staff totals based on payment type
    const staffUpdate = {};
    if (paymentType === 'salary') staffUpdate.$inc = { totalSalaryPaid: +amount };
    else if (paymentType === 'advance') staffUpdate.$inc = { totalAdvancePaid: +amount };
    else if (paymentType === 'bonus') staffUpdate.$inc = { totalBonusPaid: +amount };

    if (Object.keys(staffUpdate).length) {
      await Staff.findByIdAndUpdate(req.params.id, staffUpdate);
    }

    await log({
      user: req.user, action: 'CREATE', module: 'Staff',
      description: `${req.user.name} paid ${typeLabel} to ${member.name} — ₹${amount} [${paymentMode}]`,
    });

    res.status(201).json(payment);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Backward compatibility — old pay-salary calls go through new /pay endpoint
router.post('/:id/pay-salary', async (req, res) => {
  try {
    const { amount, paidFrom, description, date, notes, paymentMode = 'cash' } = req.body;
    const member = await Staff.findById(req.params.id);
    if (!member) return res.status(404).json({ message: 'Staff not found' });

    const payment = await Payment.create({
      date: date ? new Date(date) : new Date(),
      paidFrom, payee: member.name,
      category: 'Staff Expenses', subcategory: member.name,
      description: description || `Salary — ${member.name}`,
      amount: +amount, paymentMode,
      staff: member._id, createdBy: req.user._id,
    });

    await Account.findByIdAndUpdate(paidFrom, { $inc: { currentBalance: -amount } });
    await Staff.findByIdAndUpdate(req.params.id, { $inc: { totalSalaryPaid: +amount } });

    res.status(201).json(payment);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── DELETE /api/staff/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await Staff.findByIdAndUpdate(req.params.id, { status: 'inactive' });
    res.json({ message: 'Staff deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
