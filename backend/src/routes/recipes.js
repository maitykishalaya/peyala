const router = require('express').Router();
const Recipe = require('../models/Recipe');
const MenuItem = require('../models/MenuItem');
const InventoryItem = require('../models/InventoryItem');
const UnitConversion = require('../models/UnitConversion');
const InventoryMovement = require('../models/InventoryMovement');
const { auth, managerOrAdmin, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { generateRecipeSuggestions } = require('../services/recipeSuggestionEngine');
const { convertUnit, normalizeUnit, roundPrecision } = require('../utils/unitConverter');

router.use(auth);

// Helper to compute recipe total estimated cost from inventory WAC
async function calculateRecipeCost(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return 0;
  let totalCost = 0;
  for (const ing of ingredients) {
    if (!ing.inventoryItem) continue;
    const inv = await InventoryItem.findById(ing.inventoryItem).select('averageCost lastPurchasePrice unit');
    if (inv) {
      const unitCost = Number(inv.averageCost) || Number(inv.lastPurchasePrice) || 0;
      const lossMultiplier = 1 + (Number(ing.lossPercent) || 0) / 100;
      const lineCost = (Number(ing.canonicalQuantity) || 0) * lossMultiplier * unitCost;
      totalCost += lineCost;
    }
  }
  return roundPrecision(totalCost, 2);
}

// ── GET /api/recipes/stats/summary ────────────────────────────────
router.get('/stats/summary', async (req, res) => {
  try {
    const totalMenu = await MenuItem.countDocuments({ isAvailable: { $ne: false } });
    const totalRecipes = await Recipe.countDocuments();
    const activeRecipes = await Recipe.countDocuments({ status: 'active' });
    const draftRecipes = await Recipe.countDocuments({ status: 'draft' });

    // Distinct menu items with at least one active recipe
    const coveredMenuIds = await Recipe.distinct('menuItem', { status: 'active' });
    const coveragePercent = totalMenu > 0 ? roundPrecision((coveredMenuIds.length / totalMenu) * 100, 1) : 0;

    // Low / negative stock items
    const lowStockItems = await InventoryItem.countDocuments({
      isActive: true,
      $expr: { $lte: ['$currentStock', '$minimumStock'] }
    });

    res.json({
      totalMenuItems: totalMenu,
      coveredMenuItems: coveredMenuIds.length,
      coveragePercent,
      totalRecipes,
      activeRecipes,
      draftRecipes,
      lowStockItems,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/recipes/movements/ledger ─────────────────────────────
router.get('/movements/ledger', async (req, res) => {
  try {
    const { page = 1, limit = 50, inventoryItem, orderId, movementType } = req.query;
    const filter = {};
    if (inventoryItem) filter.inventoryItem = inventoryItem;
    if (orderId) filter.order = orderId;
    if (movementType) filter.movementType = movementType;

    const total = await InventoryMovement.countDocuments(filter);
    const movements = await InventoryMovement.find(filter)
      .populate('inventoryItem', 'name unit currentStock')
      .populate('recipe', 'name version')
      .populate('order', 'orderNumber status billNumber table')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ movements, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/recipes: List recipes ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, menuItem, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (menuItem) filter.menuItem = menuItem;
    if (search && String(search).trim()) {
      filter.name = { $regex: String(search).trim(), $options: 'i' };
    }

    const recipes = await Recipe.find(filter)
      .populate('menuItem', 'name category price variants isAvailable')
      .populate('ingredients.inventoryItem', 'name unit currentStock averageCost lastPurchasePrice')
      .populate('lastApprovedBy', 'name')
      .populate('createdBy', 'name')
      .sort({ updatedAt: -1 });

    res.json(recipes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/recipes/:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id)
      .populate('menuItem', 'name category price variants isAvailable')
      .populate('ingredients.inventoryItem', 'name unit currentStock averageCost lastPurchasePrice')
      .populate('lastApprovedBy', 'name')
      .populate('createdBy', 'name');

    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/recipes: Create recipe ──────────────────────────────
router.post('/', managerOrAdmin, async (req, res) => {
  try {
    const {
      menuItemId,
      variantName,
      name,
      status = 'draft',
      prepYield = 1,
      preparationLossPercent = 0,
      ingredients = [],
      notes = '',
    } = req.body;

    if (!menuItemId) {
      return res.status(400).json({ message: 'menuItemId is required' });
    }

    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    // Variants are strictly mandatory for menu items configured with variants
    const hasVariants = Array.isArray(menuItem.variants) && menuItem.variants.length > 0;
    if (hasVariants) {
      if (!variantName || !String(variantName).trim()) {
        return res.status(400).json({
          message: `Menu item "${menuItem.name}" has ${menuItem.variants.length} variant(s). A specific variant must be selected because different variants require different ingredient amounts.`
        });
      }
      const matched = menuItem.variants.find(v => v.name.toLowerCase() === String(variantName).trim().toLowerCase());
      if (!matched) {
        return res.status(400).json({
          message: `Variant "${variantName}" is invalid for "${menuItem.name}". Available variants: ${menuItem.variants.map(v => v.name).join(', ')}`
        });
      }
    }

    const recipeName = name && name.trim() ? name.trim() : (variantName ? `${menuItem.name} (${variantName})` : menuItem.name);

    // Validate and normalize ingredients
    const processedIngredients = [];
    for (const line of ingredients) {
      const invId = line.inventoryItem || line.inventoryItemId;
      const inv = await InventoryItem.findById(invId);
      if (!inv) continue;

      const recipeQty = Number(line.recipeQuantity) || 0;
      const recipeUnit = line.recipeUnit || inv.unit;
      let customRule = null;
      if (normalizeUnit(recipeUnit) !== normalizeUnit(inv.unit)) {
        customRule = await UnitConversion.findOne({
          inventoryItem: inv._id,
          isActive: true,
          $or: [
            { purchaseUnit: normalizeUnit(recipeUnit) },
            { canonicalUnit: normalizeUnit(recipeUnit) },
          ],
        }).lean();
      }
      const conv = convertUnit(recipeQty, recipeUnit, inv.unit, customRule?.conversionFactor, customRule?.purchaseUnit, customRule?.canonicalUnit);
      const canonicalQty = conv.success ? conv.quantity : recipeQty;

      processedIngredients.push({
        inventoryItem: inv._id,
        ingredientName: inv.name,
        recipeQuantity: recipeQty,
        recipeUnit: recipeUnit,
        canonicalQuantity: canonicalQty,
        canonicalUnit: inv.unit,
        lossPercent: Number(line.lossPercent) || 0,
        notes: line.notes || '',
      });
    }

    const estimatedCost = await calculateRecipeCost(processedIngredients);

    // If setting to active, deactivate previous active recipe for this menu + variant
    if (status === 'active') {
      await Recipe.updateMany(
        { menuItem: menuItem._id, variantName: variantName || null, status: 'active' },
        { $set: { status: 'inactive' } }
      );
    }

    const recipe = await Recipe.create({
      menuItem: menuItem._id,
      variantName: variantName ? String(variantName).trim() : null,
      name: recipeName,
      version: 1,
      status,
      confidenceScore: 100,
      generationSource: 'manual',
      prepYield: Number(prepYield) || 1,
      preparationLossPercent: Number(preparationLossPercent) || 0,
      ingredients: processedIngredients,
      estimatedCost,
      notes,
      lastApprovedBy: status === 'active' ? req.user._id : null,
      lastApprovedAt: status === 'active' ? new Date() : null,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Recipe',
      description: `${req.user.name} created recipe "${recipe.name}" (Status: ${status})`,
    });

    const populated = await Recipe.findById(recipe._id)
      .populate('menuItem', 'name price')
      .populate('ingredients.inventoryItem', 'name unit currentStock averageCost');

    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── PUT /api/recipes/:id: Update recipe ───────────────────────────
router.put('/:id', managerOrAdmin, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });

    const {
      name,
      variantName,
      status,
      prepYield,
      preparationLossPercent,
      ingredients,
      notes,
    } = req.body;

    if (name !== undefined) recipe.name = String(name).trim();
    if (variantName !== undefined) recipe.variantName = variantName ? String(variantName).trim() : null;

    const menuItem = await MenuItem.findById(recipe.menuItem);
    const hasVariants = menuItem && Array.isArray(menuItem.variants) && menuItem.variants.length > 0;
    if (hasVariants) {
      if (!recipe.variantName) {
        return res.status(400).json({
          message: `Menu item "${menuItem.name}" has ${menuItem.variants.length} variant(s). A specific variant is required because different variants use different ingredient amounts.`
        });
      }
    }
    if (prepYield !== undefined) recipe.prepYield = Math.max(0.001, Number(prepYield) || 1);
    if (preparationLossPercent !== undefined) recipe.preparationLossPercent = Math.max(0, Number(preparationLossPercent) || 0);
    if (notes !== undefined) recipe.notes = String(notes).trim();

    if (Array.isArray(ingredients)) {
      const processed = [];
      for (const line of ingredients) {
        const invId = line.inventoryItem || line.inventoryItemId;
        const inv = await InventoryItem.findById(invId);
        if (!inv) continue;

        const recipeQty = Number(line.recipeQuantity) || 0;
        const recipeUnit = line.recipeUnit || inv.unit;
        let customRule = null;
        if (normalizeUnit(recipeUnit) !== normalizeUnit(inv.unit)) {
          customRule = await UnitConversion.findOne({
            inventoryItem: inv._id,
            isActive: true,
            $or: [
              { purchaseUnit: normalizeUnit(recipeUnit) },
              { canonicalUnit: normalizeUnit(recipeUnit) },
            ],
          }).lean();
        }
        const conv = convertUnit(recipeQty, recipeUnit, inv.unit, customRule?.conversionFactor, customRule?.purchaseUnit, customRule?.canonicalUnit);
        const canonicalQty = conv.success ? conv.quantity : recipeQty;

        processed.push({
          inventoryItem: inv._id,
          ingredientName: inv.name,
          recipeQuantity: recipeQty,
          recipeUnit: recipeUnit,
          canonicalQuantity: canonicalQty,
          canonicalUnit: inv.unit,
          lossPercent: Number(line.lossPercent) || 0,
          notes: line.notes || '',
        });
      }
      recipe.ingredients = processed;
      recipe.estimatedCost = await calculateRecipeCost(processed);
      recipe.version = (recipe.version || 1) + 1; // Increment version on ingredient modification
    }

    if (status !== undefined) {
      if (status === 'active' && recipe.status !== 'active') {
        // Deactivate any existing active recipe for the same menu + variant
        await Recipe.updateMany(
          { _id: { $ne: recipe._id }, menuItem: recipe.menuItem, variantName: recipe.variantName, status: 'active' },
          { $set: { status: 'inactive' } }
        );
        recipe.lastApprovedBy = req.user._id;
        recipe.lastApprovedAt = new Date();
      }
      recipe.status = status;
    }

    recipe.updatedBy = req.user._id;
    await recipe.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Recipe',
      description: `${req.user.name} updated recipe "${recipe.name}" (v${recipe.version})`,
    });

    const populated = await Recipe.findById(recipe._id)
      .populate('menuItem', 'name price')
      .populate('ingredients.inventoryItem', 'name unit currentStock averageCost');

    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/recipes/:id/activate: One-click activation ───────────
router.post('/:id/activate', managerOrAdmin, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });

    if (recipe.ingredients.length === 0) {
      return res.status(400).json({ message: 'Cannot activate a recipe with zero ingredients.' });
    }

    // Deactivate previous active recipe for same menu item + variant
    await Recipe.updateMany(
      { _id: { $ne: recipe._id }, menuItem: recipe.menuItem, variantName: recipe.variantName, status: 'active' },
      { $set: { status: 'inactive' } }
    );

    recipe.status = 'active';
    recipe.lastApprovedBy = req.user._id;
    recipe.lastApprovedAt = new Date();
    recipe.updatedBy = req.user._id;
    await recipe.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Recipe',
      description: `${req.user.name} activated recipe "${recipe.name}"`,
    });

    res.json({ message: 'Recipe activated successfully', recipe });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/recipes/:id/deactivate: Deactivate recipe ────────────
router.post('/:id/deactivate', managerOrAdmin, async (req, res) => {
  try {
    const recipe = await Recipe.findByIdAndUpdate(
      req.params.id,
      { status: 'inactive', updatedBy: req.user._id },
      { new: true }
    );
    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Recipe',
      description: `${req.user.name} deactivated recipe "${recipe.name}"`,
    });

    res.json({ message: 'Recipe deactivated', recipe });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── POST /api/recipes/generate-suggestions: Batch generator ───────
router.post('/generate-suggestions', managerOrAdmin, async (req, res) => {
  try {
    const result = await generateRecipeSuggestions({
      menuItemId: req.body.menuItemId || null,
      userId: req.user._id,
    });

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Recipe',
      description: `${req.user.name} ran recipe auto-suggestion engine: generated ${result.generatedCount} draft recipes`,
    });

    res.json({
      message: `Generated ${result.generatedCount} draft recipe(s). ${result.skippedCount} already existed.`,
      result,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/recipes/:id: Soft or hard delete draft ─────────────
router.delete('/:id', managerOrAdmin, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });

    if (recipe.status === 'active') {
      return res.status(400).json({ message: 'Cannot delete an active recipe. Deactivate it first.' });
    }

    await Recipe.findByIdAndDelete(req.params.id);

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Recipe',
      description: `${req.user.name} deleted draft recipe "${recipe.name}"`,
    });

    res.json({ message: 'Recipe deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

