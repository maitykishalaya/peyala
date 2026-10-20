const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const localDbRunner = require('../services/localDbRunner');
const syncEngine = require('../services/syncEngine');

const connectDB = async () => {
  let localUri = null;

  try {
    // 1. Ensure local operational database is up and running
    localUri = await localDbRunner.start();
  } catch (runnerErr) {
    console.warn(`[Peyala Backend] Local MongoDB engine could not start: ${runnerErr.message}. Will connect directly to Cloud Atlas.`);
  }

  // 2. Attempt connection to local database
  if (localUri) {
    try {
      const conn = await mongoose.connect(localUri, {
        maxPoolSize: 100, // Support multi-device concurrent operations without socket starvation
        minPoolSize: 10,  // Keep at least 10 warm connections open
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,       // Enforce IPv4
      });

      console.log(`[Peyala Backend] Local-First MongoDB Connected: ${conn.connection.host} / DB: ${conn.connection.name}`);

      // 3. Auto-seed from baseline restore point if local database is fresh
      const hasMenuItems = await conn.connection.db.collection('menuitems').countDocuments().catch(() => 0);

      if (hasMenuItems === 0) {
        console.log('[Peyala Backend] Local database is fresh. Auto-seeding from baseline restore point (10,313 documents)...');
        const snapshotPath = path.join(__dirname, '../../../restore_points/v10.0.0_baseline/atlas_data_snapshot.json');
        if (fs.existsSync(snapshotPath)) {
          const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
          let totalSeeded = 0;
          for (const colName of Object.keys(snapshotData)) {
            const docs = snapshotData[colName];
            if (Array.isArray(docs) && docs.length > 0) {
              const col = conn.connection.db.collection(colName);
              const normalized = docs.map((d) => {
                const copy = { ...d };
                if (copy._id && typeof copy._id === 'string' && /^[0-9a-fA-F]{24}$/.test(copy._id)) {
                  copy._id = new mongoose.Types.ObjectId(copy._id);
                }
                return copy;
              });
              await col.insertMany(normalized, { ordered: false });
              totalSeeded += docs.length;
            }
          }
          console.log(`[Peyala Backend] Auto-seeded local database successfully with ${totalSeeded} documents!`);
        }
      }

      // 4. Initialize background sync engine (runs periodically in background, never blocking UI or startup)
      syncEngine.init().catch((err) => {
        console.warn('[Peyala Backend] Initial sync check notice:', err.message);
      });

      return conn;
    } catch (localConnErr) {
      console.warn(`[Peyala Backend] Could not connect to local URI (${localUri}): ${localConnErr.message}. Falling back to Cloud Atlas.`);
    }
  }

  // 5. Cloud Atlas Fallback (Ensures 100% plug-and-play availability on any machine)
  try {
    console.log('[Peyala Backend] Connecting directly to Cloud Atlas MongoDB...');
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 10000,
      family: 4,
    });
    console.log(`[Peyala Backend] Cloud Atlas Connected: ${conn.connection.host} / DB: ${conn.connection.name}`);
    return conn;
  } catch (atlasErr) {
    console.error(`[Peyala Backend] MongoDB Fatal Connection Error: ${atlasErr.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
