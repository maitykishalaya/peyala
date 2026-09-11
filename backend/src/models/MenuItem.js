const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuCategory', required: true },
  price: { type: Number, required: true, min: 0 },
  isVeg: { type: Boolean, default: true },
  taxPercent: { type: Number, default: 5, min: 0 },
  description: { type: String, trim: true },
  isAvailable: { type: Boolean, default: true },
}, { timestamps: true });

menuItemSchema.index({ category: 1, isAvailable: 1 });

module.exports = mongoose.model('MenuItem', menuItemSchema);
