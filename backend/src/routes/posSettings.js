const router = require('express').Router();
const POSSetting = require('../models/POSSetting');
const { auth, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// GET /api/pos-settings — Retrieve active role-based limits
router.get('/', async (req, res) => {
  try {
    const setting = await POSSetting.getSingleton();
    res.json(setting);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/pos-settings — Update limits (Admin only)
router.put('/', adminOnly, async (req, res) => {
  try {
    const {
      maxDiscountStaffPercent,
      maxDiscountManagerPercent,
      maxWaiveStaffPercent,
      maxWaiveManagerPercent,
      dbSyncIntervalMinutes,
    } = req.body;

    const setting = await POSSetting.getSingleton();

    if (maxDiscountStaffPercent !== undefined) {
      const v = Number(maxDiscountStaffPercent);
      if (isNaN(v) || v < 0 || v > 100) {
        return res.status(400).json({ message: 'Staff max discount % must be between 0 and 100' });
      }
      setting.maxDiscountStaffPercent = Math.round(v * 100) / 100;
    }

    if (maxDiscountManagerPercent !== undefined) {
      const v = Number(maxDiscountManagerPercent);
      if (isNaN(v) || v < 0 || v > 100) {
        return res.status(400).json({ message: 'Manager max discount % must be between 0 and 100' });
      }
      setting.maxDiscountManagerPercent = Math.round(v * 100) / 100;
    }

    if (maxWaiveStaffPercent !== undefined) {
      const v = Number(maxWaiveStaffPercent);
      if (isNaN(v) || v < 0 || v > 100) {
        return res.status(400).json({ message: 'Staff max waive/shortage % must be between 0 and 100' });
      }
      setting.maxWaiveStaffPercent = Math.round(v * 100) / 100;
    }

    if (maxWaiveManagerPercent !== undefined) {
      const v = Number(maxWaiveManagerPercent);
      if (isNaN(v) || v < 0 || v > 100) {
        return res.status(400).json({ message: 'Manager max waive/shortage % must be between 0 and 100' });
      }
      setting.maxWaiveManagerPercent = Math.round(v * 100) / 100;
    }

    if (dbSyncIntervalMinutes !== undefined) {
      const v = Number(dbSyncIntervalMinutes);
      if (isNaN(v) || v < 0.2 || v > 1440) {
        return res.status(400).json({ message: 'DB Sync Interval must be between 0.2 minutes (12 seconds) and 1440 minutes (24 hours)' });
      }
      setting.dbSyncIntervalMinutes = Math.round(v * 10) / 10;
      const syncEngine = require('../services/syncEngine');
      syncEngine.setIntervalMinutes(setting.dbSyncIntervalMinutes);
    }

    setting.lastUpdatedBy = req.user.name;
    await setting.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'POSSettings',
      description: `${req.user.name} updated POS & sync settings: Staff Disc: ${setting.maxDiscountStaffPercent}%, Mgr Disc: ${setting.maxDiscountManagerPercent}%, Staff Shortage: ${setting.maxWaiveStaffPercent}%, Mgr Shortage: ${setting.maxWaiveManagerPercent}%, Sync Interval: ${setting.dbSyncIntervalMinutes}m`,
    });

    res.json(setting);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
