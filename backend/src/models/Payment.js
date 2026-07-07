// ─────────────────────────────────────────────────────────────────
// Payment Model
//
// New fields:
//   isPending      — true for due purchases not yet paid
//   relatedPurchase — links back to the PurchaseEntry that created this
//   paymentMode    — now includes 'due' as a valid value
// ─────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  date: { type: Date, required: true, default: Date.now },

  // Account the money was paid from (null if due/pending)
  paidFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },

  // Who received the payment
  payee: { type: String, required: true },

  // Top-level category e.g. "Raw Materials", "Staff Expenses", "Utilities"
  category: { type: String, required: true },

  // Sub-category e.g. "Arpan Mandal", "Electricity", "Gas Bill"
  // Used for drill-down reporting (point 5)
  subcategory: { type: String },

  description: { type: String },
  amount: { type: Number, required: true },

  // Payment mode — 'due' means not yet paid
  paymentMode: {
    type: String,
    enum: ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'due'],
    default: 'cash'
  },

  referenceNumber: { type: String },
  attachments: [{ type: String }],

  // Links to other records
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },

  // Due purchase tracking
  isPending: { type: Boolean, default: false },           // true = not yet paid
  relatedPurchase: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseEntry' }, // source purchase

  notes: { type: String },
  isRecurring: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────────────
// Dashboard/reports aggregate Payments by date range and by category
// constantly; the account ledger filters by paidFrom; categories.js
// drills down by category/subcategory alone (no date); staff.js pulls
// a staff member's full payment history by staff id.
paymentSchema.index({ date: -1, category: 1 });
paymentSchema.index({ paidFrom: 1 });
paymentSchema.index({ category: 1, subcategory: 1 });
paymentSchema.index({ staff: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
