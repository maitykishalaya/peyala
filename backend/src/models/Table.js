const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  tableNumber: { type: String, required: true, unique: true, trim: true },
  capacity: { type: Number, default: 4, min: 1 },
  status: {
    type: String,
    enum: ['available', 'occupied', 'reserved'],
    default: 'available',
  },
  activeOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
}, { timestamps: true });

tableSchema.index({ status: 1 });

module.exports = mongoose.model('Table', tableSchema);
