const mongoose = require('mongoose');

const wastageSchema = new mongoose.Schema(
  {
    // Core Field 1: Name of the item
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    // Core Field 2: Quantity
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    // Measurement unit (e.g. kg, pcs, plates, portions, litres)
    unit: {
      type: String,
      default: 'units',
      trim: true,
    },
    // Core Field 3: Approximate value in ₹
    approxValue: {
      type: Number,
      required: true,
      min: 0,
    },
    // Date of wastage
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // Optional reason or note (e.g. Spoilage, Expired, Burnt, Customer return)
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    // Explicitly verified zero-wastage for the business day
    isZeroWastage: {
      type: Boolean,
      default: false,
    },
    // Staff/User who recorded this entry
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Index for date filtering and fast sorting
wastageSchema.index({ date: -1 });
wastageSchema.index({ itemName: 1 });

module.exports = mongoose.model('Wastage', wastageSchema);
