const router = require('express').Router();
const Order = require('../models/Order');
const Table = require('../models/Table');
const MenuItem = require('../models/MenuItem');
const SalesEntry = require('../models/SalesEntry');
const Account = require('../models/Account');
const BalanceSheet = require('../models/BalanceSheet');
const { auth, adminOnly, managerOrAdmin, staffOrAdmin } = require('../middleware/auth');
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
            items: round.items.map((it) => {
              let vName = it.variantName || '';
              if (!vName) {
                const match = (order.items || []).find(
                  (oi) => oi.name === it.name && oi.variant && oi.variant.name
                );
                if (match) vName = match.variant.name;
              }
              const addonsList = Array.isArray(it.addons) && it.addons.length > 0
                ? it.addons
                : (order.items || []).find((oi) => oi.name === it.name && oi.selectedAddons?.length)?.selectedAddons?.map((a) => a.name) || [];

              return {
                name: it.name,
                quantity: it.quantity,
                notes: it.notes || '',
                variantName: vName,
                addons: addonsList,
              };
            }),
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
// GET /api/orders/pending-bills — List unprinted customer bills across billed/paid orders
// Polled by the Print Station laptop to auto-print finalized bills placed from mobile devices
// ─────────────────────────────────────────────────────────────────
router.get('/pending-bills', async (req, res) => {
  try {
    const pendingOrders = await Order.find({
      billPrintQueued: true,
    })
      .populate('table', 'tableNumber')
      .populate('createdBy', 'name')
      .sort({ billPrintQueuedAt: 1, updatedAt: 1 });

    const pending = pendingOrders.map((order) => {
      const activeItems = (order.items || [])
        .filter((i) => i.status !== 'cancelled')
        .map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          taxPercent: i.taxPercent || 0,
          notes: i.notes || '',
          variantName: i.variant?.name || '',
          addons: (i.selectedAddons || []).map((a) => ({ name: a.name, price: a.price || 0 })),
        }));

      return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        billPrintSeq: order.billPrintSeq || 1,
        tokenNo: order.orderNumber ? String(order.orderNumber).slice(-2) : String(order._id).slice(-2),
        tableNumber: order.table ? order.table.tableNumber : 'Takeaway',
        billerName: order.createdBy ? order.createdBy.name : 'Staff',
        createdAt: order.createdAt,
        items: activeItems,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        discount: order.discount || 0,
        discountType: order.discountType || 'flat',
        discountValue: order.discountValue || 0,
        total: order.total,
        settledAmount: order.settledAmount,
        waivedAmount: order.waivedAmount || 0,
        paymentMethod: order.paymentMethod || 'cash',
        paymentBreakdown: order.paymentBreakdown || {},
        isPaid: order.status === 'paid',
      };
    });

    res.json(pending);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/orders/kds/active — Kitchen Display System Active Feed
