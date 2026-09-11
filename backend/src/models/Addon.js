const mongoose = require('mongoose');

const addonSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  isVeg: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

addonSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.model('Addon', addonSchema);
