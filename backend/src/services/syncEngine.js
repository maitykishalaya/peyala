const mongoose = require('mongoose');
const SyncOutbox = require('../models/SyncOutbox');
const realtimeHub = require('./realtimeHub');

class SyncEngine {
  constructor() {
    this.centralUri = process.env.MONGODB_CENTRAL_URI || process.env.MONGODB_URI;
    this.centralConn = null;
    this.isSyncing = false;
    this.syncIntervalMs = parseInt(process.env.SYNC_INTERVAL_MS || '15000', 10); // 15 seconds default
    this.timer = null;
    this.debounceTimer = null;
    this.lastSyncTime = null;
    this.lastSyncError = null;
    this.isOnline = false;
    this.consecutiveFailures = 0;
    this.lastInboundSync = null;
  }

  /**
   * Initialize sync engine with central database connection and scheduled timer
   */
  async init() {
    console.log('[SyncEngine] Initializing background delta sync engine...');
    console.log(`[SyncEngine] High-frequency sync interval: ${this.syncIntervalMs / 1000}s`);

    // Attempt initial connection to central DB
    await this.checkConnectivity();

    // Start background periodic interval
    this.timer = setInterval(() => {
      this.syncNow().catch((err) => {
        console.warn('[SyncEngine] Scheduled sync encountered error:', err.message);
      });
    }, this.syncIntervalMs);

    // Initial sync check after 2 seconds of startup
    setTimeout(() => {
      this.syncNow().catch(() => {});
    }, 2000);
  }

