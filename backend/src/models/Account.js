// ─────────────────────────────────────────────
// Account Model
// Stores all financial accounts (cash, bank, digital)
// Each account now has its own allowed payment modes
// and a default payment mode for quick entry
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

// All possible payment modes across the entire system
const ALL_PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'];

const accountSchema = new mongoose.Schema({

  // Display name of the account e.g. "Cash Counter", "HDFC Current Account"
  name: { type: String, required: true, trim: true },

  // Account type — controls which payment modes make sense
  // cash    → only 'cash' makes sense
  // bank    → bank_transfer, cheque, card (not cash)
  // digital → upi, card (not cash or cheque)
  // other   → anything
  type: {
    type: String,
    enum: ['cash', 'bank', 'digital', 'other'],
    required: true
  },

  // Balance when account was first created / opening balance
  openingBalance: { type: Number, default: 0 },

  // Live running balance — updated automatically on every transaction
  currentBalance: { type: Number, default: 0 },

  // Optional bank details shown in the UI
  bankName: { type: String },
  accountNumber: { type: String },

  // ── NEW: Payment Mode Configuration ──────────────────────────────

  // List of payment modes ALLOWED for this account
  // e.g. Cash Counter → ['cash']
  // e.g. Current Account → ['bank_transfer', 'cheque', 'upi']
  // If empty, all modes are allowed (fallback)
  allowedPaymentModes: {
    type: [String],
    enum: ALL_PAYMENT_MODES,
    default: []  // empty = no restriction (will be auto-set based on type)
  },

  // The payment mode selected by default when this account is chosen
  // e.g. Current Account → 'bank_transfer' so you don't have to pick every time
  defaultPaymentMode: {
    type: String,
    enum: [...ALL_PAYMENT_MODES, ''],  // allow empty string = no default
    default: ''
  },

  // ─────────────────────────────────────────────────────────────────

  // Misc fields
  notes: { type: String },
  color: { type: String, default: '#6366f1' },  // colour dot shown in UI
  isActive: { type: Boolean, default: true },

}, { timestamps: true }); // createdAt and updatedAt auto-managed


// ── Pre-save Hook ─────────────────────────────────────────────────
// Automatically set sensible default allowed modes based on account type
// This runs ONLY when allowedPaymentModes is empty (i.e. not manually set)
accountSchema.pre('save', function (next) {

  // Only auto-set if the user hasn't manually configured allowed modes
  if (this.allowedPaymentModes.length === 0) {
    if (this.type === 'cash') {
      // Cash accounts can ONLY use cash — no digital or bank transfers
      this.allowedPaymentModes = ['cash'];
      // Default mode is also cash
      if (!this.defaultPaymentMode) this.defaultPaymentMode = 'cash';

    } else if (this.type === 'bank') {
      // Bank accounts — transfers, cheques, cards. NOT cash.
      this.allowedPaymentModes = ['bank_transfer', 'cheque', 'card', 'upi'];
      if (!this.defaultPaymentMode) this.defaultPaymentMode = 'bank_transfer';

    } else if (this.type === 'digital') {
      // Digital wallets / UPI accounts — only digital modes
      this.allowedPaymentModes = ['upi', 'card'];
      if (!this.defaultPaymentMode) this.defaultPaymentMode = 'upi';

    } else {
      // 'other' type — allow everything
      this.allowedPaymentModes = ALL_PAYMENT_MODES;
    }
  }

  next();
});

module.exports = mongoose.model('Account', accountSchema);
