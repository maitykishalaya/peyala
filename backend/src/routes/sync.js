const express = require('express');
const router = express.Router();
const syncEngine = require('../services/syncEngine');
const localDbRunner = require('../services/localDbRunner');
const realtimeHub = require('../services/realtimeHub');
const SyncOutbox = require('../models/SyncOutbox');
const { auth, staffOrAdmin } = require('../middleware/auth');

/**
 * GET /api/sync/status
 * Public or authenticated status check for topbar indicator and health monitor
 */
router.get('/status', async (req, res) => {
  try {
    const syncStatus = await syncEngine.getStatus();
    const localDbStatus = localDbRunner.getStatus();
    const realtimeStats = realtimeHub.getStats();

    res.json({
      success: true,
      localServer: {
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      localDb: localDbStatus,
      sync: syncStatus,
      realtime: {
        activeDevices: realtimeStats.activeConnections,
        currentSequence: realtimeStats.currentSequence,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/sync/trigger
 * Manually trigger delta synchronization immediately
 */
router.post('/trigger', auth, staffOrAdmin, async (req, res) => {
  try {
    console.log(`[SyncRoute] Manual sync triggered by user: ${req.user.name || req.user.email}`);
    const result = await syncEngine.syncNow();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/sync/outbox
 * View pending or recent outbox mutations
 */
router.get('/outbox', auth, staffOrAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const status = req.query.status || 'pending';

    const filter = status === 'all' ? {} : { status };
    const items = await SyncOutbox.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
