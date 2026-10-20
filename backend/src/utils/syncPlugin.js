const syncEngine = require('../services/syncEngine');
const realtimeHub = require('../services/realtimeHub');

/**
 * Universal Mongoose Schema Plugin for Local-First Persistence & Realtime Broadcasting
 * Automatically captures every save/create/update/delete operation locally,
 * records it into the SyncOutbox delta queue for the 15-minute cloud sync,
 * and broadcasts immediate sub-10ms events across local network devices.
 */
function syncPlugin(schema, options = {}) {
  const modelName = options.modelName || 'General';

  schema.post('save', function (doc) {
    try {
      const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
      syncEngine.recordMutation(modelName, doc._id, 'update', obj);

      realtimeHub.broadcast(`${modelName.toUpperCase()}_UPDATED`, {
        id: doc._id,
        model: modelName,
        updatedAt: doc.updatedAt || new Date(),
        status: doc.status,
        table: doc.table,
      });
    } catch (_) {}
  });

  schema.post('insertMany', function (docs) {
    if (Array.isArray(docs)) {
      for (const doc of docs) {
        if (doc && doc._id) {
          try {
            const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
            syncEngine.recordMutation(modelName, doc._id, 'insert', obj);
            realtimeHub.broadcast(`${modelName.toUpperCase()}_UPDATED`, {
              id: doc._id,
              model: modelName,
              updatedAt: doc.updatedAt || new Date(),
            });
          } catch (_) {}
        }
      }
    }
  });

  schema.post('findOneAndUpdate', function (doc) {
    if (doc && doc._id) {
      try {
        const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
        syncEngine.recordMutation(modelName, doc._id, 'update', obj);

        realtimeHub.broadcast(`${modelName.toUpperCase()}_UPDATED`, {
          id: doc._id,
          model: modelName,
          updatedAt: doc.updatedAt || new Date(),
          status: doc.status,
          table: doc.table,
        });
      } catch (_) {}
    }
  });

  schema.post('findOneAndDelete', function (doc) {
    if (doc && doc._id) {
      try {
        syncEngine.recordMutation(modelName, doc._id, 'delete');
        realtimeHub.broadcast(`${modelName.toUpperCase()}_DELETED`, {
          id: doc._id,
          model: modelName,
        });
      } catch (_) {}
    }
  });

  schema.post('deleteOne', { document: true, query: false }, function (doc) {
    if (doc && doc._id) {
      try {
        syncEngine.recordMutation(modelName, doc._id, 'delete');
        realtimeHub.broadcast(`${modelName.toUpperCase()}_DELETED`, {
          id: doc._id,
          model: modelName,
        });
      } catch (_) {}
    }
  });
}

module.exports = syncPlugin;
