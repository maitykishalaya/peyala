const router = require('express').Router();
const Customer = require('../models/Customer');
const CustomerDuePayment = require('../models/CustomerDuePayment');
const Order = require('../models/Order');
const Account = require('../models/Account');
const { auth } = require('../middleware/auth');
const { getIstDayRange } = require('../utils/date');

router.use(auth);

// ── 1. Fast Customer Autocomplete Search ─────────────────────────
// Used by the cashier POS settlement modal when staff types name or phone digits.
// Highly optimized with compound index and lean payload.
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json([]);
    }

    // Escape regex special characters to prevent regex injection
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const customers = await Customer.find({
      isActive: true,
      $or: [
        { phone: regex },
        { name: regex },
      ],
    })
      .select('name phone totalDue totalOrders lastVisit')
      .sort({ totalDue: -1, lastVisit: -1 })
      .limit(10)
      .lean();

    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── 2. Unified Due Report (Metrics, Customer-wise, & Bill-wise) ──
router.get('/due-report', async (req, res) => {
  try {
    const { view = 'customer', search = '', status = 'unpaid', page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);

    // 1. Overall Metrics
    const [duesAgg, monthPaymentsAgg, unpaidOrdersCount] = await Promise.all([
      Customer.aggregate([
        { $match: { isActive: true, totalDue: { $gt: 0 } } },
        { $group: { _id: null, totalDue: { $sum: '$totalDue' }, count: { $sum: 1 } } },
      ]),
      (() => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return CustomerDuePayment.aggregate([
          { $match: { date: { $gte: startOfMonth } } },
          { $group: { _id: null, totalCollected: { $sum: '$amount' } } },
        ]);
      })(),
      Order.countDocuments({
        status: { $ne: 'cancelled' },
        dueAmount: { $gt: 0 },
        dueSettled: false,
      }),
    ]);

    const totalOutstandingDue = duesAgg[0]?.totalDue || 0;
    const totalDueCustomers = duesAgg[0]?.count || 0;
    const totalDuesCollectedThisMonth = monthPaymentsAgg[0]?.totalCollected || 0;

    const metrics = {
      totalOutstandingDue: Math.round(totalOutstandingDue * 100) / 100,
      totalDueCustomers,
      totalDuesCollectedThisMonth: Math.round(totalDuesCollectedThisMonth * 100) / 100,
      totalUnpaidBills: unpaidOrdersCount,
    };

    // 2. View: Customer-wise
    if (view === 'customer') {
      const filter = { isActive: true };
      if (status === 'unpaid') {
        filter.totalDue = { $gt: 0 };
      }

      if (search && search.trim()) {
        const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        filter.$or = [{ name: regex }, { phone: regex }];
      }

      const totalCount = await Customer.countDocuments(filter);
      const customers = await Customer.find(filter)
        .sort({ totalDue: -1, lastVisit: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean();

      // Fetch pending bill counts per customer
      const customerIds = customers.map(c => c._id);
      const pendingBillsAgg = await Order.aggregate([
        {
          $match: {
            customer: { $in: customerIds },
            status: { $ne: 'cancelled' },
            dueAmount: { $gt: 0 },
            dueSettled: false,
          },
        },
        { $group: { _id: '$customer', count: { $sum: 1 } } },
      ]);
      const pendingMap = new Map(pendingBillsAgg.map(p => [String(p._id), p.count]));

      const enrichedCustomers = customers.map(c => ({
        ...c,
        unpaidBillsCount: pendingMap.get(String(c._id)) || 0,
      }));

      return res.json({
        metrics,
        view: 'customer',
        data: enrichedCustomers,
        totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      });
    }

    // 3. View: Bill-wise
    const billFilter = {
      status: { $ne: 'cancelled' },
      dueAmount: { $gt: 0 },
    };

    if (status === 'unpaid') {
      billFilter.dueSettled = false;
    } else if (status === 'cleared') {
      billFilter.dueSettled = true;
    }

    if (search && search.trim()) {
      const q = search.trim();
      const isNum = !isNaN(Number(q));
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const orConditions = [
        { customerName: regex },
        { customerPhone: regex },
      ];
      if (isNum) {
        orConditions.push({ orderNumber: Number(q) });
      }
      billFilter.$or = orConditions;
    }

    const totalCount = await Order.countDocuments(billFilter);
    const orders = await Order.find(billFilter)
      .populate('table', 'tableNumber')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const formattedBills = orders.map(o => {
      const remainingDue = Math.max(0, (o.dueAmount || 0) - (o.dueSettledAmount || 0));
      return {
        _id: o._id,
        orderNumber: o.orderNumber,
        tableNumber: o.table?.tableNumber || 'N/A',
        createdAt: o.createdAt,
        customerName: o.customerName || 'Walk-in',
        customerPhone: o.customerPhone || 'N/A',
        customerId: o.customer,
        total: o.total,
        dueAmount: o.dueAmount,
        dueSettledAmount: o.dueSettledAmount || 0,
        remainingDue: Math.round(remainingDue * 100) / 100,
        dueSettled: o.dueSettled,
        dueSettledAt: o.dueSettledAt,
        billerName: o.createdBy?.name || 'Staff',
      };
    });

    res.json({
      metrics,
      view: 'bill',
      data: formattedBills,
      totalCount,
      page: pageNum,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── 3. Customer Details with Full Khata Ledger & Bill History ────
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const [bills, payments] = await Promise.all([
      Order.find({ customer: customer._id, dueAmount: { $gt: 0 }, status: { $ne: 'cancelled' } })
        .populate('table', 'tableNumber')
        .sort({ createdAt: -1 })
        .lean(),
      CustomerDuePayment.find({ customer: customer._id })
        .populate('receivedIn', 'name')
        .populate('receivedBy', 'name')
        .sort({ date: -1 })
        .lean(),
    ]);

    res.json({
      customer,
      bills: bills.map(b => ({
        ...b,
        remainingDue: Math.max(0, (b.dueAmount || 0) - (b.dueSettledAmount || 0)),
      })),
      payments,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── 4. Collect Due Payment from Customer ─────────────────────────
// Customer visits at the end of the month (or anytime) to clear dues.
// Credits Cash Counter or Bank Account, updates customer totalDue,
// marks oldest unpaid orders settled (FIFO), and records an audit voucher.
router.post('/:id/collect-due', async (req, res) => {
  try {
    const { amount, paymentMethod = 'cash', accountId, notes } = req.body;
    const numAmount = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100);

    if (numAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than zero' });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    if (numAmount > customer.totalDue + 0.05) {
      return res.status(400).json({
        message: `Amount (₹${numAmount}) cannot exceed customer's outstanding balance of ₹${customer.totalDue}`,
      });
    }

    // Resolve Account to credit
    let targetAccount = null;
    if (accountId) {
      targetAccount = await Account.findById(accountId);
    }
    if (!targetAccount) {
      if (paymentMethod === 'cash') {
        targetAccount = await Account.findOne({ type: 'cash', isActive: true }).sort('name');
      } else {
        targetAccount = await Account.findOne({ type: { $in: ['bank', 'digital'] }, isActive: true }).sort('name');
      }
    }

    if (targetAccount) {
      await Account.findByIdAndUpdate(targetAccount._id, {
        $inc: { currentBalance: numAmount },
      });
    }

    // Allocate payment across customer's oldest unpaid due orders (FIFO)
    let remainingToApply = numAmount;
    const billsAffected = [];

    const unpaidOrders = await Order.find({
      customer: customer._id,
      status: { $ne: 'cancelled' },
      dueAmount: { $gt: 0 },
      dueSettled: false,
    }).sort({ createdAt: 1 });

    for (const ord of unpaidOrders) {
      if (remainingToApply <= 0) break;
      const orderPendingDue = Math.max(0, (ord.dueAmount || 0) - (ord.dueSettledAmount || 0));
      if (orderPendingDue <= 0) {
        ord.dueSettled = true;
        await ord.save();
        continue;
      }

      const applyAmount = Math.min(remainingToApply, orderPendingDue);
      ord.dueSettledAmount = Math.round(((ord.dueSettledAmount || 0) + applyAmount) * 100) / 100;
      if (ord.dueSettledAmount >= (ord.dueAmount || 0) - 0.01) {
        ord.dueSettled = true;
        ord.dueSettledAt = new Date();
      }
      await ord.save();

      billsAffected.push({
        orderId: ord._id,
        orderNumber: ord.orderNumber,
        amountApplied: applyAmount,
      });

      remainingToApply = Math.round((remainingToApply - applyAmount) * 100) / 100;
    }

    // Decrement customer totalDue
    customer.totalDue = Math.max(0, Math.round((customer.totalDue - numAmount) * 100) / 100);
    customer.lastVisit = new Date();
    await customer.save();

    // Create Due Payment audit record
    const paymentRecord = await CustomerDuePayment.create({
      customer: customer._id,
      amount: numAmount,
      paymentMethod,
      receivedIn: targetAccount ? targetAccount._id : null,
      receivedBy: req.user?._id || null,
      notes: notes || '',
      billsAffected,
      date: new Date(),
    });

    res.json({
      success: true,
      message: `Successfully collected ₹${numAmount.toFixed(2)} from ${customer.name}. Remaining due: ₹${customer.totalDue.toFixed(2)}.`,
      customer,
      paymentRecord,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── 5. Create New Customer Directly ──────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, phone, notes } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: 'Name and Phone are required' });
    }

    const cleanPhone = String(phone).trim();
    const existing = await Customer.findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(400).json({ message: `Customer with phone ${cleanPhone} already exists` });
    }

    const customer = await Customer.create({
      name: String(name).trim(),
      phone: cleanPhone,
      notes: notes ? String(notes).trim() : '',
    });

    res.status(201).json(customer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
