// ─────────────────────────────────────────────────────────────────
// SalesEntry Model
// Records one day's sales across all channels.
//
// Changes in this version:
//   1. 'swiggy' renamed to 'fatafat' (Fatafat Sales)
//   2. outletSales is now AUTO-CALCULATED from paymentBreakdown
//      (cash + upi + card + bankTransfer) — no manual entry needed
//   3. totalRevenue bug fixed — pre('save') only runs on .save()
//      not on findByIdAndUpdate. We now always calculate totalRevenue
//      explicitly in the route before saving.
//   4. paymentBreakdown tracks which mode was used for outlet sales
//      so we know how much to credit to Cash Counter vs Current Account
// ─────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

// ── Sub-schema for platform sales (Zomato / Fatafat) ─────────────
// Tracks the full breakdown from platform payout to net settlement
const platformSalesSchema = new mongoose.Schema({
  grossSales: { type: Number, default: 0 },          // total ordered on platform
  platformDiscount: { type: Number, default: 0 },    // discount platform absorbs
  restaurantDiscount: { type: Number, default: 0 },  // discount restaurant absorbs
  commission: { type: Number, default: 0 },          // platform commission %
  gst: { type: Number, default: 0 },                 // GST deducted by platform
  netSettlement: { type: Number, default: 0 },       // what actually gets paid to you
  settlementDate: { type: Date },                    // when payment hits your account
  isSettled: { type: Boolean, default: false },      // has payout been received?
  receivedIn: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' }, // account where net settlement arrives
}, { _id: false });

// ── Main Sales Entry Schema ───────────────────────────────────────
const salesEntrySchema = new mongoose.Schema({

  // Date of sales (one entry per day)
  date: { type: Date, required: true, default: Date.now },

  // ── OUTLET SALES breakdown ───────────────────────────────────
  // Individual payment mode amounts for walk-in / counter sales.
  // outletSales = sum of all these (auto-calculated in route).
  paymentBreakdown: {
    cash: { type: Number, default: 0 },          // goes to Cash Counter
    upi: { type: Number, default: 0 },           // goes to Current Account
    card: { type: Number, default: 0 },          // goes to Current Account
    bankTransfer: { type: Number, default: 0 },  // goes to Current Account
  },

  // Total outlet sales = cash + upi + card + bankTransfer
  // AUTO-CALCULATED — do not set manually
  outletSales: { type: Number, default: 0 },

  // ── PLATFORM SALES ───────────────────────────────────────────
  zomato: platformSalesSchema,    // Zomato — entered only after payout received
  fatafat: platformSalesSchema,   // Fatafat (was Swiggy) — same logic

  // ── OTHER SALES ──────────────────────────────────────────────
  otherSales: { type: Number, default: 0 },             // catering, corporate, etc.
  otherSalesReceivedIn: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  otherSalesDescription: { type: String },

  // ── TOTAL ────────────────────────────────────────────────────
  // Auto-calculated = outletSales + zomato.netSettlement + fatafat.netSettlement + otherSales
  totalRevenue: { type: Number, default: 0 },

  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });


// ── Static helper: calculate totals from raw body data ───────────
// Called in the route BEFORE saving, because pre('save') doesn't
// fire on findByIdAndUpdate — this ensures totalRevenue is always correct.
salesEntrySchema.statics.calcTotals = function(data) {
  // Sum up outlet payment modes to get outletSales
  const pb = data.paymentBreakdown || {};
  const outletSales = (pb.cash || 0) + (pb.upi || 0) + (pb.card || 0) + (pb.bankTransfer || 0);

  // Sum up all revenue channels
  const totalRevenue = outletSales
    + (data.zomato?.netSettlement || 0)
    + (data.fatafat?.netSettlement || 0)
    + (data.otherSales || 0);

  return { outletSales, totalRevenue };
};

// ── Index ────────────────────────────────────────────────────────
// Dashboard and reports constantly filter/aggregate SalesEntry by date range.
salesEntrySchema.index({ date: -1 });

module.exports = mongoose.model('SalesEntry', salesEntrySchema);
