/**
 * Peyala POS — Universal Unit Conversion Engine
 * Decimal-safe unit normalization and conversion between purchase, stock, and recipe units.
 */

// Canonical alias map
const UNIT_ALIASES = {
  // Weight
  'kg': 'kg',
  'kgs': 'kg',
  'kilo': 'kg',
  'kilogram': 'kg',
  'kilograms': 'kg',
  'g': 'gram',
  'gm': 'gram',
  'gms': 'gram',
  'gram': 'gram',
  'grams': 'gram',
  'mg': 'mg',
  'milligram': 'mg',
  'milligrams': 'mg',

  // Volume
  'l': 'litre',
  'ltr': 'litre',
  'liter': 'litre',
  'liters': 'litre',
  'litre': 'litre',
  'litres': 'litre',
  'ml': 'ml',
  'millilitre': 'ml',
  'millilitres': 'ml',
  'milliliter': 'ml',
  'milliliters': 'ml',

  // Count / Discrete
  'pc': 'piece',
  'pcs': 'piece',
  'piece': 'piece',
  'pieces': 'piece',
  'portion': 'piece',
  'portions': 'piece',
  'slice': 'piece',
  'slices': 'piece',
  'plate': 'piece',
  'plates': 'piece',
  'dozen': 'dozen',
  'dozens': 'dozen',
  'dz': 'dozen',

  // Packaging
  'packet': 'packet',
  'packets': 'packet',
  'pkt': 'packet',
  'pkts': 'packet',
  'bottle': 'bottle',
  'bottles': 'bottle',
  'btl': 'bottle',
  'btls': 'bottle',
  'box': 'box',
  'boxes': 'box',
  'carton': 'carton',
  'cartons': 'carton',
  'can': 'can',
  'cans': 'can',
  'tin': 'tin',
  'tins': 'tin',
  'cup': 'cup',
  'cups': 'cup',
};

// Built-in standard metric conversion multipliers (to base canonical unit)
// Weight base: gram
const WEIGHT_TO_GRAM = {
  'kg': 1000,
  'gram': 1,
  'mg': 0.001,
};

// Volume base: ml
const VOLUME_TO_ML = {
  'litre': 1000,
  'ml': 1,
};

// Count base: piece
const COUNT_TO_PIECE = {
  'dozen': 12,
  'piece': 1,
};

/**
 * Normalize any unit string to its canonical representation.
 */
function normalizeUnit(unit) {
  if (!unit || typeof unit !== 'string') return '';
  const clean = unit.trim().toLowerCase();
  return UNIT_ALIASES[clean] || clean;
}

/**
 * Determine the physical measurement dimension of a unit ('weight', 'volume', 'count', or 'custom').
 */
function getUnitDimension(unit) {
  const norm = normalizeUnit(unit);
  if (WEIGHT_TO_GRAM[norm]) return 'weight';
  if (VOLUME_TO_ML[norm]) return 'volume';
  if (COUNT_TO_PIECE[norm]) return 'count';
  return 'custom';
}

/**
 * Check if two units belong to the same dimension and can be converted without an item-specific custom factor.
 */
function areDirectlyCompatible(fromUnit, toUnit) {
  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);
  if (normFrom === normTo) return true;

  const dimFrom = getUnitDimension(normFrom);
  const dimTo = getUnitDimension(normTo);
  return dimFrom !== 'custom' && dimFrom === dimTo;
}

/**
 * Convert quantity from one unit to another.
 * 
 * Supports:
 * 1. Identical units: returns same quantity
 * 2. Standard metric conversion (kg <-> gram, litre <-> ml, dozen <-> piece)
 * 3. Item-specific custom conversion factor (e.g. 1 box = 15 bottles, 1 packet = 25 pieces)
 *
 * @param {number} quantity - Quantity to convert
 * @param {string} fromUnit - Source unit
 * @param {string} toUnit - Target unit
 * @param {number|null} customConversionFactor - Multiplier if 1 purchaseUnit = factor canonicalUnits
 * @param {string|null} rulePurchaseUnit - Purchase unit of the custom rule (e.g. 'box')
 * @param {string|null} ruleCanonicalUnit - Canonical consumption unit of the custom rule (e.g. 'bottle')
 * @returns {{ success: boolean, quantity: number, factor: number, error?: string }}
 */
