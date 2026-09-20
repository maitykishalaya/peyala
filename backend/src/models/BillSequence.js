const mongoose = require('mongoose');

const billSequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. 'FY2627-Q1', 'FY2627-Q2'
  seq: { type: Number, default: 0 },
  quarter: { type: String, required: true }, // e.g. 'Q1', 'Q2', 'Q3', 'Q4'
  fiscalYear: { type: String, required: true }, // e.g. '2026-27'
}, { timestamps: true });

module.exports = mongoose.model('BillSequence', billSequenceSchema);
