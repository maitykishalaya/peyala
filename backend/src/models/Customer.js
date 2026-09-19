const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true,
  },
  totalDue: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalOrders: {
    type: Number,
    default: 0,
  },
  lastVisit: {
    type: Date,
    default: Date.now,
  },
  notes: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

// Optimized compound indexes for autocomplete searches and due tracking
customerSchema.index({ phone: 1, name: 1 });
customerSchema.index({ totalDue: -1, isActive: 1 });

module.exports = mongoose.model('Customer', customerSchema);
