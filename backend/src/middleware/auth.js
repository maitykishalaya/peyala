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

    // Viewers have strict read-only demo access — block all state-mutating HTTP methods
    if (user.role === 'viewer' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const isLogoutOrWalkthrough =
        req.path === '/logout' ||
        req.originalUrl?.includes('/api/auth/logout') ||
        req.path === '/complete-walkthrough' ||
        req.originalUrl?.includes('/api/auth/complete-walkthrough');

      if (!isLogoutOrWalkthrough) {
        return res.status(403).json({
          message: 'Viewer role is read-only. You cannot create, edit, or delete data in demo mode.',
        });
      }
    }

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

