const mongoose = require('mongoose');
const syncPlugin = require('../utils/syncPlugin');

const auditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  action: { type: String, enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'CANCEL'], required: true },
  module: { type: String, required: true }, // e.g. 'Purchase', 'Sales', 'Staff'
  description: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed }, // optional extra data
  ip: { type: String },
}, { timestamps: true });

// Auto-expire logs after 1 year
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

auditLogSchema.plugin(syncPlugin, { modelName: 'AuditLog' });

module.exports = mongoose.model('AuditLog', auditLogSchema);