function convertUnit(quantity, fromUnit, toUnit, customConversionFactor = null, rulePurchaseUnit = null, ruleCanonicalUnit = null) {
  const qty = Number(quantity);
  if (isNaN(qty)) {
    return { success: false, quantity: 0, factor: 0, error: `Invalid quantity: ${quantity}` };
  }

  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);

  // 1. Same unit
  if (normFrom === normTo) {
    return { success: true, quantity: roundPrecision(qty, 6), factor: 1 };
  }

  // 2. Direct standard metric conversion: Weight (kg <-> gram <-> mg)
  if (WEIGHT_TO_GRAM[normFrom] && WEIGHT_TO_GRAM[normTo]) {
    const inGrams = qty * WEIGHT_TO_GRAM[normFrom];
    const targetQty = inGrams / WEIGHT_TO_GRAM[normTo];
    const factor = WEIGHT_TO_GRAM[normFrom] / WEIGHT_TO_GRAM[normTo];
    return { success: true, quantity: roundPrecision(targetQty, 6), factor: roundPrecision(factor, 6) };
  }

  // 3. Direct standard metric conversion: Volume (litre <-> ml)
  if (VOLUME_TO_ML[normFrom] && VOLUME_TO_ML[normTo]) {
    const inMl = qty * VOLUME_TO_ML[normFrom];
    const targetQty = inMl / VOLUME_TO_ML[normTo];
    const factor = VOLUME_TO_ML[normFrom] / VOLUME_TO_ML[normTo];
    return { success: true, quantity: roundPrecision(targetQty, 6), factor: roundPrecision(factor, 6) };
  }

  // 4. Direct standard count conversion: dozen <-> piece
  if (COUNT_TO_PIECE[normFrom] && COUNT_TO_PIECE[normTo]) {
    const inPieces = qty * COUNT_TO_PIECE[normFrom];
    const targetQty = inPieces / COUNT_TO_PIECE[normTo];
    const factor = COUNT_TO_PIECE[normFrom] / COUNT_TO_PIECE[normTo];
    return { success: true, quantity: roundPrecision(targetQty, 6), factor: roundPrecision(factor, 6) };
  }

  // 5. Item-specific custom conversion
  // e.g. 1 box = 15 bottles -> factor = 15.
  // Converting 3 boxes to bottles -> 3 * 15 = 45 bottles.
  // Converting 45 bottles to boxes -> 45 / 15 = 3 boxes.
  if (customConversionFactor && typeof customConversionFactor === 'number' && customConversionFactor > 0) {
    const normRulePurch = rulePurchaseUnit ? normalizeUnit(rulePurchaseUnit) : null;
    const normRuleCanon = ruleCanonicalUnit ? normalizeUnit(ruleCanonicalUnit) : null;

    if (normRulePurch && normRuleCanon) {
      if (normFrom === normRulePurch && normTo === normRuleCanon) {
        const targetQty = qty * customConversionFactor;
        return { success: true, quantity: roundPrecision(targetQty, 6), factor: customConversionFactor };
      }
      if (normFrom === normRuleCanon && normTo === normRulePurch) {
        const targetQty = qty / customConversionFactor;
        return { success: true, quantity: roundPrecision(targetQty, 6), factor: roundPrecision(1 / customConversionFactor, 6) };
      }
    }

    // Default: forward conversion (package -> canonical consumption unit)
    const targetQty = qty * customConversionFactor;
    return { success: true, quantity: roundPrecision(targetQty, 6), factor: customConversionFactor };
  }

  return {
    success: false,
    quantity: qty,
    factor: 1,
    error: `Cannot convert directly between '${fromUnit}' and '${toUnit}' without a custom conversion factor configured.`
  };
}

/**
 * Decimal-safe rounding to prevent IEEE 754 floating point precision drift.
 */
function roundPrecision(val, decimals = 4) {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

module.exports = {
  UNIT_ALIASES,
  normalizeUnit,
  getUnitDimension,
  areDirectlyCompatible,
  convertUnit,
  roundPrecision,
};

