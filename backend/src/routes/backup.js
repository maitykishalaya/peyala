// ─────────────────────────────────────────────────────────────────
// Backup & Restore Route
//
// GET  /api/backup/export        → download full database as JSON
// GET  /api/backup/export/csv    → download all collections as a zip of CSVs
// POST /api/backup/import        → restore from a previously exported JSON
//
// IMPORTANT: This is a manual, admin-triggered operation only.
// Import REPLACES existing data for the collections included in the
// uploaded file — so we require explicit confirmation from the
// frontend before calling this, and we log every backup/restore
// action via the audit log.
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const { auth, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');

// Import every model so we can dump/restore each collection
const User = require('../models/User');
const Account = require('../models/Account');
const Supplier = require('../models/Supplier');
const InventoryCategory = require('../models/InventoryCategory');
const InventoryItem = require('../models/InventoryItem');
const PurchaseEntry = require('../models/PurchaseEntry');
const SalesEntry = require('../models/SalesEntry');
const Payment = require('../models/Payment');
const Receipt = require('../models/Receipt');
const Staff = require('../models/Staff');
const Transfer = require('../models/Transfer');
const BalanceSheet = require('../models/BalanceSheet');
const PaymentCategory = require('../models/PaymentCategory');
const AuditLog = require('../models/AuditLog');

// Map of collection name → Mongoose model
// Used to loop through all collections generically for export/import
const COLLECTIONS = {
  accounts: Account,
  suppliers: Supplier,
  inventoryCategories: InventoryCategory,
  inventoryItems: InventoryItem,
  purchaseEntries: PurchaseEntry,
  salesEntries: SalesEntry,
  payments: Payment,
  receipts: Receipt,
  staff: Staff,
  transfers: Transfer,
  balanceSheet: BalanceSheet,
  paymentCategories: PaymentCategory,
  // Note: 'users' and 'auditLogs' are intentionally excluded from
  // export/import by default — they contain login credentials and
  // system logs, not business data. Can be added back if needed.
};

router.use(auth);

// ── GET /api/backup/export ────────────────────────────────────────
// Exports the entire business database as a single JSON file.
// Admin only — this contains all financial data.
router.get('/export', adminOnly, async (req, res) => {
  try {
    const backup = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.name,
      version: '1.0',
      data: {},
    };

    // Loop through every collection and dump all documents
    for (const [key, Model] of Object.entries(COLLECTIONS)) {
      backup.data[key] = await Model.find({}).lean(); // .lean() = plain JS objects, faster
    }

    await log({
      user: req.user, action: 'CREATE', module: 'Backup',
      description: `${req.user.name} exported a full database backup (JSON)`,
    });

    // Set headers so the browser downloads this as a file
    const filename = `peyala-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/backup/export/csv/:collection ────────────────────────
// Exports ONE collection as a CSV file.
// Frontend calls this once per collection the user wants as CSV.
router.get('/export/csv/:collection', adminOnly, async (req, res) => {
  try {
    const { collection } = req.params;
    const Model = COLLECTIONS[collection];
    if (!Model) return res.status(400).json({ message: 'Unknown collection: ' + collection });

    const docs = await Model.find({}).lean();
    if (docs.length === 0) {
      return res.status(404).json({ message: 'No data in this collection' });
    }

    // Flatten nested objects into dot-notation keys for CSV columns
    // e.g. { zomato: { netSettlement: 100 } } → "zomato.netSettlement": 100
    function flatten(obj, prefix = '') {
      const flat = {};
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && v._bsontype !== 'ObjectId') {
          Object.assign(flat, flatten(v, key));
        } else if (Array.isArray(v)) {
          flat[key] = JSON.stringify(v); // arrays as JSON string in one cell
        } else {
          flat[key] = v?.toString?.() ?? v;
        }
      }
      return flat;
    }

    const flatDocs = docs.map(d => flatten(d));

    // Build CSV: collect all unique column names across all docs
    const allKeys = Array.from(new Set(flatDocs.flatMap(d => Object.keys(d))));
    const csvRows = [allKeys.join(',')]; // header row

    for (const doc of flatDocs) {
      const row = allKeys.map(k => {
        let val = doc[k] ?? '';
        val = String(val).replace(/"/g, '""'); // escape quotes
        return `"${val}"`; // wrap every cell in quotes (safe for commas/newlines)
      });
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');
    const filename = `peyala-${collection}-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/backup/collections ───────────────────────────────────
// Returns list of available collection names (for CSV export picker)
router.get('/collections', adminOnly, async (req, res) => {
  const counts = {};
  for (const [key, Model] of Object.entries(COLLECTIONS)) {
    counts[key] = await Model.countDocuments({});
  }
  res.json(counts);
});

// ── POST /api/backup/import ───────────────────────────────────────
// Restores data from a previously exported JSON backup.
// mode: 'merge' (default) keeps existing data and adds/updates by _id
//       'replace' wipes the specific collections in the file and reinserts
//
// SAFETY: This requires explicit confirmation text from the frontend
// ("RESTORE") to prevent accidental data loss.
router.post('/import', adminOnly, async (req, res) => {
  try {
    const { data, mode = 'merge', confirmation } = req.body;

    if (confirmation !== 'RESTORE') {
      return res.status(400).json({ message: 'Confirmation text must be exactly "RESTORE" to proceed' });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ message: 'Invalid backup file format' });
    }

    const results = {};

    for (const [key, docs] of Object.entries(data)) {
      const Model = COLLECTIONS[key];
      if (!Model || !Array.isArray(docs)) continue; // skip unknown/invalid collections

      if (mode === 'replace') {
        // Wipe this collection entirely, then reinsert from backup
        await Model.deleteMany({});
        if (docs.length > 0) {
          // insertMany with the original _ids preserved so relationships still work
          await Model.insertMany(docs, { ordered: false });
        }
        results[key] = { mode: 'replaced', count: docs.length };
      } else {
        // Merge mode: upsert each document by its original _id
        let upserted = 0;
        for (const doc of docs) {
          if (!doc._id) continue;
          await Model.findByIdAndUpdate(doc._id, doc, { upsert: true, setDefaultsOnInsert: true });
          upserted++;
        }
        results[key] = { mode: 'merged', count: upserted };
      }
    }

    await log({
      user: req.user, action: 'UPDATE', module: 'Backup',
      description: `${req.user.name} restored a database backup [mode: ${mode}]`,
      metadata: results,
    });

    res.json({ message: 'Restore completed', results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
