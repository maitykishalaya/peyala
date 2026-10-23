const express = require('express');
const router = express.Router();
const syncEngine = require('../services/syncEngine');
const localDbRunner = require('../services/localDbRunner');
const realtimeHub = require('../services/realtimeHub');
const SyncOutbox = require('../models/SyncOutbox');
const { auth, staffOrAdmin, adminOnly } = require('../middleware/auth');

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

/**
 * PUT /api/sync/interval
 * Admin dynamically configures the DB sync interval (in minutes)
 */
router.put('/interval', auth, adminOnly, async (req, res) => {
  try {
    const { intervalMinutes } = req.body;
    const mins = Number(intervalMinutes);
    if (isNaN(mins) || mins < 0.2 || mins > 1440) {
      return res.status(400).json({
        success: false,
        message: 'Sync interval must be between 0.2 minutes (12 seconds) and 1440 minutes (24 hours)',
      });
    }

    const POSSetting = require('../models/POSSetting');
    const setting = await POSSetting.getSingleton();
    setting.dbSyncIntervalMinutes = Math.round(mins * 10) / 10;
    setting.lastUpdatedBy = req.user.name;
    await setting.save();

    syncEngine.setIntervalMinutes(setting.dbSyncIntervalMinutes);

    res.json({
      success: true,
      dbSyncIntervalMinutes: setting.dbSyncIntervalMinutes,
      syncIntervalMs: syncEngine.syncIntervalMs,
      message: `Database sync interval updated to ${setting.dbSyncIntervalMinutes} minute(s)`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
