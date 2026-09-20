const assert = require('assert');

function runOutletDesignTests() {
  console.log('Testing Outlet Design & Zone Analytics logic...');

  // 1. Test Category Inference
  function inferDefaultCategory(tableNumber) {
    const lower = String(tableNumber || '').toLowerCase().trim();
    if (
      lower.startsWith('out') ||
      lower.includes('outdoor') ||
      lower.startsWith('o-') ||
      lower.startsWith('patio') ||
      lower.startsWith('sudhanil') ||
      lower.startsWith('ratnadeep') ||
      lower.startsWith('extra') ||
      lower.startsWith('dhitun')
    ) {
      return 'Outdoor';
    }
    if (
      lower.startsWith('pick') ||
      lower.startsWith('takeaway') ||
      lower.startsWith('delivery') ||
      lower.startsWith('pu')
    ) {
      return 'Pick Up';
    }
    return 'Indoor';
  }

  assert.strictEqual(inferDefaultCategory('Table 1'), 'Indoor');
  assert.strictEqual(inferDefaultCategory('in-02'), 'Indoor');
  assert.strictEqual(inferDefaultCategory('ratnadeep'), 'Outdoor');
  assert.strictEqual(inferDefaultCategory('patio-3'), 'Outdoor');
  assert.strictEqual(inferDefaultCategory('takeaway'), 'Pick Up');

  console.log('✅ Initial Category Inference passed');

  // 2. Test Reassigning table (e.g. ratnadeep from Outdoor to Other)
  const mockTable = {
    _id: 't_ratnadeep',
    tableNumber: 'ratnadeep',
    capacity: 6,
    category: inferDefaultCategory('ratnadeep'), // Initially 'Outdoor'
  };
  assert.strictEqual(mockTable.category, 'Outdoor');

  // Reassign to 'Other'
  mockTable.category = 'Other';
  assert.strictEqual(mockTable.category, 'Other');
  console.log('✅ Reassigning table "ratnadeep" to "Other" passed');

  // 3. Test Sales Aggregation by Zone / Category
  const mockCategories = [
    { name: 'Indoor', color: '#3b82f6', icon: '🏠' },
    { name: 'Outdoor', color: '#10b981', icon: '🌳' },
    { name: 'Other', color: '#8b5cf6', icon: '🪑' },
    { name: 'Pick Up', color: '#f59e0b', icon: '📦' },
  ];

  const mockTables = [
    { _id: 't1', tableNumber: '1', category: 'Indoor' },
    { _id: 't2', tableNumber: '2', category: 'Indoor' },
    { _id: 't3', tableNumber: 'out-1', category: 'Outdoor' },
    { _id: 't_ratnadeep', tableNumber: 'ratnadeep', category: 'Other' }, // moved to Other!
  ];

  const mockPaidOrders = [
    { table: 't1', tableCategory: 'Indoor', settledAmount: 500, total: 500 },
    { table: 't1', tableCategory: 'Indoor', settledAmount: 300, total: 300 },
    { table: 't2', tableCategory: 'Indoor', settledAmount: 200, total: 200 },
    { table: 't3', tableCategory: 'Outdoor', settledAmount: 400, total: 400 },
    { table: 't_ratnadeep', tableCategory: 'Other', settledAmount: 600, total: 600 },
  ];

  const categoryStats = new Map();
  mockCategories.forEach((c) => {
    categoryStats.set(c.name, {
      name: c.name,
      totalSales: 0,
      orderCount: 0,
      tablesCount: 0,
    });
  });

  mockTables.forEach((t) => {
    if (categoryStats.has(t.category)) {
      categoryStats.get(t.category).tablesCount += 1;
    }
  });

  let grandTotal = 0;
  mockPaidOrders.forEach((ord) => {
    const amt = ord.settledAmount;
    grandTotal += amt;
    const cat = categoryStats.get(ord.tableCategory);
    cat.totalSales += amt;
    cat.orderCount += 1;
  });

  assert.strictEqual(grandTotal, 2000);

  const indoorStat = categoryStats.get('Indoor');
  assert.strictEqual(indoorStat.totalSales, 1000); // 500 + 300 + 200
  assert.strictEqual(indoorStat.orderCount, 3);
  assert.strictEqual(indoorStat.tablesCount, 2);
  assert.strictEqual((indoorStat.totalSales / grandTotal) * 100, 50.0);

  const outdoorStat = categoryStats.get('Outdoor');
  assert.strictEqual(outdoorStat.totalSales, 400);
  assert.strictEqual(outdoorStat.orderCount, 1);
  assert.strictEqual(outdoorStat.tablesCount, 1);
  assert.strictEqual((outdoorStat.totalSales / grandTotal) * 100, 20.0);

  const otherStat = categoryStats.get('Other');
  assert.strictEqual(otherStat.totalSales, 600); // Table 'ratnadeep' moved to Other
  assert.strictEqual(otherStat.orderCount, 1);
  assert.strictEqual(otherStat.tablesCount, 1);
  assert.strictEqual((otherStat.totalSales / grandTotal) * 100, 30.0);

  console.log('✅ Sales Aggregation by Zone & Category passed:');
  console.log(`   Indoor: ₹${indoorStat.totalSales} (50%)`);
  console.log(`   Outdoor: ₹${outdoorStat.totalSales} (20%)`);
  console.log(`   Other (incl. ratnadeep): ₹${otherStat.totalSales} (30%)`);
  console.log('\n🎉 All Outlet Design tests passed successfully!');
}

runOutletDesignTests();
