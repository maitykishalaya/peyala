require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Account = require('../models/Account');
const Supplier = require('../models/Supplier');
const InventoryCategory = require('../models/InventoryCategory');
const InventoryItem = require('../models/InventoryItem');
const Staff = require('../models/Staff');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing
  await Promise.all([
    User.deleteMany({}), Account.deleteMany({}), Supplier.deleteMany({}),
    InventoryCategory.deleteMany({}), InventoryItem.deleteMany({}), Staff.deleteMany({})
  ]);

  // Admin user
  await User.create({ name: 'Kishalaya Maity', email: 'admin@peyala.com', password: 'peyala123', role: 'admin' });
  console.log('✅ Admin user created: admin@peyala.com / peyala123');

  // Accounts
  const accounts = await Account.insertMany([
    { name: 'Cash Counter', type: 'cash', openingBalance: 15000, currentBalance: 15000, color: '#10b981' },
    { name: 'Current Account', type: 'bank', openingBalance: 85000, currentBalance: 85000, bankName: 'HDFC Bank', color: '#6366f1' },
    { name: 'Petty Cash', type: 'cash', openingBalance: 3000, currentBalance: 3000, color: '#f59e0b' },
    { name: 'UPI Account', type: 'digital', openingBalance: 0, currentBalance: 0, color: '#8b5cf6' },
  ]);
  console.log('✅ Accounts created');

  // Suppliers
  const suppliers = await Supplier.insertMany([
    { name: 'Gate Bazaar', phone: '9800000001', address: 'Howrah Market', category: 'Vegetables & General' },
    { name: 'Bajrang Store', phone: '9800000002', address: 'Howrah', category: 'Dry Goods & Spices' },
    { name: 'Bunty Chicken', phone: '9800000003', address: 'Local Market', category: 'Poultry & Meat' },
    { name: 'Fresh Fish Market', phone: '9800000004', address: 'Howrah Ghat', category: 'Fish & Seafood' },
    { name: 'Amul Distributor', phone: '9800000005', address: 'Howrah', category: 'Dairy' },
    { name: 'Packaging Supplies Co', phone: '9800000006', address: 'Kolkata', category: 'Packaging' },
  ]);
  console.log('✅ Suppliers created');

  // Inventory Categories
  const cats = await InventoryCategory.insertMany([
    { name: 'Vegetables', icon: '🥦', color: '#10b981' },
    { name: 'Chicken & Meat', icon: '🍗', color: '#ef4444' },
    { name: 'Fish & Seafood', icon: '🐟', color: '#3b82f6' },
    { name: 'Dairy', icon: '🥛', color: '#f59e0b' },
    { name: 'Dry Goods & Spices', icon: '🌶️', color: '#f97316' },
    { name: 'Beverages', icon: '☕', color: '#8b5cf6' },
    { name: 'Packaging', icon: '📦', color: '#6b7280' },
    { name: 'Sauces & Condiments', icon: '🫙', color: '#ec4899' },
  ]);

  const catMap = {};
  cats.forEach(c => { catMap[c.name] = c._id; });
  console.log('✅ Categories created');

  // Inventory Items
  await InventoryItem.insertMany([
    // Vegetables
    { name: 'Capsicum', category: catMap['Vegetables'], unit: 'kg', currentStock: 5, minimumStock: 1, lastPurchasePrice: 80, averageCost: 80, preferredSupplier: suppliers[0]._id },
    { name: 'Tomato', category: catMap['Vegetables'], unit: 'kg', currentStock: 8, minimumStock: 2, lastPurchasePrice: 30, averageCost: 30, preferredSupplier: suppliers[0]._id },
    { name: 'Onion', category: catMap['Vegetables'], unit: 'kg', currentStock: 10, minimumStock: 3, lastPurchasePrice: 40, averageCost: 40, preferredSupplier: suppliers[0]._id },
    { name: 'Cucumber', category: catMap['Vegetables'], unit: 'kg', currentStock: 3, minimumStock: 1, lastPurchasePrice: 30, averageCost: 30, preferredSupplier: suppliers[0]._id },
    { name: 'Lettuce', category: catMap['Vegetables'], unit: 'kg', currentStock: 1, minimumStock: 0.5, lastPurchasePrice: 120, averageCost: 120, preferredSupplier: suppliers[0]._id },
    { name: 'Potato', category: catMap['Vegetables'], unit: 'kg', currentStock: 15, minimumStock: 5, lastPurchasePrice: 25, averageCost: 25, preferredSupplier: suppliers[0]._id },
    // Chicken
    { name: 'Chicken Breast', category: catMap['Chicken & Meat'], unit: 'kg', currentStock: 6, minimumStock: 2, lastPurchasePrice: 280, averageCost: 280, preferredSupplier: suppliers[2]._id },
    { name: 'Chicken Whole', category: catMap['Chicken & Meat'], unit: 'kg', currentStock: 10, minimumStock: 3, lastPurchasePrice: 200, averageCost: 200, preferredSupplier: suppliers[2]._id },
    // Dairy
    { name: 'Milk', category: catMap['Dairy'], unit: 'litre', currentStock: 10, minimumStock: 3, lastPurchasePrice: 60, averageCost: 60, preferredSupplier: suppliers[4]._id },
    { name: 'Butter', category: catMap['Dairy'], unit: 'kg', currentStock: 2, minimumStock: 0.5, lastPurchasePrice: 480, averageCost: 480, preferredSupplier: suppliers[4]._id },
    { name: 'Cheese', category: catMap['Dairy'], unit: 'kg', currentStock: 1.5, minimumStock: 0.5, lastPurchasePrice: 600, averageCost: 600, preferredSupplier: suppliers[4]._id },
    // Beverages
    { name: 'Tea Leaves', category: catMap['Beverages'], unit: 'kg', currentStock: 3, minimumStock: 1, lastPurchasePrice: 400, averageCost: 400, preferredSupplier: suppliers[1]._id },
    { name: 'Coffee Powder', category: catMap['Beverages'], unit: 'kg', currentStock: 2, minimumStock: 0.5, lastPurchasePrice: 600, averageCost: 600, preferredSupplier: suppliers[1]._id },
    { name: 'Sugar', category: catMap['Dry Goods & Spices'], unit: 'kg', currentStock: 20, minimumStock: 5, lastPurchasePrice: 42, averageCost: 42, preferredSupplier: suppliers[1]._id },
    // Packaging
    { name: 'Takeaway Boxes (Sm)', category: catMap['Packaging'], unit: 'piece', currentStock: 200, minimumStock: 50, lastPurchasePrice: 4, averageCost: 4, preferredSupplier: suppliers[5]._id },
    { name: 'Takeaway Boxes (Lg)', category: catMap['Packaging'], unit: 'piece', currentStock: 150, minimumStock: 50, lastPurchasePrice: 6, averageCost: 6, preferredSupplier: suppliers[5]._id },
    { name: 'Paper Cups', category: catMap['Packaging'], unit: 'piece', currentStock: 300, minimumStock: 100, lastPurchasePrice: 2, averageCost: 2, preferredSupplier: suppliers[5]._id },
  ]);
  console.log('✅ Inventory items created');

  // Staff
  await Staff.insertMany([
    { name: 'Arpan Mandal', position: 'Chef', phone: '9700000001', joiningDate: new Date('2023-01-15'), monthlySalary: 18000, status: 'active' },
    { name: 'Joydev Mahato', position: 'Assistant Chef', phone: '9700000002', joiningDate: new Date('2023-03-01'), monthlySalary: 14000, status: 'active' },
    { name: 'Rahul Das', position: 'Waiter', phone: '9700000003', joiningDate: new Date('2023-06-01'), monthlySalary: 10000, status: 'active' },
  ]);
  console.log('✅ Staff created');

  await seedCategories();

  console.log('\n🍵 Peyala seed complete!');
  console.log('Login: admin@peyala.com / peyala123');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });

