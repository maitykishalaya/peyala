/**
 * Peyala Synthetic Test Data Generator & Seeder
 * Populates strictly synthetic, isolated test data for load & performance testing.
 * Zero real customer data, zero real staff details, zero real financials.
 */

const path = require('path');
const mongoose = require(path.join(__dirname, '../backend/node_modules/mongoose'));
const bcrypt = require(path.join(__dirname, '../backend/node_modules/bcryptjs'));

async function seedSyntheticData(dbUri, options = {}) {
  const {
    catalogSize = 100,
    tableCount = 12,
    inventoryCount = 30,
    runId = `run_${Date.now()}`,
  } = options;

  console.log(`[SyntheticSeeder] Connecting to isolated test DB: ${dbUri}`);
  const conn = await mongoose.createConnection(dbUri, {
    serverSelectionTimeoutMS: 5000,
    family: 4,
  }).asPromise();

  console.log(`[SyntheticSeeder] Connected! Generating ${catalogSize} synthetic menu items, ${tableCount} tables, and test accounts...`);

  // 1. Synthetic Accounts
  const accountsCol = conn.collection('accounts');
  await accountsCol.deleteMany({});
  const testAccounts = [
    { name: 'Cash Counter (Synthetic)', type: 'Cash', balance: 10000, isSystem: true, testRunId: runId },
    { name: 'UPI Online (Synthetic)', type: 'UPI', balance: 25000, isSystem: true, testRunId: runId },
    { name: 'Petty Cash (Synthetic)', type: 'Cash', balance: 5000, isSystem: false, testRunId: runId },
  ];
  await accountsCol.insertMany(testAccounts);

  // 2. Synthetic Users
  const usersCol = conn.collection('users');
  await usersCol.deleteMany({});
  const testPasswordHash = await bcrypt.hash('synthtest123', 10);
  const testUsers = [
    {
      name: 'Synthetic Test Admin',
      email: 'admin@peyala.test',
      password: testPasswordHash,
      role: 'admin',
      isActive: true,
      testRunId: runId,
    },
    {
      name: 'Synthetic Test Cashier',
      email: 'cashier@peyala.test',
      password: testPasswordHash,
      role: 'staff',
      isActive: true,
      testRunId: runId,
    },
    {
      name: 'Synthetic Demo View',
      email: 'viewer@peyala.com',
      password: await bcrypt.hash('peyala123', 10),
      role: 'viewer',
      isActive: true,
      testRunId: runId,
    },
  ];
  await usersCol.insertMany(testUsers);

  // 3. Synthetic Dining Tables
  const tablesCol = conn.collection('tables');
  await tablesCol.deleteMany({});
  const testTables = [];
  const sections = ['Indoor', 'Outdoor', 'Pick Up'];
  for (let i = 1; i <= tableCount; i++) {
    testTables.push({
      tableNumber: `T-${i}`,
      category: sections[(i - 1) % sections.length],
      capacity: (i % 3 + 1) * 2,
      status: 'available',
      activeOrder: null,
      testRunId: runId,
    });
  }
  await tablesCol.insertMany(testTables);

  // 4. Synthetic Menu Categories
  const categoriesCol = conn.collection('menucategories');
  await categoriesCol.deleteMany({});
  const catNames = ['Beverages', 'Starters', 'Main Course', 'Burgers & Wraps', 'Desserts', 'Momos', 'Breads'];
  const testCategories = catNames.map((name, idx) => ({
    name,
    sortOrder: idx,
    isActive: true,
    testRunId: runId,
  }));
  const catResult = await categoriesCol.insertMany(testCategories);
  const catIds = Object.values(catResult.insertedIds);

  // 5. Synthetic Menu Items (Scalable: 25, 100, 500, 1000)
  const menuCol = conn.collection('menuitems');
  await menuCol.deleteMany({});
  const menuDocs = [];

  const baseDishes = [
    { name: 'Special Milk Chai', price: 25, isVeg: true, cat: 'Beverages' },
    { name: 'Cardamom Lemon Tea', price: 20, isVeg: true, cat: 'Beverages' },
    { name: 'Chilleda Chicken', price: 210, isVeg: false, cat: 'Main Course' },
    { name: 'Chilli Chicken', price: 190, isVeg: false, cat: 'Starters' },
    { name: 'Chilli Paneer', price: 170, isVeg: true, cat: 'Starters' },
    { name: 'Chicken Manchurian', price: 195, isVeg: false, cat: 'Main Course' },
    { name: 'Chilleda Chicken Burger', price: 140, isVeg: false, cat: 'Burgers & Wraps' },
    { name: 'Steamed Chicken Momo', price: 110, isVeg: false, cat: 'Momos' },
    { name: 'Crispy Veg Burger', price: 95, isVeg: true, cat: 'Burgers & Wraps' },
    { name: 'Butter Naan', price: 40, isVeg: true, cat: 'Breads' },
    { name: 'Cold Coffee with Ice Cream', price: 90, isVeg: true, cat: 'Beverages' },
    { name: 'Hot Chocolate Fudge', price: 120, isVeg: true, cat: 'Desserts' },
  ];

  for (let i = 0; i < catalogSize; i++) {
    const base = baseDishes[i % baseDishes.length];
    const catIdx = i % catIds.length;
    const suffix = i >= baseDishes.length ? ` (Var ${Math.floor(i / baseDishes.length) + 1})` : '';
    const itemCode = `SYNTH_${String(i + 1).padStart(4, '0')}`;

    menuDocs.push({
      name: `${base.name}${suffix}`,
      shortCode: itemCode,
      category: catIds[catIdx],
      categoryName: catNames[catIdx],
      price: base.price + (i % 5) * 10,
      costPrice: Math.round((base.price + (i % 5) * 10) * 0.45),
      isVeg: base.isVeg,
      taxPercent: 5,
      gstRate: 5,
      isAvailable: true,
      testRunId: runId,
      isSynthetic: true,
    });
  }
  await menuCol.insertMany(menuDocs);

  // 6. Synthetic Inventory Items
  const invCol = conn.collection('inventoryitems');
  await invCol.deleteMany({});
  const testInv = [];
  const rawMaterials = [
    { name: 'Assam Tea Leaves', unit: 'kg', stock: 15, minStock: 5, unitPrice: 320 },
    { name: 'Fresh Milk', unit: 'L', stock: 45, minStock: 10, unitPrice: 58 },
    { name: 'Chicken Breast Cut', unit: 'kg', stock: 25, minStock: 8, unitPrice: 240 },
    { name: 'Paneer Cube', unit: 'kg', stock: 12, minStock: 4, unitPrice: 360 },
    { name: 'Refined Oil', unit: 'L', stock: 30, minStock: 10, unitPrice: 135 },
    { name: 'Burger Buns', unit: 'pcs', stock: 80, minStock: 20, unitPrice: 8 },
    { name: 'Basmati Rice', unit: 'kg', stock: 50, minStock: 15, unitPrice: 95 },
  ];
  for (let i = 0; i < inventoryCount; i++) {
    const raw = rawMaterials[i % rawMaterials.length];
    const suffix = i >= rawMaterials.length ? ` #${Math.floor(i / rawMaterials.length) + 1}` : '';
    testInv.push({
      name: `${raw.name}${suffix}`,
      unit: raw.unit,
      currentStock: raw.stock,
      minStock: raw.minStock,
      unitPrice: raw.unitPrice,
      testRunId: runId,
      isSynthetic: true,
    });
  }
  await invCol.insertMany(testInv);

  // 7. Initialize clean Orders, Sales, SyncOutbox
  await conn.collection('orders').deleteMany({});
  await conn.collection('salesentries').deleteMany({});
  await conn.collection('syncoutboxes').deleteMany({});
  await conn.collection('expenseleaks').deleteMany({});
  await conn.collection('wastages').deleteMany({});

  console.log(`[SyntheticSeeder] ✅ Finished seeding isolated sandbox: ${menuDocs.length} menu items, ${testTables.length} tables, ${testInv.length} inventory items.`);
  await conn.close();
}

module.exports = { seedSyntheticData };
