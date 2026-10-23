const mongoose = require('mongoose');

const ownerNoteSchema = new mongoose.Schema({
  text: { type: String, default: '' },
  lastUpdatedBy: { type: String, default: '' },
}, { timestamps: true });

ownerNoteSchema.statics.getSingleton = async function() {
  let note = await this.findOne().sort({ updatedAt: -1 });
  if (!note) {
    note = await this.create({ text: '', lastUpdatedBy: '' });
  }
  return note;
};

const syncPlugin = require('../utils/syncPlugin');
ownerNoteSchema.plugin(syncPlugin, { modelName: 'OwnerNote' });

module.exports = mongoose.model('OwnerNote', ownerNoteSchema);
