const mongoose = require('mongoose');
const realtimeHub = require('../services/realtimeHub');
const syncEngine = require('../services/syncEngine');

/**
 * Deterministically recalculates a customer's Khata ledger:
 * - Computes totalDue strictly from active, non-cancelled orders and customer payments.
 * - Applies payments across unpaid due bills in FIFO sequence if needed.
 * - Computes lifetime active orders count (totalOrders).
 * - Updates the Customer document locally and syncs to Central DB Atlas if reachable.
 * - Emits realtime events for UI synchronization.
 *
 * @param {string|mongoose.Types.ObjectId} customerId
 * @param {object} [options]
 * @param {object} [options.customConn] Optional mongoose connection
 * @returns {Promise<{ customer: object, totalDue: number, totalOrders: number, remainingBillsCount: number }>}
 */
async function recalculateCustomerKhata(customerId, options = {}) {
  if (!customerId) return null;

  const conn = options.customConn || mongoose.connection;
  const db = conn.db || (conn.connection && conn.connection.db);
  if (!db) return null;

  const customerObjId = typeof customerId === 'string' ? new mongoose.Types.ObjectId(customerId) : customerId;
  const CustomerModel = conn.model('Customer');
  const OrderModel = conn.model('Order');
  const CustomerDuePaymentModel = conn.model('CustomerDuePayment');

  const customerDoc = await CustomerModel.findById(customerObjId);
  if (!customerDoc) return null;

  // 1. Fetch all non-cancelled orders for this customer
  const orders = await OrderModel.find({
    customer: customerObjId,
    status: { $ne: 'cancelled' },
  }).sort({ createdAt: 1 });

  // 2. Fetch all payment receipts for this customer
  const payments = await CustomerDuePaymentModel.find({
    customer: customerObjId,
  }).sort({ date: 1 });

  const totalPaymentsPool = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // 3. FIFO Allocation across orders with dueAmount > 0
  let availablePool = totalPaymentsPool;
  let computedTotalDue = 0;
  let remainingBillsCount = 0;

  for (const ord of orders) {
    const billDue = Math.max(0, Number(ord.dueAmount) || 0);
    if (billDue <= 0) continue;

    const covered = Math.min(availablePool, billDue);
    const newSettledAmount = Math.round(covered * 100) / 100;
    const isSettled = newSettledAmount >= (billDue - 0.01);
    const remainingOnBill = Math.max(0, Math.round((billDue - newSettledAmount) * 100) / 100);

    // If order settlement state drifted, update it
    let orderChanged = false;
    if (Math.abs((ord.dueSettledAmount || 0) - newSettledAmount) > 0.01) {
      ord.dueSettledAmount = newSettledAmount;
      orderChanged = true;
    }
    if (ord.dueSettled !== isSettled) {
      ord.dueSettled = isSettled;
      if (isSettled && !ord.dueSettledAt) {
        ord.dueSettledAt = new Date();
      } else if (!isSettled) {
        ord.dueSettledAt = null;
      }
      orderChanged = true;
    }

    if (orderChanged) {
      await OrderModel.updateOne(
        { _id: ord._id },
        {
          $set: {
            dueSettledAmount: ord.dueSettledAmount,
            dueSettled: ord.dueSettled,
            dueSettledAt: ord.dueSettledAt,
          },
        }
      );
    }

    if (!isSettled && remainingOnBill > 0) {
      remainingBillsCount++;
    }

    computedTotalDue = Math.round((computedTotalDue + remainingOnBill) * 100) / 100;
    availablePool = Math.max(0, Math.round((availablePool - covered) * 100) / 100);
  }

  // Factor in any remaining unapplied excess payment credit
  if (availablePool > 0) {
    computedTotalDue = Math.max(0, Math.round((computedTotalDue - availablePool) * 100) / 100);
  }

  const finalTotalOrders = orders.length;
  const lastOrder = orders.length > 0 ? orders[orders.length - 1] : null;
  const lastVisitDate = lastOrder ? (lastOrder.paidAt || lastOrder.createdAt || new Date()) : (customerDoc.lastVisit || new Date());

  // 4. Update Customer locally
  customerDoc.totalDue = computedTotalDue;
  customerDoc.totalOrders = finalTotalOrders;
  customerDoc.lastVisit = lastVisitDate;
  await customerDoc.save();

  // 5. Dual-write to Central Atlas if available
  try {
    const centralConn = await syncEngine.getCentralConnection();
    if (centralConn && centralConn.readyState === 1) {
      await centralConn.db.collection('customers').updateOne(
        { _id: customerDoc._id },
        {
          $set: {
            totalDue: computedTotalDue,
            totalOrders: finalTotalOrders,
            lastVisit: lastVisitDate,
          },
        }
      );
    }
  } catch (_) {}

  // 6. Broadcast Realtime Updates
  try {
    realtimeHub.broadcast('CUSTOMER_UPDATED', {
      id: customerDoc._id,
      model: 'Customer',
      totalDue: computedTotalDue,
      totalOrders: finalTotalOrders,
      lastVisit: lastVisitDate,
    });
    realtimeHub.broadcast('REALTIME_DUES_UPDATED', {
      customerId: customerDoc._id,
      totalDue: computedTotalDue,
      totalOrders: finalTotalOrders,
      remainingBillsCount,
    });
  } catch (_) {}

  return {
    customer: customerDoc,
    totalDue: computedTotalDue,
    totalOrders: finalTotalOrders,
    remainingBillsCount,
  };
}

/**
 * Deterministically recalculates Khata ledgers for all active customers.
 */
async function recalculateAllCustomersKhata(options = {}) {
  const conn = options.customConn || mongoose.connection;
  const CustomerModel = conn.model('Customer');
  const customers = await CustomerModel.find({ isActive: true }).select('_id name phone totalDue totalOrders');

  const results = [];
  let totalOutstanding = 0;

  for (const c of customers) {
    try {
      const res = await recalculateCustomerKhata(c._id, options);
      if (res) {
        results.push({
          customerId: c._id,
          name: c.name,
          phone: c.phone,
          oldDue: c.totalDue,
          newDue: res.totalDue,
          totalOrders: res.totalOrders,
        });
        totalOutstanding += res.totalDue;
      }
    } catch (err) {
      console.warn(`[KhataLedger] Error recalculating customer ${c._id}:`, err.message);
    }
  }

  return {
    processed: results.length,
    totalOutstandingDue: Math.round(totalOutstanding * 100) / 100,
    details: results,
  };
}

module.exports = {
  recalculateCustomerKhata,
  recalculateAllCustomersKhata,
};
