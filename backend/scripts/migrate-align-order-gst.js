const path = require('path');
const backendDir = 'c:/Users/User/Desktop/peyala_v8/backend';
const mongoose = require(path.join(backendDir, 'node_modules/mongoose'));
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });
const Order = require(path.join(backendDir, 'src/models/Order'));

async function migrateAlignOrderGst() {
  console.log('🚀 Starting Order Tax Amount DB Alignment Migration...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const orders = await Order.find({ status: 'paid' });
  console.log(`Auditing ${orders.length} paid orders...`);

  let updatedCount = 0;
  let totalDeltaPaise = 0;

  for (const o of orders) {
    const t = Number(o.taxAmount) || 0;
    const c = Math.round((t / 2) * 100) / 100;
    const s = Math.round((t / 2) * 100) / 100;
    const aligned = Math.round((c + s) * 100) / 100;

    if (Math.abs(aligned - t) > 0.001) {
      const delta = Math.round((aligned - t) * 100);
      totalDeltaPaise += delta;
      o.taxAmount = aligned;
      await o.save();
      updatedCount++;
    }
  }

  console.log(`✅ Successfully aligned ${updatedCount} orders in the database.`);
  console.log(`Cumulative adjustment: ${totalDeltaPaise / 100} INR across ${updatedCount} orders.`);

  // Verify alignment in DB
  const verifyOrders = await Order.find({ status: 'paid' }).lean();
  let totTax = 0, totCgst = 0, totSgst = 0;
  for (const vo of verifyOrders) {
    const t = Number(vo.taxAmount) || 0;
    totTax += t;
    totCgst += Math.round((t / 2) * 100) / 100;
    totSgst += Math.round((t / 2) * 100) / 100;
  }

  console.log('\n--- Post-Migration DB Verification ---');
  console.log(`Total Orders: ${verifyOrders.length}`);
  console.log(`Sum Total GST in DB: ₹${totTax.toFixed(2)}`);
  console.log(`Sum CGST in DB: ₹${totCgst.toFixed(2)}`);
  console.log(`Sum SGST in DB: ₹${totSgst.toFixed(2)}`);
  console.log(`Difference (CGST + SGST - Total GST): ${(totCgst + totSgst - totTax).toFixed(4)}`);

  await mongoose.disconnect();
  console.log('✅ DB Migration Complete!');
}

migrateAlignOrderGst().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
