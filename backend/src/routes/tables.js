const router = require('express').Router();
const Table = require('../models/Table');
const TableCategory = require('../models/TableCategory');
const Order = require('../models/Order');
const { auth, adminOnly, managerOrAdmin } = require('../middleware/auth');
const { log } = require('../utils/audit');
const { getIstDayRange, getIstFiscalQuarter } = require('../utils/date');

router.use(auth);

// Helper to infer default category for legacy tables
function inferDefaultCategory(tableNumber) {
  const lower = String(tableNumber || '').toLowerCase().trim();
  if (
    lower.startsWith('out') ||
    lower.includes('outdoor') ||
    lower.startsWith('o-') ||
    lower.startsWith('patio') ||
    lower.startsWith('sudhanil') ||
    lower.startsWith('ratnadeep') ||
    lower.startsWith('extra') ||
    lower.startsWith('dhitun')
  ) {
    return 'Outdoor';
  }
  if (
    lower.startsWith('pick') ||
    lower.startsWith('takeaway') ||
    lower.startsWith('delivery') ||
    lower.startsWith('pu')
  ) {
    return 'Pick Up';
  }
  return 'Indoor';
}

// ─────────────────────────────────────────────────────────────────
// 1. TABLE CATEGORIES (FLOOR ZONES)
// ─────────────────────────────────────────────────────────────────

