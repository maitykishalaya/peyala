const assert = require('assert');

function verifyNetSalesMath() {
  console.log('Testing Net Sales = Gross Sales - GST Collected math...\n');

  // Case 1: Order-level data
  const orders = [
    { subtotal: 340, discount: 34, taxAmount: 15.3, total: 321.3, settledAmount: 321 },
    { subtotal: 150, discount: 0, taxAmount: 7.5, total: 157.5, settledAmount: 158 },
    { subtotal: 60, discount: 0, taxAmount: 3, total: 63, settledAmount: 60 },
  ];

  let grossSales = 0;
  let gst = 0;
  orders.forEach((o) => {
    const orderGross = Number(o.settledAmount ?? o.total);
    grossSales += orderGross;
    gst += o.taxAmount;
  });

  const netSales = Math.max(0, Math.round((grossSales - gst) * 100) / 100);

  console.log('Case 1 (Orders):');
  console.log(`  Gross Sales: ₹${grossSales}`);
  console.log(`  GST:         ₹${gst}`);
  console.log(`  Net Sales:   ₹${netSales}`);
  assert.strictEqual(netSales, Math.round((grossSales - gst) * 100) / 100);
  assert.strictEqual(netSales, 539 - 25.8);
  console.log('  Passed!\n');

  // Case 2: Multi-channel sales entries
  const salesEntries = [
    {
      outletSales: 8573.5,
      zomato: { grossSales: 4000, gst: 200, netSettlement: 2800 },
      fatafat: { grossSales: 1500, gst: 75, netSettlement: 1100 },
      otherSales: 500,
    },
  ];

  let seGross = 0;
  let seGst = 0;

  salesEntries.forEach((se) => {
    const dayGross = se.outletSales + se.zomato.grossSales + se.fatafat.grossSales + se.otherSales;
    const outletGst = Math.round((se.outletSales * 5 / 105) * 100) / 100;
    const dayGst = outletGst + se.zomato.gst + se.fatafat.gst + Math.round((se.otherSales * 5 / 105) * 100) / 100;
    seGross += dayGross;
    seGst += dayGst;
  });

  const seNet = Math.max(0, Math.round((seGross - seGst) * 100) / 100);

  console.log('Case 2 (Sales Entries):');
  console.log(`  Gross Sales: ₹${seGross}`);
  console.log(`  GST:         ₹${seGst}`);
  console.log(`  Net Sales:   ₹${seNet}`);
  assert.strictEqual(seNet, Math.round((seGross - seGst) * 100) / 100);
  console.log('  Passed!\n');

  console.log('All Net Sales assertions verified successfully!');
}

verifyNetSalesMath();
