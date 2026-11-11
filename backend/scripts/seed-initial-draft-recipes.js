const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { generateRecipeSuggestions } = require('../src/services/recipeSuggestionEngine');
const Recipe = require('../src/models/Recipe');
const MenuItem = require('../src/models/MenuItem');

async function seedDraftRecipes() {
  console.log('🍳 Running Automatic Recipe Generation for All Existing Menu Items...');
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri);

  const totalMenu = await MenuItem.countDocuments({ isAvailable: { $ne: false } });
  console.log(`Found ${totalMenu} active menu items in database.`);

  const result = await generateRecipeSuggestions();
  console.log(`\n🎉 Recipe Generation Complete:`);
  console.log(`  - Total menu items evaluated: ${result.totalEvaluated}`);
  console.log(`  - Draft recipes generated: ${result.generatedCount}`);
  console.log(`  - Already existing (skipped): ${result.skippedCount}`);

  // Summary breakdown of drafts
  const drafts = await Recipe.find({ status: 'draft' }).lean();
  console.log(`\nTotal draft recipes in database: ${drafts.length}`);
  const highConfidence = drafts.filter(d => d.confidenceScore >= 75);
  console.log(`  - High confidence (>=75%): ${highConfidence.length}`);
  const mediumConfidence = drafts.filter(d => d.confidenceScore < 75);
  console.log(`  - Medium/Heuristic confidence (<75%): ${mediumConfidence.length}`);

  // Display sample generated drafts
  console.log('\nSample Generated Draft Recipes (DRAFT — NOT ACTIVE):');
  drafts.slice(0, 10).forEach(d => {
    console.log(`  • "${d.name}" | Confidence: ${d.confidenceScore}% | Ingredients: ${d.ingredients.length} | Est Cost: ₹${d.estimatedCost}`);
  });

  await mongoose.disconnect();
  console.log('\n✅ Disconnected and draft recipe seeding complete.');
}

seedDraftRecipes().catch(err => {
  console.error('Failed to seed draft recipes:', err);
  process.exit(1);
});

