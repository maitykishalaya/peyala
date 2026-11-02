const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { recalculateAccountBalances } = require('../utils/accountLedger');

class NightlySnapshotService {
  constructor() {
    this.restorePointsDir = path.join(__dirname, '../../../restore_points');
    this.nightlyDir = path.join(this.restorePointsDir, 'nightly_snapshots');
    this.scheduledTimer = null;
    this.isTakingSnapshot = false;
    this.lastSnapshotInfo = null;

    if (!fs.existsSync(this.nightlyDir)) {
      fs.mkdirSync(this.nightlyDir, { recursive: true });
    }
    this.lockFile = path.join(this.restorePointsDir, '.snapshot.lock');
  }

  /**
   * Acquire cross-process file lock to prevent concurrent snapshot collisions
   */
  acquireLock() {
    const now = Date.now();
    if (fs.existsSync(this.lockFile)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
        // If lock was acquired within the last 5 minutes, another process is actively running
        if (now - (lockData.timestamp || 0) < 5 * 60 * 1000) {
          console.log(`[NightlySnapshot] 🔒 Cross-process lock active (PID ${lockData.pid}). Another snapshot process is currently capturing. Skipping collision.`);
          return false;
        }
        console.warn(`[NightlySnapshot] ⚠️ Stale lock file detected (>5m old from PID ${lockData.pid}). Overriding.`);
      } catch (_) {}
    }

