const router = require('express').Router();
const UnitConversion = require('../models/UnitConversion');
const InventoryItem = require('../models/InventoryItem');
const { auth, managerOrAdmin } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { normalizeUnit, convertUnit, areDirectlyCompatible } = require('../utils/unitConverter');

router.use(auth);

// ── GET /api/unit-conversions: List conversions ───────────────────
router.get('/', async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.inventoryItem) {
      filter.inventoryItem = req.query.inventoryItem;
    }
    const conversions = await UnitConversion.find(filter)
      .populate('inventoryItem', 'name unit currentStock averageCost')
      .sort('inventoryItem');

    res.json(conversions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/unit-conversions/:id ─────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const conversion = await UnitConversion.findById(req.params.id)
      .populate('inventoryItem', 'name unit currentStock averageCost');
    if (!conversion) {
      return res.status(404).json({ message: 'Unit conversion rule not found' });
    }
    res.json(conversion);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/unit-conversions: Create conversion rule ────────────
router.post('/', managerOrAdmin, async (req, res) => {
  try {
    const {
      inventoryItemId,
      inventoryItem,
      canonicalUnit,
      purchaseUnit,
      conversionFactor,
      packageSize,
      packageLabel,
      notes,
    } = req.body;

    const itemId = inventoryItemId || inventoryItem;
    if (!itemId) {
      return res.status(400).json({ message: 'inventoryItem is required' });
    }

    const inv = await InventoryItem.findById(itemId);
    if (!inv) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const normCanonical = normalizeUnit(canonicalUnit || inv.unit);
    const normPurchase = normalizeUnit(purchaseUnit);

    if (!normPurchase) {
      return res.status(400).json({ message: 'purchaseUnit is required' });
    }

    const factor = Number(conversionFactor);
    if (isNaN(factor) || factor <= 0) {
      return res.status(400).json({ message: 'conversionFactor must be a positive number' });
    }

    // Upsert or update existing rule for this item + purchase unit
    let rule = await UnitConversion.findOne({
      inventoryItem: itemId,
      purchaseUnit: normPurchase,
    });

    if (rule) {
      rule.canonicalUnit = normCanonical;
      rule.conversionFactor = factor;
      rule.packageSize = Number(packageSize) || factor;
      rule.packageLabel = packageLabel || rule.packageLabel;
      rule.notes = notes !== undefined ? notes : rule.notes;
      rule.isActive = true;
      rule.updatedBy = req.user._id;
      await rule.save();
    } else {
      rule = await UnitConversion.create({
        inventoryItem: itemId,
        canonicalUnit: normCanonical,
        purchaseUnit: normPurchase,
        conversionFactor: factor,
        packageSize: Number(packageSize) || factor,
        packageLabel: packageLabel || `1 ${normPurchase} = ${factor} ${normCanonical}`,
        notes: notes || '',
        isActive: true,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
    }

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'UnitConversion',
      description: `${req.user.name} configured unit conversion for ${inv.name}: 1 ${normPurchase} = ${factor} ${normCanonical}`,
    });

    const populated = await UnitConversion.findById(rule._id)
      .populate('inventoryItem', 'name unit currentStock averageCost');

    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── PUT /api/unit-conversions/:id ─────────────────────────────────
router.put('/:id', managerOrAdmin, async (req, res) => {
  try {
    const rule = await UnitConversion.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Unit conversion rule not found' });
    }

    if (req.body.conversionFactor !== undefined) {
      const factor = Number(req.body.conversionFactor);
      if (isNaN(factor) || factor <= 0) {
        return res.status(400).json({ message: 'conversionFactor must be a positive number' });
      }
      rule.conversionFactor = factor;
    }

    if (req.body.purchaseUnit !== undefined) {
      rule.purchaseUnit = normalizeUnit(req.body.purchaseUnit);
    }
    if (req.body.canonicalUnit !== undefined) {
      rule.canonicalUnit = normalizeUnit(req.body.canonicalUnit);
    }
    if (req.body.packageSize !== undefined) {
      rule.packageSize = Number(req.body.packageSize) || rule.conversionFactor;
    }
    if (req.body.packageLabel !== undefined) {
      rule.packageLabel = String(req.body.packageLabel).trim();
    }
    if (req.body.notes !== undefined) {
      rule.notes = String(req.body.notes).trim();
    }
    if (req.body.isActive !== undefined) {
      rule.isActive = Boolean(req.body.isActive);
    }
    rule.updatedBy = req.user._id;

    await rule.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'UnitConversion',
      description: `${req.user.name} updated unit conversion (ID: ${rule._id})`,
    });

    const populated = await UnitConversion.findById(rule._id)
      .populate('inventoryItem', 'name unit currentStock averageCost');

    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── DELETE /api/unit-conversions/:id ──────────────────────────────
router.delete('/:id', managerOrAdmin, async (req, res) => {
  try {
    const rule = await UnitConversion.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedBy: req.user._id },
      { new: true }
    );
    if (!rule) {
      return res.status(404).json({ message: 'Unit conversion rule not found' });
    }

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'UnitConversion',
      description: `${req.user.name} deactivated unit conversion (ID: ${rule._id})`,
    });

    res.json({ message: 'Unit conversion deactivated', rule });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/unit-conversions/test: Live converter test ──────────
router.post('/test', (req, res) => {
  const { quantity, fromUnit, toUnit, customConversionFactor } = req.body;
  const result = convertUnit(quantity, fromUnit, toUnit, customConversionFactor);
  res.json(result);
});

module.exports = router;
