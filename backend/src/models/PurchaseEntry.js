const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  pricePerUnit: { type: Number, required: true },
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

module.exports = mongoose.model('PurchaseEntry', purchaseEntrySchema);
