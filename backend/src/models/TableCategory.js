// ─────────────────────────────────────────────────────────────────
// TableCategory Model
// Stores floor categories / zones for dining outlet design
// (e.g. Indoor, Outdoor, Other, Pick Up, Rooftop, Balcony)
// ─────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const tableCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  order: { type: Number, default: 0 },
  color: { type: String, default: '#6366f1' },
  icon: { type: String, default: '🪑' },
  description: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

tableCategorySchema.index({ isActive: 1, order: 1, name: 1 });

// Helper to seed initial categories if none exist
tableCategorySchema.statics.seedDefaults = async function() {
  const count = await this.countDocuments();
  if (count === 0) {
    const defaults = [
      { name: 'Indoor', order: 1, color: '#3b82f6', icon: '🏠', description: 'Main indoor air-conditioned dining area' },
      { name: 'Outdoor', order: 2, color: '#10b981', icon: '🌳', description: 'Patio, garden and open-air seating' },
      { name: 'Pick Up', order: 3, color: '#f59e0b', icon: '📦', description: 'Takeaway counter and pickup zone' },
      { name: 'Other', order: 4, color: '#8b5cf6', icon: '🪑', description: 'Special or overflow tables' },
    ];
    await this.insertMany(defaults);
  }
};

module.exports = mongoose.model('TableCategory', tableCategorySchema);
