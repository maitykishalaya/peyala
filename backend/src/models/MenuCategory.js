const mongoose = require('mongoose');

const menuCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

menuCategorySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('MenuCategory', menuCategorySchema);