// GET /api/tables/categories — List all floor categories
router.get('/categories', async (req, res) => {
  try {
    await TableCategory.seedDefaults();
    const categories = await TableCategory.find({ isActive: true }).sort({ order: 1, name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/tables/categories — Create a new table category
router.post('/categories', managerOrAdmin, async (req, res) => {
  try {
    const { name, color, icon, description, order } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const trimmedName = String(name).trim();
    const existing = await TableCategory.findOne({ name: new RegExp(`^${trimmedName}$`, 'i') });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        existing.color = color || existing.color;
        existing.icon = icon || existing.icon;
        existing.description = description !== undefined ? description : existing.description;
        await existing.save();
        return res.json(existing);
      }
      return res.status(400).json({ message: `Category "${trimmedName}" already exists` });
    }

    const category = await TableCategory.create({
      name: trimmedName,
      color: color || '#6366f1',
      icon: icon || '🪑',
      description: description ? String(description).trim() : '',
      order: order !== undefined ? Number(order) : 0,
      isActive: true,
    });

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'OutletDesign',
      description: `${req.user.name} added floor category "${category.name}"`,
    });

    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/tables/categories/reorder — Reorder floor categories in bulk
router.put('/categories/reorder', managerOrAdmin, async (req, res) => {
  try {
    const { categoryIds } = req.body;
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({ message: 'categoryIds array is required' });
    }

    const updates = categoryIds.map((id, index) =>
      TableCategory.findByIdAndUpdate(id, { $set: { order: index + 1 } })
    );
    await Promise.all(updates);

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'OutletDesign',
      description: `${req.user.name} reordered floor categories`,
    });

    const categories = await TableCategory.find({ isActive: true }).sort({ order: 1, name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/tables/categories/:id — Update table category
router.put('/categories/:id', managerOrAdmin, async (req, res) => {
  try {
    const { name, color, icon, description, order } = req.body;
    const category = await TableCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const oldName = category.name;
    if (name && String(name).trim() !== oldName) {
      const trimmedName = String(name).trim();
      const duplicate = await TableCategory.findOne({
        _id: { $ne: category._id },
        name: new RegExp(`^${trimmedName}$`, 'i'),
      });
      if (duplicate) {
        return res.status(400).json({ message: `Category "${trimmedName}" already exists` });
      }
      category.name = trimmedName;

      // Update all tables using the old category name
      await Table.updateMany({ category: oldName }, { $set: { category: trimmedName } });
    }

    if (color !== undefined) category.color = color;
    if (icon !== undefined) category.icon = icon;
    if (description !== undefined) category.description = String(description).trim();
    if (order !== undefined) category.order = Number(order) || 0;

    await category.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'OutletDesign',
      description: `${req.user.name} updated floor category "${category.name}"`,
    });

    res.json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/tables/categories/:id — Delete/Deactivate table category
router.delete('/categories/:id', adminOnly, async (req, res) => {
  try {
    const category = await TableCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const catName = category.name;
    await TableCategory.findByIdAndDelete(req.params.id);

    // Reassign any tables in this category to 'Other'
    await Table.updateMany({ category: catName }, { $set: { category: 'Other' } });

    await log({
      user: req.user,
      action: 'DELETE',
      module: 'OutletDesign',
      description: `${req.user.name} deleted floor category "${catName}" (tables reassigned to Other)`,
    });

    res.json({ message: `Category "${catName}" deleted` });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 2. OUTLET SALES ANALYTICS (INDOOR VS OUTDOOR VS OTHER)
// ─────────────────────────────────────────────────────────────────

// GET /api/tables/analytics/outlet-sales — Revenue by table category
router.get('/analytics/outlet-sales', async (req, res) => {
  try {
    const { period = 'this_month', startDate, endDate } = req.query;
    await TableCategory.seedDefaults();

    // Determine IST Date Range
    let dateFilter = null;
    const now = new Date();

    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (period === 'today') {
      const { start, end } = getIstDayRange(now);
      dateFilter = { $gte: start, $lte: end };
    } else if (period === 'this_week') {
      const { start } = getIstDayRange(now);
      const day = start.getDay(); // 0 is Sunday
      const diff = (day === 0 ? -6 : 1) - day;
      const monday = new Date(start);
      monday.setDate(start.getDate() + diff);
      dateFilter = { $gte: monday, $lte: now };
    } else if (period === 'this_month') {
      const { istDateStr } = getIstDayRange(now);
      const [year, month] = istDateStr.split('-').map(Number);
      const startMs = Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - (5.5 * 3600 * 1000);
      dateFilter = { $gte: new Date(startMs), $lte: now };
    } else if (period === 'quarter') {
      const qInfo = getIstFiscalQuarter(now);
      let startMonth = 4;
      let startYear = qInfo.fiscalStartYear;
      if (qInfo.quarter === 'Q2') startMonth = 7;
      else if (qInfo.quarter === 'Q3') startMonth = 10;
      else if (qInfo.quarter === 'Q4') {
        startMonth = 1;
        startYear = qInfo.fiscalStartYear + 1;
      }
      const startMs = Date.UTC(startYear, startMonth - 1, 1, 0, 0, 0, 0) - (5.5 * 3600 * 1000);
      dateFilter = { $gte: new Date(startMs), $lte: now };
    }

    // Build Order match filter for settled/paid dining orders
    const match = { status: 'paid' };
    if (dateFilter) {
      match.paidAt = dateFilter;
    }

    // Fetch all categories and tables to ensure comprehensive mapping
    const [categories, tables, paidOrders] = await Promise.all([
      TableCategory.find({ isActive: true }).sort({ order: 1, name: 1 }).lean(),
      Table.find().lean(),
      Order.find(match).select('table tableCategory subtotal taxAmount discount settledAmount total paidAt').lean(),
    ]);

    // Build lookup maps
    const tableCategoryMap = new Map();
    const tableDetailsMap = new Map();
    for (const t of tables) {
      const effectiveCategory = t.category || inferDefaultCategory(t.tableNumber);
      tableCategoryMap.set(String(t._id), effectiveCategory);
      tableCategoryMap.set(String(t.tableNumber).toLowerCase(), effectiveCategory);
      tableDetailsMap.set(String(t._id), t);
    }

    // Initialize category accumulator
    const categoryStats = new Map();
    for (const cat of categories) {
      categoryStats.set(cat.name, {
        name: cat.name,
        color: cat.color || '#6366f1',
        icon: cat.icon || '🪑',
        description: cat.description || '',
        totalSales: 0,
        orderCount: 0,
        tablesCount: 0,
        tableStats: new Map(),
      });
    }

    // Add 'Other' if not in list
    if (!categoryStats.has('Other')) {
      categoryStats.set('Other', {
        name: 'Other',
        color: '#8b5cf6',
        icon: '🪑',
        description: 'Other / unassigned tables',
        totalSales: 0,
        orderCount: 0,
        tablesCount: 0,
        tableStats: new Map(),
      });
    }

    // Count tables per category
    for (const t of tables) {
      const effectiveCat = t.category || inferDefaultCategory(t.tableNumber);
      if (!categoryStats.has(effectiveCat)) {
        categoryStats.set(effectiveCat, {
          name: effectiveCat,
          color: '#94a3b8',
          icon: '🪑',
          description: '',
          totalSales: 0,
          orderCount: 0,
          tablesCount: 0,
          tableStats: new Map(),
        });
      }
      const entry = categoryStats.get(effectiveCat);
      entry.tablesCount += 1;
      entry.tableStats.set(String(t._id), {
        tableId: t._id,
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        status: t.status,
        totalSales: 0,
        orderCount: 0,
      });
    }

    // Process all paid orders
    let grandTotalSales = 0;
    let grandTotalOrders = paidOrders.length;

    for (const ord of paidOrders) {
      const orderAmt = ord.settledAmount !== null && ord.settledAmount !== undefined
        ? ord.settledAmount
        : (ord.total || 0);

      grandTotalSales += orderAmt;

      // Identify category: order.tableCategory -> table.category -> inferred from tableNumber
      let targetCat = ord.tableCategory;
      if (!targetCat && ord.table) {
        targetCat = tableCategoryMap.get(String(ord.table));
      }
      if (!targetCat) {
        targetCat = 'Other';
      }

      if (!categoryStats.has(targetCat)) {
        categoryStats.set(targetCat, {
          name: targetCat,
          color: '#94a3b8',
          icon: '🪑',
          description: '',
          totalSales: 0,
          orderCount: 0,
          tablesCount: 0,
          tableStats: new Map(),
        });
      }

      const catEntry = categoryStats.get(targetCat);
      catEntry.totalSales = Math.round((catEntry.totalSales + orderAmt) * 100) / 100;
      catEntry.orderCount += 1;

      // Attribute to specific table if known
      if (ord.table) {
        const tId = String(ord.table);
        if (catEntry.tableStats.has(tId)) {
          const tStat = catEntry.tableStats.get(tId);
          tStat.totalSales = Math.round((tStat.totalSales + orderAmt) * 100) / 100;
          tStat.orderCount += 1;
        }
      }
    }

    grandTotalSales = Math.round(grandTotalSales * 100) / 100;

    // Convert categoryStats map to array with percentages and averages
    const resultCategories = Array.from(categoryStats.values()).map((cat) => {
      const percentage = grandTotalSales > 0 ? Math.round((cat.totalSales / grandTotalSales) * 1000) / 10 : 0;
      const avgOrderValue = cat.orderCount > 0 ? Math.round(cat.totalSales / cat.orderCount) : 0;

      const tablesList = Array.from(cat.tableStats.values()).sort((a, b) => b.totalSales - a.totalSales);

      return {
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        description: cat.description,
        totalSales: cat.totalSales,
        orderCount: cat.orderCount,
        tablesCount: cat.tablesCount,
        percentage,
        avgOrderValue,
        tables: tablesList,
      };
    }).sort((a, b) => b.totalSales - a.totalSales);

    res.json({
      summary: {
        totalSales: grandTotalSales,
        totalOrders: grandTotalOrders,
        period,
      },
      categories: resultCategories,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// 3. CORE TABLE MANAGEMENT
// ─────────────────────────────────────────────────────────────────

// GET /api/tables — List all tables
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

    // Check if any legacy tables need their default category persisted
    const uncatTables = tables.filter((t) => !t.category);
    if (uncatTables.length > 0) {
      for (const t of uncatTables) {
        t.category = inferDefaultCategory(t.tableNumber);
        await Table.updateOne({ _id: t._id }, { $set: { category: t.category } });
      }
    }

    res.json(tables);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/tables/:id — Single table
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

// POST /api/tables — Create table
router.post('/', adminOnly, async (req, res) => {
  try {
    const { tableNumber, capacity, status, category } = req.body;

    if (!tableNumber || !String(tableNumber).trim()) {
      return res.status(400).json({ message: 'Table number is required' });
    }

    const trimmedNumber = String(tableNumber).trim();
    const existing = await Table.findOne({ tableNumber: trimmedNumber });
    if (existing) {
      return res.status(400).json({ message: `Table ${trimmedNumber} already exists` });
    }

    const effectiveCategory = category && String(category).trim()
      ? String(category).trim()
      : inferDefaultCategory(trimmedNumber);

    const table = await Table.create({
      tableNumber: trimmedNumber,
      capacity: Number(capacity) || 4,
      status: status || 'available',
      category: effectiveCategory,
    });

    await log({
      user: req.user,
      action: 'CREATE',
      module: 'Tables',
      description: `${req.user.name} added Table ${table.tableNumber} in category "${table.category}" (Capacity: ${table.capacity})`,
    });

    res.status(201).json(table);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT /api/tables/:id — Update table
router.put('/:id', managerOrAdmin, async (req, res) => {
  try {
    const { tableNumber, capacity, status, category } = req.body;
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

    if (category !== undefined && String(category).trim()) {
      table.category = String(category).trim();
    }

    if (status !== undefined) {
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
      description: `${req.user.name} updated Table ${table.tableNumber} (Category: ${table.category})`,
    });

    res.json(table);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PATCH /api/tables/:id/category — Quick reassign table to category (e.g. Move ratnadeep to Other)
router.patch('/:id/category', managerOrAdmin, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category || !String(category).trim()) {
      return res.status(400).json({ message: 'Category is required' });
    }

    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

    const oldCategory = table.category;
    table.category = String(category).trim();
    await table.save();

    await log({
      user: req.user,
      action: 'UPDATE',
      module: 'Tables',
      description: `${req.user.name} moved Table ${table.tableNumber} from "${oldCategory}" to "${table.category}"`,
    });

    res.json(table);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE /api/tables/:id — Delete table
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const table = await Table.findById(req.params.id);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }

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
