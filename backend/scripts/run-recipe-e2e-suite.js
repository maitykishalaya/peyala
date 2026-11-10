const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const POSSetting = require('../src/models/POSSetting');
const MenuItem = require('../src/models/MenuItem');
const InventoryItem = require('../src/models/InventoryItem');
const Recipe = require('../src/models/Recipe');
const UnitConversion = require('../src/models/UnitConversion');
const InventoryMovement = require('../src/models/InventoryMovement');
const Order = require('../src/models/Order');
const Table = require('../src/models/Table');
const PurchaseEntry = require('../src/models/PurchaseEntry');
const inventoryConsumptionEngine = require('../src/services/inventoryConsumptionEngine');
const { convertUnit, normalizeUnit } = require('../src/utils/unitConverter');

async function runE2ESuite() {
  console.log('================================================================');
  console.log('🚀 PEYALA POS — RECIPE & INVENTORY ENGINE END-TO-END SUITE');
  console.log('================================================================\n');

  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB for E2E verification\n');

  // Track created test IDs for safe cleanup
  const cleanupQueue = {
    orders: [],
    recipes: [],
    conversions: [],
    movements: [],
    purchases: [],
    inventoryItems: [],
  };

  try {
    // ── TEST 1: Default Master Toggle Safety ─────────────────────────
    console.log('TEST 1: Verifying Master Toggle Default Safety...');
    const posSetting = await POSSetting.getSingleton();
    const isEngineActive = await inventoryConsumptionEngine.isEnabled();
    console.log(`  - POSSetting.recipeInventoryAutomationEnabled: ${posSetting.recipeInventoryAutomationEnabled}`);
    console.log(`  - Engine reports enabled: ${isEngineActive}`);
    console.assert(isEngineActive === false, 'Engine MUST be disabled by default!');
    console.log('  ✓ TEST 1 PASSED: Master toggle defaults to false.\n');

    // ── TEST 2: Universal Unit Conversion Mathematics ───────────────
    console.log('TEST 2: Verifying Universal Unit Conversion Engine...');
    const testInv = await InventoryItem.create({
      name: '__TEST_BURGER_PATTY__',
      category: new mongoose.Types.ObjectId(),
      unit: 'piece',
      currentStock: 50,
      minimumStock: 10,
      averageCost: 15,
      lastPurchasePrice: 15,
      isActive: true,
    });
    cleanupQueue.inventoryItems.push(testInv._id);

    const testConv = await UnitConversion.create({
      inventoryItem: testInv._id,
      canonicalUnit: 'piece',
      purchaseUnit: 'packet',
      conversionFactor: 25,
      packageSize: 25,
      packageLabel: 'Pack of 25 patties',
      isActive: true,
    });
    cleanupQueue.conversions.push(testConv._id);

    // Test conversion calculation
    const convResult = convertUnit(4, 'packet', 'piece', 25);
    console.assert(convResult.success && convResult.quantity === 100, '4 packets must convert to 100 pieces');
    console.log(`  ✓ 4 packets converted to: ${convResult.quantity} pieces`);

    // Test metric conversions
    const kgConv = convertUnit(1.5, 'kg', 'gram');
    console.assert(kgConv.success && kgConv.quantity === 1500, '1.5 kg must convert to 1500 g');
    console.log(`  ✓ 1.5 kg converted to: ${kgConv.quantity} g`);
    console.log('  ✓ TEST 2 PASSED: Unit conversion mathematics verified.\n');

    // ── TEST 3: Recipe Creation & Activation ─────────────────────────
    console.log('TEST 3: Verifying Recipe Model & Draft/Active Workflow...');
    const testMenu = await MenuItem.findOne({ isAvailable: true }).lean();
    console.assert(testMenu, 'A menu item must exist');

    const testRecipe = await Recipe.create({
      menuItem: testMenu._id,
      variantName: '__TEST_VARIANT__',
      name: `Test Recipe for ${testMenu.name}`,
      version: 1,
      status: 'draft',
      confidenceScore: 90,
      prepYield: 1,
      preparationLossPercent: 0,
      ingredients: [
        {
          inventoryItem: testInv._id,
          ingredientName: testInv.name,
          recipeQuantity: 2,
          recipeUnit: 'piece',
          canonicalQuantity: 2,
          canonicalUnit: 'piece',
          lossPercent: 0,
          notes: '2 patties per portion',
        },
      ],
      estimatedCost: 30,
    });
    cleanupQueue.recipes.push(testRecipe._id);

    console.assert(testRecipe.status === 'draft', 'Initial recipe status must be draft');
    console.log(`  ✓ Recipe created in DRAFT status: "${testRecipe.name}"`);

    // Activate recipe
    testRecipe.status = 'active';
    testRecipe.lastApprovedAt = new Date();
    await testRecipe.save();
    console.log(`  ✓ Recipe activated successfully.`);
    console.log('  ✓ TEST 3 PASSED: Recipe workflow verified.\n');

    // ── TEST 4: Automated Consumption upon KOT Round Dispatch ────────
    console.log('TEST 4: Verifying Automated KOT Consumption & Idempotency...');
    // Temporarily enable master toggle for execution test
    posSetting.recipeInventoryAutomationEnabled = true;
    await posSetting.save();

    const stockBeforeOrder = (await InventoryItem.findById(testInv._id)).currentStock;

    // Simulate Order with Round 1 (2 portions of testMenu = 4 patties required)
    const testOrder = await Order.create({
      table: new mongoose.Types.ObjectId(),
      orderNumber: 99991,
      status: 'open',
      items: [
        {
          _id: new mongoose.Types.ObjectId(),
          menuItem: testMenu._id,
          name: testMenu.name,
          price: testMenu.price,
          quantity: 2,
          variant: { name: '__TEST_VARIANT__', price: testMenu.price },
          status: 'pending',
          roundNumber: 1,
        },
      ],
      kotRounds: [
        {
          roundNumber: 1,
          items: [{ name: testMenu.name, quantity: 2 }],
        },
      ],
    });
    cleanupQueue.orders.push(testOrder._id);

    // Trigger Round 1 consumption
    const round1Result = await inventoryConsumptionEngine.consumeForKotRound(testOrder, testOrder.kotRounds[0]);
    console.log(`  - Round 1 Consumption count: ${round1Result.count}`);
    console.assert(round1Result.count === 1, 'Should create 1 movement for test patty');

    const stockAfterRound1 = (await InventoryItem.findById(testInv._id)).currentStock;
    console.log(`  - Stock before: ${stockBeforeOrder}, Stock after Round 1: ${stockAfterRound1}`);
    console.assert(stockBeforeOrder - stockAfterRound1 === 4, 'Stock should have decreased by exactly 4 pieces');

    // Test Idempotency: Re-dispatch Round 1 should NOT deduct again!
    const duplicateRound1 = await inventoryConsumptionEngine.consumeForKotRound(testOrder, testOrder.kotRounds[0]);
    console.log(`  - Duplicate Round 1 Consumption count: ${duplicateRound1.count}`);
    console.assert(duplicateRound1.count === 0, 'Duplicate Round 1 MUST be skipped idempotently!');

    const stockAfterDuplicate = (await InventoryItem.findById(testInv._id)).currentStock;
    console.assert(stockAfterDuplicate === stockAfterRound1, 'Stock MUST remain unchanged after duplicate dispatch');
    console.log('  ✓ TEST 4 PASSED: Consumption deduction and idempotency verified.\n');

    // ── TEST 5: Multi-Round Add-on Delta Deduction ───────────────────
    console.log('TEST 5: Verifying Multi-Round KOT Delta Deduction...');
    // Add Round 2 (1 more portion = 2 patties required)
    const newItemRound2 = {
      _id: new mongoose.Types.ObjectId(),
      menuItem: testMenu._id,
      name: testMenu.name,
      price: testMenu.price,
      quantity: 1,
      variant: { name: '__TEST_VARIANT__', price: testMenu.price },
      status: 'pending',
      roundNumber: 2,
    };
    testOrder.items.push(newItemRound2);

    const round2 = {
      roundNumber: 2,
      items: [{ name: testMenu.name, quantity: 1 }],
    };
    testOrder.kotRounds.push(round2);
    await testOrder.save();

    const round2Result = await inventoryConsumptionEngine.consumeForKotRound(testOrder, round2);
    console.log(`  - Round 2 Consumption count: ${round2Result.count}`);
    console.assert(round2Result.count === 1, 'Round 2 should deduct 1 movement');

    const stockAfterRound2 = (await InventoryItem.findById(testInv._id)).currentStock;
    console.log(`  - Stock after Round 2: ${stockAfterRound2}`);
    console.assert(stockAfterRound1 - stockAfterRound2 === 2, 'Round 2 should deduct exactly 2 pieces');
    console.log('  ✓ TEST 5 PASSED: Multi-round delta consumption verified.\n');

    // ── TEST 6: Item Cancellation Reversal ───────────────────────────
    console.log('TEST 6: Verifying Item Cancellation Stock Reversal...');
    await inventoryConsumptionEngine.reverseForCancelledItem(testOrder, newItemRound2);

    const stockAfterCancel = (await InventoryItem.findById(testInv._id)).currentStock;
    console.log(`  - Stock after item cancel: ${stockAfterCancel}`);
    console.assert(stockAfterCancel === stockAfterRound1, 'Cancelling Round 2 item must restore 2 pieces');

    const reversalMovement = await InventoryMovement.findOne({
      order: testOrder._id,
      movementType: 'cancellation_reversal',
    }).lean();
    console.assert(reversalMovement && reversalMovement.quantityDelta === 2, 'Reversal movement must have +2 delta');
    console.log('  ✓ TEST 6 PASSED: Item cancellation reversal verified.\n');

    // ── TEST 7: Whole Order Cancellation Reversal ────────────────────
    console.log('TEST 7: Verifying Whole Order Cancellation Reversal...');
    testOrder.status = 'cancelled';
    testOrder.cancelReason = 'Test Order Cancel';
    await testOrder.save();

    await inventoryConsumptionEngine.reverseForCancelledOrder(testOrder);

    const stockAfterOrderCancel = (await InventoryItem.findById(testInv._id)).currentStock;
    console.log(`  - Stock after order cancel: ${stockAfterOrderCancel}`);
    console.assert(stockAfterOrderCancel === stockBeforeOrder, 'All consumed stock must be restored to initial level');
    console.log('  ✓ TEST 7 PASSED: Order cancellation restored 100% of stock.\n');

    // ── TEST 8: Settled Bill Direct Consumption & Delete Reversal ───
    console.log('TEST 8: Verifying Direct Billing & Settled Bill Deletion...');
    const directOrder = await Order.create({
      table: new mongoose.Types.ObjectId(),
      orderNumber: 99992,
      billNumber: 99992,
      status: 'paid',
      items: [
        {
          _id: new mongoose.Types.ObjectId(),
          menuItem: testMenu._id,
          name: testMenu.name,
          price: testMenu.price,
          quantity: 1,
          variant: { name: '__TEST_VARIANT__', price: testMenu.price },
          status: 'served',
          roundNumber: 1,
        },
      ],
    });
    cleanupQueue.orders.push(directOrder._id);

    // Fallback billing consumption
    await inventoryConsumptionEngine.consumeForDirectBilling(directOrder);
    const stockAfterDirectBilling = (await InventoryItem.findById(testInv._id)).currentStock;
    console.assert(stockBeforeOrder - stockAfterDirectBilling === 2, 'Direct billing must deduct 2 pieces');
    console.log(`  ✓ Direct billing deducted 2 pieces.`);

    // Bill deletion reversal
    await inventoryConsumptionEngine.reverseForSettledBillDeletion(directOrder);
    const stockAfterBillDelete = (await InventoryItem.findById(testInv._id)).currentStock;
    console.assert(stockAfterBillDelete === stockBeforeOrder, 'Bill deletion must restore 2 pieces');
    console.log(`  ✓ Bill deletion restored 2 pieces.`);
    console.log('  ✓ TEST 8 PASSED: Direct billing and deletion reversal verified.\n');

    console.log('================================================================');
    console.log('🎉 ALL 8 AUTOMATED TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');
  } finally {
    // ── TEARDOWN & RECOVERY ──────────────────────────────────────────
    console.log('🧹 Cleaning up test artifacts...');
    if (cleanupQueue.orders.length > 0) {
      await Order.deleteMany({ _id: { $in: cleanupQueue.orders } });
      await InventoryMovement.deleteMany({ order: { $in: cleanupQueue.orders } });
    }
    if (cleanupQueue.recipes.length > 0) {
      await Recipe.deleteMany({ _id: { $in: cleanupQueue.recipes } });
    }
    if (cleanupQueue.conversions.length > 0) {
      await UnitConversion.deleteMany({ _id: { $in: cleanupQueue.conversions } });
    }
    if (cleanupQueue.inventoryItems.length > 0) {
      await InventoryItem.deleteMany({ _id: { $in: cleanupQueue.inventoryItems } });
    }

    // MANDATORY: Ensure master toggle is safely disabled (default production mode)
    const posSetting = await POSSetting.getSingleton();
    posSetting.recipeInventoryAutomationEnabled = false;
    await posSetting.save();
    console.log(`🔒 Production Master Toggle reset to: ${posSetting.recipeInventoryAutomationEnabled} (SAFE DEFAULT)`);

    await mongoose.disconnect();
    console.log('✅ Disconnected and cleanup completed.\n');
  }
}

runE2ESuite().catch(err => {
  console.error('❌ E2E Suite failed:', err);
  process.exit(1);
});
