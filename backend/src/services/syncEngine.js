const mongoose = require('mongoose');
const SyncOutbox = require('../models/SyncOutbox');
const realtimeHub = require('./realtimeHub');

function getGstLogIdentity(l) {
  if (l.salesEntryId) return `sales_${String(l.salesEntryId)}`;
  if (l._id) return String(l._id);
  return `${new Date(l.date).toISOString().split('T')[0]}_${l.gstAdded}_${l.outletSales}`;
}

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
    this.isHydrating = false;
    this.isPullingFromCentral = false;
  }

  /**
   * Initialize sync engine with central database connection and scheduled timer
   */
  async init() {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SYNC === 'true') {
      console.log('[SyncEngine] Sync engine is disabled in test mode.');
      return;
    }
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
      // Resilient ping check (5000ms timeout) to verify the socket is responsive
      try {
        await Promise.race([
          this.centralConn.db.admin().ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Central DB ping timeout (offline)')), 5000)),
        ]);
        return this.centralConn;
      } catch (pingErr) {
        // Socket broke (e.g. Wi-Fi disconnected), close stale connection
        try { await this.centralConn.close(); } catch (_) {}
        this.centralConn = null;
        this.isOnline = false;
        this.lastSyncError = pingErr.message;
        throw pingErr;
      }
    }

    if (!this.centralUri) {
      throw new Error('No MONGODB_CENTRAL_URI configured');
    }

    const dns = require('dns');
    try {
      const currentDns = dns.getServers();
      if (!currentDns || currentDns.length === 0 || (currentDns.length === 1 && currentDns[0] === '127.0.0.1')) {
        dns.setServers(['8.8.8.8', '1.1.1.1', '1.0.0.1']);
      }
    } catch (_) {}

    try {
      this.centralConn = await mongoose.createConnection(this.centralUri, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 30000,
        family: 4,
        maxPoolSize: 10,
        minPoolSize: 1,
      }).asPromise();

      console.log(`[SyncEngine] Connected to Central DB: ${this.centralConn.host} / ${this.centralConn.name}`);
      this.isOnline = true;
      this.consecutiveFailures = 0;
      this.lastSyncError = null;
      return this.centralConn;
    } catch (err) {
      this.isOnline = false;
      this.lastSyncError = err.message;
      console.warn(`[SyncEngine] Central DB connection notice: ${err.message}`);
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
      this.lastSyncError = null;
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
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SYNC === 'true' || this.isPullingFromCentral) {
      return;
    }
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
        .sort({ status: 1, attempts: 1, createdAt: 1 })
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
                    const targetCash = await centralConn.db.collection('accounts').findOne({ name: /cash counter/i, type: 'cash', isActive: true })
                      || await centralConn.db.collection('accounts').findOne({ type: 'cash', isActive: true });
                    if (targetCash) {
                      await centralConn.db.collection('accounts').updateOne(
                        { _id: targetCash._id },
                        { $inc: { currentBalance: cashAmt } }
                      );
                    }
                  }
                  if (digitalAmt > 0) {
                    const targetBank = await centralConn.db.collection('accounts').findOne({ name: /current account/i, type: { $in: ['bank', 'digital'] }, isActive: true })
                      || await centralConn.db.collection('accounts').findOne({ type: { $in: ['bank', 'digital'] }, isActive: true });
                    if (targetBank) {
                      await centralConn.db.collection('accounts').updateOne(
                        { _id: targetBank._id },
                        { $inc: { currentBalance: digitalAmt } }
                      );
                    }
                  }

                  // ── Monetary Delta Reconciliation for Central DB GST Liability ──
                  const orderTax = Number(docToSync.taxAmount) > 0
                    ? Number(docToSync.taxAmount)
                    : Math.round((Number(docToSync.settledAmount) || Number(docToSync.total) || 0) * 0.0477 * 100) / 100;
                  if (orderTax > 0) {
                    try {
                      const centralBs = await centralConn.db.collection('balancesheets').findOne({});
                      if (centralBs) {
                        const hasLog = (centralBs.gstLog || []).some((l) =>
                          String(l.salesEntryId) === String(docToSync._id) ||
                          (docToSync.billNumber && l.note && l.note.includes(`Bill #${docToSync.billNumber}`)) ||
                          (docToSync.orderNumber && l.note && l.note.includes(`Bill #${docToSync.orderNumber}`)) ||
                          (l.outletSales === (Number(docToSync.settledAmount) || Number(docToSync.total)) && Math.abs(new Date(l.date) - new Date(docToSync.paidAt || docToSync.createdAt)) < 60000)
                        );
                        if (!hasLog) {
                          await centralConn.db.collection('balancesheets').updateOne(
                            { _id: centralBs._id },
                            {
                              $inc: { gstLiability: orderTax },
                              $push: {
                                gstLog: {
                                  date: docToSync.paidAt || docToSync.createdAt || new Date(),
                                  salesEntryId: docToSync._id,
                                  outletSales: Number(docToSync.settledAmount) || Number(docToSync.total) || 0,
                                  gstAdded: orderTax,
                                  note: `Auto: GST on ₹${docToSync.settledAmount || docToSync.total} POS Dine-in Order (Bill #${docToSync.billNumber || docToSync.orderNumber})`,
                                },
                              },
                              $set: { lastUpdated: new Date() },
                            }
                          );
                        }
                      }
                    } catch (_) {}
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
                  if (docToSync.openingBalance !== undefined && centralDoc.openingBalance !== undefined) {
                    const diff = Number(docToSync.openingBalance) - Number(centralDoc.openingBalance || 0);
                    if (!Number.isNaN(diff) && diff !== 0) {
                      await centralCol.updateOne({ _id: queryId }, { $inc: { currentBalance: diff } });
                    }
                  }
                  const updateFields = { ...docToSync };
                  delete updateFields.currentBalance;
                  delete updateFields._id;
                  if (Object.keys(updateFields).length > 0) {
                    await centralCol.updateOne({ _id: queryId }, { $set: updateFields });
                  }
                }
              } else if (colName === 'balancesheets') {
                const centralDoc = await centralCol.findOne({ _id: queryId });
                if (!centralDoc) {
                  await centralCol.replaceOne({ _id: queryId }, docToSync, { upsert: true });
                } else {
                  const existingKeys = new Set((centralDoc.gstLog || []).map(getGstLogIdentity));
                  const logsToAdd = (docToSync.gstLog || []).filter((l) => !existingKeys.has(getGstLogIdentity(l)));
                  const updateFields = { ...docToSync };
                  delete updateFields._id;
                  delete updateFields.gstLog;
                  await centralCol.updateOne(
                    { _id: queryId },
                    {
                      $set: updateFields,
                      ...(logsToAdd.length > 0 ? { $push: { gstLog: { $each: logsToAdd } } } : {}),
                    }
                  );
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

      // 4. Safe Outbox Housekeeping: Prune completed synced envelopes older than 24h to keep database bounded
      try {
        const pruneCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await SyncOutbox.deleteMany({ status: 'synced', syncedAt: { $lt: pruneCutoff } });
        if (centralConn && centralConn.readyState === 1) {
          await centralConn.db.collection('syncoutboxes').deleteMany({ status: 'synced', syncedAt: { $lt: pruneCutoff } });
        }
      } catch (_) {}

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
      balancesheet: 'balancesheets',
      auditlog: 'auditlogs',
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
    this.isPullingFromCentral = true;
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
        'balancesheets',
        'billsequences',
        'ordersequences',
        'users',
        'auditlogs',
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
          const localCount = await localCol.countDocuments().catch(() => 0);

          // If local collection is completely empty, ALWAYS pull ALL documents to hydrate/clone properly!
          if (localCount === 0 || ['accounts', 'tables', 'tablecategories', 'menucategories', 'ownernotes', 'addons', 'possettings', 'paymentcategories', 'inventorycategories', 'balancesheets', 'billsequences', 'ordersequences', 'users', 'staffs', 'suppliers'].includes(colName) || !this.lastInboundSync) {
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
          } else if (colName === 'auditlogs') {
            query = {
              $or: [
                { createdAt: { $gte: thirtyDaysAgo } },
                { updatedAt: { $gte: thirtyDaysAgo } },
              ],
            };
          }

          const docs = await centralCol.find(query).toArray();
          if (docs.length > 0) {
            // Special inbound handling for sequences (BillSequence and OrderSequence) — Maximum Wins
            if (colName === 'billsequences' || colName === 'ordersequences') {
              for (const centralSeqDoc of docs) {
                const localSeqDoc = await localCol.findOne({ _id: centralSeqDoc._id });
                const centralSeq = Number(centralSeqDoc.seq) || 0;
                const localSeq = Number(localSeqDoc?.seq) || 0;
                const maxSeq = Math.max(centralSeq, localSeq);

                if (!localSeqDoc || localSeq < maxSeq) {
                  await localCol.updateOne(
                    { _id: centralSeqDoc._id },
                    { $set: { ...centralSeqDoc, seq: maxSeq, updatedAt: new Date() } },
                    { upsert: true }
                  );
                }
                if (centralSeq < maxSeq) {
                  await centralCol.updateOne(
                    { _id: centralSeqDoc._id },
                    { $set: { seq: maxSeq, updatedAt: new Date() } }
                  );
                }
              }
              continue;
            }

            // Special inbound handling for singleton BalanceSheet
            if (colName === 'balancesheets') {
              const centralDoc = docs[0];
              if (centralDoc) {
                const localDoc = await localCol.findOne({});
                if (!localDoc) {
                  await localCol.insertOne(centralDoc);
                  realtimeHub.broadcast('BALANCESHEET_UPDATED', {
                    gstLiability: centralDoc.gstLiability,
                    updatedAt: new Date(),
                  });
                } else {
                  // Robust log identity: deduplicate strictly by salesEntryId (the order _id)
                  const existingLogIds = new Set((localDoc.gstLog || []).map(getGstLogIdentity));
                  const newLogsFromCentral = (centralDoc.gstLog || []).filter((l) => !existingLogIds.has(getGstLogIdentity(l)));

                  const centralLogIds = new Set((centralDoc.gstLog || []).map(getGstLogIdentity));
                  const extraLocalLogs = (localDoc.gstLog || []).filter((l) => !centralLogIds.has(getGstLogIdentity(l)));

                  if (newLogsFromCentral.length > 0 || centralDoc.gstLiability !== localDoc.gstLiability) {
                    const mergedMap = new Map();
                    const mergedList = [];
                    const addMerged = (log) => {
                      const key = getGstLogIdentity(log);
                      if (!mergedMap.has(key)) {
                        mergedMap.set(key, true);
                        mergedList.push(log);
                      }
                    };
                    (centralDoc.gstLog || []).forEach(addMerged);
                    (localDoc.gstLog || []).forEach(addMerged);
                    mergedList.sort((a, b) => new Date(a.date) - new Date(b.date));

                    const extraLocalTax = extraLocalLogs.reduce((s, l) => s + (l.gstAdded || 0), 0);
                    const finalGstLiability = Math.round(((centralDoc.gstLiability || 0) + extraLocalTax) * 100) / 100;

                    await localCol.updateOne(
                      { _id: localDoc._id },
                      {
                        $set: {
                          gstLiability: finalGstLiability,
                          gstLog: mergedList,
                          lastUpdated: centralDoc.lastUpdated || new Date(),
                          lastUpdatedBy: centralDoc.lastUpdatedBy || 'Cloud Sync',
                        },
                      }
                    );
                    realtimeHub.broadcast('BALANCESHEET_UPDATED', {
                      gstLiability: finalGstLiability,
                      updatedAt: new Date(),
                    });
                  }

                  if (extraLocalLogs.length > 0) {
                    const extraLocalTax = extraLocalLogs.reduce((s, l) => s + (l.gstAdded || 0), 0);
                    await centralCol.updateOne(
                      { _id: centralDoc._id },
                      {
                        $inc: { gstLiability: extraLocalTax },
                        $push: { gstLog: { $each: extraLocalLogs } },
                        $set: { lastUpdated: new Date() },
                      }
                    );
                  }
                }
              }
              continue;
            }

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

              // ── Daily Sales & GST Logging for Inbound Cloud Orders ──
              // (Account balances are reconciled authoritatively via the accounts collection without double-counting)
              const wasPaidLocally = localDoc && localDoc.status === 'paid';
              if (colName === 'orders' && doc.status === 'paid' && !wasPaidLocally) {
                if (doc.paidAt || doc.createdAt) {
                  datesToReconcileDailySales.add(new Date(doc.paidAt || doc.createdAt).toISOString().slice(0, 10));
                }

                // Inbound GST Liability Reconciliation for Local DB BalanceSheet
                const orderTax = Number(doc.taxAmount) > 0
                  ? Number(doc.taxAmount)
                  : Math.round((Number(doc.settledAmount) || Number(doc.total) || 0) * 0.0477 * 100) / 100;
                if (orderTax > 0) {
                  try {
                    const localBs = await mongoose.connection.db.collection('balancesheets').findOne({});
                    if (localBs) {
                      const hasLog = (localBs.gstLog || []).some((l) =>
                        String(l.salesEntryId) === String(doc._id) ||
                        (doc.billNumber && l.note && l.note.includes(`Bill #${doc.billNumber}`)) ||
                        (doc.orderNumber && l.note && l.note.includes(`Bill #${doc.orderNumber}`)) ||
                        (l.outletSales === (Number(doc.settledAmount) || Number(doc.total)) && Math.abs(new Date(l.date) - new Date(doc.paidAt || doc.createdAt)) < 60000)
                      );
                      if (!hasLog) {
                        const newGst = Math.round(((localBs.gstLiability || 0) + orderTax) * 100) / 100;
                        await mongoose.connection.db.collection('balancesheets').updateOne(
                          { _id: localBs._id },
                          {
                            $inc: { gstLiability: orderTax },
                            $push: {
                              gstLog: {
                                date: doc.paidAt || doc.createdAt || new Date(),
                                salesEntryId: doc._id,
                                outletSales: Number(doc.settledAmount) || Number(doc.total) || 0,
                                gstAdded: orderTax,
                                note: `Auto: GST on ₹${doc.settledAmount || doc.total} POS Dine-in Order (Bill #${doc.billNumber || doc.orderNumber})`,
                              },
                            },
                            $set: { lastUpdated: new Date(), lastUpdatedBy: 'Order Sync' },
                          }
                        );
                        realtimeHub.broadcast('BALANCESHEET_UPDATED', {
                          gstLiability: newGst,
                          gstAdded: orderTax,
                          updatedAt: new Date(),
                        });
                      }
                    }
                  } catch (_) {}
                }
              }

              // Account Synchronization: Authoritative Last-Write-Wins with Central precedence
              if (colName === 'accounts') {
                const lTime = new Date(localDoc?.updatedAt || 0).getTime();
                const cTime = new Date(doc.updatedAt || 0).getTime();
                if (!localDoc || cTime >= lTime) {
                  ops.push({
                    replaceOne: {
                      filter: { _id: doc._id },
                      replacement: doc,
                      upsert: true,
                    },
                  });
                } else {
                  this.recordMutation(colName, localDoc._id, 'update', localDoc).catch(() => {});
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

            if (colName === 'users') {
              try {
                const allUsers = await localCol.find({ isActive: { $ne: false } }).toArray();
                if (allUsers.length > 0) {
                  const offlineAuthVault = require('./offlineAuthVault');
                  offlineAuthVault.syncFromDb(allUsers);
                }
              } catch (_) {}
            }

            if (colName === 'auditlogs') {
              try {
                realtimeHub.broadcast('AUDITLOG_UPDATED', { count: ops.length, updatedAt: new Date() });
              } catch (_) {}
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
    } finally {
      this.isPullingFromCentral = false;
    }
  }

  /**
   * Final reconciliation check: Ensure local and central account balances are cleanly rounded and identical
   */
  async reconcileAccountsBalanceConsistency(centralConn) {
    if (!centralConn || centralConn.readyState !== 1) return;
    try {
      const { recalculateAccountBalances } = require('../utils/accountLedger');
      // Recalculate deterministic ledger balances on both Local DB and Central DB
      await recalculateAccountBalances();
      await recalculateAccountBalances(centralConn);
    } catch (err) {
      console.warn('[SyncEngine] Account balance consistency check notice:', err.message);
    }
  }

  /**
   * Complete full clone/hydration from bundled local baseline snapshot
   */
  async hydrateFromLocalSnapshot() {
    const fs = require('fs');
    const path = require('path');
    const candidatePaths = [
      path.join(__dirname, '../../data/baseline_snapshot.json'),
      path.join(__dirname, '../data/baseline_snapshot.json'),
      path.join(__dirname, '../../../data/baseline_snapshot.json'),
      path.join(process.cwd(), 'data/baseline_snapshot.json'),
      path.join(process.cwd(), 'backend/data/baseline_snapshot.json'),
      'C:\\Peyala\\backend\\data\\baseline_snapshot.json',
      'C:\\Peyala\\data\\baseline_snapshot.json',
      path.join(__dirname, '../../../restore_points/v10.0.0_baseline/atlas_data_snapshot.json'),
    ];
    const snapshotPath = candidatePaths.find((p) => fs.existsSync(p));
    if (!snapshotPath) {
      throw new Error('No baseline snapshot found to hydrate local database.');
    }

    console.log(`[SyncEngine] Hydrating local database from bundled snapshot (${snapshotPath})...`);
    const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    let totalReplicated = 0;
    let collectionsReplicated = 0;

    for (const colName of Object.keys(snapshotData)) {
      const docs = snapshotData[colName];
      if (Array.isArray(docs) && docs.length > 0) {
        const localCol = mongoose.connection.db.collection(colName);
        const normalized = docs.map((d) => {
          const copy = { ...d };
          if (copy._id && typeof copy._id === 'string' && /^[0-9a-fA-F]{24}$/.test(copy._id)) {
            copy._id = new mongoose.Types.ObjectId(copy._id);
          }
          return copy;
        });
        const bulkOps = normalized.map((doc) => ({
          replaceOne: {
            filter: { _id: doc._id },
            replacement: doc,
            upsert: true,
          },
        }));
        const CHUNK_SIZE = 500;
        for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
          const chunk = bulkOps.slice(i, i + CHUNK_SIZE);
          await localCol.bulkWrite(chunk, { ordered: false });
        }
        totalReplicated += docs.length;
        collectionsReplicated++;
      }
    }

    // Sync auth vault with latest users
    try {
      const allUsers = await mongoose.connection.db.collection('users').find({ isActive: { $ne: false } }).toArray();
      if (allUsers.length > 0) {
        const offlineAuthVault = require('./offlineAuthVault');
        offlineAuthVault.syncFromDb(allUsers);
      }
    } catch (_) {}

    realtimeHub.broadcast('DATA_SYNCED_FROM_CLOUD', { timestamp: new Date().toISOString(), count: totalReplicated, hydrated: true });
    realtimeHub.broadcast('ACCOUNT_UPDATED', { timestamp: new Date().toISOString() });
    realtimeHub.broadcast('ORDER_UPDATED', { timestamp: new Date().toISOString() });
    realtimeHub.broadcast('TABLE_UPDATED', { timestamp: new Date().toISOString() });

    console.log(`[SyncEngine] Snapshot hydration complete: ${totalReplicated} documents across ${collectionsReplicated} collections!`);
    return {
      status: 'hydrated_from_snapshot',
      totalDocuments: totalReplicated,
      collectionsCount: collectionsReplicated,
      message: 'Hydrated successfully from offline baseline snapshot.',
    };
  }

  /**
   * Complete full clone/hydration of all collections from Central DB into local MongoDB
   */
  async hydrateFromCentral() {
    if (this.isHydrating) {
      console.log('[SyncEngine] Hydration is already in progress, skipping duplicate call.');
      return {
        status: 'in_progress',
        message: 'Hydration is already running in background.',
        totalDocuments: 0,
        collectionsCount: 0,
      };
    }

    if (!mongoose.connection || mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw new Error('Local MongoDB connection is not ready. Please ensure local server is running.');
    }

    this.isHydrating = true;
    try {
      console.log('[SyncEngine] Starting full hydration of local database from Central DB...');
      let centralConn = null;
      try {
        centralConn = await this.getCentralConnection();
      } catch (connErr) {
        console.warn('[SyncEngine] Central connection failed during hydration, falling back to bundled snapshot:', connErr.message);
      }

      if (!centralConn || centralConn.readyState !== 1) {
        return await this.hydrateFromLocalSnapshot();
      }

      const collections = await centralConn.db.listCollections().toArray();
      const PRIORITY_ORDER = [
        'users', 'possettings', 'menucategories', 'menuitems', 'tables',
        'accounts', 'orders', 'orderitems', 'shifts', 'inventoryitems',
        'inventorycategories', 'suppliers', 'expenses', 'customers',
        'reservations', 'kitchenstations', 'paymentmethods', 'printers',
        'taxsettings'
      ];

      // Sort collections: priority operational collections first, then the rest
      collections.sort((a, b) => {
        const idxA = PRIORITY_ORDER.indexOf(a.name);
        const idxB = PRIORITY_ORDER.indexOf(b.name);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.name.localeCompare(b.name);
      });

      let totalReplicated = 0;
      let collectionsReplicated = 0;

      for (const col of collections) {
        const colName = col.name;
        if (colName.startsWith('system.') || colName === 'syncoutboxes') continue;

        try {
          const centralCol = centralConn.db.collection(colName);
          const localCol = mongoose.connection.db.collection(colName);

          const docs = await centralCol.find({}).toArray();
          if (Array.isArray(docs) && docs.length > 0) {
            const normalized = docs.map((d) => {
              const copy = { ...d };
              if (copy._id && typeof copy._id === 'string' && /^[0-9a-fA-F]{24}$/.test(copy._id)) {
                copy._id = new mongoose.Types.ObjectId(copy._id);
              }
              return copy;
            });

            const bulkOps = normalized.map((doc) => ({
              replaceOne: {
                filter: { _id: doc._id },
                replacement: doc,
                upsert: true,
              },
            }));

            const CHUNK_SIZE = 500;
            for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
              const chunk = bulkOps.slice(i, i + CHUNK_SIZE);
              await localCol.bulkWrite(chunk, { ordered: false });
            }

            totalReplicated += docs.length;
            collectionsReplicated++;
          }
        } catch (colErr) {
          console.warn(`[SyncEngine] Hydration notice for ${colName}:`, colErr.message);
        }
      }

      // If Central DB returned 0 documents (e.g. read error or empty central DB), fallback to offline snapshot
      if (totalReplicated === 0) {
        console.warn('[SyncEngine] Central DB returned 0 documents. Hydrating from baseline snapshot fallback...');
        return await this.hydrateFromLocalSnapshot();
      }

      // Sync auth vault with latest users
      try {
        const allUsers = await mongoose.connection.db.collection('users').find({ isActive: { $ne: false } }).toArray();
        if (allUsers.length > 0) {
          const offlineAuthVault = require('./offlineAuthVault');
          offlineAuthVault.syncFromDb(allUsers);
        }
      } catch (_) {}

      // Broadcast full refresh to all connected UI clients
      this.lastSyncTime = new Date();
      this.lastInboundSync = new Date();
      this.isOnline = true;
      this.notifyStatus();

      realtimeHub.broadcast('DATA_SYNCED_FROM_CLOUD', {
        timestamp: new Date().toISOString(),
        count: totalReplicated,
        hydrated: true,
      });
      realtimeHub.broadcast('ACCOUNT_UPDATED', { timestamp: new Date().toISOString() });
      realtimeHub.broadcast('ORDER_UPDATED', { timestamp: new Date().toISOString() });
      realtimeHub.broadcast('TABLE_UPDATED', { timestamp: new Date().toISOString() });

      console.log(`[SyncEngine] Full hydration complete: ${totalReplicated} documents across ${collectionsReplicated} collections!`);
      return {
        status: 'hydrated',
        totalDocuments: totalReplicated,
        collectionsCount: collectionsReplicated,
      };
    } finally {
      this.isHydrating = false;
    this.isPullingFromCentral = false;
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
