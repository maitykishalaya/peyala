const assert = require('assert');
const { getIstFiscalQuarter } = require('../src/utils/date');

function runQuarterDateTests() {
  console.log('Testing IST Quarter calculations across boundary points...');

  // March 31, 2026 at 23:59:59.999 IST (= 18:29:59.999 UTC)
  const q4End = new Date('2026-03-31T18:29:59.999Z');
  const q4Result = getIstFiscalQuarter(q4End);
  assert.strictEqual(q4Result.quarterKey, 'FY2526-Q4');
  assert.strictEqual(q4Result.quarter, 'Q4');
  assert.strictEqual(q4Result.fiscalYear, '2025-26');

  // April 1, 2026 at 00:00:00.000 IST (= March 31, 18:30:00 UTC) -> Quarter 1 begins
  const q1Start = new Date('2026-03-31T18:30:00.000Z');
  const q1Result = getIstFiscalQuarter(q1Start);
  assert.strictEqual(q1Result.quarterKey, 'FY2627-Q1');
  assert.strictEqual(q1Result.quarter, 'Q1');
  assert.strictEqual(q1Result.fiscalYear, '2026-27');

  // June 30, 2026 at 23:59:59.999 IST (= 18:29:59.999 UTC) -> Quarter 1 ends
  const q1End = new Date('2026-06-30T18:29:59.999Z');
  const q1EndResult = getIstFiscalQuarter(q1End);
  assert.strictEqual(q1EndResult.quarterKey, 'FY2627-Q1');

  // July 1, 2026 at 00:00:00.000 IST (= June 30, 18:30:00 UTC) -> Quarter 2 begins
  const q2Start = new Date('2026-06-30T18:30:00.000Z');
  const q2Result = getIstFiscalQuarter(q2Start);
  assert.strictEqual(q2Result.quarterKey, 'FY2627-Q2');
  assert.strictEqual(q2Result.quarter, 'Q2');
  assert.strictEqual(q2Result.fiscalYear, '2026-27');

  // September 30, 2026 at 23:59:59.999 IST -> Quarter 2 ends
  const q2End = new Date('2026-09-30T18:29:59.999Z');
  const q2EndResult = getIstFiscalQuarter(q2End);
  assert.strictEqual(q2EndResult.quarterKey, 'FY2627-Q2');

  // October 1, 2026 at 00:00:00.000 IST -> Quarter 3 begins
  const q3Start = new Date('2026-09-30T18:30:00.000Z');
  const q3Result = getIstFiscalQuarter(q3Start);
  assert.strictEqual(q3Result.quarterKey, 'FY2627-Q3');

  // December 31, 2026 at 23:59:59.999 IST -> Quarter 3 ends
  const q3End = new Date('2026-12-31T18:29:59.999Z');
  const q3EndResult = getIstFiscalQuarter(q3End);
  assert.strictEqual(q3EndResult.quarterKey, 'FY2627-Q3');

  // January 1, 2027 at 00:00:00.000 IST -> Quarter 4 begins
  const q4NewStart = new Date('2026-12-31T18:30:00.000Z');
  const q4NewResult = getIstFiscalQuarter(q4NewStart);
  assert.strictEqual(q4NewResult.quarterKey, 'FY2627-Q4');
  assert.strictEqual(q4NewResult.fiscalYear, '2026-27');

  // April 1, 2027 at 00:00:00.000 IST -> FY27-28 Q1 begins
  const nextFyStart = new Date('2027-03-31T18:30:00.000Z');
  const nextFyResult = getIstFiscalQuarter(nextFyStart);
  assert.strictEqual(nextFyResult.quarterKey, 'FY2728-Q1');
  assert.strictEqual(nextFyResult.fiscalYear, '2027-28');

  console.log('✅ All IST Quarter boundary tests passed successfully!');
}

function runSequentialLogicTests() {
  console.log('\nTesting Simulated Sequence and Billing vs Direct Settlement...');

  // Simulated in-memory storage matching MongoDB $inc on BillSequence
  const sequences = {};
  function simulateGetNextBillNumber(date) {
    const qInfo = getIstFiscalQuarter(date);
    if (!sequences[qInfo.quarterKey]) {
      sequences[qInfo.quarterKey] = 0;
    }
    sequences[qInfo.quarterKey] += 1;
    return {
      billNumber: sequences[qInfo.quarterKey],
      fiscalQuarter: qInfo.quarterKey,
    };
  }

  function simulateEnsureOrderBillNumber(order, date) {
    if (order.billNumber && Number(order.billNumber) > 0) {
      return order.billNumber;
    }
    const { billNumber, fiscalQuarter } = simulateGetNextBillNumber(date);
    order.billNumber = billNumber;
    order.fiscalQuarter = fiscalQuarter;
    order.billedAt = date;
    return billNumber;
  }

  // 1. Scenario: In Q1, multiple bills generated
  const dateQ1 = new Date('2026-05-10T12:00:00+05:30');
  const order1 = { orderNumber: 4501, status: 'open' };
  const order2 = { orderNumber: 4502, status: 'open' };
  const order3 = { orderNumber: 4503, status: 'open' };

  // Order 1 is billed (e.g. Cash Bill printed)
  simulateEnsureOrderBillNumber(order1, dateQ1);
  assert.strictEqual(order1.billNumber, 1);
  assert.strictEqual(order1.fiscalQuarter, 'FY2627-Q1');

  // Order 2 is NOT billed first, but directly settled as Due
  simulateEnsureOrderBillNumber(order2, dateQ1);
  assert.strictEqual(order2.billNumber, 2);
  assert.strictEqual(order2.fiscalQuarter, 'FY2627-Q1');

  // Order 3 is billed
  simulateEnsureOrderBillNumber(order3, dateQ1);
  assert.strictEqual(order3.billNumber, 3);

  // Now Order 1 (already bill #1) is settled (paid)
  simulateEnsureOrderBillNumber(order1, dateQ1);
  assert.strictEqual(order1.billNumber, 1, 'Bill number must not change or double increment upon settlement');

  // 2. Scenario: July 1st 00:00 IST arrives (Quarter 2 begins)
  const dateQ2 = new Date('2026-07-01T00:00:01+05:30');
  const orderQ2_1 = { orderNumber: 4504, status: 'open' };
  const orderQ2_2 = { orderNumber: 4505, status: 'open' };

  // First bill in Q2 resets to 1
  simulateEnsureOrderBillNumber(orderQ2_1, dateQ2);
  assert.strictEqual(orderQ2_1.billNumber, 1, 'First bill in Q2 must reset to 1');
  assert.strictEqual(orderQ2_1.fiscalQuarter, 'FY2627-Q2');

  // Next bill in Q2 is 2
  simulateEnsureOrderBillNumber(orderQ2_2, dateQ2);
  assert.strictEqual(orderQ2_2.billNumber, 2);
  assert.strictEqual(orderQ2_2.fiscalQuarter, 'FY2627-Q2');

  console.log('✅ All Sequential and Quarter Reset simulations passed successfully!');
}

runQuarterDateTests();
runSequentialLogicTests();
