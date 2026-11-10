const POSSetting = require('../models/POSSetting');
const Recipe = require('../models/Recipe');
const InventoryItem = require('../models/InventoryItem');
const InventoryMovement = require('../models/InventoryMovement');
const realtimeHub = require('../services/realtimeHub');
const { roundPrecision } = require('../utils/unitConverter');

class InventoryConsumptionEngine {
  /**
   * Check if automated inventory consumption is enabled globally.
   */
  async isEnabled() {
    try {
      const setting = await POSSetting.getSingleton();
      return Boolean(setting.recipeInventoryAutomationEnabled);
    } catch (err) {
      console.error('[InventoryEngine] Error checking master toggle:', err.message);
      return false;
    }
  }

  /**
   * Retrieve the active recipe for a menu item and optional variant.
   */
  async getActiveRecipe(menuItemId, variantName = null) {
    if (!menuItemId) return null;

    // 1. Try exact match with variantName
    if (variantName) {
      const variantRecipe = await Recipe.findOne({
        menuItem: menuItemId,
        variantName: String(variantName).trim(),
        status: 'active',
      }).lean();
      if (variantRecipe) return variantRecipe;
    }

    // 2. Fallback to base recipe without variant
    return Recipe.findOne({
      menuItem: menuItemId,
      variantName: null,
      status: 'active',
    }).lean();
  }

  /**
   * Consume inventory ingredients for a newly dispatched KOT round.
   * Strictly idempotent: uses deterministic keys per order + round + item + ingredient.
   */
  async consumeForKotRound(order, kotRound, user = null) {
    if (!(await this.isEnabled())) {
      return { consumed: false, reason: 'Automation disabled via master toggle' };
    }

    if (!order || !kotRound || !Array.isArray(kotRound.items)) {
      return { consumed: false, reason: 'Invalid order or KOT round payload' };
    }

    const roundNum = kotRound.roundNumber || 1;
    const consumedRecords = [];

    // Map items from order that belong to this round or match the round items
    const roundItems = Array.isArray(order.items)
      ? order.items.filter(it => it.roundNumber === roundNum && it.status !== 'cancelled')
      : [];

    // If order.items don't have roundNumber tags, correlate with kotRound.items
    const itemsToProcess = roundItems.length > 0 ? roundItems : (order.items || []).filter(it => it.status !== 'cancelled');

    for (const item of itemsToProcess) {
      const menuItemId = item.menuItem || item.menuItemId;
      const variantName = item.variant?.name || null;
      const orderItemId = item._id ? String(item._id) : `item_${menuItemId}`;
      const itemQty = Number(item.quantity) || 1;

      const recipe = await this.getActiveRecipe(menuItemId, variantName);
      if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
        continue; // No active recipe configured; skip safely
      }

      for (const ing of recipe.ingredients) {
        const invId = String(ing.inventoryItem);
        const idempotencyKey = `order_${order._id}_item_${orderItemId}_rnd_${roundNum}_inv_${invId}`;

        // Guard against duplicate execution
        const existing = await InventoryMovement.findOne({ idempotencyKey }).lean();
        if (existing) {
          continue; // Already processed
        }

        const lossMultiplier = 1 + (Number(ing.lossPercent) || 0) / 100;
        const requiredQty = roundPrecision(ing.canonicalQuantity * itemQty * lossMultiplier, 4);

        // Atomically fetch and deduct stock
        const inv = await InventoryItem.findById(ing.inventoryItem);
        if (!inv) continue;

        const prevStock = Number(inv.currentStock) || 0;
        const newStock = roundPrecision(prevStock - requiredQty, 4);
        const unitCost = Number(inv.averageCost) || Number(inv.lastPurchasePrice) || 0;
        const totalLineCost = roundPrecision(requiredQty * unitCost, 2);

        await InventoryItem.findByIdAndUpdate(ing.inventoryItem, {
          $inc: { currentStock: -requiredQty },
        });

        const movement = await InventoryMovement.create({
          inventoryItem: ing.inventoryItem,
          recipe: recipe._id,
          order: order._id,
          orderNumber: order.orderNumber,
          kotRoundNumber: roundNum,
          orderItemId: item._id || null,
          movementType: 'kot_consumption',
          quantityDelta: -requiredQty,
          unit: ing.canonicalUnit,
          previousStock: prevStock,
          newStock: newStock,
          costPerUnit: unitCost,
          totalCost: totalLineCost,
          idempotencyKey,
          notes: `Auto-consumption for Order #${order.orderNumber} (Round ${roundNum}) - ${item.name} x${itemQty}`,
          createdBy: user?._id || order.createdBy || null,
        });

        consumedRecords.push(movement);

        // Realtime notification if stock went low or negative
        if (newStock <= (inv.minimumStock || 0)) {
          realtimeHub.broadcast('STOCK_ALERT', {
            itemId: inv._id,
            itemName: inv.name,
            currentStock: newStock,
            minimumStock: inv.minimumStock || 0,
            isNegative: newStock < 0,
          });
        }
      }
    }

