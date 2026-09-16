const mongoose = require('mongoose');

const expenseLeakReviewSchema = new mongoose.Schema({
  // Deterministic unique identifier of the anomaly (e.g. price_spike_<itemId>_<period>)
  anomalyId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  // Review status
  status: {
    type: String,
    enum: ['new', 'reviewed', 'dismissed'],
    default: 'new',
    index: true,
  },

  // If dismissed, optional date until which repeated identical alerts are muted
  dismissedUntil: {
    type: Date,
  },

  // Was this alert useful? 👍 = true, 👎 = false
  isUseful: {
    type: Boolean,
    default: null,
  },

  // Reason tag provided by user
  feedbackReason: {
    type: String,
    enum: [
      'expected_expense',
      'seasonal_change',
      'supplier_change',
      'data_mistake',
      'actual_issue',
      'other',
      null
    ],
    default: null,
  },

  // Optional explanation notes
  feedbackNotes: {
    type: String,
    trim: true,
  },

  // Who performed the action
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  reviewedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('ExpenseLeakReview', expenseLeakReviewSchema);
