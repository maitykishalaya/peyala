const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  taxPercent: { type: Number, default: 5, min: 0 },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  notes: { type: String, trim: true },
  variant: {
    name: { type: String, trim: true },
    price: { type: Number, min: 0 },
  },
  selectedAddons: [{
    addon: { type: mongoose.Schema.Types.ObjectId, ref: 'Addon' },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  }],
  status: {
    type: String,
    enum: ['pending', 'preparing', 'served', 'cancelled'],
    default: 'pending',
  },
  roundNumber: { type: Number, default: 1 },
  effectiveTime: { type: Date, default: null },
}, { timestamps: true });

const kotRoundSchema = new mongoose.Schema({
  roundNumber: { type: Number, required: true },
  roundTag: { type: String, default: '[INITIAL ORDER]' },
  items: [{
    name: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    notes: { type: String, default: '' },
    variantName: { type: String, default: '' },
    addons: [{ type: String }],
  }],
  printed: { type: Boolean, default: false },
  printedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  effectiveTime: { type: Date, default: null },
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
  items: [orderItemSchema],
  kotRounds: [kotRoundSchema],
  status: {
    type: String,
    enum: ['open', 'preparing', 'served', 'billed', 'paid', 'cancelled'],
    default: 'open',
  },
  orderNumber: { type: Number },
  billNumber: { type: Number, index: true, default: null },
  fiscalQuarter: { type: String, index: true, default: null },
  billedAt: { type: Date, default: null },
  tableCategory: { type: String, trim: true, default: 'Indoor', index: true },
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
    enum: ['cash', 'card', 'upi', 'due', 'other', 'part', null],
    default: null,
  },
  paymentBreakdown: {
    cash: { type: Number, default: 0 },
    upi: { type: Number, default: 0 },
    card: { type: Number, default: 0 },
    due: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, trim: true },
  customerPhone: { type: String, trim: true },
  dueAmount: { type: Number, default: 0 },
  dueSettled: { type: Boolean, default: false },
  dueSettledAmount: { type: Number, default: 0 },
  dueSettledAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  billPrinted: { type: Boolean, default: false },
  billPrintedAt: { type: Date, default: null },
  billPrintQueued: { type: Boolean, default: false },
  billPrintQueuedAt: { type: Date, default: null },
  billPrintSeq: { type: Number, default: 0 },
  foodServedAt: { type: Date, default: null },
  effectiveActiveTime: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

orderSchema.index({ billPrintQueued: 1 });
orderSchema.index({ status: 1, billPrinted: 1 });
orderSchema.index({ customer: 1, dueSettled: 1 });
orderSchema.index({ paymentMethod: 1, dueSettled: 1 });
orderSchema.index({ fiscalQuarter: 1, billNumber: 1 });

// Static helper to calculate order financial totals excluding cancelled items
orderSchema.statics.calcTotals = function(items = [], discountInput = 0, discountType = 'flat') {
  let subtotal = 0;
  const validItems = [];

  for (const item of items) {
    if (item.status === 'cancelled') continue;
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const taxPct = item.taxPercent !== undefined ? Number(item.taxPercent) : 5;

    const lineTotal = price * qty;
    subtotal += lineTotal;
    validItems.push({ lineTotal, taxPct });
  }

  const cleanSubtotal = Math.round(subtotal * 100) / 100;

  // Handle discountType: 'percentage' vs 'flat'
  let cleanDiscount = 0;
  const rawValue = Math.max(0, Number(discountInput) || 0);

  if (discountType === 'percentage') {
    cleanDiscount = Math.round(((cleanSubtotal * rawValue) / 100) * 100) / 100;
  } else {
    cleanDiscount = Math.round(rawValue * 100) / 100;
  }

  // Discount cannot exceed subtotal
  cleanDiscount = Math.min(cleanDiscount, cleanSubtotal);
  cleanDiscount = Math.max(0, cleanDiscount);

  // Discounted taxable base
  const discountedBase = Math.max(0, cleanSubtotal - cleanDiscount);

  // Calculate GST / tax after discount on the discounted taxable base
  let taxAmount = 0;
  if (cleanSubtotal > 0 && discountedBase > 0) {
    for (const it of validItems) {
      const itemDiscountedBase = it.lineTotal * (discountedBase / cleanSubtotal);
      const lineTax = (itemDiscountedBase * it.taxPct) / 100;
      taxAmount += lineTax;
    }
  }

  const cleanTax = Math.round(taxAmount * 100) / 100;
  const rawTotal = Math.max(0, Math.round((discountedBase + cleanTax) * 100) / 100);

  return {
    subtotal: cleanSubtotal,
    taxAmount: cleanTax,
    discountType: discountType === 'percentage' ? 'percentage' : 'flat',
    discountValue: Math.round(rawValue * 100) / 100,
    discount: cleanDiscount,
    total: Math.round(rawTotal),
  };
};

orderSchema.index({ table: 1, status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
