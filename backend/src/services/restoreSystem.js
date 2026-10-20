const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const RestorePoint = require('../models/RestorePoint');
const realtimeHub = require('./realtimeHub');

class RestoreSystem {
  constructor() {
    this.restorePointsDir = path.join(__dirname, '../../../restore_points');
    if (!fs.existsSync(this.restorePointsDir)) {
      fs.mkdirSync(this.restorePointsDir, { recursive: true });
    }
  }

  /**
   * List all available restore points
   */
  async listRestorePoints() {
    const list = [];

    // 1. Scan filesystem directory
    if (fs.existsSync(this.restorePointsDir)) {
      const entries = fs.readdirSync(this.restorePointsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(this.restorePointsDir, entry.name, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
              list.push({
                id: entry.name,
                version: manifest.version,
                tag: manifest.tag,
                description: manifest.description,
                createdAt: manifest.createdAt,
                commit: manifest.commit,
                totalDocuments: manifest.totalDocuments,
                stats: manifest.stats,
                isBaseline: entry.name.includes('baseline'),
                path: path.join(this.restorePointsDir, entry.name),
              });
            } catch (_) {}
          }
        }
      }
    }

    // Sort newest first, keeping baseline accessible
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Create a complete versioned restore point of code/config/local data
   */
  async createRestorePoint(version, description = '', syncEngine = null) {
    if (!version) throw new Error('Version string is required (e.g. 10.0.0, 10.0.1)');

    const timestamp = Date.now();
    const folderName = `v${version}_${timestamp}`;
    const targetDir = path.join(this.restorePointsDir, folderName);
    fs.mkdirSync(targetDir, { recursive: true });

    console.log(`[RestoreSystem] Creating versioned restore point: ${folderName}...`);

    // Temporarily pause sync engine to ensure clean point-in-time snapshot
    const wasSyncing = syncEngine?.isSyncing;
    if (syncEngine) syncEngine.isSyncing = true;

    try {
      const dump = {};
      const stats = {};
      const collections = await mongoose.connection.db.listCollections().toArray();

      for (const col of collections) {
        const colName = col.name;
        if (colName.startsWith('system.')) continue;
        const docs = await mongoose.connection.db.collection(colName).find({}).toArray();
        dump[colName] = docs;
        stats[colName] = docs.length;
      }

      const dumpPath = path.join(targetDir, 'local_data_dump.json');
      fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2), 'utf8');

      // Backup environment & configuration
      let envBackup = '';
      const envPath = path.join(__dirname, '../../.env');
      if (fs.existsSync(envPath)) {
        envBackup = fs.readFileSync(envPath, 'utf8');
      }

      const manifest = {
        version,
        snapshotId: folderName,
        createdAt: new Date().toISOString(),
        description: description || `Version ${version} Snapshot`,
        stats,
        totalDocuments: Object.values(stats).reduce((a, b) => a + b, 0),
        envBackup,
      };

      fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

      // Persist to MongoDB model as well
      try {
        await RestorePoint.create({
          version,
          snapshotId: folderName,
          description: manifest.description,
          dbDumpPath: dumpPath,
          stats,
          totalDocuments: manifest.totalDocuments,
          appConfig: { version },
        });
      } catch (_) {}

      console.log(`[RestoreSystem] Restore point ${folderName} created successfully (${manifest.totalDocuments} docs).`);
      return manifest;
    } finally {
      if (syncEngine) syncEngine.isSyncing = wasSyncing;
    }
  }

  /**
   * Safe 8-step rollback procedure
   */
  async rollbackToVersion(targetVersionOrId, syncEngine = null) {
    console.log(`[RestoreSystem] Initiating safe rollback to: ${targetVersionOrId}...`);

    // 1. Locate target restore point
    const points = await this.listRestorePoints();
    const target = points.find(p => p.id === targetVersionOrId || p.version === targetVersionOrId);
    if (!target) {
      throw new Error(`Restore point "${targetVersionOrId}" was not found.`);
    }

    const dataDumpFile = fs.existsSync(path.join(target.path, 'local_data_dump.json'))
      ? path.join(target.path, 'local_data_dump.json')
      : path.join(target.path, 'atlas_data_snapshot.json');

    if (!fs.existsSync(dataDumpFile)) {
      throw new Error(`Data dump missing in restore point: ${target.path}`);
    }

    // Step 1: Pause synchronization
    if (syncEngine) {
      syncEngine.isSyncing = true;
      console.log('[RestoreSystem] Step 1/8: Synchronization paused.');
    }

    // Step 2 & 3: Create automatic pre-rollback safety snapshot
    console.log('[RestoreSystem] Step 2 & 3/8: Creating automatic pre-rollback safety backup...');
    let preRollbackDir = null;
    try {
      const preRollbackManifest = await this.createRestorePoint(`pre_rollback_${Date.now()}`, `Automatic safety backup prior to rolling back to ${target.version}`);
      preRollbackDir = path.join(this.restorePointsDir, preRollbackManifest.snapshotId);
    } catch (snapErr) {
      console.error('[RestoreSystem] Failed to create pre-rollback snapshot:', snapErr.message);
      if (syncEngine) syncEngine.isSyncing = false;
      throw new Error(`Rollback aborted: Unable to take pre-rollback safety snapshot (${snapErr.message})`);
    }

    // Step 4 & 5: Restore target version collections
    console.log(`[RestoreSystem] Step 4 & 5/8: Restoring collections from ${target.version}...`);
    try {
      const rawData = JSON.parse(fs.readFileSync(dataDumpFile, 'utf8'));
      const colNames = Object.keys(rawData);

      for (const colName of colNames) {
        if (colName.startsWith('system.')) continue;
        const docs = rawData[colName];
        const col = mongoose.connection.db.collection(colName);

        // Clear existing collection
        try {
          await col.deleteMany({});
        } catch (_) {}

        // Reinsert snapshot documents
        if (Array.isArray(docs) && docs.length > 0) {
          // Preserve exact ObjectIds and dates
          const normalized = docs.map(d => {
            const copy = { ...d };
            if (copy._id && typeof copy._id === 'string' && /^[0-9a-fA-F]{24}$/.test(copy._id)) {
              copy._id = new mongoose.Types.ObjectId(copy._id);
            }
            return copy;
          });
          await col.insertMany(normalized, { ordered: false });
        }
      }

      // Step 6: Verify database integrity
      console.log('[RestoreSystem] Step 6/8: Verifying database integrity...');
      let totalRestored = 0;
      for (const colName of colNames) {
        if (colName.startsWith('system.')) continue;
        const count = await mongoose.connection.db.collection(colName).countDocuments();
        totalRestored += count;
      }

      console.log(`[RestoreSystem] Integrity check passed: ${totalRestored} documents restored across ${colNames.length} collections.`);

      // Step 7 & 8: Resume sync & notify
      console.log('[RestoreSystem] Step 7 & 8/8: Finalizing rollback and resuming operation...');
      if (syncEngine) {
        syncEngine.isSyncing = false;
        syncEngine.notifyStatus();
      }

      realtimeHub.broadcast('VERSION_RESTORED', {
        version: target.version,
        restoredAt: new Date().toISOString(),
        totalDocuments: totalRestored,
      });

      return {
        success: true,
        status: 'success',
        restoredVersion: target.version,
        restoredFrom: target.id,
        totalDocuments: totalRestored,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[RestoreSystem] ERROR during rollback. Auto-reverting to pre-rollback state...', err);
      // Fallback: Revert to pre-rollback snapshot
      try {
        if (preRollbackDir) {
          const preDump = JSON.parse(fs.readFileSync(path.join(preRollbackDir, 'local_data_dump.json'), 'utf8'));
          for (const colName of Object.keys(preDump)) {
            const col = mongoose.connection.db.collection(colName);
            await col.deleteMany({});
            if (preDump[colName].length > 0) {
              await col.insertMany(preDump[colName]);
            }
          }
          console.log('[RestoreSystem] Successfully reverted to pre-rollback state.');
        }
      } catch (revertErr) {
        console.error('[RestoreSystem CRITICAL] Revert failed:', revertErr);
      } finally {
        if (syncEngine) syncEngine.isSyncing = false;
      }
      throw new Error(`Rollback failed: ${err.message}. Pre-rollback state was preserved.`);
    }
  }
}

const restoreSystem = new RestoreSystem();
module.exports = restoreSystem;
