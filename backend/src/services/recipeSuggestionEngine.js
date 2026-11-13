const MenuItem = require('../models/MenuItem');
const InventoryItem = require('../models/InventoryItem');
const Recipe = require('../models/Recipe');
const { normalizeUnit, convertUnit } = require('../utils/unitConverter');

/**
 * Intelligent deterministic ingredient matcher based on culinary heuristics and keyword taxonomy.
 */
const INGREDIENT_TAXONOMY = [
  {
    menuKeywords: ['chicken burger', 'burger'],
    ingredients: [
      { namePattern: /burger bun|bun/i, qty: 1, unit: 'piece', loss: 0 },
      { namePattern: /patty|chicken burger patty/i, qty: 1, unit: 'piece', loss: 0 },
      { namePattern: /chicken breast|chicken/i, qty: 80, unit: 'gram', loss: 5 },
      { namePattern: /mayo|mayonnaise/i, qty: 20, unit: 'gram', loss: 2 },
      { namePattern: /lettuce/i, qty: 15, unit: 'gram', loss: 5 },
      { namePattern: /tomato/i, qty: 25, unit: 'gram', loss: 5 },
    ],
  },
  {
    menuKeywords: ['pasta', 'white sauce'],
    ingredients: [
      { namePattern: /pasta/i, qty: 100, unit: 'gram', loss: 0 },
      { namePattern: /milk/i, qty: 150, unit: 'ml', loss: 2 },
      { namePattern: /butter/i, qty: 20, unit: 'gram', loss: 0 },
      { namePattern: /cheese/i, qty: 30, unit: 'gram', loss: 2 },
      { namePattern: /capsicum/i, qty: 20, unit: 'gram', loss: 5 },
      { namePattern: /chicken breast|chicken/i, qty: 60, unit: 'gram', loss: 5 },
    ],
  },
  {
    menuKeywords: ['mojito', 'virgin mojito', 'mint'],
    ingredients: [
      { namePattern: /soda/i, qty: 200, unit: 'ml', loss: 2 },
      { namePattern: /mint syrup/i, qty: 30, unit: 'ml', loss: 0 },
      { namePattern: /mint leaves/i, qty: 5, unit: 'gram', loss: 10 },
      { namePattern: /lemon/i, qty: 1, unit: 'piece', loss: 0 },
      { namePattern: /sugar/i, qty: 20, unit: 'gram', loss: 0 },
    ],
  },
  {
    menuKeywords: ['cold coffee', 'coffee', 'cappuccino', 'latte', 'espresso'],
    ingredients: [
      { namePattern: /milk/i, qty: 200, unit: 'ml', loss: 2 },
      { namePattern: /coffee powder|coffee/i, qty: 10, unit: 'gram', loss: 2 },
      { namePattern: /sugar/i, qty: 20, unit: 'gram', loss: 0 },
    ],
  },
  {
    menuKeywords: ['tea', 'chai', 'masala chai'],
    ingredients: [
      { namePattern: /milk/i, qty: 100, unit: 'ml', loss: 5 },
      { namePattern: /tea leaves|tea/i, qty: 8, unit: 'gram', loss: 2 },
      { namePattern: /sugar/i, qty: 15, unit: 'gram', loss: 0 },
    ],
  },
  {
    menuKeywords: ['fries', 'french fries'],
    ingredients: [
      { namePattern: /french fries|potato/i, qty: 150, unit: 'gram', loss: 5 },
      { namePattern: /oil|cooking oil/i, qty: 30, unit: 'ml', loss: 10 },
      { namePattern: /salt/i, qty: 3, unit: 'gram', loss: 0 },
    ],
  },
  {
    menuKeywords: ['pokora', 'pakoda', 'chicken popcorn', 'wings', 'strips'],
    ingredients: [
      { namePattern: /chicken breast|chicken/i, qty: 120, unit: 'gram', loss: 8 },
      { namePattern: /oil|cooking oil/i, qty: 40, unit: 'ml', loss: 12 },
      { namePattern: /besan|flour/i, qty: 30, unit: 'gram', loss: 5 },
    ],
  },
  {
    menuKeywords: ['paneer pakoda', 'paneer'],
    ingredients: [
      { namePattern: /paneer/i, qty: 120, unit: 'gram', loss: 5 },
      { namePattern: /oil|cooking oil/i, qty: 35, unit: 'ml', loss: 10 },
      { namePattern: /besan|flour/i, qty: 30, unit: 'gram', loss: 5 },
    ],
  },
  {
    menuKeywords: ['wrap', 'roll'],
    ingredients: [
      { namePattern: /tortilla|wrap|roti/i, qty: 1, unit: 'piece', loss: 0 },
      { namePattern: /chicken breast|chicken/i, qty: 80, unit: 'gram', loss: 5 },
      { namePattern: /mayo|mayonnaise/i, qty: 25, unit: 'gram', loss: 2 },
      { namePattern: /lettuce/i, qty: 20, unit: 'gram', loss: 5 },
      { namePattern: /onion/i, qty: 25, unit: 'gram', loss: 5 },
    ],
  },
];

