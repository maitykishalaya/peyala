const assert = require('assert');

console.log('Testing KDS Active vs Fulfilled (Served Unbilled) Partitioning...');

// Mock data representing different table states
const mockOrders = [
  // 1. Table 1: Cooking / Pending items
  {
    _id: 'order_1',
    table: { tableNumber: '1' },
    status: 'open',
    billPrinted: false,
    items: [
      { name: 'Noodles', status: 'pending', roundNumber: 1 },
      { name: 'Blue Lagoon', status: 'pending', roundNumber: 1 },
    ],
    createdAt: new Date('2026-09-20T10:00:00Z'),
    _doc: {},
  },
  // 2. Table 2: Fully Served, NOT Billed Yet -> Must be in Fulfilled!
  {
    _id: 'order_2',
    table: { tableNumber: '2' },
    status: 'served',
    billPrinted: false,
    foodServedAt: new Date('2026-09-20T10:15:00Z'),
    items: [
      { name: 'Burger', status: 'served', roundNumber: 1 },
      { name: 'Sandwich', status: 'served', roundNumber: 1 },
      { name: 'Thums Up', status: 'served', roundNumber: 1 },
    ],
    createdAt: new Date('2026-09-20T10:05:00Z'),
    _doc: {},
  },
  // 3. Table 3: Fully Served, but ALREADY BILLED -> Must NOT be in Fulfilled (cleared after billed!)
  {
    _id: 'order_3',
    table: { tableNumber: '3' },
    status: 'billed',
    billPrinted: true,
    foodServedAt: new Date('2026-09-20T09:45:00Z'),
    items: [
      { name: 'Pizza', status: 'served', roundNumber: 1 },
    ],
    createdAt: new Date('2026-09-20T09:30:00Z'),
    _doc: {},
  },
  // 4. Table 4: Settled / Paid -> Must NOT be in Fulfilled
  {
    _id: 'order_4',
    table: { tableNumber: '4' },
    status: 'paid',
    billPrinted: true,
    foodServedAt: new Date('2026-09-20T09:30:00Z'),
    items: [
      { name: 'Coffee', status: 'served', roundNumber: 1 },
    ],
    createdAt: new Date('2026-09-20T09:15:00Z'),
    _doc: {},
  },
  // 5. Table 5: Cancelled -> Must NOT be in Fulfilled
  {
    _id: 'order_5',
    table: { tableNumber: '5' },
    status: 'cancelled',
    billPrinted: false,
    items: [
      { name: 'Pasta', status: 'cancelled', roundNumber: 1 },
    ],
    createdAt: new Date('2026-09-20T09:00:00Z'),
    _doc: {},
  },
];

// Logic matching backend/src/routes/orders.js
const unbilledOrders = mockOrders.filter((o) => {
  if (!Array.isArray(o.items) || o.items.length === 0) return false;
  if (['billed', 'paid', 'cancelled'].includes(o.status) || o.billPrinted) return false;
  return o.items.some((i) => i.status !== 'cancelled');
});

const activeOrders = [];
const fulfilledOrders = [];

for (const order of unbilledOrders) {
  const activeItems = (order.items || []).filter((i) => i.status !== 'cancelled');
  const hasUnserved = activeItems.some(
    (i) => i.status === 'pending' || i.status === 'preparing'
  );

  if (hasUnserved) {
    activeOrders.push(order);
  } else {
    fulfilledOrders.push(order);
  }
}

console.log('Active Orders count:', activeOrders.length, '->', activeOrders.map(o => `Table ${o.table.tableNumber}`));
console.log('Fulfilled Orders count:', fulfilledOrders.length, '->', fulfilledOrders.map(o => `Table ${o.table.tableNumber}`));

// Verifications
assert.strictEqual(activeOrders.length, 1, 'Only Table 1 should be active');
assert.strictEqual(activeOrders[0].table.tableNumber, '1', 'Table 1 is in active cooking queue');

assert.strictEqual(fulfilledOrders.length, 1, 'Only Table 2 should be in fulfilled queue');
assert.strictEqual(fulfilledOrders[0].table.tableNumber, '2', 'Table 2 is in fulfilled queue');

// Check that billed Table 3 and paid Table 4 are cleared
assert(!fulfilledOrders.some(o => o.table.tableNumber === '3'), 'Table 3 (billed) must be cleared from fulfilled');
assert(!fulfilledOrders.some(o => o.table.tableNumber === '4'), 'Table 4 (paid) must be cleared from fulfilled');

// 6. Test: If Table 2 gets billed, it is cleared
console.log('\nTesting billing of Table 2:');
mockOrders[1].billPrinted = true;
mockOrders[1].status = 'billed';

const unbilledAfterBill = mockOrders.filter((o) => {
  if (!Array.isArray(o.items) || o.items.length === 0) return false;
  if (['billed', 'paid', 'cancelled'].includes(o.status) || o.billPrinted) return false;
  return o.items.some((i) => i.status !== 'cancelled');
});
const fulfilledAfterBill = unbilledAfterBill.filter(o => !o.items.some(i => i.status === 'pending' || i.status === 'preparing'));

console.log('Fulfilled Orders after Table 2 is billed:', fulfilledAfterBill.length);
assert.strictEqual(fulfilledAfterBill.length, 0, 'Fulfilled queue should be empty once Table 2 is billed');

console.log('✅ All KDS fulfilled unbilled tests passed successfully!');
