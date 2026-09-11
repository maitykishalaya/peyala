const router = require('express').Router();
const Table = require('../models/Table');
const { auth, adminOnly } = require('../middleware/auth');
const { log } = require('../utils/audit');

router.use(auth);

// GET /api/tables
router.get('/', async (req, res) => {
  try {
    const tables = await Table.find()
      .populate({
        path: 'activeOrder',
        populate: [
          { path: 'items.menuItem', select: 'name price isVeg' },
          { path: 'createdBy', select: 'name' },
        ],
      })
      .sort({ tableNumber: 1 });

    res.json(tables);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tables/:id
router.get('/:id', async (req, res) => {
  try {
    const table = await Table.findById(req.params.id).populate({
      path: 'activeOrder',
      populate: [
        { path: 'items.menuItem', select: 'name price isVeg' },
        { path: 'createdBy', select: 'name' },
      ],
    });

    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    res.json(table);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tables
router.post('/', adminOnly, async (req, res) => {
  try {
    const { tableNumber, capacity, status } = req.body;

    if (!tableNumber || !String(tableNumber).trim()) {
      return res.status(400).json({ message: 'Table number is required' });
    }

    const existing = await Table.findOne({ tableNumber: String(tableNumber).trim() });
    if (existing) {
      return res.status(400).json({ message: `Table ${tableNumber} already exists` });
    }

    const table = await Table.create({
      tableNumber: String(tableNumber).trim(),
      capacity: Number(capacity) || 4,
      status: status || 'available',
    });

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Tables',
      description: `${req.user.name} added Table ${table.tableNumber} (Capacity: ${table.capacity})`,
    });

    res.status(201).json(table);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/tables/:id
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const { tableNumber, capacity, status } = req.body;
    const table = await Table.findById(req.params.id);

    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    if (tableNumber !== undefined && String(tableNumber).trim() !== table.tableNumber) {
      const duplicate = await Table.findOne({
        tableNumber: String(tableNumber).trim(),
        _id: { $ne: table._id },
      });
      if (duplicate) {
        return res.status(400).json({ message: `Table ${tableNumber} already exists` });
      }
      table.tableNumber = String(tableNumber).trim();
    }

    if (capacity !== undefined) {
      table.capacity = Math.max(1, Number(capacity) || 1);
    }

    if (status !== undefined) {
      // Do not allow manually setting to occupied without an active order
      if (status === 'occupied' && !table.activeOrder) {
        return res.status(400).json({ message: 'Table can only be marked occupied by opening an order' });
      }
      table.status = status;
    }

    await table.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Tables',
      description: `${req.user.name} updated Table ${table.tableNumber}`,
    });

    res.json(table);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/tables/:id
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    // Block delete if a table's status is occupied
    if (table.status === 'occupied' || table.activeOrder) {
      return res.status(400).json({ message: 'Cannot delete an occupied table with an active order' });
    }

    await Table.findByIdAndDelete(req.params.id);

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'Tables',
      description: `${req.user.name} deleted Table ${table.tableNumber}`,
    });

    res.json({ message: `Table ${table.tableNumber} deleted` });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
