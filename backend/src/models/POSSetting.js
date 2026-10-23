const mongoose = require('mongoose');

const posSettingSchema = new mongoose.Schema({
  // Maximum discount percentage allowed for staff role (default: 10%)
  maxDiscountStaffPercent: {
    type: Number,
    default: 10,
    min: 0,
    max: 100,
  },
  // Maximum discount percentage allowed for manager role (default: 20%)
  maxDiscountManagerPercent: {
    type: Number,
    default: 20,
    min: 0,
    max: 100,
  },
  // Maximum waive-off / cash shortage percentage allowed for staff role (default: 2%)
  maxWaiveStaffPercent: {
    type: Number,
    default: 2,
    min: 0,
    max: 100,
  },
  // Maximum waive-off / cash shortage percentage allowed for manager role (default: 5%)
  maxWaiveManagerPercent: {
    type: Number,
    default: 5,
    min: 0,
    max: 100,
  },
  // Dynamic background cloud DB sync interval in minutes (default: 15 minutes)
  dbSyncIntervalMinutes: {
    type: Number,
    default: 15,
    min: 0.2, // min 12 seconds
    max: 1440, // max 24 hours
  },
  lastUpdatedBy: {
    type: String,
    default: null,
  },
}, { timestamps: true });

// Singleton pattern helper to retrieve or initialize the single configuration document
posSettingSchema.statics.getSingleton = async function() {
  let setting = await this.findOne();
  if (!setting) {
    setting = await this.create({
      maxDiscountStaffPercent: 10,
      maxDiscountManagerPercent: 20,
      maxWaiveStaffPercent: 2,
      maxWaiveManagerPercent: 5,
      dbSyncIntervalMinutes: 15,
    });
  }
  return setting;
};

module.exports = mongoose.model('POSSetting', posSettingSchema);
