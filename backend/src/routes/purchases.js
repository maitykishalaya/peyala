// ─────────────────────────────────────────────────────────────────
// Purchases Route
//
// Payment behaviour:
//   PAID (cash/upi/card/bank):
//     → Deduct from account
//     → Create Payment record (shows in Payments section)
//     → Update inventory
//     → Update supplier totalPurchased + totalPaid
//
//   DUE:
//     → Do NOT deduct from account
//     → Create Payment record marked isPending=true (shows as Due in Payments)
//     → Update inventory
//     → Update supplier totalPurchased (outstanding increases)
//
//   CLEAR DUE:
//     → Deduct from account (cash→Cash Counter, others→specified account)
//     → Update Payment record to isPending=false
//     → Update supplier totalPaid
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const PurchaseEntry = require('../models/PurchaseEntry');
const InventoryItem = require('../models/InventoryItem');
const Account = require('../models/Account');
const Supplier = require('../models/Supplier');
const Payment = require('../models/Payment');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// ── GET /api/purchases ────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, supplier, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate + 'T23:59:59');
    }
    if (supplier) filter.supplier = supplier;

    const total = await PurchaseEntry.countDocuments(filter);
    const purchases = await PurchaseEntry.find(filter)
      .populate('supplier', 'name')
      .populate('paidFrom', 'name type')
      .populate('items.item', 'name unit')
      .populate('createdBy', 'name')
      .sort('-date')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ purchases, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/purchases/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const purchase = await PurchaseEntry.findById(req.params.id)
      .populate('supplier')
      .populate('paidFrom')
      .populate('items.item')
      .populate('createdBy', 'name');
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
    res.json(purchase);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/purchases/items/quick-add ───────────────────────────
