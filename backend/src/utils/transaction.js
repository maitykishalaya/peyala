const mongoose = require('mongoose');

/**
 * Checks whether the current MongoDB connection supports multi-document transactions.
 * Transactions require a replica set or sharded cluster (mongos).
 * Standalone MongoDB instances do not support transactions.
 */
function isTransactionSupported() {
  try {
    const topology = mongoose.connection?.client?.topology;
    const type = topology?.description?.type;
    return type === 'ReplicaSetWithPrimary' || type === 'Sharded';
  } catch (_) {
    return false;
  }
}

/**
 * Runs the given async callback inside a MongoDB transaction if supported.
 * If running on a standalone MongoDB instance, executes the callback directly without a session.
 *
 * @param {Function} callback - async (session) => result
 * @returns {Promise<any>}
 */
async function withOptionalTransaction(callback) {
  if (!isTransactionSupported()) {
    return await callback(null);
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (err) {
    if (
      err.message &&
      (err.message.includes('replica set member or mongos') ||
        err.message.includes('Transaction numbers are only allowed') ||
        err.code === 20)
    ) {
      return await callback(null);
    }
    throw err;
  }

  try {
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    throw err;
  } finally {
    try {
      session.endSession();
    } catch (_) {}
  }
}

module.exports = {
  isTransactionSupported,
  withOptionalTransaction,
};
