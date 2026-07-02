const router = require('express').Router();
const OwnerNote = require('../models/OwnerNote');
const { auth, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const note = await OwnerNote.getSingleton();
    res.json({
      note: note.text || '',
      lastUpdatedBy: note.lastUpdatedBy || null,
      lastUpdatedAt: note.updatedAt || note.createdAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/', adminOnly, async (req, res) => {
  try {
    const { note } = req.body;
    const ownerNote = await OwnerNote.getSingleton();
    ownerNote.text = note || '';
    ownerNote.lastUpdatedBy = req.user.name;
    await ownerNote.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'OwnerNote',
      description: `${req.user.name} updated the owner notice`,
    });

    res.json({
      note: ownerNote.text,
      lastUpdatedBy: ownerNote.lastUpdatedBy,
      lastUpdatedAt: ownerNote.updatedAt,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
