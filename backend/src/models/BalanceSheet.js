// ─────────────────────────────────────────────────────────────────
// BalanceSheet Model
// Stores the persistent state of the balance sheet.
// There is only ONE balance sheet document for the entire business
// (we use upsert to always update the same document).
//
// Structure:
//   Assets     → selected account IDs (live balances pulled at query time)
//   Liabilities → GST liability + supplier dues + custom items
//   Equity      → auto-calculated = total assets − total liabilities
//
// GST Liability:
//   - Starts at 0
//   - Increases by 5% of outlet sales every time a sales entry is saved
//   - Can be manually overridden (editable)
//   - Resets to 0 when a GST payment is recorded
// ─────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

// ── Custom Liability Item ────────────────────────────────────────
// User can add extra liability rows (e.g. "Bank Loan ₹50,000")
const customLiabilitySchema = new mongoose.Schema({
  label: { type: String, required: true },   // e.g. "Bank Loan", "Pending Rent"
  amount: { type: Number, default: 0 },      // the liability amount in ₹
  notes: { type: String },                   // optional note
}, { _id: true });

// ── Main Balance Sheet Schema ────────────────────────────────────
const balanceSheetSchema = new mongoose.Schema({

  // ── ASSETS section ───────────────────────────────────────────
  // List of account IDs the user has chosen to include as assets.
  // Live balances are fetched from the Account collection at query time.
  // Stored as strings so we can populate them easily.
  assetAccountIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account'
  }],

  // ── LIABILITIES section ──────────────────────────────────────

  // GST Liability — auto-accumulated from 5% of outlet sales
  // User can manually edit this number at any time
  gstLiability: { type: Number, default: 0 },

  // Running log of GST additions (for transparency / audit)
  // Each entry records when GST was added and from which sales entry
  gstLog: [{
    date: { type: Date },                    // date of the sales entry
    salesEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesEntry' },
    outletSales: { type: Number },           // outlet sales amount that triggered this
    gstAdded: { type: Number },              // 5% of outletSales
    note: { type: String },
  }],

  // Whether supplier dues should be auto-included from Supplier collection
  // If true → sum of all supplier outstanding dues appears in liabilities
  includeSupplierDues: { type: Boolean, default: true },
  showPurchaseGstPaid: { type: Boolean, default: true },

  // Any extra liabilities user wants to add manually
  // e.g. bank loans, rent arrears, etc.
  customLiabilities: [customLiabilitySchema],

  // ── METADATA ─────────────────────────────────────────────────

  // Last time the balance sheet was updated (any field)
  lastUpdated: { type: Date, default: Date.now },

  // Who last edited it
  lastUpdatedBy: { type: String },

}, { timestamps: true });

// Use a singleton pattern — only one balance sheet per business
// We'll always upsert using a fixed identifier
balanceSheetSchema.statics.getSingleton = async function() {
  // Find or create the one and only balance sheet document
  let bs = await this.findOne();
  if (!bs) {
    bs = await this.create({
      assetAccountIds: [],
      gstLiability: 0,
      customLiabilities: [],
      includeSupplierDues: true,
    });
  }
  return bs;
};

module.exports = mongoose.model('BalanceSheet', balanceSheetSchema);
