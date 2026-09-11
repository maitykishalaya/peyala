require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const models = [
  'Account', 'Attendance', 'AuditLog', 'BalanceSheet',
  'InventoryCategory', 'InventoryItem', 'MenuCategory', 'MenuItem',
  'Order', 'OwnerNote', 'Payment', 'PaymentCategory',
  'PurchaseEntry', 'SalesEntry', 'Staff', 'Supplier',
  'Table', 'Transfer', 'User'
];

async function backup() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found in backend/.env');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../../backups', `backup-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`📡 Connecting to MongoDB for READ-ONLY backup...`);
  await mongoose.connect(uri);
  console.log(`✅ Connected. Creating snapshot at: ${backupDir}\n`);

  let totalDocs = 0;
  for (const modelName of models) {
    try {
      const Model = require(`../models/${modelName}`);
      const data = await Model.find({}).lean();
      const filePath = path.join(backupDir, `${modelName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`  📦 Saved ${modelName}: ${data.length} records`);
      totalDocs += data.length;
    } catch (err) {
      console.warn(`  ⚠️ Could not export ${modelName}: ${err.message}`);
    }
  }

  console.log(`\n🎉 Backup complete! Total records saved: ${totalDocs}`);
  console.log(`📁 Files saved in: ${backupDir}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  backup().catch(err => {
    console.error('❌ Backup failed:', err);
    process.exit(1);
  });
}

module.exports = { backup };
