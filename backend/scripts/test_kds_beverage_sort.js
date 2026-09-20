const { BEVERAGE_CATEGORY_REGEX, BEVERAGE_ITEM_REGEX, isBeverageItem } = (() => {
  const BEVERAGE_CATEGORY_REGEX =
    /\b(drink|drinks|beverage|beverages|coffee|coffees|tea|teas|chai|shake|shakes|juice|juices|mocktail|mocktails|cocktail|cocktails|soda|sodas|smoothie|smoothies|cooler|coolers|cold\s*drinks?|soft\s*drinks?)\b/i;

  const BEVERAGE_ITEM_REGEX =
    /\b(thums\s*up|thumsup|coca\s*cola|coke|pepsi|sprite|fanta|limca|mirinda|mountain\s*dew|dew|7\s*up|seven\s*up|soda|sodas|mojito|mojitos|tea|teas|chai|coffee|coffees|shake|shakes|juice|juices|smoothie|smoothies|mocktail|mocktails|cocktail|cocktails|lassi|water|beverage|beverages|drink|drinks|frappe|latte|cappuccino|espresso|lemonade|red\s*bull|sting|appy)\b/i;

  function isBeverageItem(item) {
    if (!item) return false;
    const cat = item.menuItem?.category || item.category;
    const catName =
      typeof cat === 'object' && cat !== null
        ? String(cat.name || '')
      : String(cat || '');

    if (catName && BEVERAGE_CATEGORY_REGEX.test(catName)) {
      return true;
    }

    const name = String(item.name || '').trim();
    return BEVERAGE_ITEM_REGEX.test(name);
  }

  return { BEVERAGE_CATEGORY_REGEX, BEVERAGE_ITEM_REGEX, isBeverageItem };
})();

function assert(condition, message) {
  if (!condition) {
    console.error('❌ ASSERTION FAILED:', message);
    process.exit(1);
  }
}

console.log('Testing beverage detection and KDS sorting...');

// 1. Check user example: table ordered thumsup, Noodles, Burger
const userOrderedItems = [
  { name: 'thumsup', category: { name: 'Beverages' } },
  { name: 'Noodles', category: { name: 'Chinese' } },
  { name: 'Burger', category: { name: 'Snacks' } },
];

assert(isBeverageItem(userOrderedItems[0]) === true, 'thumsup should be beverage');
assert(isBeverageItem(userOrderedItems[1]) === false, 'Noodles should not be beverage');
assert(isBeverageItem(userOrderedItems[2]) === false, 'Burger should not be beverage');

const sortedItems = [...userOrderedItems].sort((a, b) => {
  const aBev = isBeverageItem(a) ? 1 : 0;
  const bBev = isBeverageItem(b) ? 1 : 0;
  if (aBev !== bBev) return aBev - bBev;
  return (a.roundNumber || 1) - (b.roundNumber || 1);
});

console.log('Original order:', userOrderedItems.map(i => i.name));
console.log('Sorted order:', sortedItems.map(i => i.name));

assert(sortedItems[0].name === 'Noodles', 'First item must be Noodles');
assert(sortedItems[1].name === 'Burger', 'Second item must be Burger');
assert(sortedItems[2].name === 'thumsup', 'Third item must be thumsup');

// 2. Additional test with multi-round and various beverage / food items
const complexOrderItems = [
  { name: 'Fresh Lime Soda', category: { name: 'Beverages' }, roundNumber: 1 },
  { name: 'Chicken Biryani', category: { name: 'Main Course' }, roundNumber: 1 },
  { name: 'Paneer Butter Masala', category: { name: 'Main Course' }, roundNumber: 1 },
  { name: 'Steamed Momo', category: { name: 'Starters' }, roundNumber: 1 },
  { name: 'Virgin Mojito', category: { name: 'Mocktails' }, roundNumber: 1 },
  { name: 'Cold Coffee', category: { name: 'Beverages' }, roundNumber: 2 },
  { name: 'Garlic Naan', category: { name: 'Breads' }, roundNumber: 2 },
];

const sortedComplex = [...complexOrderItems].sort((a, b) => {
  const aBev = isBeverageItem(a) ? 1 : 0;
  const bBev = isBeverageItem(b) ? 1 : 0;
  if (aBev !== bBev) return aBev - bBev;
  return (a.roundNumber || 1) - (b.roundNumber || 1);
});

console.log('\nComplex sorted:');
sortedComplex.forEach(i => console.log(` - [${isBeverageItem(i) ? 'BEVERAGE' : 'FOOD'}] Round ${i.roundNumber}: ${i.name}`));

const firstBeverageIndex = sortedComplex.findIndex(i => isBeverageItem(i));
const allFoodBefore = sortedComplex.slice(0, firstBeverageIndex).every(i => !isBeverageItem(i));
const allBevAfter = sortedComplex.slice(firstBeverageIndex).every(i => isBeverageItem(i));

assert(allFoodBefore, 'All food items must appear before any beverage');
assert(allBevAfter, 'All beverage items must appear after all food items');

console.log('\n✅ All beverage sorting tests passed successfully!');
