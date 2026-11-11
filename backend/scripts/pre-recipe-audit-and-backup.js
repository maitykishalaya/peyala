const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runAuditAndBackup() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in backend/.env');
    process.exit(1);
  }

  console.log('====================================================');
  console.log('🚀 PEYALA POS — PHASE 0 AUDIT & PHASE 1 VERIFIED BACKUP');
  console.log('====================================================');
  console.log(`📡 Connecting to MongoDB URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  console.log(`✅ Connected successfully to database: [${dbName}]`);

  // 1. PHASE 1: Complete verified backup of all collections
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../../backups', `pre-recipe-backup-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  console.log(`\n📦 Found ${collections.length} collections. Starting verified backup to:`);
  console.log(`   ${backupDir}\n`);

  const backupManifest = {
    timestamp: new Date().toISOString(),
    database: dbName,
    collections: {},
    totalDocuments: 0
  };

  let totalDocs = 0;
  let verificationPassed = true;

  for (const colInfo of collections) {
    const colName = colInfo.name;
    // Skip system collections
    if (colName.startsWith('system.')) continue;

    const col = db.collection(colName);
    const countInDb = await col.countDocuments();
    const docs = await col.find({}).toArray();

    const filePath = path.join(backupDir, `${colName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');

    // Verify written file
    const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const isMatching = fileContent.length === countInDb;

    if (!isMatching) {
      console.error(`❌ MISMATCH in collection ${colName}: DB=${countInDb}, Written=${fileContent.length}`);
      verificationPassed = false;
    } else {
      console.log(`  ✓ ${colName.padEnd(25)} : ${countInDb} docs backed up and verified`);
    }

    backupManifest.collections[colName] = {
      count: countInDb,
      file: `${colName}.json`,
      verified: isMatching
    };
    totalDocs += countInDb;
  }

  backupManifest.totalDocuments = totalDocs;
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(backupManifest, null, 2), 'utf-8');

  if (verificationPassed) {
    console.log(`\n🎉 Verified Database Backup PASSED! Total documents safely backed up: ${totalDocs}`);
  } else {
    console.error(`\n❌ Verified Database Backup FAILED due to collection count mismatch!`);
    process.exit(1);
  }

  // 2. PHASE 0: Deep Codebase & Database Audit
  console.log('\n====================================================');
  console.log('🔍 PHASE 0: DETAILED DATABASE AUDIT');
  console.log('====================================================');

  // Audit Inventory
  const InventoryItem = require('../src/models/InventoryItem');
  const inventoryItems = await InventoryItem.find({}).lean();
  console.log(`\n1. INVENTORY ITEMS (${inventoryItems.length} total):`);
  const activeInventory = inventoryItems.filter(i => i.status !== 'inactive' && !i.isInactive);
  const inactiveInventory = inventoryItems.filter(i => i.status === 'inactive' || i.isInactive);
  console.log(`   - Active items: ${activeInventory.length}`);
  console.log(`   - Inactive items: ${inactiveInventory.length}`);
  
  // Units present in inventory
  const inventoryUnits = [...new Set(inventoryItems.map(i => i.unit || 'NO_UNIT'))];
  console.log(`   - Unique units currently used: ${JSON.stringify(inventoryUnits)}`);
  
  // Sample inventory items
  console.log(`   - Sample items:`);
  inventoryItems.slice(0, 10).forEach(i => {
    console.log(`     * "${i.name}" (ID: ${i._id}) | Unit: ${i.unit} | Stock: ${i.currentStock} | CostPrice/WAC: ₹${i.unitPrice || i.costPrice || 0}`);
  });

  // Audit Menu Items
  const MenuItem = require('../src/models/MenuItem');
  const menuItems = await MenuItem.find({}).lean();
  console.log(`\n2. MENU ITEMS (${menuItems.length} total):`);
  const activeMenu = menuItems.filter(m => m.isAvailable !== false);
  const inactiveMenu = menuItems.filter(m => m.isAvailable === false);
  console.log(`   - Active items: ${activeMenu.length}`);
  console.log(`   - Inactive items: ${inactiveMenu.length}`);
  const menuCategories = [...new Set(menuItems.map(m => m.category?.toString() || 'NO_CATEGORY'))];
  console.log(`   - Distinct category IDs: ${menuCategories.length}`);
  const itemsWithVariants = menuItems.filter(m => m.variants && m.variants.length > 0);
  const itemsWithAddons = menuItems.filter(m => m.addons && m.addons.length > 0);
  console.log(`   - Items with variants: ${itemsWithVariants.length}`);
  console.log(`   - Items with add-ons: ${itemsWithAddons.length}`);
  console.log(`   - Sample Menu items:`);
  menuItems.slice(0, 10).forEach(m => {
    console.log(`     * "${m.name}" | Price: ₹${m.price} | Variants: ${m.variants?.length || 0} | Addons: ${m.addons?.length || 0}`);
  });

  // Audit Purchases
  const PurchaseEntry = require('../src/models/PurchaseEntry');
  const purchaseCount = await PurchaseEntry.countDocuments();
  console.log(`\n3. PURCHASE ENTRIES (${purchaseCount} total records)`);
  const latestPurchase = await PurchaseEntry.findOne().sort({ createdAt: -1 }).lean();
  if (latestPurchase) {
    console.log(`   - Latest purchase invoice: ${latestPurchase.invoiceNumber || 'N/A'}, date: ${latestPurchase.createdAt}`);
    console.log(`   - Latest purchase items count: ${latestPurchase.items?.length || 0}`);
  }

  // Audit Orders & KOT Rounds
  const Order = require('../src/models/Order');
  const orderCount = await Order.countDocuments();
  console.log(`\n4. ORDERS (${orderCount} total records)`);
  const sampleOrder = await Order.findOne({ 'kotRounds.0': { $exists: true } }).sort({ createdAt: -1 }).lean();
  if (sampleOrder) {
    console.log(`   - Recent Order with KOT rounds: Order #${sampleOrder.orderNumber}, status: ${sampleOrder.status}`);
    console.log(`   - kotRounds length: ${sampleOrder.kotRounds?.length || 0}`);
    if (sampleOrder.kotRounds && sampleOrder.kotRounds.length > 0) {
      console.log(`   - Round 1 items: ${sampleOrder.kotRounds[0].items?.length || 0}`);
    }
  }

  // Audit Wastage
  const Wastage = require('../src/models/Wastage');
  const wastageCount = await Wastage.countDocuments();
  console.log(`\n5. WASTAGE RECORDS (${wastageCount} total records)`);

  // Audit AuditLog
  const AuditLog = require('../src/models/AuditLog');
  const auditLogCount = await AuditLog.countDocuments();
  console.log(`\n6. AUDIT LOG RECORDS (${auditLogCount} total records)`);

  // Audit POSSetting
  const POSSetting = require('../src/models/POSSetting');
  const posSetting = await POSSetting.findOne().lean();
  console.log(`\n7. POS SETTING:`);
  if (posSetting) {
    console.log(`   - Setting found (ID: ${posSetting._id})`);
    console.log(`   - recipeInventoryAutomationEnabled: ${posSetting.recipeInventoryAutomationEnabled}`);
  } else {
    console.log(`   - No POSSetting document found (needs initial doc)`);
  }

  console.log('\n====================================================');
  console.log('✅ AUDIT & BACKUP COMPLETE');
  console.log('====================================================');
  await mongoose.disconnect();
}

runAuditAndBackup().catch(err => {
  console.error('Audit and backup failed:', err);
  process.exit(1);
});