    try {
      fs.writeFileSync(this.lockFile, JSON.stringify({ pid: process.pid, timestamp: now }), 'utf8');
      return true;
    } catch (e) {
      console.warn('[NightlySnapshot] Could not write lock file:', e.message);
      return true;
    }
  }

  /**
   * Release cross-process file lock
   */
  releaseLock() {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch (_) {}
  }

  /**
   * Safely write JSON to disk atomically using a temp file + atomic rename
   */
  atomicWriteJson(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
      fs.renameSync(tmpPath, filePath);
    } catch (renameErr) {
      // Fallback direct write if atomic rename is blocked by filesystem or permissions
      try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch (directErr) {
        console.warn(`[NightlySnapshot] Atomic write warning for ${filePath}:`, directErr.message);
      }
    }
  }

  /**
   * Helper to get IST date string (YYYY-MM-DD)
   */
  getIstDateStr(d = new Date()) {
    const utc = d.getTime();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utc + istOffset);
    return istDate.toISOString().split('T')[0];
  }

  /**
   * Helper to get IST ISO string
   */
  getIstTimestampStr(d = new Date()) {
    const utc = d.getTime();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utc + istOffset);
    return istDate.toISOString().replace('Z', '+05:30');
  }

  /**
   * Calculates milliseconds until next 23:59:00 IST (18:29:00 UTC)
   */
  getMsUntilNext1159PMIst() {
    const now = new Date();
    const targetUtc = new Date(now);
    // 23:59:00 IST = 18:29:00 UTC
    targetUtc.setUTCHours(18, 29, 0, 0);

    if (targetUtc.getTime() <= now.getTime()) {
      targetUtc.setUTCDate(targetUtc.getUTCDate() + 1);
    }

    return targetUtc.getTime() - now.getTime();
  }

  /**
   * Captures a full snapshot of the authoritative database
   */
  async takeSnapshot(options = {}) {
    const dateStr = options.dateStr || this.getIstDateStr();
    const tag = options.tag || 'nightly_1159pm';
    const reason = options.reason || 'Nightly 11:59 PM IST Closing Snapshot';

    // 0a. In-process mutex check (prevents duplicate calls within the same Node process)
    if (this.isTakingSnapshot) {
      console.log('[NightlySnapshot] Snapshot already in progress in this process, skipping duplicate call.');
      return this.lastSnapshotInfo;
    }

    // 0b. 5-Minute Deduplication Cooldown Guard
    // Prevents collision between in-process scheduler and Windows Scheduled Task if both trigger around 23:59 IST
    const targetDir = path.join(this.nightlyDir, `snapshot_${dateStr}`);
    const manifestFile = path.join(targetDir, 'manifest.json');
    if (tag === 'nightly_1159pm' && fs.existsSync(manifestFile)) {
      try {
        const existingManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        const createdAt = new Date(existingManifest.createdAt).getTime();
        const ageMs = Date.now() - createdAt;
        if (ageMs < 5 * 60 * 1000) {
          const ageSec = Math.round(ageMs / 1000);
          console.log(`[NightlySnapshot] ✅ Nightly closing snapshot for ${dateStr} was already completed ${ageSec}s ago. Skipping redundant collision.`);
          this.lastSnapshotInfo = existingManifest;
          return existingManifest;
        }
      } catch (_) {}
    }

    // 0c. OS-level cross-process lock check (prevents dual Node processes from colliding on disk)
    if (!this.acquireLock()) {
      return this.lastSnapshotInfo;
    }

    this.isTakingSnapshot = true;
    const startTime = Date.now();
    const timestampStr = this.getIstTimestampStr();

    console.log(`\n[NightlySnapshot] Starting closing snapshot for ${dateStr} (${reason})...`);

    let connToClose = null;
    try {
      // 1. Determine active database connection
      let activeDb = null;
      let isCentral = false;

      // Check if Central DB connection is directly available
      const centralUri = process.env.MONGODB_CENTRAL_URI || 
        (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('mongodb+srv://') ? process.env.MONGODB_URI : null);

      if (centralUri) {
        try {
          console.log('[NightlySnapshot] Connecting to Central Atlas DB for authoritative snapshot...');
          connToClose = await mongoose.createConnection(centralUri, { serverSelectionTimeoutMS: 8000 }).asPromise();
          activeDb = connToClose.db;
          isCentral = true;
          console.log('[NightlySnapshot] Connected to Central Atlas successfully.');
        } catch (centralErr) {
          console.warn('[NightlySnapshot] Could not connect to Central Atlas, falling back to local DB:', centralErr.message);
        }
      }

      if (!activeDb) {
        if (mongoose.connection && mongoose.connection.readyState === 1) {
          activeDb = mongoose.connection.db;
        } else {
          // Connect to local MongoDB
          const localUri = process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/peyala_local';
          connToClose = await mongoose.createConnection(localUri, { serverSelectionTimeoutMS: 5000 }).asPromise();
          activeDb = connToClose.db;
        }
      }

      if (!activeDb) {
        throw new Error('No database connection available to take snapshot.');
      }

      // 2. Dump all non-system collections
      const collections = await activeDb.listCollections().toArray();
      const dump = {};
      const stats = {};

      for (const col of collections) {
        const colName = col.name;
        if (colName.startsWith('system.')) continue;
        const docs = await activeDb.collection(colName).find({}).toArray();
        dump[colName] = docs;
        stats[colName] = docs.length;
      }

      const totalDocuments = Object.values(stats).reduce((a, b) => a + b, 0);

      // 3. Calculate closing financial metrics & balances
      let closingBalances = [];
      try {
        closingBalances = await recalculateAccountBalances(activeDb);
      } catch (balErr) {
        console.warn('[NightlySnapshot] Balances recalculation notice:', balErr.message);
      }

      // 4. Calculate today's sales summary
      const startOfDay = new Date(`${dateStr}T00:00:00.000+05:30`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999+05:30`);
      const todayOrders = (dump.orders || []).filter(o => {
        const cAt = new Date(o.createdAt || o.date);
        return cAt >= startOfDay && cAt <= endOfDay;
      });

      const paidOrders = todayOrders.filter(o => o.status === 'paid');
      let grossSales = 0;
      let totalTax = 0;
      const paymentBreakdown = { cash: 0, upi: 0, card: 0, due: 0, other: 0 };

      for (const o of paidOrders) {
        grossSales += (o.total || 0);
        totalTax += (o.tax || 0);
        const pb = o.paymentBreakdown || {};
        if (pb.cash || pb.upi || pb.card || pb.due) {
          paymentBreakdown.cash += (pb.cash || 0);
          paymentBreakdown.upi += (pb.upi || 0);
          paymentBreakdown.card += (pb.card || 0);
          paymentBreakdown.due += (pb.due || 0);
        } else {
          const mode = (o.paymentMode || '').toLowerCase();
          if (mode === 'cash') paymentBreakdown.cash += (o.total || 0);
          else if (mode === 'upi') paymentBreakdown.upi += (o.total || 0);
          else if (mode === 'card') paymentBreakdown.card += (o.total || 0);
          else if (mode === 'due' || mode === 'khata') paymentBreakdown.due += (o.total || 0);
          else paymentBreakdown.other += (o.total || 0);
        }
      }

      // 5. Construct snapshot manifest
      const snapshotId = `snapshot_${dateStr}_closing_${Date.now()}`;
      const targetDir = path.join(this.nightlyDir, `snapshot_${dateStr}`);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const manifest = {
        version: '12.0.0',
        snapshotId,
        dateStr,
        tag,
        description: reason,
        createdAt: new Date().toISOString(),
        istTimestamp: timestampStr,
        source: isCentral ? 'Central MongoDB Atlas' : 'Local MongoDB',
        totalDocuments,
        stats,
        closingFinancials: {
          grossSales,
          totalTax,
          totalOrders: todayOrders.length,
          paidOrders: paidOrders.length,
          paymentBreakdown,
          closingBalances: closingBalances.map(b => ({
            name: b.name,
            anchorBalance: b.anchorBalance,
            inflows: b.inflows,
            outflows: b.outflows,
            currentBalance: b.currentBalance,
          })),
        },
      };

      // 6. Write files to disk using atomic operations (temp file + rename)
      const dumpFile = path.join(targetDir, 'atlas_data_snapshot.json');
      const manifestFile = path.join(targetDir, 'manifest.json');
      this.atomicWriteJson(dumpFile, dump);
      this.atomicWriteJson(manifestFile, manifest);

      // Update baseline snapshots for offline installer bundling
      const candidateBaselinePaths = [
        path.join(__dirname, '../../data/baseline_snapshot.json'),
        path.join(__dirname, '../../../data/baseline_snapshot.json'),
        path.join(this.restorePointsDir, 'latest_closing_snapshot.json'),
      ];

      for (const p of candidateBaselinePaths) {
        try {
          this.atomicWriteJson(p, dump);
        } catch (_) {}
      }

      // 7. Insert RestorePoint document into database directly on activeDb
      try {
        await activeDb.collection('restorepoints').insertOne({
          version: '12.0.0',
          snapshotId,
          tag,
          description: reason,
          dbDumpPath: dumpFile,
          stats,
          totalDocuments,
          appConfig: {
            dateStr,
            istTimestamp: timestampStr,
            source: manifest.source,
            financials: manifest.closingFinancials,
          },
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (rpErr) {
        console.warn('[NightlySnapshot] RestorePoint persistence notice:', rpErr.message);
      }

      // 8. Insert AuditLog entry directly on activeDb
      try {
        const adminUser = await activeDb.collection('users').findOne({ role: 'admin' }) || { _id: new mongoose.Types.ObjectId(), name: 'Kishalaya Maity' };
        const cashBal = (closingBalances.find(b => /cash counter/i.test(b.name)) || {}).currentBalance || 0;
        const currBal = (closingBalances.find(b => /current account/i.test(b.name)) || {}).currentBalance || 0;
        const kmBal = (closingBalances.find(b => /kishalaya/i.test(b.name)) || {}).currentBalance || 0;

        await activeDb.collection('auditlogs').insertOne({
          user: adminUser._id,
          userName: 'Nightly Scheduler (' + (adminUser.name || 'Admin') + ')',
          action: 'CREATE',
          module: 'Backup',
          description: `Nightly 11:59 PM IST Closing Snapshot captured for ${dateStr}. Total docs: ${totalDocuments}. Closing: Cash ₹${cashBal.toFixed(2)}, Current ₹${currBal.toFixed(2)}, Kishalaya ₹${kmBal.toFixed(2)}.`,
          metadata: {
            snapshotId,
            dateStr,
            totalDocuments,
            grossSales,
            closingBalances,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (auditErr) {
        console.warn('[NightlySnapshot] AuditLog persistence notice:', auditErr.message);
      }

      // 9. Broadcast via Realtime WebSocket Hub
      try {
        const realtimeHub = require('./realtimeHub');
        realtimeHub.broadcast('SNAPSHOT_TAKEN', manifest);
      } catch (_) {}

      const durationMs = Date.now() - startTime;
      console.log(`[NightlySnapshot SUCCESS] Snapshot completed in ${durationMs}ms:`);
      console.log(`  - Target Directory: ${targetDir}`);
      console.log(`  - Total Documents:  ${totalDocuments}`);
      console.log(`  - Gross Sales Today: ₹${grossSales}`);
      console.log(`  - Cash Closing:     ₹${(closingBalances.find(b => /cash counter/i.test(b.name)) || {}).currentBalance}`);
      console.log(`  - Bank Closing:     ₹${(closingBalances.find(b => /current account/i.test(b.name)) || {}).currentBalance}`);

      this.lastSnapshotInfo = manifest;
      return manifest;
    } finally {
      this.isTakingSnapshot = false;
      this.releaseLock();
      if (connToClose) {
        try { await connToClose.close(); } catch (_) {}
      }
    }
  }

  /**
   * Initializes the nightly recurring schedule (runs at 23:59:00 IST every day)
   */
  initSchedule() {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }

    const msUntilNext = this.getMsUntilNext1159PMIst();
    const nextRunDate = new Date(Date.now() + msUntilNext);
    const minsUntilNext = Math.round(msUntilNext / 60000);

    console.log(`[NightlySnapshot] ⏰ Scheduler armed: Next snapshot at 23:59:00 IST (UTC: ${nextRunDate.toISOString()}) in ~${minsUntilNext} minutes.`);

    this.scheduledTimer = setTimeout(async () => {
      try {
        console.log('[NightlySnapshot] 🔔 11:59 PM IST timer triggered! Executing automated closing snapshot...');
        await this.takeSnapshot({ tag: 'nightly_1159pm', reason: 'Automated 11:59 PM IST Closing Snapshot' });
      } catch (err) {
        console.error('[NightlySnapshot ERROR] Scheduled snapshot failed:', err);
      } finally {
        // Reschedule for next day
        this.initSchedule();
      }
    }, msUntilNext);

    // Prevent timer from blocking graceful process exit
    if (this.scheduledTimer && typeof this.scheduledTimer.unref === 'function') {
      this.scheduledTimer.unref();
    }
  }

  /**
   * Returns current status of the snapshot service
   */
  getStatus() {
    const msUntilNext = this.getMsUntilNext1159PMIst();
    const nextRunDate = new Date(Date.now() + msUntilNext);

    return {
      armed: this.scheduledTimer !== null,
      nextScheduledRunUtc: nextRunDate.toISOString(),
      minutesUntilNext: Math.round(msUntilNext / 60000),
      lastSnapshot: this.lastSnapshotInfo,
    };
  }
}

const nightlySnapshotService = new NightlySnapshotService();
module.exports = nightlySnapshotService;
