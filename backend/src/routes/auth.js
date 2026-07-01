const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!user.isActive) return res.status(403).json({ message: 'Account deactivated. Contact admin.' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    await log({ user, action: 'LOGIN', module: 'Auth', description: `${user.name} logged in`, ip: req.ip });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role }, isFirstLogin: user.isFirstLogin });
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
    await log({ user: req.user, action: 'UPDATE', module: 'Users', description: `Updated user account: ${user.name}`, metadata: { role, isActive } });
    res.json(user);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Deactivate user (admin only)
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'Cannot deactivate your own account' });
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    await log({ user: req.user, action: 'DELETE', module: 'Users', description: `Deactivated user: ${user.name}` });
    res.json({ message: 'User deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
