const mongoose = require('mongoose');

const inventorySnapshotSchema = new mongoose.Schema({
  monthKey: { type: String, required: true, unique: true }, // 'YYYY-MM', e.g. '2026-09'
  monthLabel: { type: String, required: true }, // e.g. 'September 2026'
  cutoffDate: { type: Date, required: true },
  cutoffFormatted: { type: String, default: '' }, // e.g. '30 Sep, 11:59 PM'
  totalValue: { type: Number, required: true, default: 0 },
  itemCount: { type: Number, default: 0 },
  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    name: { type: String },
    unit: { type: String },
    stock: { type: Number, default: 0 },
    averageCost: { type: Number, default: 0 },
    value: { type: Number, default: 0 },
  }],
  capturedAt: { type: Date, default: Date.now },
  isAutomatic: { type: Boolean, default: true },
}, { timestamps: true });

inventorySnapshotSchema.index({ cutoffDate: -1 });

module.exports = mongoose.model('InventorySnapshot', inventorySnapshotSchema);
