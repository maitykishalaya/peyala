const mongoose = require('mongoose');

const migrationLogSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      index: true,
    },
    migrationId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'applied', 'failed', 'rolled_back'],
      default: 'pending',
    },
    appliedAt: {
      type: Date,
      default: null,
    },
    rolledBackAt: {
      type: Date,
      default: null,
    },
    executionTimeMs: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MigrationLog', migrationLogSchema);
