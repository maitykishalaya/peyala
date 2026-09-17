const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present', 'absent', 'leave', 'holiday', 'halfday'], required: true },
  note: { type: String },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Duty and Shift Time Tracking fields
  dutyHours: { type: Number },
  timeSlots: [{
    entry: { type: String, trim: true },
    exit: { type: String, trim: true },
  }],
  shift1: {
    entry: { type: String, trim: true },
    exit: { type: String, trim: true },
  },
  shift2: {
    entry: { type: String, trim: true },
    exit: { type: String, trim: true },
  },
  totalPresentHours: { type: Number, default: 0 },
  absentHours: { type: Number, default: 0 },
  dailySalary: { type: Number },
  hourlyRate: { type: Number, default: 0 },
  deductionAmount: { type: Number, default: 0 },
  penaltyReason: { type: String, trim: true },
  penaltyAmount: { type: Number, default: 0 },
  payableAmount: { type: Number, default: 0 },
}, { timestamps: true });

attendanceSchema.index({ staff: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
