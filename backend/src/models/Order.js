const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  taxPercent: { type: Number, default: 5, min: 0 },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  notes: { type: String, trim: true },
  status: {
    type: String,
    enum: ['pending', 'preparing', 'served', 'cancelled'],
    default: 'pending',
  },
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
  items: [orderItemSchema],
  status: {
    type: String,
    enum: ['open', 'preparing', 'served', 'billed', 'paid', 'cancelled'],
    default: 'open',
  },
  orderNumber: { type: Number },
  kotCount: { type: Number, default: 1 },
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountType: {
    type: String,
    enum: ['flat', 'percentage'],
    default: 'flat',
  },
  discountValue: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  settledAmount: { type: Number, default: null },
  waivedAmount: { type: Number, default: 0, min: 0 },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'other', null],
    default: null,
  },
  paidAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Static helper to calculate order financial totals excluding cancelled items
orderSchema.statics.calcTotals = function(items = [], discountInput = 0, discountType = 'flat') {
  let subtotal = 0;
  let taxAmount = 0;

  for (const item of items) {
    if (item.status === 'cancelled') continue;
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const taxPct = Number(item.taxPercent) || 0;

    const lineTotal = price * qty;
    const lineTax = (lineTotal * taxPct) / 100;

    subtotal += lineTotal;
    taxAmount += lineTax;
  }

  // Handle discountType: 'percentage' vs 'flat'
  let cleanDiscount = 0;
  const rawValue = Math.max(0, Number(discountInput) || 0);

  if (discountType === 'percentage') {
    cleanDiscount = (subtotal * rawValue) / 100;
  } else {
    cleanDiscount = rawValue;
  }

  // Discount cannot exceed subtotal + taxAmount
  cleanDiscount = Math.min(cleanDiscount, subtotal + taxAmount);
  cleanDiscount = Math.max(0, cleanDiscount);

  const rawTotal = Math.max(0, subtotal + taxAmount - cleanDiscount);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    discountType: discountType === 'percentage' ? 'percentage' : 'flat',
    discountValue: Math.round(rawValue * 100) / 100,
    discount: Math.round(cleanDiscount * 100) / 100,
    total: Math.round(rawTotal * 100) / 100,
  };
};

orderSchema.index({ table: 1, status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
