const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'Token invalid' });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

const managerOrAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access restricted to managers and administrators.' });
  }
  next();
};

const staffOrAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'manager', 'staff'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access restricted to authorized staff, managers, and administrators.' });
  }
  next();
};

module.exports = { auth, adminOnly, managerOrAdmin, staffOrAdmin };

