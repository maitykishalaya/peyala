const mongoose = require('mongoose');

const syncOutboxSchema = new mongoose.Schema(
  {
    collectionName: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      index: true,
    },
    operation: {
      type: String,
      enum: ['insert', 'update', 'delete'],
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    revision: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'synced', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },
    syncedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

syncOutboxSchema.index({ status: 1, createdAt: 1 });
syncOutboxSchema.index({ collectionName: 1, documentId: 1, status: 1 });

module.exports = mongoose.model('SyncOutbox', syncOutboxSchema);
