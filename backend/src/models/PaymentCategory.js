// ─────────────────────────────────────────────────────────────────
// PaymentCategory Model
// Stores editable categories and subcategories for payments.
// This replaces the hardcoded PAYMENT_CATEGORIES array.
//
// Structure:
//   Category: "Staff Expenses"
//     Subcategories: ["Arpan Mandal", "Joydev Mahato", "Rahul Das", "Temporary Staff"]
//
// Users can add/remove categories and subcategories from Settings.
// ─────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const paymentCategorySchema = new mongoose.Schema({
  // Top-level category name e.g. "Staff Expenses"
  name: { type: String, required: true, trim: true, unique: true },

  // List of subcategories under this category
  // e.g. ["Arpan Mandal", "Joydev Mahato", "Temporary Staff"]
  subcategories: [{ type: String, trim: true }],

  // Display order in dropdowns
  order: { type: Number, default: 0 },

  // Whether this category is active (soft delete)
  isActive: { type: Boolean, default: true },

  // Icon/emoji for the category (optional, shown in UI)
  icon: { type: String, default: '💰' },

  // Colour for charts
  color: { type: String, default: '#6366f1' },

}, { timestamps: true });

// ── Index ────────────────────────────────────────────────────────
// categories.js queries find({ isActive: true }).sort('order name').
paymentCategorySchema.index({ isActive: 1, order: 1, name: 1 });

module.exports = mongoose.model('PaymentCategory', paymentCategorySchema);
