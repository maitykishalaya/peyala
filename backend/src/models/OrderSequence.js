const mongoose = require('mongoose');

const orderSequenceSchema = new mongoose.Schema({
  _id: { type: String, required: true, default: 'orderNumber' },
  seq: { type: Number, default: 4500 },
}, { timestamps: true });

module.exports = mongoose.model('OrderSequence', orderSequenceSchema);