// Create a new inventory item on the fly while entering a purchase.
router.post('/items/quick-add', async (req, res) => {
  try {
    const { name, category, unit, lastPurchasePrice, preferredSupplier } = req.body;

    // Check if item already exists (case-insensitive)
    const existing = await InventoryItem.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      isActive: true
    }).populate('category');

    if (existing) {
      return res.json({ item: existing, created: false, message: 'Item already exists' });
    }

    const item = await InventoryItem.create({
      name: name.trim(), category, unit: unit || 'kg',
      currentStock: 0, minimumStock: 0,
      lastPurchasePrice: lastPurchasePrice || 0,
      averageCost: lastPurchasePrice || 0,
      preferredSupplier, isActive: true,
    });

    const populated = await InventoryItem.findById(item._id).populate('category');

    await log({
      user: req.user, action: 'CREATE', module: 'Inventory',
      description: `${req.user.name} quick-added item: ${name} (${unit})`,
    });

    res.status(201).json({ item: populated, created: true });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── POST /api/purchases ───────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { date, supplier, items, paidFrom, paymentMode, notes, referenceNumber } = req.body;
    const totalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);

    // Validate inventory line units against saved units
    const itemIds = items.filter(i => i.item).map(i => i.item);
    const inventoryItems = await InventoryItem.find({ _id: { $in: itemIds } }).select('unit name');
    const unitMap = inventoryItems.reduce((map, inv) => {
      map[inv._id.toString()] = inv.unit;
      return map;
    }, {});

    items.forEach((line, idx) => {
      if (line.item && unitMap[line.item.toString()] && line.unit !== unitMap[line.item.toString()]) {
        throw new Error(`Line ${idx + 1}: unit '${line.unit}' does not match inventory item unit '${unitMap[line.item.toString()]}'.`);
      }
    });

    // Is this a credit/due purchase?
    const isDue = paymentMode === 'due';

    // Create the purchase entry
    const purchase = await PurchaseEntry.create({
      date, supplier, items, totalAmount,
      paidFrom: isDue ? null : paidFrom,
      paymentMode,
      isPaid: !isDue,
      notes, referenceNumber,
      createdBy: req.user._id,
    });

    // Update inventory stock (weighted average cost)
    for (const item of items) {
      const inv = await InventoryItem.findById(item.item);
      if (inv) {
        const oldTotal = inv.currentStock * inv.averageCost;
        const newQty = inv.currentStock + item.quantity;
        const newAvg = newQty > 0 ? (oldTotal + item.totalPrice) / newQty : item.pricePerUnit;
        await InventoryItem.findByIdAndUpdate(item.item, {
          $inc: { currentStock: item.quantity },
          lastPurchasePrice: item.pricePerUnit,
          averageCost: newAvg,
        });
      }
    }

    // Get supplier name for payment description
    const supplierDoc = await Supplier.findById(supplier);
    const supplierName = supplierDoc?.name || 'Supplier';

    if (isDue) {
      // DUE: don't deduct account, create pending payment record
      await Supplier.findByIdAndUpdate(supplier, { $inc: { totalPurchased: totalAmount } });

      await Payment.create({
        date, paidFrom: null, payee: supplierName,
        category: 'Raw Materials', subcategory: 'Due Purchase',
        description: `Due purchase from ${supplierName} — ₹${totalAmount}`,
        amount: totalAmount, paymentMode: 'due',
        isPending: true, relatedPurchase: purchase._id,
        notes, createdBy: req.user._id,
      });
    } else {
      // PAID: deduct account, update supplier paid, create payment record
      if (paidFrom) {
        await Account.findByIdAndUpdate(paidFrom, { $inc: { currentBalance: -totalAmount } });
      }
      await Supplier.findByIdAndUpdate(supplier, {
        $inc: { totalPurchased: totalAmount, totalPaid: totalAmount }
      });

      // Create payment record so it shows in Payments section
      await Payment.create({
        date, paidFrom, payee: supplierName,
        category: 'Raw Materials', subcategory: supplierName,
        description: `Purchase from ${supplierName} — ${items.length} item(s)`,
        amount: totalAmount, paymentMode,
        isPending: false, relatedPurchase: purchase._id,
        notes, createdBy: req.user._id,
      });
    }

    const populated = await PurchaseEntry.findById(purchase._id)
      .populate('supplier', 'name')
      .populate('paidFrom', 'name')
      .populate('items.item', 'name unit')
      .populate('createdBy', 'name');

    await log({
      user: req.user, action: 'CREATE', module: 'Purchases',
      description: `${req.user.name} purchased from ${supplierName} — ₹${totalAmount} [${isDue ? 'DUE' : paymentMode.toUpperCase()}]`,
    });

    res.status(201).json(populated);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── PUT /api/purchases/:id ───────────────────────────────────────
