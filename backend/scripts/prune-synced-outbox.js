/**
 * Peyala POS - Safe Outbox Pruning & Index Maintenance
 * Purges obsolete `status: 'synced'` envelopes from `syncoutboxes`.
 * Strictly leaves all `pending`, `failed`, and active operational data 100% untouched.
 */

const path = require('path');
const mongoose = require(path.join(__dirname, '../node_modules/mongoose'));
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });

async function pruneDb(uri, label) {
  if (!uri) {
    console.log(`[${label}] No URI provided, skipping.`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`[${label}] Connecting to database...`);
  const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
  console.log(`[${label}] Connected to: ${conn.name} on ${conn.host}`);

  const col = conn.db.collection('syncoutboxes');

  // Check stats before
  const statsBefore = await conn.db.stats();
  let syncStatsBefore = { size: 0, count: 0 };
  try {
    syncStatsBefore = await conn.db.command({ collStats: 'syncoutboxes' });
  } catch (_) {}

  const totalBefore = await col.countDocuments();
  const syncedCount = await col.countDocuments({ status: 'synced' });
  const pendingCount = await col.countDocuments({ status: 'pending' });
  const failedCount = await col.countDocuments({ status: 'failed' });

  console.log(`[${label}] SyncOutbox BEFORE: Total: ${totalBefore} | Synced: ${syncedCount} | Pending: ${pendingCount} | Failed: ${failedCount}`);
  console.log(`[${label}] SyncOutbox Data Size BEFORE: ${(syncStatsBefore.size / 1024 / 1024).toFixed(3)} MB`);
  console.log(`[${label}] Total DB Logical Size BEFORE: ${((statsBefore.dataSize + statsBefore.indexSize) / 1024 / 1024).toFixed(2)} MB`);

  if (syncedCount > 0) {
    // Safety deletion: ONLY delete documents where status is explicitly 'synced'
    console.log(`[${label}] Safely deleting ${syncedCount} completed ('synced') records...`);
    const deleteResult = await col.deleteMany({
      status: 'synced',
      syncedAt: { $ne: null },
    });
    console.log(`[${label}] ✅ Successfully deleted ${deleteResult.deletedCount} synced outbox records.`);
  } else {
    console.log(`[${label}] No synced records to prune.`);
  }

  // Ensure TTL Index is created so MongoDB automatically prunes synced records after 24 hours in the background
  console.log(`[${label}] Ensuring 24-hour background TTL index on syncedAt...`);
  try {
    // Drop existing non-TTL index on syncedAt if present
    const existingIndexes = await col.indexes();
    const hasSyncedAtTTL = existingIndexes.some((idx) => idx.name === 'syncedAt_ttl_24h' || (idx.key?.syncedAt && idx.expireAfterSeconds));
    if (!hasSyncedAtTTL) {
      await col.createIndex(
        { syncedAt: 1 },
        {
          name: 'syncedAt_ttl_24h',
          expireAfterSeconds: 86400, // 24 hours
          partialFilterExpression: { status: 'synced' },
        }
      );
      console.log(`[${label}] ✅ Created 24-hour TTL index 'syncedAt_ttl_24h'.`);
    } else {
      console.log(`[${label}] ✅ TTL index already present.`);
    }
  } catch (idxErr) {
    console.warn(`[${label}] Notice on TTL index:`, idxErr.message);
  }

  // Check stats after
  const statsAfter = await conn.db.stats();
  let syncStatsAfter = { size: 0, count: 0 };
  try {
    syncStatsAfter = await conn.db.command({ collStats: 'syncoutboxes' });
  } catch (_) {}

  const totalAfter = await col.countDocuments();
  const pendingAfter = await col.countDocuments({ status: 'pending' });

  console.log(`\n[${label}] --- RESULTS ---`);
  console.log(`[${label}] SyncOutbox Count: ${totalBefore} -> ${totalAfter} (Pending preserved: ${pendingAfter})`);
  console.log(`[${label}] SyncOutbox Data Size: ${(syncStatsBefore.size / 1024 / 1024).toFixed(3)} MB -> ${(syncStatsAfter.size / 1024 / 1024).toFixed(3)} MB`);
  console.log(`[${label}] Total DB Logical Size: ${((statsBefore.dataSize + statsBefore.indexSize) / 1024 / 1024).toFixed(2)} MB -> ${((statsAfter.dataSize + statsAfter.indexSize) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`======================================================\n`);

  await conn.close();
}

async function main() {
  const centralUri = process.env.MONGODB_CENTRAL_URI || process.env.MONGODB_URI;
  await pruneDb(centralUri, 'CENTRAL CLOUD ATLAS');

  // Check local database as well if running
  try {
    const localUri = 'mongodb://127.0.0.1:27017/peyala_local';
    const testConn = await mongoose.createConnection(localUri, { serverSelectionTimeoutMS: 2000 }).asPromise();
    await testConn.close();
    await pruneDb(localUri, 'LOCAL COUNTER DB');
  } catch (_) {
    console.log('[LOCAL COUNTER DB] Local MongoDB is currently offline/not running, skipping local prune.');
  }
}

main().catch((err) => {
  console.error('Pruning script error:', err);
  process.exit(1);
});
