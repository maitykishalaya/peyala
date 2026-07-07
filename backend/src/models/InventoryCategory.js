const mongoose = require('mongoose');

const inventoryCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCategory', default: null },
  description: { type: String },
  color: { type: String, default: '#10b981' },
  icon: { type: String, default: '📦' },
}, { timestamps: true });

inventoryCategorySchema.index({ name: 1 });

module.exports = mongoose.model('InventoryCategory', inventoryCategorySchema);
