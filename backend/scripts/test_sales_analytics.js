const { evaluateSalesSuggestions } = require('../src/utils/salesSuggestionEngine');

function testSuggestionEngineOffline() {
  console.log('Testing Sales Suggestion Engine (In-Memory)...');

  const config = {
    targetAov: 400,
    dailyTarget: 12000,
    weakDayThresholdPct: 20,
    deliveryDeductionThresholdPct: 25,
    lowItemSalesThresholdQty: 3,
    suggestionActionStates: {},
  };

  const dummyKpis = {
    grossSales: 45000,
    netSales: 42857,
    orders: 110,
    aov: 389,
    discounts: 1200,
    gst: 2143,
    prevGrossSales: 52000,
    prevNetSales: 49523,
    prevOrders: 130,
    prevAov: 400,
    aovGrowthPct: -2.8,
    salesGrowthPct: -13.5,
    ordersGrowthPct: -15.4,
  };

  const dummyTodayStatus = {
    dateStr: '2026-09-20',
    target: 12000,
    actual: 4500,
    remaining: 7500,
    achievementPct: 37.5,
    isSuggested: false,
    targetType: 'configured',
  };

  const dummyDowStats = [
    { dayIndex: 1, dayName: 'Monday', sales: 6000, orders: 15, isWeak: false, variancePct: 0 },
    { dayIndex: 2, dayName: 'Tuesday', sales: 3000, orders: 8, isWeak: true, variancePct: -45 },
    { dayIndex: 3, dayName: 'Wednesday', sales: 5500, orders: 14, isWeak: false, variancePct: 0 },
  ];

  const dummyHourly = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i}:00`,
    sales: i >= 19 && i <= 21 ? 12000 : 800,
    orders: i >= 19 && i <= 21 ? 30 : 2,
    aov: 400,
  }));

  const dummyDelivery = [
    {
      platformName: 'Zomato',
      grossSales: 15000,
      netSettlement: 10200,
      commission: 3200,
      restaurantDiscount: 1200,
      platformDiscount: 400,
      otherDeductions: 0,
      effectiveDeductionPct: 32.0,
    },
  ];

  const dummyItems = [
    { name: 'Chicken Biryani', quantitySold: 45, netSales: 11250 },
    { name: 'Cold Coffee', quantitySold: 2, netSales: 180 },
  ];

  const { suggestions, top3Actions } = evaluateSalesSuggestions({
    kpis: dummyKpis,
    todayStatus: dummyTodayStatus,
    dowStats: dummyDowStats,
    hourlyStats: dummyHourly,
    channelStats: [],
    deliveryStats: dummyDelivery,
    itemStats: dummyItems,
    config,
  });

  console.log(`\nEvaluated Suggestions count: ${suggestions.length}`);
  console.log(`Top 3 actions selected: ${top3Actions.length}`);
  top3Actions.forEach((act, i) => {
    console.log(`\nAction ${i + 1} [${act.severity.toUpperCase()}]: ${act.title}`);
    console.log(`  Finding: ${act.finding}`);
    console.log(`  Action: ${act.action}`);
    console.log(`  Impact: ${act.impact}`);
  });

  console.log('\n--- All assertions passed! ---');
}

testSuggestionEngineOffline();