/**
 * Generate intelligent recipe drafts for all menu items or a specific menu item.
 */
async function generateRecipeSuggestions({ menuItemId = null, userId = null } = {}) {
  const menuFilter = menuItemId ? { _id: menuItemId } : { isAvailable: { $ne: false } };
  const menuItems = await MenuItem.find(menuFilter).lean();
  const inventoryItems = await InventoryItem.find({ isActive: true }).lean();

  const generated = [];
  let skippedCount = 0;

  for (const menuItem of menuItems) {
    // Check variants or generate for base item (only items with hasVariants === true have true portion variants)
    const hasVariants = Boolean(menuItem.hasVariants && Array.isArray(menuItem.variants) && menuItem.variants.length > 0);
    const variants = hasVariants
      ? menuItem.variants
      : [{ name: null, price: menuItem.price }];

    for (const v of variants) {
      const variantName = v.name ? v.name.trim() : null;

      // Check if active or existing draft already exists
      const existing = await Recipe.findOne({
        menuItem: menuItem._id,
        variantName: variantName,
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      // Match against taxonomy
      const menuNameLower = menuItem.name.toLowerCase();
      let matchedTaxonomy = INGREDIENT_TAXONOMY.find(t =>
        t.menuKeywords.some(kw => menuNameLower.includes(kw))
      );

      // If no direct taxonomy match, look for inventory items that contain parts of the menu item name
      const matchedIngredients = [];
      let totalCost = 0;

      if (matchedTaxonomy) {
        for (const rule of matchedTaxonomy.ingredients) {
          // Find matching inventory item
          const invMatch = inventoryItems.find(inv => rule.namePattern.test(inv.name));
          if (invMatch) {
            // Convert rule quantity to inventory canonical unit
            const conv = convertUnit(rule.qty, rule.unit, invMatch.unit);
            const canonicalQty = conv.success ? conv.quantity : rule.qty;
            const canonicalUnit = invMatch.unit;

            const costPerUnit = Number(invMatch.averageCost) || Number(invMatch.lastPurchasePrice) || 0;
            const lineCost = canonicalQty * costPerUnit;
            totalCost += lineCost;

            matchedIngredients.push({
              inventoryItem: invMatch._id,
              ingredientName: invMatch.name,
              recipeQuantity: rule.qty,
              recipeUnit: rule.unit,
              canonicalQuantity: canonicalQty,
              canonicalUnit: canonicalUnit,
              lossPercent: rule.loss || 0,
              notes: 'Auto-suggested ingredient',
            });
          }
        }
      } else {
        // Keyword bag fallback
        const words = menuNameLower.split(/[\s-]+/).filter(w => w.length > 3);
        for (const word of words) {
          const invMatch = inventoryItems.find(inv => inv.name.toLowerCase().includes(word));
          if (invMatch && !matchedIngredients.some(m => String(m.inventoryItem) === String(invMatch._id))) {
            const defaultQty = invMatch.unit === 'gram' ? 50 : invMatch.unit === 'ml' ? 50 : 1;
            const costPerUnit = Number(invMatch.averageCost) || Number(invMatch.lastPurchasePrice) || 0;
            totalCost += defaultQty * costPerUnit;

            matchedIngredients.push({
              inventoryItem: invMatch._id,
              ingredientName: invMatch.name,
              recipeQuantity: defaultQty,
              recipeUnit: invMatch.unit,
              canonicalQuantity: defaultQty,
              canonicalUnit: invMatch.unit,
              lossPercent: 0,
              notes: 'Keyword matched ingredient',
            });
          }
        }
      }

      // Confidence score calculation:
      // More matched ingredients -> higher confidence
      let confidence = 50;
      if (matchedTaxonomy && matchedIngredients.length >= 3) confidence = 88;
      else if (matchedTaxonomy && matchedIngredients.length >= 2) confidence = 78;
      else if (matchedIngredients.length > 0) confidence = 65;
      else confidence = 40;

      const recipeName = variantName
        ? `${menuItem.name} (${variantName})`
        : menuItem.name;

      const newRecipe = await Recipe.create({
        menuItem: menuItem._id,
        variantName: variantName,
        name: recipeName,
        version: 1,
        status: 'draft', // MANDATORY: strictly DRAFT
        confidenceScore: confidence,
        generationSource: 'auto_generated',
        prepYield: 1,
        preparationLossPercent: 0,
        ingredients: matchedIngredients,
        estimatedCost: Math.round(totalCost * 100) / 100,
        notes: 'ESTIMATED — REVIEW REQUIRED before activation',
        createdBy: userId,
      });

      generated.push(newRecipe);
    }
  }

  return {
    totalEvaluated: menuItems.length,
    generatedCount: generated.length,
    skippedCount,
    recipes: generated,
  };
}

module.exports = {
  generateRecipeSuggestions,
};

