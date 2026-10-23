const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const localDbRunner = require('../services/localDbRunner');
const syncEngine = require('../services/syncEngine');
const offlineAuthVault = require('../services/offlineAuthVault');

// Prevent Mongoose from hanging indefinitely on queries when DB is reconnecting
mongoose.set('bufferTimeoutMS', 3000);

let isRecoveryActive = false;
let recoveryInterval = null;

async function seedBaselineIfNeeded(conn) {
  try {
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

    // Populate offline auth vault with active users
    const allUsers = await conn.connection.db.collection('users').find({ isActive: { $ne: false } }).toArray().catch(() => []);
    if (allUsers.length > 0) {
      offlineAuthVault.syncFromDb(allUsers);
    }
  } catch (err) {
    console.warn('[Peyala Backend] Auto-seed or vault sync warning:', err.message);
  }
}

function startLocalDbRecovery() {
  if (isRecoveryActive) return;
  isRecoveryActive = true;
  console.log('[Peyala Backend] ⚡ Continuous background local database auto-recovery loop started.');

  recoveryInterval = setInterval(async () => {
    if (mongoose.connection.readyState === 1) {
      clearInterval(recoveryInterval);
      isRecoveryActive = false;
      return;
    }

    try {
      const uri = await localDbRunner.start();
      if (uri) {
        console.log('[Peyala Backend] Local DB engine detected! Connecting Mongoose...');
        const conn = await mongoose.connect(uri, {
          maxPoolSize: 100,
          minPoolSize: 10,
          serverSelectionTimeoutMS: 3000,
          socketTimeoutMS: 45000,
          family: 4,
        });

        console.log(`[Peyala Backend] ✅ Local-First MongoDB auto-recovered: ${conn.connection.host}`);
        await seedBaselineIfNeeded(conn);

        syncEngine.init().catch((err) => {
          console.warn('[Peyala Backend] Sync engine init notice:', err.message);
        });

        clearInterval(recoveryInterval);
        isRecoveryActive = false;
      }
    } catch (_) {
      // Keep trying quietly in background without flooding logs
    }
  }, 4000);
}

const connectDB = async () => {
  // If running in test mode with explicit MONGODB_URI (e.g. load testing sandbox)
  if (process.env.NODE_ENV === 'test' && process.env.MONGODB_URI) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        maxPoolSize: 100,
        minPoolSize: 10,
        serverSelectionTimeoutMS: 4000,
        socketTimeoutMS: 45000,
        family: 4,
      });
      console.log(`[Peyala Backend] Test Sandbox MongoDB Connected: ${conn.connection.host} / DB: ${conn.connection.name}`);
      await seedBaselineIfNeeded(conn);
      return conn;
    } catch (testDbErr) {
      console.warn(`[Peyala Backend] Test sandbox connection failed: ${testDbErr.message}`);
    }
  }

  let localUri = null;

  try {
    // 1. Ensure local operational database is up and running
    localUri = await localDbRunner.start();
  } catch (runnerErr) {
    console.warn(`[Peyala Backend] Local MongoDB engine notice: ${runnerErr.message}. Will attempt Cloud Atlas or recovery loop.`);
  }

  // 2. Attempt connection to local database
  if (localUri) {
    try {
      const conn = await mongoose.connect(localUri, {
        maxPoolSize: 100,
        minPoolSize: 10,
        serverSelectionTimeoutMS: 4000,
        socketTimeoutMS: 45000,
        family: 4,
      });

      console.log(`[Peyala Backend] Local-First MongoDB Connected: ${conn.connection.host} / DB: ${conn.connection.name}`);

      await seedBaselineIfNeeded(conn);

      // Initialize background sync engine
      syncEngine.init().catch((err) => {
        console.warn('[Peyala Backend] Initial sync check notice:', err.message);
      });

      return conn;
    } catch (localConnErr) {
      console.warn(`[Peyala Backend] Could not connect to local URI (${localUri}): ${localConnErr.message}`);
    }
  }

  // 3. Cloud Atlas Fallback (If online)
  if (process.env.MONGODB_URI) {
    try {
      console.log('[Peyala Backend] Attempting Cloud Atlas MongoDB fallback...');
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        maxPoolSize: 50,
        serverSelectionTimeoutMS: 4000,
        family: 4,
      });
      console.log(`[Peyala Backend] Cloud Atlas Connected: ${conn.connection.host} / DB: ${conn.connection.name}`);
      return conn;
    } catch (atlasErr) {
      console.warn(`[Peyala Backend] Cloud Atlas unavailable (${atlasErr.message}). Operating in full offline mode.`);
    }
  }

  // 4. Zero-Crash Guarantee: If neither local nor cloud connected yet, KEEP SERVER ALIVE and start auto-recovery
  console.log('[Peyala Backend] ⚡ Backend is ALIVE in Offline Standalone Mode. Starting auto-recovery for local MongoDB...');
  startLocalDbRecovery();
  return null;
};

module.exports = connectDB;
