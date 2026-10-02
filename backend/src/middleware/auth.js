const jwt = require('jsonwebtoken');
const User = require('../models/User');

// In-memory cache for authenticated users (reduces 80%+ redundant Atlas DB roundtrips during polling)
const userCache = new Map();
const USER_CACHE_TTL_MS = 30000; // 30 seconds

// Periodic garbage collection for expired entries
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of userCache.entries()) {
    if (entry.expiresAt <= now) userCache.delete(id);
  }
}, 60000).unref();

function invalidateUserCache(userId) {
  if (userId) {
    userCache.delete(String(userId));
  } else {
    userCache.clear();
  }
}

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let user = null;
    const now = Date.now();
    const cached = userCache.get(decoded.id);
    if (cached && cached.expiresAt > now) {
      user = cached.user;
    } else {
      user = await User.findById(decoded.id).select('-password');
      if (!user) return res.status(401).json({ message: 'Token invalid' });
      userCache.set(decoded.id, { user, expiresAt: now + USER_CACHE_TTL_MS });
    }

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

module.exports = { auth, adminOnly, managerOrAdmin, staffOrAdmin, invalidateUserCache };