router.put('/:id', async (req, res) => {
  const session = await PurchaseEntry.startSession();
  session.startTransaction();

  try {
    const purchase = await PurchaseEntry.findById(req.params.id).session(session);
    if (!purchase) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Purchase not found' });
    }

    const { date, supplier, items, paidFrom, paymentMode, notes, referenceNumber } = req.body;
    const totalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);

    const itemIds = items.filter(i => i.item).map(i => i.item);
    const inventoryItems = await InventoryItem.find({ _id: { $in: itemIds } }).select('unit name');
    const unitMap = inventoryItems.reduce((map, inv) => {
      map[inv._id.toString()] = inv.unit;
      return map;
    }, {});

    items.forEach((line, idx) => {
      if (line.item && unitMap[line.item.toString()] && line.unit !== unitMap[line.item.toString()]) {
        throw new Error(`Line ${idx + 1}: unit '${line.unit}' does not match inventory item unit '${unitMap[line.item.toString()]}'.`);
      }
    });

    const isDue = paymentMode === 'due';
    if (!isDue && !paidFrom) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'paidFrom is required for non-due purchases' });
    }

    const oldSupplierId = purchase.supplier.toString();
    const oldPaidFromId = purchase.paidFrom ? purchase.paidFrom.toString() : null;
    const oldAmount = purchase.totalAmount;
    const oldIsPaid = purchase.isPaid;

    const oldItemMap = purchase.items.reduce((map, item) => {
      const id = item.item.toString();
      if (!map[id]) map[id] = { qty: 0, totalPrice: 0, pricePerUnit: item.pricePerUnit, unit: item.unit };
      map[id].qty += item.quantity;
      map[id].totalPrice += item.totalPrice;
      return map;
    }, {});

    const newItemMap = items.reduce((map, item) => {
      const id = item.item.toString();
      if (!map[id]) map[id] = { qty: 0, totalPrice: 0, pricePerUnit: item.pricePerUnit, unit: item.unit };
      map[id].qty += item.quantity;
      map[id].totalPrice += item.totalPrice;
      return map;
    }, {});

    const itemIdsToUpdate = [...new Set([...Object.keys(oldItemMap), ...Object.keys(newItemMap)])];
    for (const itemId of itemIdsToUpdate) {
      const oldLine = oldItemMap[itemId] || { qty: 0, totalPrice: 0 };
      const newLine = newItemMap[itemId] || { qty: 0, totalPrice: 0, pricePerUnit: 0 };
      const inv = await InventoryItem.findById(itemId).session(session);
      if (!inv) continue;

      if (oldLine.qty > 0) {
        await InventoryItem.findByIdAndUpdate(itemId, { $inc: { currentStock: -oldLine.qty } }, { session });
      }

      if (newLine.qty > 0) {
        const stockBefore = Math.max(0, inv.currentStock - oldLine.qty);
        const averageCostBefore = inv.averageCost || 0;
        const addedCost = newLine.totalPrice;
        const newStock = stockBefore + newLine.qty;
        const newAverageCost = newStock > 0
          ? ((stockBefore * averageCostBefore) + addedCost) / newStock
          : newLine.pricePerUnit;

        await InventoryItem.findByIdAndUpdate(itemId, {
          $inc: { currentStock: newLine.qty },
          averageCost: newAverageCost,
          lastPurchasePrice: newLine.pricePerUnit,
        }, { session });
      }
    }

    if (oldIsPaid && oldPaidFromId) {
      await Account.findByIdAndUpdate(oldPaidFromId, { $inc: { currentBalance: oldAmount } }, { session });
    }

    const newIsPaid = !isDue;
    const supplierDoc = await Supplier.findById(supplier).session(session);
    const supplierName = supplierDoc?.name || 'Supplier';

    if (oldSupplierId !== supplier) {
      await Supplier.findByIdAndUpdate(oldSupplierId, {
        $inc: {
          totalPurchased: -oldAmount,
          totalPaid: oldIsPaid ? -oldAmount : 0,
        }
      }, { session });
      await Supplier.findByIdAndUpdate(supplier, {
        $inc: {
          totalPurchased: totalAmount,
          totalPaid: newIsPaid ? totalAmount : 0,
        }
      }, { session });
    } else {
      await Supplier.findByIdAndUpdate(supplier, {
        $inc: {
          totalPurchased: totalAmount - oldAmount,
          totalPaid: (newIsPaid ? totalAmount : 0) - (oldIsPaid ? oldAmount : 0),
        }
      }, { session });
    }

    if (newIsPaid && paidFrom) {
      await Account.findByIdAndUpdate(paidFrom, { $inc: { currentBalance: -totalAmount } }, { session });
    }

    const payment = await Payment.findOne({ relatedPurchase: purchase._id }).session(session);
    const paymentPayload = {
      date,
      paidFrom: newIsPaid ? paidFrom : null,
      payee: supplierName,
      category: 'Raw Materials',
      subcategory: isDue ? 'Due Purchase' : supplierName,
      description: isDue
        ? `Due purchase from ${supplierName} — ₹${totalAmount}`
        : `Purchase from ${supplierName} — ${items.length} item(s)`,
      amount: totalAmount,
      paymentMode: isDue ? 'due' : paymentMode,
      isPending: isDue,
      supplier,
      notes,
      relatedPurchase: purchase._id,
      createdBy: purchase.createdBy,
    };

    if (payment) {
      await Payment.findByIdAndUpdate(payment._id, paymentPayload, { new: true, runValidators: true, session });
    } else {
      await Payment.create([paymentPayload], { session });
    }

    const updatedPurchase = await PurchaseEntry.findByIdAndUpdate(req.params.id, {
      date,
      supplier,
      items,
      totalAmount,
      paidFrom: newIsPaid ? paidFrom : null,
      paymentMode,
      isPaid: newIsPaid,
      notes,
      referenceNumber,
    }, { new: true, runValidators: true, session })
      .populate('supplier', 'name')
      .populate('paidFrom', 'name type')
      .populate('items.item', 'name unit')
      .populate('createdBy', 'name');

    await session.commitTransaction();
    session.endSession();

    await log({
      user: req.user, action: 'UPDATE', module: 'Purchases',
      description: `${req.user.name} updated purchase from ${supplierName} — ₹${totalAmount}`,
    });

    res.json(updatedPurchase);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/purchases/:id/clear-due ────────────────────────────
