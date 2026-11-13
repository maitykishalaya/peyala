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
const UnitConversion = require('../models/UnitConversion');
const { convertUnit, normalizeUnit, roundPrecision } = require('../utils/unitConverter');
const { auth } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { withOptionalTransaction } = require('../utils/transaction');

router.use(auth);

// ── Helper: Resolve Payment Description for Purchases ─────────────
// If the purchase has a description/note recorded, use it directly.
// If no description was recorded, list all item names separated by comma.
const buildPurchasePaymentDescription = async (notes, description, items, fallbackSupplierName) => {
  const customDesc = (description || notes || '').trim();
  if (customDesc) {
    return customDesc;
  }

  if (Array.isArray(items) && items.length > 0) {
    const itemIds = items
      .map(i => (typeof i.item === 'object' && i.item?._id ? i.item._id : i.item))
      .filter(Boolean);

    let invDocs = [];
    if (itemIds.length > 0) {
      invDocs = await InventoryItem.find({ _id: { $in: itemIds } }).select('name').lean();
    }
    const invMap = new Map(invDocs.map(d => [String(d._id), d.name]));

    const names = [];
    for (const line of items) {
      let name = '';
      if (typeof line.item === 'object' && line.item?.name) {
        name = line.item.name;
      } else if (line.item && invMap.has(String(line.item))) {
        name = invMap.get(String(line.item));
      } else if (line.name) {
        name = line.name;
      }
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }

    if (names.length > 0) {
      return names.join(', ');
    }
  }

  return fallbackSupplierName ? `Purchase from ${fallbackSupplierName}` : 'Purchase';
};

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

    const gstAggregate = await PurchaseEntry.aggregate([
      { $match: filter },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, totalGst: { $sum: { $ifNull: ['$items.gstAmount', 0] } } } }
    ]);
    const purchaseGstTotal = gstAggregate[0]?.totalGst || 0;

    res.json({ purchases, total, page: Number(page), pages: Math.ceil(total / limit), purchaseGstTotal });
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

    // Validate inventory line units and resolve canonical quantities using Unit Conversion adapter
    const itemIds = items.filter(i => i.item).map(i => i.item);
    const inventoryItems = await InventoryItem.find({ _id: { $in: itemIds } }).select('unit name');
    const unitMap = inventoryItems.reduce((map, inv) => {
      map[inv._id.toString()] = inv.unit;
      return map;
    }, {});

    // Fetch any custom unit conversion rules for these items
    const customConversions = await UnitConversion.find({
      inventoryItem: { $in: itemIds },
      isActive: true,
    }).lean();

    const conversionMap = new Map();
    for (const rule of customConversions) {
      conversionMap.set(`${rule.inventoryItem}_${normalizeUnit(rule.purchaseUnit)}`, rule);
    }

    const canonicalQuantities = [];
    for (let idx = 0; idx < items.length; idx++) {
      const line = items[idx];
      if (!line.item) {
        canonicalQuantities.push(line.quantity);
        continue;
      }
      const invUnit = unitMap[line.item.toString()];
      const normLineUnit = normalizeUnit(line.unit);
      const normInvUnit = normalizeUnit(invUnit);

      if (normLineUnit === normInvUnit) {
        canonicalQuantities.push(line.quantity);
      } else {
        const customRule = conversionMap.get(`${line.item}_${normLineUnit}`);
        const conv = convertUnit(line.quantity, line.unit, invUnit, customRule?.conversionFactor, customRule?.purchaseUnit, customRule?.canonicalUnit);
        if (conv.success) {
          canonicalQuantities.push(conv.quantity);
        } else {
          throw new Error(`Line ${idx + 1}: unit '${line.unit}' does not match inventory item unit '${invUnit}'. ${conv.error || 'No valid unit conversion rule configured.'}`);
        }
      }
    }

    // Is this a credit/due purchase?
    const isDue = paymentMode === 'due';

    const purchaseDesc = (req.body.description || notes || '').trim();

    // Create the purchase entry
    const purchase = await PurchaseEntry.create({
      date, supplier, items, totalAmount,
      paidFrom: isDue ? null : paidFrom,
      paymentMode,
      isPaid: !isDue,
      notes: purchaseDesc,
      description: purchaseDesc,
      referenceNumber,
      createdBy: req.user._id,
    });

    // Update inventory stock (weighted average cost in canonical stock units)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const canonicalQty = canonicalQuantities[i];
      const inv = await InventoryItem.findById(item.item);
      if (inv) {
        const oldTotal = inv.currentStock * inv.averageCost;
        const newQty = inv.currentStock + canonicalQty;
        const newAvg = newQty > 0 ? (oldTotal + item.totalPrice) / newQty : (item.totalPrice / (canonicalQty || 1));
        const canonicalUnitPrice = roundPrecision(item.totalPrice / (canonicalQty || 1), 4);
        await InventoryItem.findByIdAndUpdate(item.item, {
          $inc: { currentStock: canonicalQty },
          lastPurchasePrice: canonicalUnitPrice,
          averageCost: roundPrecision(newAvg, 4),
        });
      }
    }

    // Get supplier name for payment description
    const supplierDoc = await Supplier.findById(supplier);
    const supplierName = supplierDoc?.name || 'Supplier';
    const paymentDescription = await buildPurchasePaymentDescription(notes, req.body.description, items, supplierName);

    if (isDue) {
      // DUE: don't deduct account, create pending payment record
      await Supplier.findByIdAndUpdate(supplier, { $inc: { totalPurchased: totalAmount } });

      await Payment.create({
        date, paidFrom: null, payee: supplierName,
        category: 'Raw Materials', subcategory: 'Due Purchase',
        description: paymentDescription,
        amount: totalAmount, paymentMode: 'due',
        isPending: true, relatedPurchase: purchase._id,
        supplier,
        notes: purchaseDesc, createdBy: req.user._id,
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
        description: paymentDescription,
        amount: totalAmount, paymentMode,
        isPending: false, relatedPurchase: purchase._id,
        supplier,
        notes: purchaseDesc, createdBy: req.user._id,
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
  try {
    const result = await withOptionalTransaction(async (session) => {
      const opts = session ? { session } : {};
      const query = PurchaseEntry.findById(req.params.id);
      if (session) query.session(session);
      const purchase = await query;
      if (!purchase) {
        const error = new Error('Purchase not found');
        error.statusCode = 404;
        throw error;
      }

      const { date, supplier, items, paidFrom, paymentMode, notes, referenceNumber } = req.body;
      const totalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);

      const allItemIds = [
        ...purchase.items.filter(i => i.item).map(i => i.item.toString()),
        ...items.filter(i => i.item).map(i => i.item.toString()),
      ];
      const inventoryItems = await InventoryItem.find({ _id: { $in: allItemIds } }).select('unit name');
      const unitMap = inventoryItems.reduce((map, inv) => {
        map[inv._id.toString()] = inv.unit;
        return map;
      }, {});

      const customConversions = await UnitConversion.find({
        inventoryItem: { $in: allItemIds },
        isActive: true,
      }).lean();

      const convMap = new Map();
      for (const rule of customConversions) {
        convMap.set(`${rule.inventoryItem}_${normalizeUnit(rule.purchaseUnit)}`, rule);
      }

      const getCanonicalQty = (itemId, qty, unit, invUnit) => {
        if (!itemId || !qty) return 0;
        const normUnit = normalizeUnit(unit);
        const normInvUnit = normalizeUnit(invUnit);
        if (normUnit === normInvUnit) return qty;
        const customRule = convMap.get(`${itemId}_${normUnit}`);
        const conv = convertUnit(qty, unit, invUnit, customRule?.conversionFactor, customRule?.purchaseUnit, customRule?.canonicalUnit);
        if (conv.success) return conv.quantity;
        return null;
      };

      for (let idx = 0; idx < items.length; idx++) {
        const line = items[idx];
        if (line.item && unitMap[line.item.toString()]) {
          const invUnit = unitMap[line.item.toString()];
          const canonical = getCanonicalQty(line.item.toString(), line.quantity, line.unit, invUnit);
          if (canonical === null) {
            const error = new Error(`Line ${idx + 1}: unit '${line.unit}' does not match inventory stock unit '${invUnit}' and no conversion rule is configured.`);
            error.statusCode = 400;
            throw error;
          }
        }
      }

      const isDue = paymentMode === 'due';
      if (!isDue && !paidFrom) {
        const error = new Error('paidFrom is required for non-due purchases');
        error.statusCode = 400;
        throw error;
      }

      const oldSupplierId = purchase.supplier.toString();
      const oldPaidFromId = purchase.paidFrom ? purchase.paidFrom.toString() : null;
      const oldAmount = purchase.totalAmount;
      const oldIsPaid = purchase.isPaid;

      const oldItemMap = purchase.items.reduce((map, item) => {
        const id = item.item.toString();
        const invUnit = unitMap[id];
        const canonicalQty = getCanonicalQty(id, item.quantity, item.unit, invUnit) ?? item.quantity;
        if (!map[id]) map[id] = { qty: 0, totalPrice: 0, pricePerUnit: item.pricePerUnit, unit: item.unit };
        map[id].qty += canonicalQty;
        map[id].totalPrice += item.totalPrice;
        return map;
      }, {});

      const newItemMap = items.reduce((map, item) => {
        const id = item.item.toString();
        const invUnit = unitMap[id];
        const canonicalQty = getCanonicalQty(id, item.quantity, item.unit, invUnit) ?? item.quantity;
        const canonicalUnitPrice = canonicalQty > 0 ? roundPrecision(item.totalPrice / canonicalQty, 4) : item.pricePerUnit;
        if (!map[id]) map[id] = { qty: 0, totalPrice: 0, pricePerUnit: canonicalUnitPrice, unit: item.unit };
        map[id].qty += canonicalQty;
        map[id].totalPrice += item.totalPrice;
        return map;
      }, {});

      const itemIdsToUpdate = [...new Set([...Object.keys(oldItemMap), ...Object.keys(newItemMap)])];
      for (const itemId of itemIdsToUpdate) {
        const oldLine = oldItemMap[itemId] || { qty: 0, totalPrice: 0 };
        const newLine = newItemMap[itemId] || { qty: 0, totalPrice: 0, pricePerUnit: 0 };
        const invQuery = InventoryItem.findById(itemId);
        if (session) invQuery.session(session);
        const inv = await invQuery;
        if (!inv) continue;

        if (oldLine.qty > 0) {
          await InventoryItem.findByIdAndUpdate(itemId, { $inc: { currentStock: -oldLine.qty } }, opts);
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
            averageCost: roundPrecision(newAverageCost, 4),
            lastPurchasePrice: newLine.pricePerUnit,
          }, opts);
        }
      }

      if (oldIsPaid && oldPaidFromId) {
        await Account.findByIdAndUpdate(oldPaidFromId, { $inc: { currentBalance: oldAmount } }, opts);
      }

      const newIsPaid = !isDue;
      const supQuery = Supplier.findById(supplier);
      if (session) supQuery.session(session);
      const supplierDoc = await supQuery;
      const supplierName = supplierDoc?.name || 'Supplier';

      if (oldSupplierId !== supplier) {
        await Supplier.findByIdAndUpdate(oldSupplierId, {
          $inc: {
            totalPurchased: -oldAmount,
            totalPaid: oldIsPaid ? -oldAmount : 0,
          }
        }, opts);
        await Supplier.findByIdAndUpdate(supplier, {
          $inc: {
            totalPurchased: totalAmount,
            totalPaid: newIsPaid ? totalAmount : 0,
          }
        }, opts);
      } else {
        await Supplier.findByIdAndUpdate(supplier, {
          $inc: {
            totalPurchased: totalAmount - oldAmount,
            totalPaid: (newIsPaid ? totalAmount : 0) - (oldIsPaid ? oldAmount : 0),
          }
        }, opts);
      }

      if (newIsPaid && paidFrom) {
        await Account.findByIdAndUpdate(paidFrom, { $inc: { currentBalance: -totalAmount } }, opts);
      }

      const purchaseDesc = (req.body.description || notes || '').trim();
      const paymentDescription = await buildPurchasePaymentDescription(notes, req.body.description, items, supplierName);

      const payQuery = Payment.findOne({ relatedPurchase: purchase._id });
      if (session) payQuery.session(session);
      const payment = await payQuery;

      const paymentPayload = {
        date,
        paidFrom: newIsPaid ? paidFrom : null,
        payee: supplierName,
        category: 'Raw Materials',
        subcategory: isDue ? 'Due Purchase' : supplierName,
        description: paymentDescription,
        amount: totalAmount,
        paymentMode: isDue ? 'due' : paymentMode,
        isPending: isDue,
        supplier,
        notes: purchaseDesc,
        relatedPurchase: purchase._id,
        createdBy: purchase.createdBy,
      };

      if (payment) {
        await Payment.findByIdAndUpdate(payment._id, paymentPayload, {
          new: true,
          runValidators: true,
          ...(session ? { session } : {}),
        });
      } else {
        await Payment.create([paymentPayload], session ? { session } : undefined);
      }

      const updatedPurchase = await PurchaseEntry.findByIdAndUpdate(req.params.id, {
        date,
        supplier,
        items,
        totalAmount,
        paidFrom: newIsPaid ? paidFrom : null,
        paymentMode,
        isPaid: newIsPaid,
        notes: purchaseDesc,
        description: purchaseDesc,
        referenceNumber,
      }, {
        new: true,
        runValidators: true,
        ...(session ? { session } : {}),
      })
        .populate('supplier', 'name')
        .populate('paidFrom', 'name type')
        .populate('items.item', 'name unit')
        .populate('createdBy', 'name');

      return { updatedPurchase, supplierName, totalAmount };
    });

    await log({
      user: req.user, action: 'UPDATE', module: 'Purchases',
      description: `${req.user.name} updated purchase from ${result.supplierName} — ₹${result.totalAmount}`,
    });

    res.json(result.updatedPurchase);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
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

    // Update the pending Payment record to mark it cleared with consistent purchase description
    const paymentDescription = await buildPurchasePaymentDescription(
      purchase.notes,
      purchase.description,
      purchase.items,
      purchase.supplier?.name
    );

    await Payment.findOneAndUpdate(
      { relatedPurchase: purchase._id, isPending: true },
      {
        paidFrom,
        paymentMode,
        isPending: false,
        supplier: purchase.supplier._id,
        description: paymentDescription,
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

    // Reverse inventory (using canonical stock units)
    for (const item of purchase.items) {
      if (!item.item) continue;
      const inv = await InventoryItem.findById(item.item).select('unit');
      let reverseQty = item.quantity;
      if (inv && normalizeUnit(item.unit) !== normalizeUnit(inv.unit)) {
        const customRule = await UnitConversion.findOne({
          inventoryItem: item.item,
          purchaseUnit: normalizeUnit(item.unit),
          isActive: true,
        }).lean();
        const conv = convertUnit(item.quantity, item.unit, inv.unit, customRule?.conversionFactor, customRule?.purchaseUnit, customRule?.canonicalUnit);
        if (conv.success) reverseQty = conv.quantity;
      }
      await InventoryItem.findByIdAndUpdate(item.item, { $inc: { currentStock: -reverseQty } });
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
