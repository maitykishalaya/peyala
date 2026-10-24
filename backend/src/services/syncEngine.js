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

    // Load persisted dynamic sync interval from POSSetting
    try {
      const POSSetting = require('../models/POSSetting');
      const setting = await POSSetting.getSingleton();
      if (setting && setting.dbSyncIntervalMinutes && process.env.SYNC_INTERVAL_MS !== '999999999') {
        this.syncIntervalMs = Math.round(setting.dbSyncIntervalMinutes * 60 * 1000);
      }
    } catch (err) {
      console.warn('[SyncEngine] Could not load dynamic interval from POSSetting, using default:', err.message);
    }

    console.log(`[SyncEngine] High-frequency sync interval: ${this.syncIntervalMs / 1000}s (${(this.syncIntervalMs / 60000).toFixed(1)}m)`);

    // Attempt initial connection to central DB
    await this.checkConnectivity();

    // Start background periodic interval
    if (this.timer) clearInterval(this.timer);
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
   * Dynamically update sync interval timer at runtime
   * @param {number} minutes
   */
  setIntervalMinutes(minutes) {
    const mins = Math.max(0.2, Math.min(1440, Number(minutes) || 15));
    this.syncIntervalMs = Math.round(mins * 60 * 1000);
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => {
      this.syncNow().catch((err) => {
        console.warn('[SyncEngine] Scheduled sync encountered error:', err.message);
      });
    }, this.syncIntervalMs);
    console.log(`[SyncEngine] Dynamically updated sync interval to ${mins} minutes (${this.syncIntervalMs / 1000}s)`);
    this.notifyStatus();
    return this.syncIntervalMs;
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

              // ── Monetary Delta Reconciliation for Central DB Accounts ──
              // When local station creates new financial transactions, apply the delta to Central Accounts
              if (colName === 'payments') {
                const centralBefore = await centralCol.findOne({ _id: queryId }, { projection: { _id: 1 } });
                if (!centralBefore && docToSync.paidFrom && docToSync.amount && !docToSync.isPending) {
                  let paidFromId = docToSync.paidFrom;
                  if (typeof paidFromId === 'string' && /^[0-9a-fA-F]{24}$/.test(paidFromId)) paidFromId = new mongoose.Types.ObjectId(paidFromId);
                  await centralConn.db.collection('accounts').updateOne(
                    { _id: paidFromId },
                    { $inc: { currentBalance: -Number(docToSync.amount) } }
                  );
                }
              } else if (colName === 'orders') {
                const centralBefore = await centralCol.findOne({ _id: queryId }, { projection: { _id: 1, status: 1 } });
                const wasPaidCentral = centralBefore && centralBefore.status === 'paid';
                if (!wasPaidCentral && docToSync.status === 'paid') {
                  const pb = docToSync.paymentBreakdown || {};
                  let cashAmt = Number(pb.cash) || 0;
                  let digitalAmt = (Number(pb.upi) || 0) + (Number(pb.card) || 0) + (Number(pb.other) || 0);
                  if (docToSync.paymentMethod === 'cash' && !cashAmt) cashAmt = Number(docToSync.total) || 0;
                  if (docToSync.paymentMethod === 'upi' && !digitalAmt) digitalAmt = Number(docToSync.total) || 0;

                  if (cashAmt > 0) {
                    await centralConn.db.collection('accounts').updateOne(
                      { type: 'cash', isActive: true },
                      { $inc: { currentBalance: cashAmt } }
                    );
                  }
                  if (digitalAmt > 0) {
                    await centralConn.db.collection('accounts').updateOne(
                      { type: { $in: ['bank', 'digital'] }, isActive: true },
                      { $inc: { currentBalance: digitalAmt } }
                    );
                  }
                }
              } else if (colName === 'receipts') {
                const centralBefore = await centralCol.findOne({ _id: queryId }, { projection: { _id: 1 } });
                if (!centralBefore && docToSync.receivedIn && docToSync.amount) {
                  let recId = docToSync.receivedIn;
                  if (typeof recId === 'string' && /^[0-9a-fA-F]{24}$/.test(recId)) recId = new mongoose.Types.ObjectId(recId);
                  await centralConn.db.collection('accounts').updateOne(
                    { _id: recId },
                    { $inc: { currentBalance: Number(docToSync.amount) } }
                  );
                }
              } else if (colName === 'transfers') {
                const centralBefore = await centralCol.findOne({ _id: queryId }, { projection: { _id: 1 } });
                if (!centralBefore && docToSync.amount) {
                  let fromId = docToSync.fromAccount;
                  let toId = docToSync.toAccount;
                  if (typeof fromId === 'string' && /^[0-9a-fA-F]{24}$/.test(fromId)) fromId = new mongoose.Types.ObjectId(fromId);
                  if (typeof toId === 'string' && /^[0-9a-fA-F]{24}$/.test(toId)) toId = new mongoose.Types.ObjectId(toId);
                  if (fromId) await centralConn.db.collection('accounts').updateOne({ _id: fromId }, { $inc: { currentBalance: -Number(docToSync.amount) } });
                  if (toId) await centralConn.db.collection('accounts').updateOne({ _id: toId }, { $inc: { currentBalance: Number(docToSync.amount) } });
                }
              } else if (colName === 'customerduepayments') {
                const centralBefore = await centralCol.findOne({ _id: queryId }, { projection: { _id: 1 } });
                if (!centralBefore && docToSync.receivedIn && docToSync.amount) {
                  let recId = docToSync.receivedIn;
                  if (typeof recId === 'string' && /^[0-9a-fA-F]{24}$/.test(recId)) recId = new mongoose.Types.ObjectId(recId);
                  await centralConn.db.collection('accounts').updateOne(
                    { _id: recId },
                    { $inc: { currentBalance: Number(docToSync.amount) } }
                  );
                }
              }

              // Special handling for accounts: protect currentBalance from being clobbered by stale snapshots
              if (colName === 'accounts') {
                const centralDoc = await centralCol.findOne({ _id: queryId });
                if (!centralDoc) {
                  await centralCol.replaceOne({ _id: queryId }, docToSync, { upsert: true });
                } else {
                  const updateFields = { ...docToSync };
                  delete updateFields.currentBalance;
                  delete updateFields._id;
                  if (Object.keys(updateFields).length > 0) {
                    await centralCol.updateOne({ _id: queryId }, { $set: updateFields });
                  }
                }
              } else {
                await centralCol.replaceOne(
                  { _id: queryId },
                  docToSync,
                  { upsert: true }
                );
              }
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
      possetting: 'possettings',
      ownernote: 'ownernotes',
      paymentcategory: 'paymentcategories',
      addon: 'addons',
      staff: 'staffs',
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
        'possettings',
        'paymentcategories',
        'addons',
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

      const datesToReconcileDailySales = new Set();

      for (const colName of inboundCollections) {
        try {
          const centralCol = centralConn.db.collection(colName);
          const localCol = mongoose.connection.db.collection(colName);

          let query = syncFilter;
          // Small master collections: always pull all to guarantee 100% real-time fidelity
          if (['accounts', 'tables', 'tablecategories', 'menucategories', 'ownernotes', 'addons', 'possettings', 'paymentcategories', 'inventorycategories'].includes(colName) || !this.lastInboundSync) {
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
            const docIds = docs.map(d => d._id);
            const existingLocals = await localCol.find(
              { _id: { $in: docIds } },
              { projection: { _id: 1, updatedAt: 1, status: 1 } }
            ).toArray();
            const localMap = new Map(existingLocals.map(l => [String(l._id), l]));

            const ops = [];
            for (const doc of docs) {
              const localDoc = localMap.get(String(doc._id));
              if (localDoc && localDoc.updatedAt && doc.updatedAt) {
                const localTime = new Date(localDoc.updatedAt).getTime();
                const centralTime = new Date(doc.updatedAt).getTime();
                // Last-Write-Wins: If local write is newer than incoming cloud doc, protect local data!
                if (localTime > centralTime) {
                  // Ensure local newer version gets pushed to central
                  this.recordMutation(colName, localDoc._id, 'update', localDoc).catch(() => {});
                  continue;
                }
              }

              // ── Monetary Delta Reconciliation for Local DB Accounts ──
              // When cloud website created new financial transactions, apply the delta to Local Accounts
              if (!localDoc) {
                if (colName === 'payments' && doc.paidFrom && doc.amount && !doc.isPending) {
                  let paidFromId = doc.paidFrom;
                  if (typeof paidFromId === 'string' && /^[0-9a-fA-F]{24}$/.test(paidFromId)) paidFromId = new mongoose.Types.ObjectId(paidFromId);
                  await mongoose.connection.db.collection('accounts').updateOne(
                    { _id: paidFromId },
                    { $inc: { currentBalance: -Number(doc.amount) } }
                  );
                } else if (colName === 'orders' && doc.status === 'paid') {
                  const pb = doc.paymentBreakdown || {};
                  let cashAmt = Number(pb.cash) || 0;
                  let digitalAmt = (Number(pb.upi) || 0) + (Number(pb.card) || 0) + (Number(pb.other) || 0);
                  if (doc.paymentMethod === 'cash' && !cashAmt) cashAmt = Number(doc.total) || 0;
                  if (doc.paymentMethod === 'upi' && !digitalAmt) digitalAmt = Number(doc.total) || 0;

                  if (cashAmt > 0) {
                    await mongoose.connection.db.collection('accounts').updateOne(
                      { type: 'cash', isActive: true },
                      { $inc: { currentBalance: cashAmt } }
                    );
                  }
                  if (digitalAmt > 0) {
                    await mongoose.connection.db.collection('accounts').updateOne(
                      { type: { $in: ['bank', 'digital'] }, isActive: true },
                      { $inc: { currentBalance: digitalAmt } }
                    );
                  }
                  if (doc.paidAt || doc.createdAt) {
                    datesToReconcileDailySales.add(new Date(doc.paidAt || doc.createdAt).toISOString().slice(0, 10));
                  }
                } else if (colName === 'receipts' && doc.receivedIn && doc.amount) {
                  let recId = doc.receivedIn;
                  if (typeof recId === 'string' && /^[0-9a-fA-F]{24}$/.test(recId)) recId = new mongoose.Types.ObjectId(recId);
                  await mongoose.connection.db.collection('accounts').updateOne(
                    { _id: recId },
                    { $inc: { currentBalance: Number(doc.amount) } }
                  );
                } else if (colName === 'transfers' && doc.amount) {
                  let fromId = doc.fromAccount;
                  let toId = doc.toAccount;
                  if (typeof fromId === 'string' && /^[0-9a-fA-F]{24}$/.test(fromId)) fromId = new mongoose.Types.ObjectId(fromId);
                  if (typeof toId === 'string' && /^[0-9a-fA-F]{24}$/.test(toId)) toId = new mongoose.Types.ObjectId(toId);
                  if (fromId) await mongoose.connection.db.collection('accounts').updateOne({ _id: fromId }, { $inc: { currentBalance: -Number(doc.amount) } });
                  if (toId) await mongoose.connection.db.collection('accounts').updateOne({ _id: toId }, { $inc: { currentBalance: Number(doc.amount) } });
                } else if (colName === 'customerduepayments' && doc.receivedIn && doc.amount) {
                  let recId = doc.receivedIn;
                  if (typeof recId === 'string' && /^[0-9a-fA-F]{24}$/.test(recId)) recId = new mongoose.Types.ObjectId(recId);
                  await mongoose.connection.db.collection('accounts').updateOne(
                    { _id: recId },
                    { $inc: { currentBalance: Number(doc.amount) } }
                  );
                }
              }

              // Special handling for accounts: protect currentBalance from being clobbered by stale snapshots
              if (colName === 'accounts') {
                if (!localDoc) {
                  ops.push({
                    replaceOne: {
                      filter: { _id: doc._id },
                      replacement: doc,
                      upsert: true,
                    },
                  });
                } else {
                  const updateFields = { ...doc };
                  delete updateFields.currentBalance;
                  delete updateFields._id;
                  if (Object.keys(updateFields).length > 0) {
                    await localCol.updateOne({ _id: doc._id }, { $set: updateFields });
                  }
                }
              } else {
                ops.push({
                  replaceOne: {
                    filter: { _id: doc._id },
                    replacement: doc,
                    upsert: true,
                  },
                });
              }
            }

            if (ops.length > 0) {
              await localCol.bulkWrite(ops, { ordered: false });
              pulledCount += ops.length;
            }
          }
        } catch (colErr) {
          console.warn(`[SyncEngine] Inbound pull error for ${colName}:`, colErr.message);
        }
      }

      // Reconcile DailySales for any order dates pulled from cloud
      for (const dateStr of datesToReconcileDailySales) {
        try {
          const { reconcileDailySales } = require('../utils/salesReconciler');
          await reconcileDailySales(new Date(dateStr));
        } catch (rErr) {
          console.warn('[SyncEngine] Daily sales reconciliation notice for', dateStr, rErr.message);
        }
      }

      // Ensure local and central account balances are identical and clean rounded
      await this.reconcileAccountsBalanceConsistency(centralConn);

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

  /**
   * Final reconciliation check: Ensure local and central account balances are cleanly rounded and identical
   */
  async reconcileAccountsBalanceConsistency(centralConn) {
    if (!centralConn || centralConn.readyState !== 1) return;
    try {
      const localAccCol = mongoose.connection.db.collection('accounts');
      const centralAccCol = centralConn.db.collection('accounts');

      const localAccs = await localAccCol.find({ isActive: true }).toArray();
      for (const lAcc of localAccs) {
        const cAcc = await centralAccCol.findOne({ _id: lAcc._id });
        if (cAcc) {
          const lBal = Math.round((Number(lAcc.currentBalance) || 0) * 100) / 100;
          const cBal = Math.round((Number(cAcc.currentBalance) || 0) * 100) / 100;

          if (lBal !== cBal) {
            // Reconcile and align Central with Local counter master
            await centralAccCol.updateOne({ _id: cAcc._id }, { $set: { currentBalance: lBal } });
          } else {
            // Ensure clean 2-decimal rounding on both
            await localAccCol.updateOne({ _id: lAcc._id }, { $set: { currentBalance: lBal } });
            await centralAccCol.updateOne({ _id: cAcc._id }, { $set: { currentBalance: cBal } });
          }
        }
      }
    } catch (err) {
      console.warn('[SyncEngine] Account balance consistency check notice:', err.message);
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
      syncIntervalMinutes: Math.round((this.syncIntervalMs / 60000) * 10) / 10,
      syncIntervalSeconds: Math.round(this.syncIntervalMs / 1000),
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

const syncEngine = new SyncEngine();
module.exports = syncEngine;
