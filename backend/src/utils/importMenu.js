require('dotenv').config();
const mongoose = require('mongoose');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');

const menuData = [
  {
    category: 'Snacks',
    description: 'Crispy, fried, and savoury finger foods',
    sortOrder: 1,
    items: [
      { name: 'Paneer Pakora 6pc', price: 200, isVeg: true },
      { name: 'Chicken Pakora 6pc', price: 200, isVeg: false },
      { name: 'French Fries', price: 110, isVeg: true },
      { name: 'Peri Peri Fries', price: 120, isVeg: true },
      { name: 'Chicken Popcorn', price: 170, isVeg: false },
      { name: 'Chicken Strips 4pc', price: 170, isVeg: false },
      { name: 'Chicken Strips 8pc', price: 280, isVeg: false },
      { name: 'Hot Wings 4pc', price: 170, isVeg: false },
      { name: 'Hot Wings 8pc', price: 280, isVeg: false },
      { name: 'Fish Finger 6pc', price: 200, isVeg: false },
      { name: 'Fried Wings in BBQ Sauce 6pc', price: 230, isVeg: false },
      { name: 'Fried Wings in Buffalo Sauce 6pc', price: 230, isVeg: false },
      { name: 'Korean Dragon Chicken Wings 6pc', price: 230, isVeg: false },
    ],
  },
];

async function importMenu(data = menuData) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set in environment!');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB\n');

  let totalAdded = 0;
  let totalUpdated = 0;

  for (const catData of data) {
    // Find or create category
    let category = await MenuCategory.findOne({
      name: { $regex: new RegExp(`^${catData.category.trim()}$`, 'i') },
    });

    if (!category) {
      category = await MenuCategory.create({
        name: catData.category.trim(),
        description: catData.description || '',
        sortOrder: catData.sortOrder || 0,
        isActive: true,
      });
      console.log(`📁 Created Category: "${category.name}" (ID: ${category._id})`);
    } else {
      console.log(`📁 Found Category: "${category.name}" (ID: ${category._id})`);
    }

    // Process items
    for (const item of catData.items) {
      const existing = await MenuItem.findOne({
        name: { $regex: new RegExp(`^${item.name.trim()}$`, 'i') },
        category: category._id,
      });

      if (existing) {
        existing.price = item.price;
        existing.isVeg = item.isVeg !== undefined ? item.isVeg : true;
        existing.taxPercent = item.taxPercent !== undefined ? item.taxPercent : 5;
        if (item.description) existing.description = item.description;
        existing.isAvailable = item.isAvailable !== undefined ? item.isAvailable : true;
        await existing.save();
        console.log(`  ↻ Updated: ${item.name} — ₹${item.price} (${item.isVeg ? 'Veg' : 'Non-Veg'})`);
        totalUpdated++;
      } else {
        await MenuItem.create({
          name: item.name.trim(),
          category: category._id,
          price: item.price,
          isVeg: item.isVeg !== undefined ? item.isVeg : true,
          taxPercent: item.taxPercent !== undefined ? item.taxPercent : 5,
          description: item.description || '',
          isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
        });
        console.log(`  ➕ Added:   ${item.name} — ₹${item.price} (${item.isVeg ? 'Veg' : 'Non-Veg'})`);
        totalAdded++;
      }
    }
  }

  console.log(`\n🎉 Done! Added: ${totalAdded}, Updated: ${totalUpdated}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  importMenu().catch((err) => {
    console.error('❌ Import failed:', err);
    process.exit(1);
  });
}

module.exports = { importMenu };
