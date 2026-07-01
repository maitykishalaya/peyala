// ─────────────────────────────────────────────────────────────────
// Staff Model
// Tracks salary, advances paid, and remaining salary due.
//
// New fields:
//   totalAdvancePaid  — total advance payments made
//   salaryMonth       — tracks salary payment per month
// ─────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  position: { type: String, required: true },
  phone: { type: String },
  address: { type: String },
  joiningDate: { type: Date },

  // Monthly salary agreed amount
  monthlySalary: { type: Number, default: 0 },

  // Running totals updated on every salary/advance payment
  totalSalaryPaid: { type: Number, default: 0 },   // full salary payments only
  totalAdvancePaid: { type: Number, default: 0 },   // advance payments only
  totalBonusPaid: { type: Number, default: 0 },     // bonus payments

  status: { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' },
  notes: { type: String },
  photo: { type: String },
}, { timestamps: true });

// Virtual: total paid (salary + advance + bonus)
staffSchema.virtual('totalPaid').get(function() {
  return (this.totalSalaryPaid || 0) + (this.totalAdvancePaid || 0) + (this.totalBonusPaid || 0);
});

staffSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Staff', staffSchema);
