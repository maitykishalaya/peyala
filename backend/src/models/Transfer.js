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

module.exports = mongoose.model('Transfer', transferSchema);
