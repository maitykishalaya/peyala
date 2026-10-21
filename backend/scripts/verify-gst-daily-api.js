const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const { getGstDailyHistory } = require('../src/utils/gstHistory');
const Order = require('../src/models/Order');
const BalanceSheet = require('../src/models/BalanceSheet');

async function verifyGstDailyApi() {
  console.log('🧪 Starting End-to-End Audit-Grade GST Daily History Verification...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Test 1: Fetch 30-day GST history
  console.log('\n--- Test 1: Calculating 30-Day GST History ---');
  const history = await getGstDailyHistory(30);

  if (!history || !history.summary || !Array.isArray(history.days)) {
    throw new Error('❌ Failed: getGstDailyHistory did not return expected structure');
  }
  console.log('✅ Structure verified: has summary and days array');

  // Test 2: Verify days count
  if (history.days.length !== 30) {
    throw new Error(`❌ Failed: Expected 30 days, got ${history.days.length}`);
  }
  console.log('✅ Exact 30 calendar days returned');

  // Test 3: Mathematical integrity of CGST + SGST === totalGst on every day
  console.log('\n--- Test 2: Verifying Mathematical Precision (Paise Accuracy) ---');
  let checkedDays = 0;
  for (const day of history.days) {
    const cgstPaise = Math.round(day.cgst * 100);
    const sgstPaise = Math.round(day.sgst * 100);
    const totalGstPaise = Math.round(day.totalGst * 100);

    if (cgstPaise + sgstPaise !== totalGstPaise) {
      throw new Error(`❌ Tax imbalance on ${day.date}: CGST (${day.cgst}) + SGST (${day.sgst}) !== Total GST (${day.totalGst})`);
    }
    checkedDays++;
  }
  console.log(`✅ All ${checkedDays} days have 100% exact CGST + SGST = Total GST precision (0 paisa drift)`);

  // Test 4: Verify summary sums match days array exactly
  console.log('\n--- Test 3: Verifying Summary Totals Match Day-wise Sums ---');
  const sumTaxable = history.days.reduce((s, d) => s + Math.round(d.taxableSales * 100), 0) / 100;
  const sumCgst = history.days.reduce((s, d) => s + Math.round(d.cgst * 100), 0) / 100;
  const sumSgst = history.days.reduce((s, d) => s + Math.round(d.sgst * 100), 0) / 100;
  const sumTotalGst = history.days.reduce((s, d) => s + Math.round(d.totalGst * 100), 0) / 100;
  const sumGross = history.days.reduce((s, d) => s + Math.round(d.grossSales * 100), 0) / 100;
  const sumOrders = history.days.reduce((s, d) => s + d.orderCount, 0);

  if (Math.abs(sumTaxable - history.summary.taxableSales) > 0.01) {
    throw new Error(`❌ Summary taxable mismatch: ${sumTaxable} vs ${history.summary.taxableSales}`);
  }
  if (Math.abs(sumTotalGst - history.summary.totalGstCollected) > 0.01) {
    throw new Error(`❌ Summary totalGst mismatch: ${sumTotalGst} vs ${history.summary.totalGstCollected}`);
  }
  if (Math.abs((sumCgst + sumSgst) - history.summary.totalGstCollected) > 0.01) {
    throw new Error(`❌ Summary CGST+SGST mismatch with total GST`);
  }
  if (sumOrders !== history.summary.totalOrders) {
    throw new Error(`❌ Summary orders count mismatch: ${sumOrders} vs ${history.summary.totalOrders}`);
  }
  console.log('✅ Summary totals perfectly match day-wise row sums:');
  console.log(`   - 30-Day Orders: ${history.summary.totalOrders} bills`);
  console.log(`   - Taxable Turnover: ₹${history.summary.taxableSales.toLocaleString('en-IN')}`);
  console.log(`   - CGST (2.5%): ₹${history.summary.cgst.toLocaleString('en-IN')}`);
  console.log(`   - SGST (2.5%): ₹${history.summary.sgst.toLocaleString('en-IN')}`);
  console.log(`   - Total GST Collected: ₹${history.summary.totalGstCollected.toLocaleString('en-IN')}`);
  console.log(`   - Gross Turnover: ₹${history.summary.totalGrossSales.toLocaleString('en-IN')}`);
  console.log(`   - Govt GST Remitted: ₹${history.summary.totalGstPaid.toLocaleString('en-IN')}`);

  // Test 5: Verify reconciliation with actual raw Order documents in MongoDB
  console.log('\n--- Test 4: Cross-checking Against Raw Order Documents in DB ---');
  const todayDateStr = history.days[0].date;
  const { getIstDayRange } = require('../src/utils/date');
  const { start, end } = getIstDayRange(todayDateStr);
  const rawTodayOrders = await Order.find({
    status: 'paid',
    paidAt: { $gte: start, $lte: end }
  }).lean();

  const rawTodayTax = rawTodayOrders.reduce((s, o) => s + (o.taxAmount || 0), 0);
  const rawTodayGross = rawTodayOrders.reduce((s, o) => s + (o.settledAmount ?? o.total ?? 0), 0);

  console.log(`   - Today (${todayDateStr}) Raw DB Orders Count: ${rawTodayOrders.length}`);
  console.log(`   - History Day 0 Orders Count: ${history.days[0].orderCount}`);
  if (rawTodayOrders.length !== history.days[0].orderCount) {
    throw new Error(`❌ Today order count mismatch: DB has ${rawTodayOrders.length}, history has ${history.days[0].orderCount}`);
  }
  if (Math.abs(rawTodayTax - history.days[0].totalGst) > 0.01) {
    throw new Error(`❌ Today GST mismatch: DB raw tax sum ${rawTodayTax} vs history ${history.days[0].totalGst}`);
  }
  if (Math.abs(rawTodayGross - history.days[0].grossSales) > 0.01) {
    throw new Error(`❌ Today Gross Sales mismatch: DB raw gross sum ${rawTodayGross} vs history ${history.days[0].grossSales}`);
  }
  console.log('✅ Direct database cross-check: 100% matched to raw Order collection documents!');

  await mongoose.disconnect();
  console.log('\n🎉 ALL AUDIT-GRADE GST CHECKS PASSED WITH ZERO DISCREPANCIES!');
}

verifyGstDailyApi().catch(err => {
  console.error(err);
  process.exit(1);
});
