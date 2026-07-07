const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  pricePerUnit: { type: Number, required: true },
  gstPercent: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  totalPrice: { type: Number, required: true },
});

const purchaseEntrySchema = new mongoose.Schema({
  date: { type: Date, required: true, default: Date.now },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  items: [purchaseItemSchema],
  totalAmount: { type: Number, required: true },
  paidFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  paymentMode: { type: String, enum: ['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'due'], default: 'cash' },
  isPaid: { type: Boolean, default: true },
  notes: { type: String },
  attachments: [{ type: String }],
  referenceNumber: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// ── Indexes ────────────────────────────────────────────────────────
// Matches how the Purchases page actually queries this collection:
//   sort by date, filter by date range, filter by supplier.
purchaseEntrySchema.index({ date: -1 });
purchaseEntrySchema.index({ supplier: 1, date: -1 });

module.exports = mongoose.model('PurchaseEntry', purchaseEntrySchema);
