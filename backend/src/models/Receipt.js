const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  date: { type: Date, required: true, default: Date.now },
  receivedIn: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  source: { type: String, required: true },
  category: { type: String, enum: ['zomato_settlement', 'swiggy_settlement', 'cash_deposit', 'loan', 'investment', 'other'], default: 'other' },
  description: { type: String },
  amount: { type: Number, required: true },
  referenceNumber: { type: String },
  attachments: [{ type: String }],
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Receipt', receiptSchema);
