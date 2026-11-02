const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const nightlySnapshotService = require('../src/services/nightlySnapshotService');

async function run() {
  const args = process.argv.slice(2);
  const isScheduled = args.includes('--scheduled');
  const tag = isScheduled ? 'nightly_1159pm' : 'manual_closing';
  const reason = isScheduled 
    ? 'Automated 11:59 PM IST Closing Snapshot' 
    : 'Manual EOD Closing Snapshot';

  console.log('====================================================');
  console.log('  PEYALA POS - NIGHTLY CLOSING SNAPSHOT ENGINE      ');
  console.log('====================================================');

  try {
    const manifest = await nightlySnapshotService.takeSnapshot({ tag, reason });
    console.log('\n[SUCCESS] Snapshot captured successfully!');
    console.log(`Snapshot ID:      ${manifest.snapshotId}`);
    console.log(`IST Timestamp:    ${manifest.istTimestamp}`);
    console.log(`Total Documents:  ${manifest.totalDocuments}`);
    console.log(`Gross Sales:      ₹${manifest.closingFinancials.grossSales}`);
    console.log('Closing Balances:');
    manifest.closingFinancials.closingBalances.forEach(b => {
      console.log(`  - ${b.name.padEnd(20)}: ₹${b.currentBalance.toFixed(2)}`);
    });
    process.exit(0);
  } catch (err) {
    console.error('\n[FATAL] Snapshot failed:', err.message);
    process.exit(1);
  }
}

run();

