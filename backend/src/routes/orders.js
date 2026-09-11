const router = require('express').Router();
const Order = require('../models/Order');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const SalesEntry = require('../models/SalesEntry');
const Account = require('../models/Account');
const BalanceSheet = require('../models/BalanceSheet');
const { auth, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { getIstDayRange } = require('../utils/date');

router.use(auth);

// Helper to populate order consistently
const populateOrder = (query) => {
  return query
    .populate('table', 'tableNumber capacity status')
    .populate('items.menuItem', 'name price isVeg isAvailable category')
    .populate('createdBy', 'name');
};

// ─────────────────────────────────────────────────────────────────
// GET /api/orders — list orders
// ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const orders = await populateOrder(
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
    );

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/orders/table/:tableId/active — current active order for table
// ─────────────────────────────────────────────────────────────────
router.get('/table/:tableId/active', async (req, res) => {
  try {
    const order = await populateOrder(
      Order.findOne({
        table: req.params.tableId,
        status: { $nin: ['paid', 'cancelled'] },
      }).sort({ createdAt: -1 })
    );

    res.json(order || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/orders/pending-kots — List unprinted KOT rounds across active orders
// Polled by the Print Station laptop to auto-print KOTs placed by mobiles
// ─────────────────────────────────────────────────────────────────
router.get('/pending-kots', async (req, res) => {
  try {
    const activeOrders = await Order.find({
      status: { $nin: ['paid', 'cancelled'] },
      'kotRounds.printed': false,
    })
      .populate('table', 'tableNumber')
      .populate('createdBy', 'name')
      .sort({ createdAt: 1 });

    const pending = [];

    for (const order of activeOrders) {
      if (!Array.isArray(order.kotRounds)) continue;

      for (const round of order.kotRounds) {
        if (!round.printed) {
          pending.push({
            orderId: order._id,
            roundId: round._id,
            tableNumber: order.table ? order.table.tableNumber : 'N/A',
            orderNumber: order.orderNumber,
            kotNumber: `${order.orderNumber}-${round.roundNumber}`,
            roundNumber: round.roundNumber,
            roundTag: round.roundTag || (round.roundNumber === 1 ? '[INITIAL ORDER]' : `[ROUND ${round.roundNumber} - ADD-ON]`),
            billerName: order.createdBy ? order.createdBy.name : 'Staff',
            createdAt: round.createdAt || order.createdAt,
            items: round.items.map((it) => ({
              name: it.name,
              quantity: it.quantity,
              notes: it.notes || '',
            })),
          });
        }
      }
    }

    res.json(pending);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/orders/:id — get order by id
// ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await populateOrder(Order.findById(req.params.id));
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders — open a new order for a table (KOT)
// ─────────────────────────────────────────────────────────────────
router.post('/', adminOnly, async (req, res) => {
  try {
    const { tableId, items } = req.body;

    if (!tableId) {
      return res.status(400).json({ message: 'Table ID is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one menu item is required to open an order' });
    }

    const table = await Table.findById(tableId);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    // Reject if table is already occupied
    if (table.status === 'occupied' || table.activeOrder) {
      return res.status(400).json({ message: `Table ${table.tableNumber} is already occupied with an active order` });
    }

    // Fetch and snapshot MenuItem details
    const itemIds = items.map((i) => i.menuItemId);
    const menuItems = await MenuItem.find({ _id: { $in: itemIds } });
    const menuItemMap = new Map(menuItems.map((m) => [m._id.toString(), m]));

    const snapshottedItems = [];
    for (const it of items) {
      const mi = menuItemMap.get(String(it.menuItemId));
      if (!mi) {
        return res.status(400).json({ message: `Menu item with ID ${it.menuItemId} was not found` });
      }

      snapshottedItems.push({
        menuItem: mi._id,
        name: mi.name,
        price: mi.price,
        taxPercent: mi.taxPercent !== undefined ? mi.taxPercent : 5,
        quantity: Math.max(1, Number(it.quantity) || 1),
        notes: it.notes ? String(it.notes).trim() : '',
        status: 'pending',
      });
    }

    // Calculate totals server-side
    const totals = Order.calcTotals(snapshottedItems, 0);

    // Sequential 4-digit order number (e.g. 4501, 4510...)
    const orderCount = await Order.countDocuments();
    const orderNumber = 4500 + orderCount + 1;

    const initialKotRound = {
      roundNumber: 1,
      roundTag: '[INITIAL ORDER]',
      items: snapshottedItems.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        notes: i.notes || '',
      })),
      printed: false,
      createdAt: new Date(),
    };

    const order = await Order.create({
      table: table._id,
      orderNumber,
      kotCount: 1,
      items: snapshottedItems,
      kotRounds: [initialKotRound],
      status: 'open',
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      discount: 0,
      total: totals.total,
      createdBy: req.user._id,
    });

    // Mark table as occupied and assign activeOrder
    table.status = 'occupied';
    table.activeOrder = order._id;
    await table.save();

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Orders',
      description: `${req.user.name} opened order for Table ${table.tableNumber} with ${snapshottedItems.length} item(s) (Total: ₹${order.total})`,
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:id/items — add another KOT round to existing order
// ─────────────────────────────────────────────────────────────────
router.post('/:id/items', adminOnly, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (['paid', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot add items to an order with status "${order.status}"` });
    }

    // Fetch and snapshot MenuItems
    const itemIds = items.map((i) => i.menuItemId);
    const menuItems = await MenuItem.find({ _id: { $in: itemIds } });
    const menuItemMap = new Map(menuItems.map((m) => [m._id.toString(), m]));

    const newRoundItems = [];
    for (const it of items) {
      const mi = menuItemMap.get(String(it.menuItemId));
      if (!mi) {
        return res.status(400).json({ message: `Menu item with ID ${it.menuItemId} was not found` });
      }

      const itemObj = {
        menuItem: mi._id,
        name: mi.name,
        price: mi.price,
        taxPercent: mi.taxPercent !== undefined ? mi.taxPercent : 5,
        quantity: Math.max(1, Number(it.quantity) || 1),
        notes: it.notes ? String(it.notes).trim() : '',
        status: 'pending',
      };
      order.items.push(itemObj);
      newRoundItems.push(itemObj);
    }

    // If order was billed, adding items re-opens it for billing updates
    if (order.status === 'billed') {
      order.status = 'open';
    }

    const totals = Order.calcTotals(order.items, order.discount);
    order.subtotal = totals.subtotal;
    order.taxAmount = totals.taxAmount;
    order.total = totals.total;

    const nextKotCount = (order.kotCount || 1) + 1;
    order.kotCount = nextKotCount;

    if (!Array.isArray(order.kotRounds)) {
      order.kotRounds = [];
    }

    order.kotRounds.push({
      roundNumber: nextKotCount,
      roundTag: `[ROUND ${nextKotCount} - ADD-ON]`,
      items: newRoundItems.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        notes: i.notes || '',
      })),
      printed: false,
      createdAt: new Date(),
    });

    await order.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} added ${items.length} item(s) to Order on Table`,
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/orders/:id/items/:itemId — update one item's status/qty/notes
// ─────────────────────────────────────────────────────────────────
router.patch('/:id/items/:itemId', adminOnly, async (req, res) => {
  try {
    const { status, quantity, notes } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (['paid', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot modify an order with status "${order.status}"` });
    }

    const item = order.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: 'Order item not found' });
    }

    if (status) item.status = status;
    if (quantity !== undefined && Number(quantity) > 0) item.quantity = Number(quantity);
    if (notes !== undefined) item.notes = notes;

    const totals = Order.calcTotals(order.items, order.discount);
    order.subtotal = totals.subtotal;
    order.taxAmount = totals.taxAmount;
    order.total = totals.total;

    await order.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} updated item "${item.name}" on Order`,
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/orders/:id/items/:itemId — soft-cancel one item
// ─────────────────────────────────────────────────────────────────
router.delete('/:id/items/:itemId', adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (['paid', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot modify an order with status "${order.status}"` });
    }

    const item = order.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: 'Order item not found' });
    }

    // Soft-cancel: kept for record, excluded from totals
    item.status = 'cancelled';

    const totals = Order.calcTotals(order.items, order.discount);
    order.subtotal = totals.subtotal;
    order.taxAmount = totals.taxAmount;
    order.total = totals.total;

    await order.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} cancelled item "${item.name}" on Order`,
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/orders/:id/discount — set percentage or flat discount
// ─────────────────────────────────────────────────────────────────
router.patch('/:id/discount', adminOnly, async (req, res) => {
  try {
    const { discount, discountValue, discountType = 'flat' } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (['paid', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot modify an order with status "${order.status}"` });
    }

    const type = discountType === 'percentage' ? 'percentage' : 'flat';
    const val = discountValue !== undefined ? Number(discountValue) : Number(discount) || 0;

    const totals = Order.calcTotals(order.items, val, type);
    order.subtotal = totals.subtotal;
    order.taxAmount = totals.taxAmount;
    order.discountType = totals.discountType;
    order.discountValue = totals.discountValue;
    order.discount = totals.discount;
    order.total = totals.total;

    await order.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} applied ${type === 'percentage' ? `${totals.discountValue}%` : `₹${totals.discountValue}`} discount (₹${order.discount}) on Order`,
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:id/bill — status → billed
// ─────────────────────────────────────────────────────────────────
router.post('/:id/bill', adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (['paid', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot bill an order with status "${order.status}"` });
    }

    order.status = 'billed';
    await order.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} generated bill for Order (Total: ₹${order.total})`,
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:id/pay — Accounting integration endpoint
// ─────────────────────────────────────────────────────────────────
router.post('/:id/pay', adminOnly, async (req, res) => {
  try {
    const { paymentMethod, settlementAmount } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Guard against double payment
    if (order.status === 'paid') {
      return res.status(400).json({ message: 'Order is already paid' });
    }
    if (order.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot pay a cancelled order' });
    }

    const validMethods = ['cash', 'card', 'upi', 'other'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ message: `Invalid payment method "${paymentMethod}". Allowed: ${validMethods.join(', ')}` });
    }

    // Determine settled and waived amounts
    let finalSettled = order.total;
    let waivedAmount = 0;

    if (settlementAmount !== undefined && settlementAmount !== null && String(settlementAmount).trim() !== '') {
      const parsed = Number(settlementAmount);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'Settlement amount must be a positive number' });
      }
      finalSettled = Math.round(parsed * 100) / 100;
      if (finalSettled < order.total) {
        waivedAmount = Math.round((order.total - finalSettled) * 100) / 100;
      } else {
        finalSettled = order.total;
        waivedAmount = 0;
      }
    }

    // 1. Map paymentMethod -> SalesEntry.paymentBreakdown key
    // cash -> cash, upi -> upi, card -> card, other -> bankTransfer
    const breakdownKey = paymentMethod === 'other' ? 'bankTransfer' : paymentMethod;

    // 2. Upsert TODAY's single SalesEntry using Indian Standard Time calendar range
    const { start, end, canonicalDate } = getIstDayRange(new Date());

    let salesEntry = await SalesEntry.findOne({ date: { $gte: start, $lte: end } });
    if (!salesEntry) {
      salesEntry = new SalesEntry({
        date: canonicalDate,
        paymentBreakdown: { cash: 0, upi: 0, card: 0, bankTransfer: 0 },
        outletSales: 0,
        totalRevenue: 0,
        createdBy: req.user._id,
      });
    }

    if (!salesEntry.paymentBreakdown) {
      salesEntry.paymentBreakdown = { cash: 0, upi: 0, card: 0, bankTransfer: 0 };
    }

    // Accumulate the actual collected amount (finalSettled) into the single daily row
    salesEntry.paymentBreakdown[breakdownKey] = (salesEntry.paymentBreakdown[breakdownKey] || 0) + finalSettled;
    const { outletSales, totalRevenue } = SalesEntry.calcTotals(salesEntry);
    salesEntry.outletSales = outletSales;
    salesEntry.totalRevenue = totalRevenue;
    await salesEntry.save();

    // 3. Credit the matching real Account document with the settled amount
    if (finalSettled > 0) {
      if (breakdownKey === 'cash') {
        const cashAccount = await Account.findOne({ type: 'cash', isActive: true }).sort('name');
        if (cashAccount) {
          await Account.findByIdAndUpdate(cashAccount._id, {
            $inc: { currentBalance: finalSettled },
          });
        }
      } else {
        const bankAccount = await Account.findOne({ type: { $in: ['bank', 'digital'] }, isActive: true }).sort('name');
        if (bankAccount) {
          await Account.findByIdAndUpdate(bankAccount._id, {
            $inc: { currentBalance: finalSettled },
          });
        }
      }
    }

    // 4. GST liability & gstLog on BalanceSheet
    // Use order.taxAmount if calculated, otherwise proportional to settled amount
    const gstToAdd = order.taxAmount > 0
      ? order.taxAmount
      : Math.round(finalSettled * 0.0477 * 100) / 100;

    const tableDoc = await Table.findById(order.table);
    const tableNum = tableDoc ? tableDoc.tableNumber : '';

    if (gstToAdd > 0) {
      const bs = await BalanceSheet.getSingleton();
      bs.gstLiability = Math.max(0, bs.gstLiability + gstToAdd);
      bs.gstLog.push({
        date: new Date(),
        salesEntryId: salesEntry._id,
        outletSales: finalSettled,
        gstAdded: gstToAdd,
        note: `Auto: GST on ₹${finalSettled} POS Dine-in Order (Table ${tableNum})${waivedAmount > 0 ? ` [Waived: ₹${waivedAmount}]` : ''}`,
      });
      bs.lastUpdated = new Date();
      bs.lastUpdatedBy = req.user.name;
      await bs.save();
    }

    // 5. Never touch the Payment model (it is for supplier dues)

    // 6. Record settled amount, waived amount, mark order paid, free the table
    order.status = 'paid';
    order.paidAt = new Date();
    order.paymentMethod = paymentMethod;
    order.settledAmount = finalSettled;
    order.waivedAmount = waivedAmount;
    await order.save();

    if (tableDoc) {
      tableDoc.status = 'available';
      tableDoc.activeOrder = null;
      await tableDoc.save();
    }

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} collected payment of ₹${finalSettled}${waivedAmount > 0 ? ` (Waived: ₹${waivedAmount})` : ''} via ${paymentMethod.toUpperCase()} for Order on Table ${tableNum}`,
      metadata: { orderId: order._id, paymentMethod, settledAmount: finalSettled, waivedAmount },
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:id/cancel — cancel unpaid order, free table
// ─────────────────────────────────────────────────────────────────
router.post('/:id/cancel', adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status === 'paid') {
      return res.status(400).json({ message: 'Cannot cancel an already paid order' });
    }

    order.status = 'cancelled';
    await order.save();

    const tableDoc = await Table.findById(order.table);
    if (tableDoc && String(tableDoc.activeOrder) === String(order._id)) {
      tableDoc.status = 'available';
      tableDoc.activeOrder = null;
      await tableDoc.save();
    }

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} cancelled order for Table ${tableDoc ? tableDoc.tableNumber : ''}`,
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:orderId/rounds/:roundId/mark-printed — Acknowledge KOT printed
// ─────────────────────────────────────────────────────────────────
router.post('/:orderId/rounds/:roundId/mark-printed', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!Array.isArray(order.kotRounds)) {
      return res.status(404).json({ message: 'No KOT rounds found on order' });
    }

    const round = order.kotRounds.id(req.params.roundId);
    if (!round) {
      return res.status(404).json({ message: 'KOT round not found' });
    }

    round.printed = true;
    round.printedAt = new Date();
    await order.save();

    res.json({ success: true, message: 'KOT marked as printed', roundId: round._id });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:orderId/reprint — Queue full KOT reprint for print station
// ─────────────────────────────────────────────────────────────────
router.post('/:orderId/reprint', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const activeItems = order.items
      .filter((i) => i.status !== 'cancelled')
      .map((i) => ({
        name: i.name,
        quantity: i.quantity,
        notes: i.notes || '',
      }));

    if (activeItems.length === 0) {
      return res.status(400).json({ message: 'No active items to reprint' });
    }

    if (!Array.isArray(order.kotRounds)) {
      order.kotRounds = [];
    }

    const newRoundNumber = order.kotRounds.length + 1;
    order.kotRounds.push({
      roundNumber: newRoundNumber,
      roundTag: '[KOT REPRINT]',
      items: activeItems,
      printed: false,
    });

    await order.save();
    res.json({ success: true, message: 'Reprint KOT queued for print station' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:orderId/rounds/:roundId/reprint — Re-queue KOT for print station
// ─────────────────────────────────────────────────────────────────
router.post('/:orderId/rounds/:roundId/reprint', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!Array.isArray(order.kotRounds)) {
      return res.status(404).json({ message: 'No KOT rounds found on order' });
    }

    const round = order.kotRounds.id(req.params.roundId);
    if (!round) {
      return res.status(404).json({ message: 'KOT round not found' });
    }

    round.printed = false;
    await order.save();

    res.json({ success: true, message: 'KOT re-queued for print station', roundId: round._id });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
