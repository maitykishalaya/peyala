const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCategory', required: true },
  unit: { type: String, enum: ['kg', 'gram', 'litre', 'ml', 'piece', 'packet', 'box', 'dozen', 'bottle'], required: true },
  currentStock: { type: Number, default: 0 },
  minimumStock: { type: Number, default: 0 },
  lastPurchasePrice: { type: Number, default: 0 },
  averageCost: { type: Number, default: 0 },
  preferredSupplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  notes: { type: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

inventoryItemSchema.virtual('stockValue').get(function() {
  return this.currentStock * this.averageCost;
});

inventoryItemSchema.virtual('isLowStock').get(function() {
  return this.currentStock <= this.minimumStock;
});

inventoryItemSchema.set('toJSON', { virtuals: true });

// ── Indexes ────────────────────────────────────────────────────────
// Speeds up the exact queries the Inventory page runs:
//   find({ isActive: true })                → isActive index
//   find({ isActive: true, category: id })   → compound index below
//   .sort('name')                            → name index
// Without these, MongoDB has to scan every document every time.
inventoryItemSchema.index({ isActive: 1, category: 1 });
inventoryItemSchema.index({ name: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
