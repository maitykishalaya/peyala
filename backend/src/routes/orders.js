const router = require('express').Router();
const Order = require('../models/Order');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const SalesEntry = require('../models/SalesEntry');
const Account = require('../models/Account');
const BalanceSheet = require('../models/BalanceSheet');
const { auth, adminOnly, managerOrAdmin } = require('../middleware/auth');
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
router.post('/', managerOrAdmin, async (req, res) => {
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

      let basePrice = mi.price;
      let variantObj = undefined;
      if (it.variant && typeof it.variant.price === 'number') {
        basePrice = Number(it.variant.price);
        variantObj = {
          name: String(it.variant.name || '').trim(),
          price: basePrice,
        };
      }

      let addonsTotal = 0;
      const validSelectedAddons = [];
      if (Array.isArray(it.selectedAddons)) {
        for (const a of it.selectedAddons) {
          if (a && typeof a.name === 'string') {
            const addonPrice = Math.max(0, Number(a.price) || 0);
            addonsTotal += addonPrice;
            validSelectedAddons.push({
              addon: a.addon || a.addonId || undefined,
              name: a.name.trim(),
              price: addonPrice,
            });
          }
        }
      }

      const finalUnitPrice = basePrice + addonsTotal;

      snapshottedItems.push({
        menuItem: mi._id,
        name: mi.name,
        price: finalUnitPrice,
        taxPercent: mi.taxPercent !== undefined ? mi.taxPercent : 5,
        quantity: Math.max(1, Number(it.quantity) || 1),
        notes: it.notes ? String(it.notes).trim() : '',
        variant: variantObj,
        selectedAddons: validSelectedAddons,
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
        variantName: i.variant?.name || '',
        addons: i.selectedAddons?.map((a) => a.name) || [],
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
router.post('/:id/items', managerOrAdmin, async (req, res) => {
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

      let basePrice = mi.price;
      let variantObj = undefined;
      if (it.variant && typeof it.variant.price === 'number') {
        basePrice = Number(it.variant.price);
        variantObj = {
          name: String(it.variant.name || '').trim(),
          price: basePrice,
        };
      }

      let addonsTotal = 0;
      const validSelectedAddons = [];
      if (Array.isArray(it.selectedAddons)) {
        for (const a of it.selectedAddons) {
          if (a && typeof a.name === 'string') {
            const addonPrice = Math.max(0, Number(a.price) || 0);
            addonsTotal += addonPrice;
            validSelectedAddons.push({
              addon: a.addon || a.addonId || undefined,
              name: a.name.trim(),
              price: addonPrice,
            });
          }
        }
      }

      const finalUnitPrice = basePrice + addonsTotal;

      const itemObj = {
        menuItem: mi._id,
        name: mi.name,
        price: finalUnitPrice,
        taxPercent: mi.taxPercent !== undefined ? mi.taxPercent : 5,
        quantity: Math.max(1, Number(it.quantity) || 1),
        notes: it.notes ? String(it.notes).trim() : '',
        variant: variantObj,
        selectedAddons: validSelectedAddons,
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
        variantName: i.variant?.name || '',
        addons: i.selectedAddons?.map((a) => a.name) || [],
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
router.patch('/:id/items/:itemId', managerOrAdmin, async (req, res) => {
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
router.delete('/:id/items/:itemId', managerOrAdmin, async (req, res) => {
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
router.patch('/:id/discount', managerOrAdmin, async (req, res) => {
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
router.post('/:id/bill', managerOrAdmin, async (req, res) => {
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
router.post('/:id/pay', managerOrAdmin, async (req, res) => {
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

    const validMethods = ['cash', 'card', 'upi', 'other', 'part'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ message: `Invalid payment method "${paymentMethod}". Allowed: ${validMethods.join(', ')}` });
    }

    // Determine breakdown and settled/waived amounts
    let finalSettled = order.total;
    let waivedAmount = 0;
    let orderPaymentBreakdown = { cash: 0, upi: 0, card: 0, other: 0 };

    if (paymentMethod === 'part') {
      const pb = req.body.paymentBreakdown || {};
      const cashPart = Math.max(0, Math.round((Number(pb.cash) || 0) * 100) / 100);
      const upiPart = Math.max(0, Math.round((Number(pb.upi) || 0) * 100) / 100);
      const cardPart = Math.max(0, Math.round((Number(pb.card) || 0) * 100) / 100);
      const otherPart = Math.max(0, Math.round((Number(pb.other) || 0) * 100) / 100);
      const sumParts = Math.round((cashPart + upiPart + cardPart + otherPart) * 100) / 100;

      if (sumParts <= 0) {
        return res.status(400).json({ message: 'Part payment requires at least one positive payment amount.' });
      }

      finalSettled = sumParts;
      if (finalSettled < order.total) {
        waivedAmount = Math.round((order.total - finalSettled) * 100) / 100;
      } else {
        waivedAmount = 0;
      }
      orderPaymentBreakdown = { cash: cashPart, upi: upiPart, card: cardPart, other: otherPart };
    } else {
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
      if (paymentMethod === 'cash') orderPaymentBreakdown.cash = finalSettled;
      else if (paymentMethod === 'upi') orderPaymentBreakdown.upi = finalSettled;
      else if (paymentMethod === 'card') orderPaymentBreakdown.card = finalSettled;
      else orderPaymentBreakdown.other = finalSettled;
    }

    // 1. Upsert TODAY's single SalesEntry using Indian Standard Time calendar range
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

    // Accumulate the collected breakdown amounts into the single daily row
    salesEntry.paymentBreakdown.cash = (salesEntry.paymentBreakdown.cash || 0) + orderPaymentBreakdown.cash;
    salesEntry.paymentBreakdown.upi = (salesEntry.paymentBreakdown.upi || 0) + orderPaymentBreakdown.upi;
    salesEntry.paymentBreakdown.card = (salesEntry.paymentBreakdown.card || 0) + orderPaymentBreakdown.card;
    salesEntry.paymentBreakdown.bankTransfer = (salesEntry.paymentBreakdown.bankTransfer || 0) + orderPaymentBreakdown.other;

    const { outletSales, totalRevenue } = SalesEntry.calcTotals(salesEntry);
    salesEntry.outletSales = outletSales;
    salesEntry.totalRevenue = totalRevenue;
    await salesEntry.save();

    // 2. Credit the matching real Account documents
    if (orderPaymentBreakdown.cash > 0) {
      const cashAccount = await Account.findOne({ type: 'cash', isActive: true }).sort('name');
      if (cashAccount) {
        await Account.findByIdAndUpdate(cashAccount._id, {
          $inc: { currentBalance: orderPaymentBreakdown.cash },
        });
      }
    }
    const digitalAmount = orderPaymentBreakdown.upi + orderPaymentBreakdown.card + orderPaymentBreakdown.other;
    if (digitalAmount > 0) {
      const bankAccount = await Account.findOne({ type: { $in: ['bank', 'digital'] }, isActive: true }).sort('name');
      if (bankAccount) {
        await Account.findByIdAndUpdate(bankAccount._id, {
          $inc: { currentBalance: digitalAmount },
        });
      }
    }

    // 3. GST liability & gstLog on BalanceSheet
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

    // 4. Record settled amount, waived amount, payment breakdown, mark order paid, free the table
    order.status = 'paid';
    order.paidAt = new Date();
    order.paymentMethod = paymentMethod;
    order.paymentBreakdown = orderPaymentBreakdown;
    order.settledAmount = finalSettled;
    order.waivedAmount = waivedAmount;
    await order.save();

    if (tableDoc) {
      tableDoc.status = 'available';
      tableDoc.activeOrder = null;
      await tableDoc.save();
    }

    const methodDesc = paymentMethod === 'part'
      ? `PART PAYMENT (Cash: ₹${orderPaymentBreakdown.cash}, UPI: ₹${orderPaymentBreakdown.upi}${orderPaymentBreakdown.card ? `, Card: ₹${orderPaymentBreakdown.card}` : ''}${orderPaymentBreakdown.other ? `, Other: ₹${orderPaymentBreakdown.other}` : ''})`
      : paymentMethod.toUpperCase();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} collected payment of ₹${finalSettled}${waivedAmount > 0 ? ` (Waived: ₹${waivedAmount})` : ''} via ${methodDesc} for Order on Table ${tableNum}`,
      metadata: { orderId: order._id, paymentMethod, paymentBreakdown: orderPaymentBreakdown, settledAmount: finalSettled, waivedAmount },
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
router.post('/:id/cancel', managerOrAdmin, async (req, res) => {
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

// ─────────────────────────────────────────────────────────────────
// DELETE /api/orders/:id/settled — Admin Only: Delete settled bill & reverse all financials
// ─────────────────────────────────────────────────────────────────
router.delete('/:id/settled', adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'paid') {
      return res.status(400).json({ message: 'Only settled (paid) bills can be deleted via this endpoint' });
    }

    const settledAmt = order.settledAmount !== null && order.settledAmount !== undefined
      ? order.settledAmount
      : order.total;
    const paymentMethod = (order.paymentMethod || 'other').toLowerCase();

    // Determine breakdown of amounts being reversed
    let oldCash = 0, oldUpi = 0, oldCard = 0, oldOther = 0;
    if (order.paymentBreakdown && (order.paymentBreakdown.cash || order.paymentBreakdown.upi || order.paymentBreakdown.card || order.paymentBreakdown.other)) {
      oldCash = order.paymentBreakdown.cash || 0;
      oldUpi = order.paymentBreakdown.upi || 0;
      oldCard = order.paymentBreakdown.card || 0;
      oldOther = order.paymentBreakdown.other || 0;
    } else {
      const pm = paymentMethod;
      if (pm === 'cash') oldCash = settledAmt;
      else if (pm === 'upi') oldUpi = settledAmt;
      else if (pm === 'card') oldCard = settledAmt;
      else oldOther = settledAmt;
    }

    // 1. Reverse Account Balance (Deduct from Cash or Bank Account)
    if (oldCash > 0) {
      const cashAccount = await Account.findOne({ type: 'cash', isActive: true }).sort('name');
      if (cashAccount) {
        await Account.findByIdAndUpdate(cashAccount._id, {
          $inc: { currentBalance: -oldCash },
        });
      }
    }
    const oldDigital = oldUpi + oldCard + oldOther;
    if (oldDigital > 0) {
      const bankAccount = await Account.findOne({ type: { $in: ['bank', 'digital'] }, isActive: true }).sort('name');
      if (bankAccount) {
        await Account.findByIdAndUpdate(bankAccount._id, {
          $inc: { currentBalance: -oldDigital },
        });
      }
    }

    // 2. Reverse Daily Sales Register (SalesEntry for the calendar date in IST)
    const orderDate = order.paidAt || order.createdAt || new Date();
    const { start, end } = getIstDayRange(orderDate);
    const salesEntry = await SalesEntry.findOne({ date: { $gte: start, $lte: end } });
    if (salesEntry && salesEntry.paymentBreakdown) {
      salesEntry.paymentBreakdown.cash = Math.max(0, (salesEntry.paymentBreakdown.cash || 0) - oldCash);
      salesEntry.paymentBreakdown.upi = Math.max(0, (salesEntry.paymentBreakdown.upi || 0) - oldUpi);
      salesEntry.paymentBreakdown.card = Math.max(0, (salesEntry.paymentBreakdown.card || 0) - oldCard);
      salesEntry.paymentBreakdown.bankTransfer = Math.max(0, (salesEntry.paymentBreakdown.bankTransfer || 0) - oldOther);
      const { outletSales, totalRevenue } = SalesEntry.calcTotals(salesEntry);
      salesEntry.outletSales = outletSales;
      salesEntry.totalRevenue = totalRevenue;
      await salesEntry.save();
    }

    // 3. Reverse GST Liability on BalanceSheet
    const gstToRemove = order.taxAmount > 0
      ? order.taxAmount
      : Math.round(settledAmt * 0.0477 * 100) / 100;

    if (gstToRemove > 0) {
      const bs = await BalanceSheet.getSingleton();
      bs.gstLiability = Math.max(0, bs.gstLiability - gstToRemove);
      bs.gstLog.push({
        date: new Date(),
        salesEntryId: salesEntry ? salesEntry._id : undefined,
        outletSales: -settledAmt,
        gstAdded: -gstToRemove,
        note: `Reversal: Deleted Settled Bill #${order.orderNumber || order._id} (Admin: ${req.user.name})`,
      });
      bs.lastUpdated = new Date();
      bs.lastUpdatedBy = req.user.name;
      await bs.save();
    }

    // 4. Free table if still attached (edge case)
    const tableDoc = await Table.findById(order.table);
    if (tableDoc && tableDoc.activeOrder && tableDoc.activeOrder.toString() === order._id.toString()) {
      tableDoc.activeOrder = null;
      tableDoc.status = 'available';
      await tableDoc.save();
    }

    // 5. Permanently remove the order document
    await Order.findByIdAndDelete(order._id);

    // 6. Audit Logging
    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Orders',
      description: `${req.user.name} deleted settled bill #${order.orderNumber || order._id} (Reversed ₹${settledAmt} from ${paymentMethod.toUpperCase()} and ₹${gstToRemove} GST)`,
      metadata: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        reversedSettled: settledAmt,
        reversedGst: gstToRemove,
        paymentMethod,
      },
    });

    res.json({
      success: true,
      message: `Settled bill #${order.orderNumber || order._id} deleted successfully. Reversed ₹${settledAmt} and ₹${gstToRemove} GST liability.`,
      reversedSettled: settledAmt,
      reversedGst: gstToRemove,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/orders/:id/settled — Admin Only: Modify settled bill & reconcile financials
// ─────────────────────────────────────────────────────────────────
router.put('/:id/settled', adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'paid') {
      return res.status(400).json({ message: 'Only settled (paid) bills can be modified via this endpoint' });
    }

    // 1. Snapshot previous financial figures & payment breakdown
    const oldSettled = order.settledAmount !== null && order.settledAmount !== undefined
      ? order.settledAmount
      : order.total;
    const oldMethod = (order.paymentMethod || 'other').toLowerCase();

    let oldCash = 0, oldUpi = 0, oldCard = 0, oldOther = 0;
    if (order.paymentBreakdown && (order.paymentBreakdown.cash || order.paymentBreakdown.upi || order.paymentBreakdown.card || order.paymentBreakdown.other)) {
      oldCash = order.paymentBreakdown.cash || 0;
      oldUpi = order.paymentBreakdown.upi || 0;
      oldCard = order.paymentBreakdown.card || 0;
      oldOther = order.paymentBreakdown.other || 0;
    } else {
      if (oldMethod === 'cash') oldCash = oldSettled;
      else if (oldMethod === 'upi') oldUpi = oldSettled;
      else if (oldMethod === 'card') oldCard = oldSettled;
      else oldOther = oldSettled;
    }

    const oldTax = order.taxAmount > 0
      ? order.taxAmount
      : Math.round(oldSettled * 0.0477 * 100) / 100;

    // 2. Parse and recalculate items if provided
    let newSubtotal = order.subtotal;
    let newTaxAmount = order.taxAmount;

    if (Array.isArray(req.body.items) && req.body.items.length > 0) {
      let sub = 0;
      let tax = 0;

      const formattedItems = req.body.items.map((it) => {
        const itemPrice = Number(it.price) || 0;
        const itemQty = Math.max(1, Number(it.quantity) || 1);
        const itemTaxPct = it.taxPercent !== undefined ? Number(it.taxPercent) : 5;
        const lineTotal = itemPrice * itemQty;
        const lineTax = (lineTotal * itemTaxPct) / 100;

        if (it.status !== 'cancelled') {
          sub += lineTotal;
          tax += lineTax;
        }

        return {
          menuItem: it.menuItem || it.menuItemId,
          name: String(it.name || 'Custom Item').trim(),
          price: itemPrice,
          quantity: itemQty,
          taxPercent: itemTaxPct,
          notes: it.notes || '',
          variant: it.variant ? { name: it.variant.name, price: it.variant.price } : undefined,
          selectedAddons: Array.isArray(it.selectedAddons)
            ? it.selectedAddons.map((a) => ({ addon: a.addon || a.addonId, name: a.name, price: a.price }))
            : [],
          status: it.status || 'served',
        };
      });

      newSubtotal = Math.round(sub * 100) / 100;
      newTaxAmount = Math.round(tax * 100) / 100;
      order.items = formattedItems;
    }

    // 3. Discount recalculation
    const discountType = req.body.discountType === 'percentage' ? 'percentage' : 'flat';
    const discountValue = Math.max(0, Number(req.body.discountValue !== undefined ? req.body.discountValue : order.discountValue) || 0);
    const newDiscount = discountType === 'percentage'
      ? Math.round(((newSubtotal * discountValue) / 100) * 100) / 100
      : Math.min(newSubtotal, discountValue);

    // 4. Grand Total & Settlement recalculation
    const newTotal = Math.max(0, Math.round((newSubtotal - newDiscount + newTaxAmount) * 100) / 100);

    const validMethods = ['cash', 'card', 'upi', 'other', 'part'];
    const newMethod = req.body.paymentMethod && validMethods.includes(req.body.paymentMethod)
      ? req.body.paymentMethod.toLowerCase()
      : oldMethod;

    let newSettled = newTotal;
    let newCash = 0, newUpi = 0, newCard = 0, newOther = 0;

    if (newMethod === 'part') {
      const pb = req.body.paymentBreakdown || {};
      newCash = Math.max(0, Math.round((Number(pb.cash) || 0) * 100) / 100);
      newUpi = Math.max(0, Math.round((Number(pb.upi) || 0) * 100) / 100);
      newCard = Math.max(0, Math.round((Number(pb.card) || 0) * 100) / 100);
      newOther = Math.max(0, Math.round((Number(pb.other) || 0) * 100) / 100);
      newSettled = Math.round((newCash + newUpi + newCard + newOther) * 100) / 100;
    } else {
      if (req.body.settlementAmount !== undefined && req.body.settlementAmount !== null && String(req.body.settlementAmount).trim() !== '') {
        const parsed = Number(req.body.settlementAmount);
        if (!isNaN(parsed) && parsed >= 0) {
          newSettled = Math.round(parsed * 100) / 100;
        }
      }
      if (newMethod === 'cash') newCash = newSettled;
      else if (newMethod === 'upi') newUpi = newSettled;
      else if (newMethod === 'card') newCard = newSettled;
      else newOther = newSettled;
    }

    const newWaived = Math.max(0, Math.round((newTotal - newSettled) * 100) / 100);

    // 5. Account Balances Reversal & Application (Net Adjustments)
    const netCashDiff = Math.round((newCash - oldCash) * 100) / 100;
    if (netCashDiff !== 0) {
      const cashAcc = await Account.findOne({ type: 'cash', isActive: true }).sort('name');
      if (cashAcc) {
        await Account.findByIdAndUpdate(cashAcc._id, { $inc: { currentBalance: netCashDiff } });
      }
    }

    const oldDigital = oldUpi + oldCard + oldOther;
    const newDigital = newUpi + newCard + newOther;
    const netDigitalDiff = Math.round((newDigital - oldDigital) * 100) / 100;
    if (netDigitalDiff !== 0) {
      const bankAcc = await Account.findOne({ type: { $in: ['bank', 'digital'] }, isActive: true }).sort('name');
      if (bankAcc) {
        await Account.findByIdAndUpdate(bankAcc._id, { $inc: { currentBalance: netDigitalDiff } });
      }
    }

    // 6. Reconcile Daily Sales Register
    const orderDate = order.paidAt || order.createdAt || new Date();
    const { start, end } = getIstDayRange(orderDate);
    const salesEntry = await SalesEntry.findOne({ date: { $gte: start, $lte: end } });
    if (salesEntry && salesEntry.paymentBreakdown) {
      salesEntry.paymentBreakdown.cash = Math.max(0, (salesEntry.paymentBreakdown.cash || 0) + (newCash - oldCash));
      salesEntry.paymentBreakdown.upi = Math.max(0, (salesEntry.paymentBreakdown.upi || 0) + (newUpi - oldUpi));
      salesEntry.paymentBreakdown.card = Math.max(0, (salesEntry.paymentBreakdown.card || 0) + (newCard - oldCard));
      salesEntry.paymentBreakdown.bankTransfer = Math.max(0, (salesEntry.paymentBreakdown.bankTransfer || 0) + (newOther - oldOther));
      const { outletSales, totalRevenue } = SalesEntry.calcTotals(salesEntry);
      salesEntry.outletSales = outletSales;
      salesEntry.totalRevenue = totalRevenue;
      await salesEntry.save();
    }

    // 7. Reconcile GST Liability on BalanceSheet
    const effectiveNewGst = newTaxAmount > 0
      ? newTaxAmount
      : Math.round(newSettled * 0.0477 * 100) / 100;
    const gstDiff = Math.round((effectiveNewGst - oldTax) * 100) / 100;

    if (gstDiff !== 0) {
      const bs = await BalanceSheet.getSingleton();
      bs.gstLiability = Math.max(0, bs.gstLiability + gstDiff);
      bs.gstLog.push({
        date: new Date(),
        salesEntryId: salesEntry ? salesEntry._id : undefined,
        outletSales: newSettled - oldSettled,
        gstAdded: gstDiff,
        note: `Adjustment: Modified Settled Bill #${order.orderNumber || order._id} (Admin: ${req.user.name})`,
      });
      bs.lastUpdated = new Date();
      bs.lastUpdatedBy = req.user.name;
      await bs.save();
    }

    // 8. Update Order
    order.subtotal = newSubtotal;
    order.taxAmount = newTaxAmount;
    order.discountType = discountType;
    order.discountValue = discountValue;
    order.discount = newDiscount;
    order.total = newTotal;
    order.settledAmount = newSettled;
    order.waivedAmount = newWaived;
    order.paymentMethod = newMethod;
    order.paymentBreakdown = { cash: newCash, upi: newUpi, card: newCard, other: newOther };
    await order.save();

    // 9. Audit Logging
    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} modified settled bill #${order.orderNumber || order._id} (Amount: ₹${oldSettled} ${oldMethod.toUpperCase()} -> ₹${newSettled} ${newMethod.toUpperCase()}, GST diff: ₹${gstDiff})`,
      metadata: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        oldSettled,
        newSettled,
        oldMethod,
        newMethod,
        gstDiff,
      },
    });

    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
