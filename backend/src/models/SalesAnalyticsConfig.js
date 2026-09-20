const mongoose = require('mongoose');

const salesAnalyticsConfigSchema = new mongoose.Schema({
  // Daily revenue target (₹). If null, computed dynamically from comparable-day historical baseline
  dailyTarget: {
    type: Number,
    default: null,
    min: 0,
  },

  // Weekday-specific targets (₹)
  weekdayTargets: {
    monday: { type: Number, default: null, min: 0 },
    tuesday: { type: Number, default: null, min: 0 },
    wednesday: { type: Number, default: null, min: 0 },
    thursday: { type: Number, default: null, min: 0 },
    friday: { type: Number, default: null, min: 0 },
  },

  // Weekend target (₹) applied to Saturday and Sunday
  weekendTarget: {
    type: Number,
    default: null,
    min: 0,
  },

  // Desired growth percentage when computing suggested targets (default: 10%)
  suggestedGrowthPct: {
    type: Number,
    default: 10,
    min: 0,
    max: 100,
  },

  // Target Average Order Value (₹)
  targetAov: {
    type: Number,
    default: 150,
    min: 1,
  },

  // Threshold percentage below average to trigger a weak-day insight (default: 20%)
  weakDayThresholdPct: {
    type: Number,
    default: 20,
    min: 5,
    max: 80,
  },

  // Threshold for delivery platform deductions (default: 35%)
  deliveryDeductionThresholdPct: {
    type: Number,
    default: 35,
    min: 10,
    max: 80,
  },

  // Threshold quantity for low item sales alert (default: 5 units)
  lowItemSalesThresholdQty: {
    type: Number,
    default: 5,
    min: 1,
  },

  // User feedback / snooze / dismissal actions on suggestions
  suggestionActions: [{
    actionId: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'completed', 'dismissed', 'snoozed'],
      default: 'active',
    },
    snoozedUntil: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
  }],

  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

// Singleton pattern helper to retrieve or initialize the single configuration document
salesAnalyticsConfigSchema.statics.getSingleton = async function() {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({
      dailyTarget: null,
      weekdayTargets: {
        monday: null,
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
      },
      weekendTarget: null,
      suggestedGrowthPct: 10,
      targetAov: 150,
      weakDayThresholdPct: 20,
      deliveryDeductionThresholdPct: 35,
      lowItemSalesThresholdQty: 5,
      suggestionActions: [],
    });
  }
  return config;
};

module.exports = mongoose.model('SalesAnalyticsConfig', salesAnalyticsConfigSchema);
