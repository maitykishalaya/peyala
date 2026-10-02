const mongoose = require('mongoose');

const kotSequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "KOT-2026-10-02"
  seq: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('KotSequence', kotSequenceSchema);
