const mongoose = require('mongoose');

const deletedOrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    orderNumber: {
      type: Number,
      index: true,
    },
    billNumber: {
      type: Number,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    total: {
      type: Number,
      default: 0,
    },
    dueAmount: {
      type: Number,
      default: 0,
    },
    reason: {
      type: String,
      default: 'settled_bill_deletion',
    },
    deletedBy: {
      type: String,
      default: 'admin',
    },
    deletedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

deletedOrderSchema.index({ orderId: 1, orderNumber: 1, billNumber: 1 });

module.exports = mongoose.model('DeletedOrder', deletedOrderSchema);
