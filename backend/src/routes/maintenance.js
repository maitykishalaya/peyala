const express = require('express');
const router = express.Router();
const { auth, adminOnly } = require('../middleware/auth');
const restoreSystem = require('../services/restoreSystem');
const syncEngine = require('../services/syncEngine');
const localDbRunner = require('../services/localDbRunner');
const realtimeHub = require('../services/realtimeHub');
const pkg = require('../../package.json');

/**
 * GET /api/maintenance/overview
 * Restricted to Administrators
 */
router.get('/overview', auth, adminOnly, async (req, res) => {
  try {
    const restorePoints = await restoreSystem.listRestorePoints();
    const syncStatus = await syncEngine.getStatus();
    const localDbStatus = localDbRunner.getStatus();
    const realtimeStats = realtimeHub.getStats();

    res.json({
      success: true,
      system: {
        applicationVersion: pkg.version || '10.0.0',
        environment: process.env.NODE_ENV || 'production',
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
      localServer: {
        status: 'online',
        host: req.headers.host,
        ip: req.socket.localAddress,
      },
      localDb: localDbStatus,
      sync: syncStatus,
      connectedDevices: realtimeStats,
      restorePoints: {
        total: restorePoints.length,
        latest: restorePoints[0] || null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/maintenance/restore-points
 */
router.get('/restore-points', auth, adminOnly, async (req, res) => {
  try {
    const points = await restoreSystem.listRestorePoints();
    res.json({ success: true, count: points.length, restorePoints: points });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/maintenance/restore-points
 * Create a new versioned restore point
 */
router.post('/restore-points', auth, adminOnly, async (req, res) => {
  try {
    const { version, description } = req.body;
    if (!version) {
      return res.status(400).json({ success: false, message: 'Version is required (e.g. 10.0.1)' });
    }

    const result = await restoreSystem.createRestorePoint(version, description, syncEngine);
    res.json({ success: true, restorePoint: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/maintenance/rollback
 * Execute safe 8-step rollback to a previous version
 */
router.post('/rollback', auth, adminOnly, async (req, res) => {
  try {
    const { targetVersion } = req.body;
    if (!targetVersion) {
      return res.status(400).json({ success: false, message: 'Target version is required (e.g. 10.0.0)' });
    }

    console.log(`[Maintenance] Rollback requested by Admin ${req.user.name || req.user.email} to version ${targetVersion}`);
    const result = await restoreSystem.rollbackToVersion(targetVersion, syncEngine);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/maintenance/connected-devices
 */
router.get('/connected-devices', auth, adminOnly, async (req, res) => {
  try {
    const stats = realtimeHub.getStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
