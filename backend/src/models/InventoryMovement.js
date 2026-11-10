const mongoose = require('mongoose');

const inventoryMovementSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true,
    index: true,
  },
  recipe: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Recipe',
    default: null,
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true,
  },
  orderNumber: {
    type: Number,
    default: null,
  },
  kotRoundNumber: {
    type: Number,
    default: null,
  },
  orderItemId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  movementType: {
    type: String,
    enum: [
      'kot_consumption',
      'billing_consumption',
      'cancellation_reversal',
      'bill_edit_adjustment',
      'bill_delete_reversal',
      'purchase_receipt',
      'purchase_reversal',
      'wastage',
      'manual_adjustment',
    ],
    required: true,
    index: true,
  },
  quantityDelta: {
    type: Number,
    required: true,
  },
  unit: {
    type: String,
    required: true,
    trim: true,
  },
  previousStock: {
    type: Number,
    required: true,
  },
  newStock: {
    type: Number,
    required: true,
  },
  costPerUnit: {
    type: Number,
    default: 0,
  },
  totalCost: {
    type: Number,
    default: 0,
  },
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

inventoryMovementSchema.index({ inventoryItem: 1, createdAt: -1 });
inventoryMovementSchema.index({ order: 1, createdAt: -1 });
inventoryMovementSchema.index({ movementType: 1, createdAt: -1 });

const syncPlugin = require('../utils/syncPlugin');
inventoryMovementSchema.plugin(syncPlugin, { modelName: 'InventoryMovement' });

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
