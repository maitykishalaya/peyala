const path = require('path');
const {
  matchesSearch,
  getSearchScore,
  filterBySearch,
  sortBySearchRelevance,
  isExactMatch,
} = require(path.join(__dirname, '../backend/src/utils/search'));

const sampleMenuItems = [
  { name: 'Chilleda Chicken', category: 'Chicken Items', isVeg: false },
  { name: 'Chilli Paneer', category: 'Starters', isVeg: true },
  { name: 'Chilli Chicken', category: 'Chicken Items', isVeg: false },
  { name: 'Chicken Manchurian', category: 'Chinese', isVeg: false },
  { name: 'Chilleda Chicken Burger', category: 'Burgers', isVeg: false },
  { name: 'Butter Naan', category: 'Breads', isVeg: true },
  { name: 'Cold Coffee', category: 'Beverages', isVeg: true },
  { name: 'Steamed Chicken Momo', category: 'Momos', isVeg: false },
];

console.log('--- 1. Testing Core Matching Logic ---');
const testCases = [
  // Examples explicitly requested by user
  { target: 'Chilleda Chicken', query: 'Chilleda', expected: true, desc: 'Exact "Chilleda"' },
  { target: 'Chilleda Chicken', query: 'chilleda', expected: true, desc: 'Lowercase "chilleda"' },
  { target: 'Chilleda Chicken', query: 'CHILLEDA', expected: true, desc: 'Uppercase "CHILLEDA"' },
  { target: 'Chilleda Chicken', query: 'chil', expected: true, desc: 'Partial "chil" -> Chilleda Chicken' },
  { target: 'Chilli Paneer', query: 'chil', expected: true, desc: 'Partial "chil" -> Chilli Paneer' },
  { target: 'Chilli Chicken', query: 'chil', expected: true, desc: 'Partial "chil" -> Chilli Chicken' },
  { target: 'Chicken Manchurian', query: 'chil', expected: false, desc: 'Partial "chil" does NOT match Chicken Manchurian' },
  { target: 'Chilleda Chicken', query: 'chill', expected: true, desc: 'Prefix "chill"' },
  { target: 'Chilleda Chicken', query: 'Chileda', expected: true, desc: 'Typo "Chileda" (missing l)' },
  { target: 'Chilleda Chicken', query: 'chil leda', expected: true, desc: 'Space inside word "chil leda"' },
  { target: 'Chilleda Chicken', query: ' Chilleda ', expected: true, desc: 'Surrounding spaces " Chilleda "' },
  { target: 'Chilleda Chicken', query: 'Chileda Chicken', expected: true, desc: 'Multi-word with typo "Chileda Chicken"' },
  { target: 'Chilli Chicken', query: 'Chili Chicken', expected: true, desc: 'Typo "Chili Chicken" -> Chilli Chicken' },
  { target: 'Chilleda Chicken Burger', query: 'Chileda Burger', expected: true, desc: 'Multi-word with typo "Chileda Burger" -> Chilleda Chicken Burger' },

  // Edge cases and tolerances
  { target: 'Chilleda Chicken', query: 'Chilledda', expected: true, desc: 'Extra character "Chilledda"' },
  { target: 'Chilleda Chicken', query: 'Chiled', expected: true, desc: 'Missing character "Chiled"' },
  { target: 'Chilleda Chicken', query: '', expected: true, desc: 'Empty search returns true' },
  { target: 'Chilleda Chicken', query: '   ', expected: true, desc: 'Whitespace search returns true' },
  { target: 'Chilleda Chicken', query: null, expected: true, desc: 'Null search returns true' },
  { target: 'Chilleda Chicken', query: 'burger', expected: false, desc: 'Unrelated search "burger" returns false' },
  { target: 'Cold Coffee', query: 'coldcoffee', expected: true, desc: 'Missing space "coldcoffee" matches "Cold Coffee"' },
  { target: 'Cold Coffee', query: 'cold coffee', expected: true, desc: 'Exact "cold coffee"' },

  // Tables, bills, phones
  { target: 'T-1', query: 't1', expected: true, desc: 'Table "T-1" matches "t1"' },
  { target: 'Table 10', query: '10', expected: true, desc: 'Table "Table 10" matches "10"' },
  { target: 'Ratnadeep 2', query: 'ratna', expected: true, desc: 'Table "Ratnadeep 2" matches "ratna"' },
  { target: 'Ratnadeep 2', query: 'ratandeep', expected: true, desc: 'Table "Ratnadeep 2" matches "ratandeep"' },
  { target: ['Rahul Sharma', '9876543210'], query: 'rahul', expected: true, desc: 'Customer name "rahul"' },
  { target: ['Rahul Sharma', '9876543210'], query: 'rauhl', expected: true, desc: 'Customer name swap typo "rauhl"' },
  { target: ['Rahul Sharma', '9876543210'], query: '9876', expected: true, desc: 'Customer phone digits "9876"' },
];

let failed = 0;
for (const tc of testCases) {
  const actual = matchesSearch(tc.target, tc.query);
  if (actual === tc.expected) {
    console.log(`PASS: ${tc.desc}`);
  } else {
    failed++;
    console.error(`FAIL: ${tc.desc} (expected ${tc.expected}, got ${actual})`);
  }
}

console.log('\n--- 2. Testing Combined Filters with Search ---');
// Filter menu: Veg only + search "chil"
const vegChil = sampleMenuItems.filter(item => item.isVeg && matchesSearch(item.name, 'chil'));
console.log('Veg + "chil":', vegChil.map(i => i.name));
if (vegChil.length === 1 && vegChil[0].name === 'Chilli Paneer') {
  console.log('PASS: Veg filter + "chil" returns only Chilli Paneer');
} else {
  failed++;
  console.error('FAIL: Expected only Chilli Paneer for veg + "chil"');
}

// Filter menu: Non-veg + search "Chileda"
const nonVegChileda = sampleMenuItems.filter(item => !item.isVeg && matchesSearch(item.name, 'Chileda'));
console.log('Non-veg + "Chileda":', nonVegChileda.map(i => i.name));
if (nonVegChileda.length === 2 && nonVegChileda.some(i => i.name === 'Chilleda Chicken') && nonVegChileda.some(i => i.name === 'Chilleda Chicken Burger')) {
  console.log('PASS: Non-veg filter + "Chileda" returns Chilleda Chicken and Chilleda Chicken Burger');
} else {
  failed++;
  console.error('FAIL: Expected Chilleda items for non-veg + "Chileda"');
}

console.log('\n--- 3. Testing Ranking / Relevance ---');
const ranked = sortBySearchRelevance(sampleMenuItems, 'Chilleda Chicken', i => i.name);
console.log('Ranked for "Chilleda Chicken":');
ranked.forEach((item, idx) => console.log(`  ${idx + 1}. ${item.name}`));
if (ranked[0].name === 'Chilleda Chicken') {
  console.log('PASS: Exact match "Chilleda Chicken" is ranked #1');
} else {
  failed++;
  console.error('FAIL: Expected exact match at #1');
}

console.log('\n--- 4. Summary ---');
if (failed === 0) {
  console.log('ALL TESTS PASSED! 100% compliance with search requirements.');
} else {
  console.error(`${failed} tests failed!`);
  process.exit(1);
}
