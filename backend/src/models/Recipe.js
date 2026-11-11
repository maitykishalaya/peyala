const mongoose = require('mongoose');

const recipeIngredientSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true,
  },
  ingredientName: {
    type: String,
    required: true,
    trim: true,
  },
  recipeQuantity: {
    type: Number,
    required: true,
    min: 0.000001,
  },
  recipeUnit: {
    type: String,
    required: true,
    trim: true,
  },
  canonicalQuantity: {
    type: Number,
    required: true,
    min: 0.000001,
  },
  canonicalUnit: {
    type: String,
    required: true,
    trim: true,
  },
  lossPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
});

const recipeSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem',
    required: true,
    index: true,
  },
  variantName: {
    type: String,
    trim: true,
    default: null,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  version: {
    type: Number,
    default: 1,
    min: 1,
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive'],
    default: 'draft',
    index: true,
  },
  confidenceScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 100,
  },
  generationSource: {
    type: String,
    enum: ['manual', 'auto_generated', 'duplicate'],
    default: 'manual',
  },
  prepYield: {
    type: Number,
    default: 1,
    min: 0.001,
  },
  preparationLossPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  ingredients: [recipeIngredientSchema],
  estimatedCost: {
    type: Number,
    default: 0,
    min: 0,
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
  lastApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastApprovedAt: {
    type: Date,
    default: null,
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

// Compound index for querying active recipe for a menu item + variant
recipeSchema.index({ menuItem: 1, variantName: 1, status: 1 });
recipeSchema.index({ name: 1 });

const syncPlugin = require('../utils/syncPlugin');
recipeSchema.plugin(syncPlugin, { modelName: 'Recipe' });

module.exports = mongoose.model('Recipe', recipeSchema);