    return { consumed: true, count: consumedRecords.length, records: consumedRecords };
  }

  /**
   * Fallback consumption for direct billing if any items were not consumed during KOT dispatch.
   */
  async consumeForDirectBilling(order, user = null) {
    if (!(await this.isEnabled())) return;
    if (!order || !Array.isArray(order.items)) return;

    for (const item of order.items) {
      if (item.status === 'cancelled') continue;
      const menuItemId = item.menuItem || item.menuItemId;
      const variantName = item.variant?.name || null;
      const orderItemId = item._id ? String(item._id) : `item_${menuItemId}`;
      const itemQty = Number(item.quantity) || 1;

      const recipe = await this.getActiveRecipe(menuItemId, variantName);
      if (!recipe || !Array.isArray(recipe.ingredients)) continue;

      for (const ing of recipe.ingredients) {
        const invId = String(ing.inventoryItem);
        const idempotencyKey = `billing_${order._id}_item_${orderItemId}_inv_${invId}`;

        // Check if already consumed via KOT or previous billing
        const alreadyConsumed = await InventoryMovement.findOne({
          $or: [
            { idempotencyKey },
            { order: order._id, orderItemId: item._id, inventoryItem: ing.inventoryItem }
          ]
        }).lean();

        if (alreadyConsumed) continue;

        const lossMultiplier = 1 + (Number(ing.lossPercent) || 0) / 100;
        const requiredQty = roundPrecision(ing.canonicalQuantity * itemQty * lossMultiplier, 4);

        const inv = await InventoryItem.findById(ing.inventoryItem);
        if (!inv) continue;

        const prevStock = Number(inv.currentStock) || 0;
        const newStock = roundPrecision(prevStock - requiredQty, 4);
        const unitCost = Number(inv.averageCost) || Number(inv.lastPurchasePrice) || 0;
        const totalLineCost = roundPrecision(requiredQty * unitCost, 2);

        await InventoryItem.findByIdAndUpdate(ing.inventoryItem, {
          $inc: { currentStock: -requiredQty },
        });

        await InventoryMovement.create({
          inventoryItem: ing.inventoryItem,
          recipe: recipe._id,
          order: order._id,
          orderNumber: order.orderNumber,
          kotRoundNumber: item.roundNumber || 1,
          orderItemId: item._id || null,
          movementType: 'billing_consumption',
          quantityDelta: -requiredQty,
          unit: ing.canonicalUnit,
          previousStock: prevStock,
          newStock: newStock,
          costPerUnit: unitCost,
          totalCost: totalLineCost,
          idempotencyKey,
          notes: `Billing settlement consumption for Order #${order.orderNumber} - ${item.name} x${itemQty}`,
          createdBy: user?._id || order.createdBy || null,
        });
      }
    }
  }

  /**
   * Reverse consumption when an individual item is soft-cancelled.
   */
  async reverseForCancelledItem(order, item, user = null) {
    if (!order || !item) return;

    const itemId = item._id || item;
    const movements = await InventoryMovement.find({
      order: order._id,
      orderItemId: itemId,
      movementType: { $in: ['kot_consumption', 'billing_consumption'] },
    }).lean();

    for (const mov of movements) {
      const reversalKey = `reversal_${mov.idempotencyKey || mov._id}`;
      const alreadyReversed = await InventoryMovement.findOne({ idempotencyKey: reversalKey }).lean();
      if (alreadyReversed) continue;

      const restoreQty = Math.abs(mov.quantityDelta);
      const inv = await InventoryItem.findById(mov.inventoryItem);
      if (!inv) continue;

      const prevStock = Number(inv.currentStock) || 0;
      const newStock = roundPrecision(prevStock + restoreQty, 4);

      await InventoryItem.findByIdAndUpdate(mov.inventoryItem, {
        $inc: { currentStock: restoreQty },
      });

      await InventoryMovement.create({
        inventoryItem: mov.inventoryItem,
        recipe: mov.recipe,
        order: order._id,
        orderNumber: order.orderNumber,
        kotRoundNumber: mov.kotRoundNumber,
        orderItemId: itemId,
        movementType: 'cancellation_reversal',
        quantityDelta: restoreQty,
        unit: mov.unit,
        previousStock: prevStock,
        newStock: newStock,
        costPerUnit: mov.costPerUnit,
        totalCost: mov.totalCost,
        idempotencyKey: reversalKey,
        notes: `Reversal for cancelled item "${item.name || ''}" on Order #${order.orderNumber}`,
        createdBy: user?._id || null,
      });
    }
  }

  /**
   * Reverse consumption for an entire cancelled order.
   */
  async reverseForCancelledOrder(order, user = null) {
    if (!order) return;

    const movements = await InventoryMovement.find({
      order: order._id,
      movementType: { $in: ['kot_consumption', 'billing_consumption'] },
    }).lean();

    for (const mov of movements) {
      const reversalKey = `order_reversal_${mov.idempotencyKey || mov._id}`;
      // Guard against double reversal if item was already reversed individually
      const alreadyReversed = await InventoryMovement.findOne({
        $or: [
          { idempotencyKey: reversalKey },
          { idempotencyKey: `reversal_${mov.idempotencyKey || mov._id}` },
        ]
      }).lean();
      if (alreadyReversed) continue;

      const restoreQty = Math.abs(mov.quantityDelta);
      const inv = await InventoryItem.findById(mov.inventoryItem);
      if (!inv) continue;

      const prevStock = Number(inv.currentStock) || 0;
      const newStock = roundPrecision(prevStock + restoreQty, 4);

      await InventoryItem.findByIdAndUpdate(mov.inventoryItem, {
        $inc: { currentStock: restoreQty },
      });

      await InventoryMovement.create({
        inventoryItem: mov.inventoryItem,
        recipe: mov.recipe,
        order: order._id,
        orderNumber: order.orderNumber,
        kotRoundNumber: mov.kotRoundNumber,
        orderItemId: mov.orderItemId,
        movementType: 'cancellation_reversal',
        quantityDelta: restoreQty,
        unit: mov.unit,
        previousStock: prevStock,
        newStock: newStock,
        costPerUnit: mov.costPerUnit,
        totalCost: mov.totalCost,
        idempotencyKey: reversalKey,
        notes: `Reversal for cancelled Order #${order.orderNumber}. Reason: ${order.cancelReason || 'Order Cancelled'}`,
        createdBy: user?._id || null,
      });
    }
  }

  /**
   * Reverse all consumption movements when a settled bill is deleted by admin.
   */
  async reverseForSettledBillDeletion(order, user = null) {
    if (!order) return;

    const movements = await InventoryMovement.find({
      order: order._id,
      movementType: { $in: ['kot_consumption', 'billing_consumption'] },
    }).lean();

    for (const mov of movements) {
      const reversalKey = `bill_delete_reversal_${mov.idempotencyKey || mov._id}`;
      const alreadyReversed = await InventoryMovement.findOne({
        $or: [
          { idempotencyKey: reversalKey },
          { idempotencyKey: `order_reversal_${mov.idempotencyKey || mov._id}` },
          { idempotencyKey: `reversal_${mov.idempotencyKey || mov._id}` },
        ]
      }).lean();
      if (alreadyReversed) continue;

      const restoreQty = Math.abs(mov.quantityDelta);
      const inv = await InventoryItem.findById(mov.inventoryItem);
      if (!inv) continue;

      const prevStock = Number(inv.currentStock) || 0;
      const newStock = roundPrecision(prevStock + restoreQty, 4);

      await InventoryItem.findByIdAndUpdate(mov.inventoryItem, {
        $inc: { currentStock: restoreQty },
      });

      await InventoryMovement.create({
        inventoryItem: mov.inventoryItem,
        recipe: mov.recipe,
        order: order._id,
        orderNumber: order.orderNumber,
        kotRoundNumber: mov.kotRoundNumber,
        orderItemId: mov.orderItemId,
        movementType: 'bill_delete_reversal',
        quantityDelta: restoreQty,
        unit: mov.unit,
        previousStock: prevStock,
        newStock: newStock,
        costPerUnit: mov.costPerUnit,
        totalCost: mov.totalCost,
        idempotencyKey: reversalKey,
        notes: `Reversal due to settled Bill #${order.billNumber || order.orderNumber} deletion by ${user?.name || 'Admin'}`,
        createdBy: user?._id || null,
      });
    }
  }
}

module.exports = new InventoryConsumptionEngine();
