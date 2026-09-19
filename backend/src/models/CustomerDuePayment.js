const mongoose = require('mongoose');

const customerDuePaymentSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi', 'card'],
    required: true,
  },
  receivedIn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
  },
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  notes: {
    type: String,
    trim: true,
  },
  billsAffected: [{
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: { type: Number },
    amountApplied: { type: Number },
  }],
  date: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { timestamps: true });

customerDuePaymentSchema.index({ customer: 1, date: -1 });

module.exports = mongoose.model('CustomerDuePayment', customerDuePaymentSchema);
