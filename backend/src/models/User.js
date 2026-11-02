const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['admin', 'manager', 'staff', 'viewer'], default: 'staff' },
  isActive: { type: Boolean, default: true },
  isFirstLogin: { type: Boolean, default: true },
  hasSeenWalkthrough: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const crypto = require('crypto');
const passwordVerificationCache = new Map();
const VERIFICATION_CACHE_TTL_MS = 60000; // 60 seconds

userSchema.methods.matchPassword = async function(entered) {
  const cacheKey = crypto.createHash('sha256').update(`${this._id}:${entered}:${this.password}`).digest('hex');
  const cached = passwordVerificationCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }
  const result = await bcrypt.compare(entered, this.password);
  if (result) {
    passwordVerificationCache.set(cacheKey, { result: true, expiresAt: Date.now() + VERIFICATION_CACHE_TTL_MS });
    if (passwordVerificationCache.size > 200) {
      const oldestKey = passwordVerificationCache.keys().next().value;
      passwordVerificationCache.delete(oldestKey);
    }
  }
  return result;
};

module.exports = mongoose.model('User', userSchema);