  /**
   * Connect or retrieve Central MongoDB connection
   */
  async getCentralConnection() {
    if (this.centralConn && this.centralConn.readyState === 1) {
      return this.centralConn;
    }

    if (!this.centralUri) {
      throw new Error('No MONGODB_CENTRAL_URI configured');
    }

    try {
      this.centralConn = await mongoose.createConnection(this.centralUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 20000,
        family: 4,
        maxPoolSize: 10,
        minPoolSize: 1,
      }).asPromise();

      console.log(`[SyncEngine] Connected to Central DB: ${this.centralConn.host} / ${this.centralConn.name}`);
      this.isOnline = true;
      this.consecutiveFailures = 0;
      return this.centralConn;
    } catch (err) {
      this.isOnline = false;
      this.lastSyncError = err.message;
      throw err;
    }
  }

  /**
   * Ping central database to verify internet / cloud reachability
   */
  async checkConnectivity() {
    try {
      const conn = await this.getCentralConnection();
      await conn.db.admin().ping();
      this.isOnline = true;
      this.consecutiveFailures = 0;
      return true;
    } catch (err) {
      this.isOnline = false;
      this.lastSyncError = err.message;
      return false;
    }
  }

  /**
   * Record a local mutation in the persistent SyncOutbox queue
   */
  async recordMutation(collectionName, documentId, operation, payload = {}, revision = 1) {
    try {
      const docIdStr = String(documentId);

      // Check for an existing pending mutation on this document to coalesce rapid edits
      const existing = await SyncOutbox.findOne({
        collectionName,
        documentId: docIdStr,
        status: 'pending',
      });

      if (existing) {
        // If it was an insert, keep operation as insert, merge payload, increment revision
        const mergedPayload = { ...existing.payload, ...payload };
        existing.payload = mergedPayload;
        existing.revision = (existing.revision || 1) + 1;
        existing.attempts = 0;
        await existing.save();
        return existing;
      }

      // Create new outbox entry
      const outboxItem = await SyncOutbox.create({
        collectionName,
        documentId: docIdStr,
        operation,
        payload,
        revision,
        status: 'pending',
        idempotencyKey: `${collectionName}_${docIdStr}_rev${revision}_${Date.now()}`,
      });

      // Broadcast sync status update to connected devices
      this.notifyStatus();

      // Debounce immediate sync push so changes hit Atlas in <1s instead of waiting
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.syncNow().catch(() => {});
      }, 600);

      return outboxItem;
    } catch (err) {
      console.error(`[SyncEngine] Failed to record mutation for ${collectionName}:${documentId}:`, err.message);
    }
  }

  /**
   * Execute sync: Push pending outbox mutations to Central DB
   */
  async syncNow() {
    if (this.isSyncing) {
      return { status: 'already_syncing', message: 'Sync cycle already in progress' };
    }

    this.isSyncing = true;
    let processedCount = 0;
    let failedCount = 0;

    try {
      // 1. Verify central connection
      let centralConn;
      try {
        centralConn = await this.getCentralConnection();
      } catch (err) {
        this.consecutiveFailures++;
        this.isOnline = false;
        this.lastSyncError = `Central DB unavailable: ${err.message}`;
        this.notifyStatus();
        return {
          status: 'offline',
          message: 'Central database unavailable. Local operations unaffected.',
          pending: await this.getPendingCount(),
        };
      }

      // 2. Query batch of pending outbox items
      const pendingItems = await SyncOutbox.find({ status: { $in: ['pending', 'failed'] } })
        .sort({ createdAt: 1 })
        .limit(100);

      if (pendingItems.length === 0) {
        // Run inbound sync to pull any updates made directly on website
        await this.pullFromCentral(centralConn);
        this.lastSyncTime = new Date();
        this.lastSyncError = null;
        this.notifyStatus();
        return { status: 'up_to_date', processed: 0, pending: 0 };
      }

      console.log(`[SyncEngine] Processing ${pendingItems.length} pending mutations to Central DB...`);

      for (const item of pendingItems) {
        item.status = 'in_progress';
        item.attempts += 1;
        await item.save();

        try {
          const colName = this.getCollectionName(item.collectionName);

          const centralCol = centralConn.db.collection(colName);
          const localCol = mongoose.connection.db.collection(colName);

          if (item.operation === 'insert' || item.operation === 'update') {
            // Read latest full document from local DB if available
            let docToSync = item.payload;
            try {
              const fullDoc = await localCol.findOne({
                $or: [
                  { _id: item.documentId },
                  { _id: new mongoose.Types.ObjectId(item.documentId) },
                ],
              });
              if (fullDoc) docToSync = fullDoc;
            } catch (_) {}

            if (docToSync && Object.keys(docToSync).length > 0) {
              let queryId = docToSync._id || item.documentId;
              if (typeof queryId === 'string' && /^[0-9a-fA-F]{24}$/.test(queryId)) {
                queryId = new mongoose.Types.ObjectId(queryId);
                docToSync._id = queryId;
              }
              await centralCol.replaceOne(
                { _id: queryId },
                docToSync,
                { upsert: true }
              );
            }
          } else if (item.operation === 'delete') {
            let delId = item.documentId;
            if (typeof delId === 'string' && /^[0-9a-fA-F]{24}$/.test(delId)) {
              delId = new mongoose.Types.ObjectId(delId);
            }
            await centralCol.deleteOne({ _id: delId });
          }

          item.status = 'synced';
          item.syncedAt = new Date();
          item.lastError = null;
          await item.save();
          processedCount++;
        } catch (err) {
          failedCount++;
          item.status = 'failed';
          item.lastError = err.message;
          await item.save();
          console.warn(`[SyncEngine] Error syncing ${item.collectionName}:${item.documentId}:`, err.message);
        }
      }

      this.lastSyncTime = new Date();
      this.lastSyncError = failedCount > 0 ? `${failedCount} items failed to sync` : null;
      console.log(`[SyncEngine] Outbound sync: ${processedCount} synced, ${failedCount} failed.`);

      // 3. Inbound Sync: Pull cloud changes (transfers, accounts, menu) into local DB
      await this.pullFromCentral(centralConn);

      // Broadcast update
      this.notifyStatus();

      return {
        status: 'success',
        processed: processedCount,
        failed: failedCount,
        pending: await this.getPendingCount(),
        lastSyncTime: this.lastSyncTime,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  getCollectionName(modelName) {
    if (!modelName) return 'generals';
    if (mongoose.models[modelName]) {
      return mongoose.models[modelName].collection.name;
    }
    const map = {
      purchaseentry: 'purchaseentries',
      menucategory: 'menucategories',
      inventorycategory: 'inventorycategories',
      tablecategory: 'tablecategories',
      customerduepayment: 'customerduepayments',
    };
    const lower = modelName.toLowerCase();
    if (map[lower]) return map[lower];
    return lower.endsWith('s') ? lower : `${lower}s`;
  }

  /**
   * Inbound Sync: Pull updates from Central DB into Local DB
   * Ensures transfers, account balances, purchases, payments, orders, and menu updates done on website reflect locally
   */
  async pullFromCentral(centralConn) {
    if (!centralConn || centralConn.readyState !== 1) return;
    try {
      const inboundCollections = [
        'accounts',
        'transfers',
        'payments',
        'purchaseentries',
        'orders',
        'receipts',
        'suppliers',
        'salesentries',
        'customers',
        'customerduepayments',
        'menuitems',
        'menucategories',
        'inventoryitems',
        'inventorycategories',
        'tables',
        'tablecategories',
        'staffs',
        'attendances',
        'wastages',
        'ownernotes',
      ];

      let pulledCount = 0;
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 48 * 3600 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      const syncFilter = this.lastInboundSync
        ? {
            $or: [
              { updatedAt: { $gte: new Date(this.lastInboundSync.getTime() - 120000) } },
              { createdAt: { $gte: new Date(this.lastInboundSync.getTime() - 120000) } },
            ],
          }
        : {};

      for (const colName of inboundCollections) {
        try {
          const centralCol = centralConn.db.collection(colName);
          const localCol = mongoose.connection.db.collection(colName);

          let query = syncFilter;
          // Small master collections: always pull all to guarantee 100% real-time fidelity
          if (['accounts', 'tables', 'tablecategories', 'menucategories', 'ownernotes', 'addons'].includes(colName) || !this.lastInboundSync) {
            query = {};
          } else if (colName === 'orders') {
            // Always pull any open/preparing/served order, plus recent orders
            query = {
              $or: [
                { status: { $nin: ['paid', 'cancelled'] } },
                { createdAt: { $gte: twoDaysAgo } },
                { updatedAt: { $gte: twoDaysAgo } },
              ],
            };
          } else if (['purchaseentries', 'transfers', 'payments'].includes(colName)) {
            // Always verify all activity from the last 48 hours
            query = {
              $or: [
                { date: { $gte: twoDaysAgo } },
                { createdAt: { $gte: twoDaysAgo } },
                { updatedAt: { $gte: twoDaysAgo } },
              ],
            };
          } else if (colName === 'salesentries') {
            query = { date: { $gte: thirtyDaysAgo } };
          }

          const docs = await centralCol.find(query).toArray();
          if (docs.length > 0) {
            const ops = docs.map(doc => ({
              replaceOne: {
                filter: { _id: doc._id },
                replacement: doc,
                upsert: true,
              },
            }));
            await localCol.bulkWrite(ops, { ordered: false });
            pulledCount += docs.length;
          }
        } catch (colErr) {
          console.warn(`[SyncEngine] Inbound pull error for ${colName}:`, colErr.message);
        }
      }

      this.lastInboundSync = new Date();
      if (pulledCount > 0) {
        console.log(`[SyncEngine] Inbound sync completed: Reconciled ${pulledCount} cloud changes into local DB.`);
        realtimeHub.broadcast('DATA_SYNCED_FROM_CLOUD', {
          timestamp: new Date().toISOString(),
          count: pulledCount,
        });
        realtimeHub.broadcast('ACCOUNT_UPDATED', {
          timestamp: new Date().toISOString(),
        });
        realtimeHub.broadcast('PURCHASE_CREATED', {
          timestamp: new Date().toISOString(),
        });
        realtimeHub.broadcast('PAYMENT_CREATED', {
          timestamp: new Date().toISOString(),
        });
        realtimeHub.broadcast('ORDER_UPDATED', {
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('[SyncEngine] Error during inbound pullFromCentral:', err.message);
    }
  }

  async getPendingCount() {
    try {
      return await SyncOutbox.countDocuments({ status: { $in: ['pending', 'failed'] } });
    } catch {
      return 0;
    }
  }

  notifyStatus() {
    this.getPendingCount().then((pending) => {
      realtimeHub.broadcast('SYNC_STATUS_CHANGED', {
        isOnline: this.isOnline,
        isSyncing: this.isSyncing,
        pendingCount: pending,
        lastSyncTime: this.lastSyncTime ? this.lastSyncTime.toISOString() : null,
        lastError: this.lastSyncError,
      });
    }).catch(() => {});
  }

  async getStatus() {
    const pending = await this.getPendingCount();
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: pending,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastSyncError,
      syncIntervalMinutes: Math.round(this.syncIntervalMs / 60000),
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

const syncEngine = new SyncEngine();
module.exports = syncEngine;
