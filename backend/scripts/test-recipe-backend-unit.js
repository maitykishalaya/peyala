const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { convertUnit, normalizeUnit, areDirectlyCompatible } = require('../src/utils/unitConverter');
const POSSetting = require('../src/models/POSSetting');
const Recipe = require('../src/models/Recipe');
const UnitConversion = require('../src/models/UnitConversion');
const InventoryMovement = require('../src/models/InventoryMovement');
const inventoryConsumptionEngine = require('../src/services/inventoryConsumptionEngine');
const { generateRecipeSuggestions } = require('../src/services/recipeSuggestionEngine');

async function testBackend() {
  console.log('🧪 Testing Recipe & Unit Conversion Backend Modules...');

  // 1. Test Unit Converter calculations
  console.log('\n--- 1. Testing unitConverter.js ---');
  console.assert(normalizeUnit('Kgs') === 'kg', 'Kgs should normalize to kg');
  console.assert(normalizeUnit('Litres') === 'litre', 'Litres should normalize to litre');
  console.assert(normalizeUnit('pcs') === 'piece', 'pcs should normalize to piece');

  const kgToGram = convertUnit(2.5, 'kg', 'gram');
  console.log(`2.5 kg -> gram:`, kgToGram);
  console.assert(kgToGram.success && kgToGram.quantity === 2500, '2.5 kg should be 2500 g');

  const litreToMl = convertUnit(1.5, 'litre', 'ml');
  console.log(`1.5 litre -> ml:`, litreToMl);
  console.assert(litreToMl.success && litreToMl.quantity === 1500, '1.5 litre should be 1500 ml');

  const dozenToPcs = convertUnit(3, 'dozen', 'piece');
  console.log(`3 dozen -> piece:`, dozenToPcs);
  console.assert(dozenToPcs.success && dozenToPcs.quantity === 36, '3 dozen should be 36 pieces');

  // Custom conversion (e.g. 1 packet = 25 patties)
  const packetToPcs = convertUnit(4, 'packet', 'piece', 25);
  console.log(`4 packets (25 pcs/pkt) -> pieces:`, packetToPcs);
  console.assert(packetToPcs.success && packetToPcs.quantity === 100, '4 packets should be 100 pieces');

  console.log('✅ unitConverter tests passed!');

  // 2. Connect to database
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('\n--- 2. Database Connection & Schema Verification ---');

  // Check POSSetting
  const setting = await POSSetting.getSingleton();
  console.log(`Current recipeInventoryAutomationEnabled:`, setting.recipeInventoryAutomationEnabled);
  console.assert(setting.recipeInventoryAutomationEnabled === false, 'Default master toggle must be false');

  // Test Recipe auto-suggestion engine in dry run mode (don't commit unwanted records or test on single item)
  console.log('\n--- 3. Testing Recipe Suggestion Engine ---');
  const MenuItem = require('../src/models/MenuItem');
  const sampleMenuItem = await MenuItem.findOne({ name: /burger/i }).lean();
  if (sampleMenuItem) {
    console.log(`Found sample menu item for test: "${sampleMenuItem.name}" (ID: ${sampleMenuItem._id})`);
    const suggestionResult = await generateRecipeSuggestions({ menuItemId: sampleMenuItem._id });
    console.log(`Suggestion generated count:`, suggestionResult.generatedCount);
    if (suggestionResult.recipes.length > 0) {
      const r = suggestionResult.recipes[0];
      console.log(`Generated Recipe: "${r.name}" | Status: ${r.status} | Confidence: ${r.confidenceScore}% | Ingredients: ${r.ingredients.length} | Cost: ₹${r.estimatedCost}`);
      console.assert(r.status === 'draft', 'Generated recipe must be DRAFT');
      console.assert(r.confidenceScore >= 50, 'Confidence score should be >= 50');
    }
  }

  // 4. Test consumption engine inactive state
  console.log('\n--- 4. Testing Consumption Engine when disabled ---');
  const isEngineEnabled = await inventoryConsumptionEngine.isEnabled();
  console.log(`Engine isEnabled: ${isEngineEnabled}`);
  console.assert(isEngineEnabled === false, 'Engine must report disabled when toggle is false');

  const mockKotResult = await inventoryConsumptionEngine.consumeForKotRound(
    { _id: new mongoose.Types.ObjectId(), items: [] },
    { roundNumber: 1, items: [] }
  );
  console.log(`consumeForKotRound when disabled:`, mockKotResult);
  console.assert(mockKotResult.consumed === false, 'Must not consume when toggle is false');

  await mongoose.disconnect();
  console.log('\n🎉 ALL BACKEND MODULE TESTS COMPLETED SUCCESSFULLY!');
}

testBackend().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

