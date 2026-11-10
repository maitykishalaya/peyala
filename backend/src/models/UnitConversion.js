const mongoose = require('mongoose');

const unitConversionSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true,
    index: true,
  },
  canonicalUnit: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  purchaseUnit: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  conversionFactor: {
    type: Number,
    required: true,
    min: 0.000001,
  },
  packageSize: {
    type: Number,
    default: 1,
    min: 0.000001,
  },
  packageLabel: {
    type: String,
    trim: true,
    default: '',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

// Prevent duplicate conversion rules for the same inventory item + purchase unit
unitConversionSchema.index({ inventoryItem: 1, purchaseUnit: 1 }, { unique: true });

const syncPlugin = require('../utils/syncPlugin');
unitConversionSchema.plugin(syncPlugin, { modelName: 'UnitConversion' });

module.exports = mongoose.model('UnitConversion', unitConversionSchema);
