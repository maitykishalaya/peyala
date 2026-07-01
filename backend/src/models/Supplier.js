const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String },
  address: { type: String },
  category: { type: String },
  notes: { type: String },
  openingBalance: { type: Number, default: 0 },
  totalPurchased: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

supplierSchema.virtual('outstanding').get(function() {
  return this.openingBalance + this.totalPurchased - this.totalPaid;
});

supplierSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Supplier', supplierSchema);
