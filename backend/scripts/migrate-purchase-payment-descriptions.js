// ─────────────────────────────────────────────────────────────────
// Migration Script: Synchronize Payment Descriptions with Purchases
//
// Rules:
// 1. If purchase has description/notes: Payment description = purchase notes/description.
// 2. If purchase has NO description/notes: Payment description = comma-separated item names.
// 3. Updates Payment.supplier from PurchaseEntry.supplier if missing.
// 4. Safe and idempotent. Run with --dry-run to preview changes without saving.
// ─────────────────────────────────────────────────────────────────

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Payment = require('../src/models/Payment');
const PurchaseEntry = require('../src/models/PurchaseEntry');
const InventoryItem = require('../src/models/InventoryItem');

async function migrate() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`🚀 Starting purchase-payment description migration... [mode: ${isDryRun ? 'DRY RUN' : 'APPLY'}]`);

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const payments = await Payment.find({ relatedPurchase: { $exists: true, $ne: null } })
    .populate({
      path: 'relatedPurchase',
      populate: { path: 'items.item', select: 'name' }
    });

  console.log(`📋 Found ${payments.length} purchase-linked payments to evaluate.`);

  let updatedCount = 0;
  let unchangedCount = 0;
  let missingPurchaseCount = 0;

  for (const payment of payments) {
    const purchase = payment.relatedPurchase;
    if (!purchase) {
      missingPurchaseCount++;
      continue;
    }

    const customDesc = (purchase.description || purchase.notes || '').trim();
    let targetDescription = '';

    if (customDesc) {
      targetDescription = customDesc;
    } else if (Array.isArray(purchase.items) && purchase.items.length > 0) {
      const names = [];
      for (const line of purchase.items) {
        let name = '';
        if (line.item && typeof line.item === 'object' && line.item.name) {
          name = line.item.name;
        } else if (line.name) {
          name = line.name;
        }
        if (name && !names.includes(name)) {
          names.push(name);
        }
      }
      targetDescription = names.length > 0 ? names.join(', ') : payment.description;
    } else {
      targetDescription = payment.description;
    }

    const needsDescUpdate = payment.description !== targetDescription;
    const needsSupplierUpdate = !payment.supplier && purchase.supplier;

    if (needsDescUpdate || needsSupplierUpdate) {
      updatedCount++;
      if (isDryRun) {
        console.log(`[DRY-RUN UPDATE] Payment ${payment._id} (${payment.payee}):`);
        if (needsDescUpdate) console.log(`   Old Desc: "${payment.description}" -> New Desc: "${targetDescription}"`);
        if (needsSupplierUpdate) console.log(`   Set supplier: ${purchase.supplier}`);
      } else {
        payment.description = targetDescription;
        if (needsSupplierUpdate) payment.supplier = purchase.supplier;
        await payment.save();
      }
    } else {
      unchangedCount++;
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log(`Summary:`);
  console.log(`  Total evaluated:   ${payments.length}`);
  console.log(`  ${isDryRun ? 'Would update' : 'Updated'}:      ${updatedCount}`);
  console.log(`  Already matching:  ${unchangedCount}`);
  console.log(`  Missing purchases: ${missingPurchaseCount}`);
  console.log('─────────────────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB. Done!');
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
