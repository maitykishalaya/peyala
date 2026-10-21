const router = require('express').Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { auth, adminOnly, invalidateUserCache } = require('../middleware/auth');
const { log } = require('../utils/audit');
const offlineAuthVault = require('../services/offlineAuthVault');

// Ensure only read-only demo viewer account exists for public walkthroughs
async function ensureDefaultAccounts() {
  if (mongoose.connection.readyState !== 1) return;

  const defaultAccounts = [
    { name: 'Demo View', email: 'viewer@peyala.com', password: 'peyala123', role: 'viewer' },
  ];

  // Purge any legacy insecure testing accounts if present
  try {
    await User.deleteMany({
      email: { $in: ['admin@peyala.com', 'manager@peyala.com', 'staff@peyala.com'] },
    });
  } catch (_) {
    // Ignore error
  }

  for (const acc of defaultAccounts) {
    try {
      let user = await User.findOne({ email: acc.email });
      if (!user) {
        user = await User.create({
          ...acc,
          isActive: true,
          isFirstLogin: false,
          hasSeenWalkthrough: true,
        });
        console.log(`✅ Demo viewer account initialized: ${acc.email} (${acc.role})`);
      } else {
        let changed = false;
        if (!user.isActive) {
          user.isActive = true;
          changed = true;
        }
        const matchesCurrent = await user.matchPassword(acc.password).catch(() => false);
        if (!matchesCurrent) {
          user.password = acc.password;
          changed = true;
        }
        if (changed) {
          await user.save();
          invalidateUserCache(user._id);
          console.log(`✅ Demo viewer account password synchronized: ${acc.email}`);
        }
      }
      offlineAuthVault.saveUser(user);
    } catch (err) {
      // Ignore duplicate key or startup errors
    }
  }

  // Pre-cache all active database users into offline vault for zero-downtime offline login
  try {
    const allUsers = await User.find({ isActive: true }).select('+password');
    offlineAuthVault.syncFromDb(allUsers);
  } catch (_) {}
}

mongoose.connection.on('connected', () => {
  ensureDefaultAccounts();
});
if (mongoose.connection.readyState === 1) {
  ensureDefaultAccounts();
}

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    let user = null;
    let isOfflineAuth = false;

    // 1. Try DB authentication if connected
    if (mongoose.connection.readyState === 1) {
      if (email === 'viewer@peyala.com') {
        await ensureDefaultAccounts().catch(() => {});
      }
      try {
        user = await User.findOne({ email }).maxTimeMS(2500);
      } catch (dbErr) {
        console.warn('[Auth] Database lookup error or timeout, trying offline vault:', dbErr.message);
      }
    }

    // 2. Fall back to Offline Auth Vault if DB is not connected, timed out, or user not in DB
    if (!user) {
      const offlineUser = await offlineAuthVault.verifyUser(email, password);
      if (offlineUser) {
        user = offlineUser;
        isOfflineAuth = true;
      }
    } else {
      // Verify password via DB model
      const isMatch = await user.matchPassword(password).catch(() => false);
      if (!isMatch) {
        // Double check against offline vault in case password was cached/reset locally
        const offlineFallback = await offlineAuthVault.verifyUser(email, password);
        if (offlineFallback) {
          user = offlineFallback;
          isOfflineAuth = true;
        } else {
          return res.status(401).json({ message: 'Invalid credentials' });
        }
      } else {
        // Password verified in DB: keep offline vault up-to-date
        offlineAuthVault.saveUser(user);
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: 'Account deactivated. Contact admin.' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'peyala_super_secret_jwt_key_2024_change_in_production';
    const token = jwt.sign(
      { id: user._id || user.id, email: user.email, role: user.role, isOffline: isOfflineAuth },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Audit log (non-blocking, ignore errors if DB offline)
    log({
      user,
      action: 'LOGIN',
      module: 'Auth',
      description: `${user.name} logged in${isOfflineAuth ? ' (Offline Vault Mode)' : ''}`,
      ip: req.ip,
    }).catch(() => {});

    res.json({
      token,
      user: { id: user._id || user.id, name: user.name, email: user.email, role: user.role },
      isFirstLogin: user.isFirstLogin || false,
      isOfflineMode: isOfflineAuth || mongoose.connection.readyState !== 1,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Logout (just log it — token invalidation handled client-side)
router.post('/logout', auth, async (req, res) => {
  await log({ user: req.user, action: 'LOGOUT', module: 'Auth', description: `${req.user.name} logged out`, ip: req.ip });
  res.json({ message: 'Logged out' });
});

// Get me
router.get('/me', auth, async (req, res) => {
  res.json(req.user);
});

// Mark walkthrough complete
router.post('/complete-walkthrough', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { isFirstLogin: false, hasSeenWalkthrough: false });
    res.json({ message: 'Walkthrough complete' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Admin: User Management ──────────────────────────────────────────

// List all users
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort('name');
    res.json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Create user (admin only)
router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already registered' });
    const user = await User.create({ name, email, password, role: role || 'staff', isFirstLogin: true });
    await log({ user: req.user, action: 'CREATE', module: 'Users', description: `Created user account for ${name} (${role})`, metadata: { email, role } });
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Update user (admin only)
router.put('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, role, isActive, password } = req.body;
    const update = { name, email, role, isActive };
    if (password) {
      const bcrypt = require('bcryptjs');
      update.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    invalidateUserCache(req.params.id);
    await log({ user: req.user, action: 'UPDATE', module: 'Users', description: `Updated user account: ${user.name}`, metadata: { role, isActive } });
    res.json(user);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Deactivate user (admin only)
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'Cannot deactivate your own account' });
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    invalidateUserCache(req.params.id);
    await log({ user: req.user, action: 'DELETE', module: 'Users', description: `Deactivated user: ${user.name}` });
    res.json({ message: 'User deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
