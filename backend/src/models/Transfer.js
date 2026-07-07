const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
  date: { type: Date, required: true, default: Date.now },
  fromAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  toAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  amount: { type: Number, required: true },
  description: { type: String },
  referenceNumber: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────
// accounts.js ledger route queries by fromAccount/toAccount and sorts by
// date; transfers.js list route sorts all by date.
transferSchema.index({ fromAccount: 1, date: -1 });
transferSchema.index({ toAccount: 1, date: -1 });

module.exports = mongoose.model('Transfer', transferSchema);