// Returns active cooking orders and smart "Prep Next" aggregated items
// ─────────────────────────────────────────────────────────────────
router.get('/kds/active', async (req, res) => {
  try {
    const orders = await populateOrder(
      Order.find({
        status: { $in: ['open', 'preparing', 'served', 'billed'] },
      }).sort({ createdAt: 1 })
    );

    // Filter out orders that have no active items left (all cancelled or already completed)
    const activeOrders = orders.filter((o) => {
      if (!Array.isArray(o.items) || o.items.length === 0) return false;
      return o.items.some((i) => i.status !== 'cancelled');
    });

    // Compute "Prep Next" (Smart Item-wise Aggregation)
    const prepMap = new Map();

    for (const order of activeOrders) {
      if (!Array.isArray(order.items)) continue;
      const tableNumber = order.table
        ? typeof order.table === 'object'
          ? order.table.tableNumber
          : 'Takeaway'
        : 'Takeaway';
      const orderCreatedAt = order.createdAt;

      for (const item of order.items) {
        if (item.status === 'cancelled' || item.status === 'served') continue;

        const menuItemId = item.menuItem
          ? typeof item.menuItem === 'object'
            ? String(item.menuItem._id)
            : String(item.menuItem)
          : item.name;
        const variantName = item.variant?.name || '';
        const key = `${menuItemId}__${variantName}`;

        const existing = prepMap.get(key);
        if (!existing) {
          prepMap.set(key, {
            key,
            menuItemId,
            name: item.name,
            variantName,
            isVeg:
              typeof item.menuItem === 'object' && item.menuItem !== null
                ? Boolean(item.menuItem.isVeg)
                : false,
            category:
              typeof item.menuItem === 'object' && item.menuItem?.category
                ? item.menuItem.category
                : null,
            totalQuantity: item.quantity,
            pendingQuantity: item.status === 'pending' ? item.quantity : 0,
            preparingQuantity: item.status === 'preparing' ? item.quantity : 0,
            oldestOrderAt: orderCreatedAt,
            notes: item.notes ? [item.notes] : [],
            tables: [
              {
                orderId: order._id,
                itemId: item._id,
                tableNumber,
                tokenNumber: order.orderNumber,
                quantity: item.quantity,
                status: item.status,
                notes: item.notes || '',
                createdAt: orderCreatedAt,
              },
            ],
          });
        } else {
          existing.totalQuantity += item.quantity;
          if (item.status === 'pending') existing.pendingQuantity += item.quantity;
          if (item.status === 'preparing') existing.preparingQuantity += item.quantity;
          if (new Date(orderCreatedAt) < new Date(existing.oldestOrderAt)) {
            existing.oldestOrderAt = orderCreatedAt;
          }
          if (item.notes && !existing.notes.includes(item.notes)) {
            existing.notes.push(item.notes);
          }
          existing.tables.push({
            orderId: order._id,
            itemId: item._id,
            tableNumber,
            tokenNumber: order.orderNumber,
            quantity: item.quantity,
            status: item.status,
            notes: item.notes || '',
            createdAt: orderCreatedAt,
          });
        }
      }
    }

    const prepNext = Array.from(prepMap.values()).sort(
      (a, b) => new Date(a.oldestOrderAt).getTime() - new Date(b.oldestOrderAt).getTime()
    );

    res.json({ orders: activeOrders, prepNext });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/kds/batch-bump — Mark prepared dish ready across all tables
// ─────────────────────────────────────────────────────────────────
router.post('/kds/batch-bump', async (req, res) => {
  try {
    const { menuItemId, variantName } = req.body;
    if (!menuItemId) {
      return res.status(400).json({ message: 'menuItemId is required' });
    }

    const activeOrders = await Order.find({
      status: { $in: ['open', 'preparing', 'served', 'billed'] },
    });

    let updatedOrdersCount = 0;

    for (const order of activeOrders) {
      let modified = false;
      for (const item of order.items) {
        if (item.status === 'cancelled' || item.status === 'served') continue;
        const mId = item.menuItem ? String(item.menuItem) : item.name;
        const vName = item.variant?.name || '';

        if (mId === String(menuItemId) && (!variantName || vName === variantName)) {
          item.status = 'served';
          modified = true;
        }
      }

      if (modified) {
        const nonCancelled = order.items.filter((i) => i.status !== 'cancelled');
        const allServed = nonCancelled.length > 0 && nonCancelled.every((i) => i.status === 'served');
        if (allServed) {
          if (!order.foodServedAt) order.foodServedAt = new Date();
          if (!['billed', 'paid', 'cancelled'].includes(order.status)) {
            order.status = 'served';
          }
        }
        await order.save();
        updatedOrdersCount++;
      }
    }

    res.json({ success: true, message: `Batch updated across ${updatedOrdersCount} orders` });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/orders/:id/items/:itemId/kds-status — Update prep status from KDS
// ─────────────────────────────────────────────────────────────────
router.patch('/:id/items/:itemId/kds-status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'preparing', 'served'].includes(status)) {
      return res.status(400).json({ message: 'Invalid item prep status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const item = order.items.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found on order' });
    }

    item.status = status;

    const nonCancelled = order.items.filter((i) => i.status !== 'cancelled');
    const allServed = nonCancelled.length > 0 && nonCancelled.every((i) => i.status === 'served');
    if (allServed) {
      if (!order.foodServedAt) order.foodServedAt = new Date();
      if (!['billed', 'paid', 'cancelled'].includes(order.status)) {
        order.status = 'served';
      }
    } else if (status === 'preparing' && order.status === 'open') {
      order.status = 'preparing';
    }

    await order.save();
    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:id/kds-bump — Mark entire ticket ready/served from KDS
// ─────────────────────────────────────────────────────────────────
router.post('/:id/kds-bump', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        if (item.status !== 'cancelled') {
          item.status = 'served';
        }
      });
    }

    if (!order.foodServedAt) order.foodServedAt = new Date();
    if (!['billed', 'paid', 'cancelled'].includes(order.status)) {
      order.status = 'served';
    }

    await order.save();
    const populated = await populateOrder(Order.findById(order._id));
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
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
router.post('/', staffOrAdmin, async (req, res) => {
  try {
    const { tableId, items, shouldPrint } = req.body;

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
      if (it.variant && (it.variant.name || typeof it.variant.price === 'number')) {
        if (typeof it.variant.price === 'number') {
          basePrice = Number(it.variant.price);
        } else if (it.variant.price) {
          basePrice = Number(it.variant.price) || basePrice;
        }
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

    const isAutoPrint = shouldPrint !== false;
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
      printed: !isAutoPrint,
      printedAt: !isAutoPrint ? new Date() : null,
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
router.post('/:id/items', staffOrAdmin, async (req, res) => {
  try {
    const { items, shouldPrint } = req.body;
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
      if (it.variant && (it.variant.name || typeof it.variant.price === 'number')) {
        if (typeof it.variant.price === 'number') {
          basePrice = Number(it.variant.price);
        } else if (it.variant.price) {
          basePrice = Number(it.variant.price) || basePrice;
        }
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

    // If order was billed or served, adding items re-opens it for kitchen preparation
    if (['billed', 'served'].includes(order.status)) {
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

    const isAutoPrint = shouldPrint !== false;
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
      printed: !isAutoPrint,
      printedAt: !isAutoPrint ? new Date() : null,
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
router.patch('/:id/items/:itemId', staffOrAdmin, async (req, res) => {
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
router.delete('/:id/items/:itemId', staffOrAdmin, async (req, res) => {
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
router.patch('/:id/discount', staffOrAdmin, async (req, res) => {
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
// POST /api/orders/:id/mark-served — status → served (Food Served)
// ─────────────────────────────────────────────────────────────────
router.post('/:id/mark-served', staffOrAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (['paid', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot mark food served on order with status "${order.status}"` });
    }

    order.status = 'served';
    order.foodServedAt = new Date();

    // Mark all non-cancelled items as served
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        if (item.status !== 'cancelled') {
          item.status = 'served';
        }
      });
    }

    await order.save();

    const tableDoc = await Table.findById(order.table);
    const tableNum = tableDoc ? tableDoc.tableNumber : '';

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Orders',
      description: `${req.user.name} marked food served for Order on Table ${tableNum}`,
      metadata: { orderId: order._id, tableNumber: tableNum },
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
router.post('/:id/bill', staffOrAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (['paid', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot bill an order with status "${order.status}"` });
    }

    order.status = 'billed';
    order.billPrinted = false;
    order.billPrintQueued = true;
    order.billPrintQueuedAt = new Date();
    order.billPrintSeq = (order.billPrintSeq || 0) + 1;

    // Stage 3 (Food Served) is optional: auto-set foodServedAt and mark pending items served if skipped
    if (!order.foodServedAt) {
      order.foodServedAt = new Date();
    }
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        if (['pending', 'preparing'].includes(item.status)) {
          item.status = 'served';
        }
      });
    }

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
router.post('/:id/pay', staffOrAdmin, async (req, res) => {
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
    order.billPrinted = false;

    // Stage 3 (Food Served) is optional: auto-set foodServedAt and mark pending items served if skipped
    if (!order.foodServedAt) {
      order.foodServedAt = new Date();
    }
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        if (['pending', 'preparing'].includes(item.status)) {
          item.status = 'served';
        }
      });
    }

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
router.post('/:id/cancel', staffOrAdmin, async (req, res) => {
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
// POST /api/orders/:id/transfer — Move table / KOT / items
// ─────────────────────────────────────────────────────────────────
router.post('/:id/transfer', staffOrAdmin, async (req, res) => {
  try {
    const { targetTableId, transferType = 'table', kotRoundNumbers = [], itemTransfers = [] } = req.body;

    if (!targetTableId) {
      return res.status(400).json({ message: 'Target table is required' });
    }

    const sourceOrder = await Order.findById(req.params.id);
    if (!sourceOrder) {
      return res.status(404).json({ message: 'Source order not found' });
    }
    if (sourceOrder.status === 'paid' || sourceOrder.status === 'cancelled') {
      return res.status(400).json({ message: `Cannot transfer an order with status: ${sourceOrder.status}` });
    }

    const sourceTable = await Table.findById(sourceOrder.table);
    if (!sourceTable) {
      return res.status(404).json({ message: 'Source table not found' });
    }

    const targetTable = await Table.findById(targetTableId);
    if (!targetTable) {
      return res.status(404).json({ message: 'Target table not found' });
    }

    if (String(sourceTable._id) === String(targetTable._id)) {
      return res.status(400).json({ message: 'Source table and target table cannot be the same' });
    }

    // ───────────────────────────────────────────────
    // Scenario 1: Table-wise transfer (Whole Order / All KOTs)
    // ───────────────────────────────────────────────
    if (transferType === 'table') {
      // If target table is available/empty:
      if (!targetTable.activeOrder) {
        sourceOrder.table = targetTable._id;
        await sourceOrder.save();

        targetTable.activeOrder = sourceOrder._id;
        targetTable.status = 'occupied';
        await targetTable.save();

        sourceTable.activeOrder = null;
        sourceTable.status = 'available';
        await sourceTable.save();

        await log({
          user: req.user,
          action: 'UPDATE',
          module: 'Orders',
          description: `${req.user.name} moved Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber} (Order #${sourceOrder.orderNumber})`,
        });

        return res.json({
          success: true,
          message: `Successfully moved order from Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber}`,
          type: 'table_move',
        });
      } else {
        // Target table is already occupied -> MERGE orders
        const targetOrder = await Order.findById(targetTable.activeOrder);
        if (!targetOrder) {
          // Orphan reference fallback
          sourceOrder.table = targetTable._id;
          await sourceOrder.save();
          targetTable.activeOrder = sourceOrder._id;
          targetTable.status = 'occupied';
          await targetTable.save();
          sourceTable.activeOrder = null;
          sourceTable.status = 'available';
          await sourceTable.save();

          return res.json({
            success: true,
            message: `Successfully moved order from Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber}`,
            type: 'table_move',
          });
        }

        // Merge items from source into target
        for (const it of sourceOrder.items) {
          if (it.status !== 'cancelled') {
            targetOrder.items.push({
              menuItem: it.menuItem,
              name: it.name,
              price: it.price,
              taxPercent: it.taxPercent,
              quantity: it.quantity,
              notes: it.notes ? `${it.notes} (from ${sourceTable.tableNumber})` : `(from ${sourceTable.tableNumber})`,
              variant: it.variant,
              selectedAddons: it.selectedAddons,
              status: it.status || 'pending',
            });
          }
        }

        // Merge KOT rounds
        let currentKotCount = targetOrder.kotCount || targetOrder.kotRounds?.length || 1;
        for (const round of (sourceOrder.kotRounds || [])) {
          currentKotCount += 1;
          targetOrder.kotRounds.push({
            roundNumber: currentKotCount,
            roundTag: `[FROM ${sourceTable.tableNumber} - ROUND ${round.roundNumber}]`,
            items: round.items,
            printed: round.printed,
            printedAt: round.printedAt,
            createdAt: round.createdAt || new Date(),
          });
        }
        targetOrder.kotCount = currentKotCount;

        // Recalculate target totals
        const newTotals = Order.calcTotals(targetOrder.items, targetOrder.discountValue, targetOrder.discountType);
        targetOrder.subtotal = newTotals.subtotal;
        targetOrder.taxAmount = newTotals.taxAmount;
        targetOrder.total = newTotals.total;
        targetOrder.billPrinted = false;
        await targetOrder.save();

        // Cancel and mark source order as merged
        sourceOrder.status = 'cancelled';
        sourceOrder.cancelReason = `Merged into Table ${targetTable.tableNumber} (Order #${targetOrder.orderNumber})`;
        await sourceOrder.save();

        // Free source table
        sourceTable.activeOrder = null;
        sourceTable.status = 'available';
        await sourceTable.save();

        await log({
          user: req.user,
          action: 'UPDATE',
          module: 'Orders',
          description: `${req.user.name} merged Table ${sourceTable.tableNumber} into Table ${targetTable.tableNumber} (Order #${targetOrder.orderNumber})`,
        });

        return res.json({
          success: true,
          message: `Successfully merged Table ${sourceTable.tableNumber} into Table ${targetTable.tableNumber}`,
          type: 'table_merge',
        });
      }
    }

    // ───────────────────────────────────────────────
    // Scenario 2: KOT-wise transfer (Specific KOT Rounds)
    // ───────────────────────────────────────────────
    if (transferType === 'kot') {
      const roundNums = Array.isArray(kotRoundNumbers) ? kotRoundNumbers.map(Number) : [];
      if (roundNums.length === 0) {
        return res.status(400).json({ message: 'No KOT rounds selected for transfer' });
      }

      const allRounds = (sourceOrder.kotRounds || []).map((r) => r.roundNumber);
      if (roundNums.length >= allRounds.length && allRounds.every((r) => roundNums.includes(r))) {
        // Equivalent to table transfer
        req.body.transferType = 'table';
        // Recursively handle as table transfer
        if (!targetTable.activeOrder) {
          sourceOrder.table = targetTable._id;
          await sourceOrder.save();
          targetTable.activeOrder = sourceOrder._id;
          targetTable.status = 'occupied';
          await targetTable.save();
          sourceTable.activeOrder = null;
          sourceTable.status = 'available';
          await sourceTable.save();
          return res.json({
            success: true,
            message: `Successfully moved all KOTs from Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber}`,
            type: 'table_move',
          });
        }
      }

      const roundsToMove = (sourceOrder.kotRounds || []).filter((r) => roundNums.includes(r.roundNumber));
      const remainingRounds = (sourceOrder.kotRounds || []).filter((r) => !roundNums.includes(r.roundNumber));

      if (roundsToMove.length === 0) {
        return res.status(400).json({ message: 'Selected KOT rounds not found' });
      }

      const itemsToMoveNames = new Map();
      for (const r of roundsToMove) {
        for (const it of r.items) {
          const count = itemsToMoveNames.get(it.name) || 0;
          itemsToMoveNames.set(it.name, count + (it.quantity || 1));
        }
      }

      const movedItems = [];
      const remainingItems = [];
      for (const it of sourceOrder.items) {
        const needed = itemsToMoveNames.get(it.name) || 0;
        if (needed > 0 && it.status !== 'cancelled') {
          if (it.quantity <= needed) {
            movedItems.push(it);
            itemsToMoveNames.set(it.name, needed - it.quantity);
          } else {
            const splitQty = needed;
            const keptQty = it.quantity - splitQty;
            it.quantity = keptQty;
            remainingItems.push(it);

            const clone = it.toObject ? it.toObject() : { ...it };
            delete clone._id;
            clone.quantity = splitQty;
            movedItems.push(clone);
            itemsToMoveNames.set(it.name, 0);
          }
        } else {
          remainingItems.push(it);
        }
      }

      sourceOrder.items = remainingItems;
      sourceOrder.kotRounds = remainingRounds;
      const srcTotals = Order.calcTotals(sourceOrder.items, sourceOrder.discountValue, sourceOrder.discountType);
      sourceOrder.subtotal = srcTotals.subtotal;
      sourceOrder.taxAmount = srcTotals.taxAmount;
      sourceOrder.total = srcTotals.total;

      const activeRemaining = sourceOrder.items.filter((i) => i.status !== 'cancelled');
      if (activeRemaining.length === 0) {
        sourceOrder.status = 'cancelled';
        sourceOrder.cancelReason = `All KOTs moved to Table ${targetTable.tableNumber}`;
        sourceTable.activeOrder = null;
        sourceTable.status = 'available';
        await sourceTable.save();
      }
      await sourceOrder.save();

      if (!targetTable.activeOrder) {
        const orderCount = await Order.countDocuments();
        const orderNumber = 4500 + orderCount + 1;
        const tgtTotals = Order.calcTotals(movedItems, 0, 'flat');

        const newTargetOrder = await Order.create({
          table: targetTable._id,
          orderNumber,
          items: movedItems,
          kotRounds: roundsToMove.map((r, idx) => ({
            roundNumber: idx + 1,
            roundTag: `[FROM ${sourceTable.tableNumber} - ${r.roundTag || 'KOT'}]`,
            items: r.items,
            printed: r.printed,
            printedAt: r.printedAt,
          })),
          kotCount: roundsToMove.length,
          subtotal: tgtTotals.subtotal,
          taxAmount: tgtTotals.taxAmount,
          total: tgtTotals.total,
          createdBy: req.user._id,
        });

        targetTable.activeOrder = newTargetOrder._id;
        targetTable.status = 'occupied';
        await targetTable.save();
      } else {
        const targetOrder = await Order.findById(targetTable.activeOrder);
        if (targetOrder) {
          for (const mi of movedItems) {
            targetOrder.items.push(mi);
          }
          let cnt = targetOrder.kotCount || targetOrder.kotRounds?.length || 1;
          for (const r of roundsToMove) {
            cnt += 1;
            targetOrder.kotRounds.push({
              roundNumber: cnt,
              roundTag: `[FROM ${sourceTable.tableNumber} - ${r.roundTag || 'KOT'}]`,
              items: r.items,
              printed: r.printed,
              printedAt: r.printedAt,
            });
          }
          targetOrder.kotCount = cnt;
          const tgtTotals = Order.calcTotals(targetOrder.items, targetOrder.discountValue, targetOrder.discountType);
          targetOrder.subtotal = tgtTotals.subtotal;
          targetOrder.taxAmount = tgtTotals.taxAmount;
          targetOrder.total = tgtTotals.total;
          targetOrder.billPrinted = false;
          await targetOrder.save();
        }
      }

      await log({
        user: req.user,
        action: 'UPDATE',
        module: 'Orders',
        description: `${req.user.name} moved KOT rounds [${roundNums.join(', ')}] from Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber}`,
      });

      return res.json({
        success: true,
        message: `Successfully moved selected KOT rounds from Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber}`,
      });
    }

    // ───────────────────────────────────────────────
    // Scenario 3: Item-wise transfer (Specific Items)
    // ───────────────────────────────────────────────
    if (transferType === 'item') {
      if (!Array.isArray(itemTransfers) || itemTransfers.length === 0) {
        return res.status(400).json({ message: 'No items selected for transfer' });
      }

      const movedItems = [];
      const remainingItems = [];
      const transferMap = new Map(itemTransfers.map((t) => [String(t.itemId), Number(t.quantity) || 1]));

      for (const it of sourceOrder.items) {
        const transferQty = transferMap.get(String(it._id));
        if (transferQty && transferQty > 0 && it.status !== 'cancelled') {
          if (transferQty >= it.quantity) {
            movedItems.push(it);
          } else {
            const keptQty = it.quantity - transferQty;
            it.quantity = keptQty;
            remainingItems.push(it);

            const clone = it.toObject ? it.toObject() : { ...it };
            delete clone._id;
            clone.quantity = transferQty;
            movedItems.push(clone);
          }
        } else {
          remainingItems.push(it);
        }
      }

      if (movedItems.length === 0) {
        return res.status(400).json({ message: 'No valid items found to move' });
      }

      sourceOrder.items = remainingItems;
      const srcTotals = Order.calcTotals(sourceOrder.items, sourceOrder.discountValue, sourceOrder.discountType);
      sourceOrder.subtotal = srcTotals.subtotal;
      sourceOrder.taxAmount = srcTotals.taxAmount;
      sourceOrder.total = srcTotals.total;

      const activeRemaining = sourceOrder.items.filter((i) => i.status !== 'cancelled');
      if (activeRemaining.length === 0) {
        sourceOrder.status = 'cancelled';
        sourceOrder.cancelReason = `All items moved to Table ${targetTable.tableNumber}`;
        sourceTable.activeOrder = null;
        sourceTable.status = 'available';
        await sourceTable.save();
      }
      await sourceOrder.save();

      if (!targetTable.activeOrder) {
        const orderCount = await Order.countDocuments();
        const orderNumber = 4500 + orderCount + 1;
        const tgtTotals = Order.calcTotals(movedItems, 0, 'flat');

        const newTargetOrder = await Order.create({
          table: targetTable._id,
          orderNumber,
          items: movedItems,
          kotRounds: [{
            roundNumber: 1,
            roundTag: `[TRANSFER FROM ${sourceTable.tableNumber}]`,
            items: movedItems.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              notes: i.notes || '',
              variantName: i.variant?.name || '',
              addons: i.selectedAddons?.map((a) => a.name) || [],
            })),
            printed: false,
          }],
          kotCount: 1,
          subtotal: tgtTotals.subtotal,
          taxAmount: tgtTotals.taxAmount,
          total: tgtTotals.total,
          createdBy: req.user._id,
        });

        targetTable.activeOrder = newTargetOrder._id;
        targetTable.status = 'occupied';
        await targetTable.save();
      } else {
        const targetOrder = await Order.findById(targetTable.activeOrder);
        if (targetOrder) {
          for (const mi of movedItems) {
            targetOrder.items.push(mi);
          }
          const cnt = (targetOrder.kotCount || targetOrder.kotRounds?.length || 1) + 1;
          targetOrder.kotCount = cnt;
          targetOrder.kotRounds.push({
            roundNumber: cnt,
            roundTag: `[TRANSFER FROM ${sourceTable.tableNumber}]`,
            items: movedItems.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              notes: i.notes || '',
              variantName: i.variant?.name || '',
              addons: i.selectedAddons?.map((a) => a.name) || [],
            })),
            printed: false,
          });
          const tgtTotals = Order.calcTotals(targetOrder.items, targetOrder.discountValue, targetOrder.discountType);
          targetOrder.subtotal = tgtTotals.subtotal;
          targetOrder.taxAmount = tgtTotals.taxAmount;
          targetOrder.total = tgtTotals.total;
          targetOrder.billPrinted = false;
          await targetOrder.save();
        }
      }

      await log({
        user: req.user,
        action: 'UPDATE',
        module: 'Orders',
        description: `${req.user.name} moved ${movedItems.length} items from Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber}`,
      });

      return res.json({
        success: true,
        message: `Successfully moved selected items from Table ${sourceTable.tableNumber} to Table ${targetTable.tableNumber}`,
      });
    }

    return res.status(400).json({ message: 'Invalid transferType' });
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
        variantName: i.variant?.name || '',
        addons: (i.selectedAddons || []).map((a) => a.name),
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
// POST /api/orders/:orderId/mark-bill-printed — Acknowledge Customer Bill printed
// ─────────────────────────────────────────────────────────────────
router.post('/:orderId/mark-bill-printed', async (req, res) => {
  try {
    const { seq } = req.body || {};
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const currentSeq = order.billPrintSeq || 0;
    if (!seq || Number(seq) >= currentSeq) {
      order.billPrintQueued = false;
    }
    order.billPrinted = true;
    order.billPrintedAt = new Date();
    if (!['paid', 'cancelled'].includes(order.status)) {
      order.status = 'billed';
    }

    // Stage 3 (Food Served) is optional: auto-set foodServedAt and mark pending items served if skipped
    if (!order.foodServedAt) {
      order.foodServedAt = new Date();
    }
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        if (['pending', 'preparing'].includes(item.status)) {
          item.status = 'served';
        }
      });
    }

    await order.save();

    res.json({ success: true, message: 'Customer bill marked as printed', orderId: order._id });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/orders/:orderId/queue-bill-print — Queue customer bill print for Print Station laptop
// ─────────────────────────────────────────────────────────────────
router.post('/:orderId/queue-bill-print', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.billPrintQueued = true;
    order.billPrintQueuedAt = new Date();
    order.billPrintSeq = (order.billPrintSeq || 0) + 1;
    order.billPrinted = false;

    // Advance open table orders to billed status as the bill is being presented to the customer
    if (!['paid', 'cancelled'].includes(order.status)) {
      order.status = 'billed';
    }

    // Stage 3 (Food Served) is optional: auto-set foodServedAt and mark pending items served if skipped
    if (!order.foodServedAt) {
      order.foodServedAt = new Date();
    }
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        if (['pending', 'preparing'].includes(item.status)) {
          item.status = 'served';
        }
      });
    }

    await order.save();

    res.json({
      success: true,
      message: 'Customer bill queued for printer',
      orderId: order._id,
      billPrintSeq: order.billPrintSeq,
    });
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
