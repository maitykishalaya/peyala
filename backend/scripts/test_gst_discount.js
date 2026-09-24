const assert = require('assert');

// Standalone verification of the calcTotals logic
function calcTotals(items = [], discountInput = 0, discountType = 'flat') {
  let subtotal = 0;
  const validItems = [];

  for (const item of items) {
    if (item.status === 'cancelled') continue;
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const taxPct = item.taxPercent !== undefined ? Number(item.taxPercent) : 5;

    const lineTotal = price * qty;
    subtotal += lineTotal;
    validItems.push({ lineTotal, taxPct });
  }

  const cleanSubtotal = Math.round(subtotal * 100) / 100;

  // Handle discountType: 'percentage' vs 'flat'
  let cleanDiscount = 0;
  const rawValue = Math.max(0, Number(discountInput) || 0);

  if (discountType === 'percentage') {
    cleanDiscount = Math.round(((cleanSubtotal * rawValue) / 100) * 100) / 100;
  } else {
    cleanDiscount = Math.round(rawValue * 100) / 100;
  }

  // Discount cannot exceed subtotal
  cleanDiscount = Math.min(cleanDiscount, cleanSubtotal);
  cleanDiscount = Math.max(0, cleanDiscount);

  // Discounted taxable base
  const discountedBase = Math.max(0, cleanSubtotal - cleanDiscount);

  // Calculate GST / tax after discount on the discounted taxable base
  let taxAmount = 0;
  if (cleanSubtotal > 0 && discountedBase > 0) {
    for (const it of validItems) {
      const itemDiscountedBase = it.lineTotal * (discountedBase / cleanSubtotal);
      const lineTax = (itemDiscountedBase * it.taxPct) / 100;
      taxAmount += lineTax;
    }
  }

  const cleanTax = Math.round(taxAmount * 100) / 100;
  const rawTotal = Math.max(0, Math.round((discountedBase + cleanTax) * 100) / 100);

  return {
    subtotal: cleanSubtotal,
    taxAmount: cleanTax,
    discountType: discountType === 'percentage' ? 'percentage' : 'flat',
    discountValue: Math.round(rawValue * 100) / 100,
    discount: cleanDiscount,
    total: Math.round(rawTotal),
  };
}

console.log('--- Running GST After Discount Test Suite ---');

// Test 1: User's exact prompt example:
// 200 Rs item, 5% GST = 10, total 210.
// Flat 20 Rs discount -> 180 + 9 = 189 Rs total!
{
  const items = [{ name: 'Test Food', price: 200, quantity: 1, taxPercent: 5 }];
  const res = calcTotals(items, 20, 'flat');
  console.log('Test 1 (User Example - Flat ₹20 on ₹200 item):', res);
  assert.strictEqual(res.subtotal, 200, 'Subtotal should be 200');
  assert.strictEqual(res.discount, 20, 'Discount should be 20');
  assert.strictEqual(res.taxAmount, 9, 'GST should be 9 (5% of 180)');
  assert.strictEqual(res.total, 189, 'Total bill should be 189');
  console.log('✓ Test 1 Passed: 180 + 9 = 189!\n');
}

// Test 2: Percentage discount: 10% on ₹200 item
{
  const items = [{ name: 'Test Food', price: 200, quantity: 1, taxPercent: 5 }];
  const res = calcTotals(items, 10, 'percentage');
  console.log('Test 2 (Percentage 10% on ₹200 item):', res);
  assert.strictEqual(res.subtotal, 200);
  assert.strictEqual(res.discount, 20);
  assert.strictEqual(res.taxAmount, 9);
  assert.strictEqual(res.total, 189);
  console.log('✓ Test 2 Passed!\n');
}

// Test 3: Multiple items with different quantities and prices
{
  const items = [
    { name: 'Burger', price: 150, quantity: 2, taxPercent: 5 }, // 300
    { name: 'Tea', price: 50, quantity: 2, taxPercent: 5 },     // 100
  ];
  // Subtotal = 400. Flat discount = 100.
  // Discounted base = 300. 5% GST on 300 = 15. Total = 315.
  const res = calcTotals(items, 100, 'flat');
  console.log('Test 3 (Multi-item: ₹400 subtotal, ₹100 discount):', res);
  assert.strictEqual(res.subtotal, 400);
  assert.strictEqual(res.discount, 100);
  assert.strictEqual(res.taxAmount, 15);
  assert.strictEqual(res.total, 315);
  console.log('✓ Test 3 Passed!\n');
}

// Test 4: Cancelled item exclusion
{
  const items = [
    { name: 'Burger', price: 200, quantity: 1, taxPercent: 5, status: 'active' },
    { name: 'Cancelled Dish', price: 500, quantity: 1, taxPercent: 5, status: 'cancelled' },
  ];
  const res = calcTotals(items, 20, 'flat');
  console.log('Test 4 (Cancelled items excluded):', res);
  assert.strictEqual(res.subtotal, 200);
  assert.strictEqual(res.discount, 20);
  assert.strictEqual(res.taxAmount, 9);
  assert.strictEqual(res.total, 189);
  console.log('✓ Test 4 Passed!\n');
}

// Test 5: Zero discount
{
  const items = [{ name: 'Pizza', price: 200, quantity: 1, taxPercent: 5 }];
  const res = calcTotals(items, 0, 'flat');
  console.log('Test 5 (Zero discount):', res);
  assert.strictEqual(res.subtotal, 200);
  assert.strictEqual(res.discount, 0);
  assert.strictEqual(res.taxAmount, 10);
  assert.strictEqual(res.total, 210);
  console.log('✓ Test 5 Passed!\n');
}

console.log('ALL GST DISCOUNT TESTS PASSED PERFECTLY!');
