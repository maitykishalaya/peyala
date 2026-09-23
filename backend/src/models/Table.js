const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  tableNumber: { type: String, required: true, unique: true, trim: true },
  capacity: { type: Number, default: 4, min: 1 },
  status: {
    type: String,
    enum: ['available', 'occupied', 'reserved'],
    default: 'available',
  },
  category: { type: String, trim: true, default: 'Indoor' },
  activeOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
}, { timestamps: true });

tableSchema.index({ status: 1 });
tableSchema.index({ category: 1 });

module.exports = mongoose.model('Table', tableSchema);