// Clear a previously due purchase.
// Account debiting logic:
//   cash → deduct from Cash Counter (or specified paidFrom if it's cash type)
//   upi/card/bank → deduct from specified paidFrom account
router.post('/:id/clear-due', async (req, res) => {
  try {
    const { paidFrom, paymentMode = 'cash', date } = req.body;

    const purchase = await PurchaseEntry.findById(req.params.id).populate('supplier');
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
    if (purchase.isPaid) return res.status(400).json({ message: 'Already paid' });

    // Mark purchase as paid
    purchase.isPaid = true;
    purchase.paidFrom = paidFrom;
    purchase.paymentMode = paymentMode;
    await purchase.save();

    // Deduct from the correct account based on payment mode
    // Cash → cash-type account; others → specified account
    if (paymentMode === 'cash') {
      // If paidFrom specified and it's cash type, use it
      // Otherwise find the first cash account
      const account = await Account.findById(paidFrom);
      const targetAccount = (account?.type === 'cash') ? paidFrom :
        (await Account.findOne({ type: 'cash', isActive: true }))._id;
      await Account.findByIdAndUpdate(targetAccount, { $inc: { currentBalance: -purchase.totalAmount } });
    } else {
      // UPI, card, cheque, bank transfer → use specified account
      await Account.findByIdAndUpdate(paidFrom, { $inc: { currentBalance: -purchase.totalAmount } });
    }

    // Update supplier: due is now cleared
    await Supplier.findByIdAndUpdate(purchase.supplier._id, {
      $inc: { totalPaid: purchase.totalAmount }
    });

    // Update the pending Payment record to mark it cleared
    await Payment.findOneAndUpdate(
      { relatedPurchase: purchase._id, isPending: true },
      {
        paidFrom,
        paymentMode,
        isPending: false,
        description: `Due cleared — ${purchase.supplier?.name} (₹${purchase.totalAmount})`,
        date: date ? new Date(date) : new Date(),
      }
    );

    await log({
      user: req.user, action: 'UPDATE', module: 'Purchases',
      description: `${req.user.name} cleared due of ₹${purchase.totalAmount} to ${purchase.supplier?.name} via ${paymentMode}`,
    });

    res.json({ message: 'Due cleared', purchase });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── DELETE /api/purchases/:id ─────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const purchase = await PurchaseEntry.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });

    // Reverse inventory
    for (const item of purchase.items) {
      await InventoryItem.findByIdAndUpdate(item.item, { $inc: { currentStock: -item.quantity } });
    }

    // Reverse account if paid
    if (purchase.isPaid && purchase.paidFrom) {
      await Account.findByIdAndUpdate(purchase.paidFrom, { $inc: { currentBalance: purchase.totalAmount } });
    }

    // Reverse supplier totals
    await Supplier.findByIdAndUpdate(purchase.supplier, { $inc: { totalPurchased: -purchase.totalAmount } });
    if (purchase.isPaid) {
      await Supplier.findByIdAndUpdate(purchase.supplier, { $inc: { totalPaid: -purchase.totalAmount } });
    }

    // Remove linked payment record
    await Payment.deleteOne({ relatedPurchase: purchase._id });

    await PurchaseEntry.findByIdAndDelete(req.params.id);

    await log({
      user: req.user, action: 'DELETE', module: 'Purchases',
      description: `${req.user.name} deleted purchase of ₹${purchase.totalAmount}`,
    });

    res.json({ message: 'Purchase deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
