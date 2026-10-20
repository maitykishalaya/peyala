const mongoose = require('mongoose');

const restorePointSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      index: true,
    },
    snapshotId: {
      type: String,
      required: true,
      unique: true,
    },
    tag: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    dbDumpPath: {
      type: String,
      required: true,
    },
    stats: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    totalDocuments: {
      type: Number,
      default: 0,
    },
    appConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['active', 'restoring', 'archived'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

restorePointSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RestorePoint', restorePointSchema);