// ── Seed Payment Categories (run separately if needed) ────────────
async function seedCategories() {
  const PaymentCategory = require('../models/PaymentCategory');
  await PaymentCategory.deleteMany({});
  await PaymentCategory.insertMany([
    { name: 'Raw Materials', icon: '🥦', color: '#10b981', order: 1, subcategories: [] },
    { name: 'Staff Expenses', icon: '👥', color: '#6366f1', order: 2, subcategories: ['Arpan Mandal', 'Joydev Mahato', 'Rahul Das', 'Temporary Staff', 'Petrol Allowance'] },
    { name: 'Utilities', icon: '⚡', color: '#f59e0b', order: 3, subcategories: ['Electricity', 'Gas', 'Water', 'Internet'] },
    { name: 'Serving Materials', icon: '🍽️', color: '#8b5cf6', order: 4, subcategories: ['Plates', 'Cups', 'Packaging', 'Straws'] },
    { name: 'Marketing', icon: '📢', color: '#ec4899', order: 5, subcategories: ['Zomato Ads', 'Social Media', 'Flyers'] },
    { name: 'Repairs & Maintenance', icon: '🔧', color: '#f97316', order: 6, subcategories: ['Equipment', 'Plumbing', 'Electrical'] },
    { name: 'Sanitation', icon: '🧹', color: '#14b8a6', order: 7, subcategories: ['Cleaning Supplies', 'Pest Control'] },
    { name: 'Transport', icon: '🚗', color: '#3b82f6', order: 8, subcategories: [] },
    { name: 'GST Payment', icon: '🏛️', color: '#ef4444', order: 9, subcategories: [] },
    { name: 'Miscellaneous', icon: '📋', color: '#6b7280', order: 10, subcategories: [] },
  ]);
  console.log('✅ Payment categories seeded');
}
