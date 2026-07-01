const AuditLog = require('../models/AuditLog');

const log = async ({ user, action, module, description, metadata, ip }) => {
  try {
    await AuditLog.create({
      user: user._id,
      userName: user.name,
      action,
      module,
      description,
      metadata,
      ip,
    });
  } catch (err) {
    // Never let audit logging break the main request
    console.error('Audit log error:', err.message);
  }
};

module.exports = { log };
