const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function createBaselineSnapshot() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGODB_URI found in backend/.env');
    process.exit(1);
  }

  console.log('[Snapshot] Connecting to Central MongoDB Atlas...');
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[Snapshot] Connected to ${conn.connection.host} / ${conn.connection.name}`);

  const collections = await conn.connection.db.listCollections().toArray();
  console.log(`[Snapshot] Found ${collections.length} collections:`, collections.map(c => c.name));

  const targetDir = path.join(__dirname, '../../restore_points/v10.0.0_baseline');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const dump = {};
  const stats = {};

  for (const col of collections) {
    const colName = col.name;
    if (colName.startsWith('system.')) continue;
    const docs = await conn.connection.db.collection(colName).find({}).toArray();
    dump[colName] = docs;
    stats[colName] = docs.length;
    console.log(`  - ${colName}: ${docs.length} documents dumped`);
  }

  const snapshotFile = path.join(targetDir, 'atlas_data_snapshot.json');
  fs.writeFileSync(snapshotFile, JSON.stringify(dump, null, 2), 'utf8');

  const manifest = {
    version: '10.0.0',
    tag: 'v10.0.0-pre-local-first',
    createdAt: new Date().toISOString(),
    commit: 'ab4faca',
    description: 'Complete working restore point before local-first performance and reliability upgrade',
    stats,
    totalDocuments: Object.values(stats).reduce((a, b) => a + b, 0),
    envBackup: {
      backend: fs.readFileSync(path.join(__dirname, '../.env'), 'utf8'),
    }
  };

  const manifestFile = path.join(targetDir, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n[Snapshot SUCCESS] Snapshot saved to ${targetDir}`);
  console.log(`Total documents backed up: ${manifest.totalDocuments}`);

  await mongoose.disconnect();
}

createBaselineSnapshot().catch((err) => {
  console.error('[Snapshot ERROR]', err);
  process.exit(1);
});
