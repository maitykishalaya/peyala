// ─────────────────────────────────────────────────────────────────
// Expense Leak Detection Engine
// Peyala v8 — Deterministic, Statistical Financial Anomaly Detector
// ─────────────────────────────────────────────────────────────────

/**
 * Computes arithmetic mean
 */
function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Computes standard deviation
 */
function stdDev(arr, m) {
  if (!arr || arr.length < 2) return 0;
  const avg = m !== undefined ? m : mean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Formats currency amount in INR
 */
function formatInr(val) {
  return '₹' + Math.round(val || 0).toLocaleString('en-IN');
}

/**
 * Core Detection Engine Runner
 *
 * @param {Object} data
 * @param {Array} data.payments - Payment documents
 * @param {Array} data.purchases - PurchaseEntry documents
 * @param {Array} data.salesEntries - SalesEntry documents
 * @param {Array} data.orders - Order documents (paid/settled)
 * @param {Object} data.currentRange - { start: Date, end: Date }
 * @param {Object} data.baselineRange - { start: Date, end: Date }
 * @param {Map} data.reviewsMap - Map of anomalyId -> ExpenseLeakReview
 * @returns {Object} Analysis result
 */
function analyzeExpenseLeaks({
  payments = [],
  purchases = [],
  salesEntries = [],
  orders = [],
  currentRange,
  baselineRange,
  reviewsMap = new Map(),
}) {
  const anomalies = [];
  const currentStart = new Date(currentRange.start);
  const currentEnd = new Date(currentRange.end);
  const baselineStart = new Date(baselineRange.start);
  const baselineEnd = new Date(baselineRange.end);

  const currentDays = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000));
  const baselineDays = Math.max(1, Math.round((baselineEnd.getTime() - baselineStart.getTime()) / 86400000));

  // ── 1. Split Data into Current vs Baseline ─────────────────────────
  const currentPayments = [];
  const baselinePayments = [];
  for (const p of payments) {
    const d = new Date(p.date || p.createdAt);
    if (d >= currentStart && d <= currentEnd) currentPayments.push(p);
    else if (d >= baselineStart && d <= baselineEnd) baselinePayments.push(p);
  }

  const currentPurchases = [];
  const baselinePurchases = [];
  for (const p of purchases) {
    const d = new Date(p.date || p.createdAt);
    if (d >= currentStart && d <= currentEnd) currentPurchases.push(p);
    else if (d >= baselineStart && d <= baselineEnd) baselinePurchases.push(p);
  }

  // Aggregate Sales
  let currentSalesTotal = 0;
  let baselineSalesTotal = 0;
  for (const s of salesEntries) {
    const d = new Date(s.date);
    const rev = s.totalRevenue || 0;
    if (d >= currentStart && d <= currentEnd) currentSalesTotal += rev;
    else if (d >= baselineStart && d <= baselineEnd) baselineSalesTotal += rev;
  }

  // Fallback to Orders if SalesEntry is empty
  if (currentSalesTotal === 0 && orders.length > 0) {
    for (const o of orders) {
      const d = new Date(o.paidAt || o.createdAt);
      const amt = o.settledAmount || o.total || 0;
      if (d >= currentStart && d <= currentEnd) currentSalesTotal += amt;
      else if (d >= baselineStart && d <= baselineEnd) baselineSalesTotal += amt;
    }
  }

  // Daily Sales Rates & Growth
  const currentDailySales = currentSalesTotal / currentDays;
  const baselineDailySales = baselineSalesTotal / baselineDays;
  const salesGrowthRate = baselineDailySales > 0 ? (currentDailySales - baselineDailySales) / baselineDailySales : 0;
  const salesGrowthPct = Math.round(salesGrowthRate * 100);

  // Order Counts
  let currentOrderCount = 0;
  let baselineOrderCount = 0;
  for (const o of orders) {
    const d = new Date(o.paidAt || o.createdAt);
    if (d >= currentStart && d <= currentEnd) currentOrderCount++;
    else if (d >= baselineStart && d <= baselineEnd) baselineOrderCount++;
  }
  const currentDailyOrders = currentOrderCount / currentDays;
  const baselineDailyOrders = baselineOrderCount / baselineDays;
  const ordersGrowthRate = baselineDailyOrders > 0 ? (currentDailyOrders - baselineDailyOrders) / baselineDailyOrders : 0;

  // Track Data Sufficiency
  const totalExpenseRecords = payments.length + purchases.length;
  const hasEnoughData = totalExpenseRecords >= 5;
  const insufficientDataReason = !hasEnoughData
    ? 'Expense Leak Detector requires at least 5-10 recorded expenses or purchases to establish reliable statistical baselines.'
    : null;

  // ── Helper: Attach Review & Feedback State ─────────────────────────
  function enrichAnomaly(anomaly) {
    const review = reviewsMap.get(anomaly.id);
    anomaly.status = review?.status || 'new';
    anomaly.dismissedUntil = review?.dismissedUntil || null;
    anomaly.isUseful = review?.isUseful !== undefined ? review.isUseful : null;
    anomaly.feedbackReason = review?.feedbackReason || null;
    anomaly.feedbackNotes = review?.feedbackNotes || '';
    anomaly.reviewedAt = review?.reviewedAt || null;
    return anomaly;
  }

  // ── DETECTOR #1: PRICE SPIKE (Item Unit Price) ──────────────────────
  // Evaluates PurchaseEntry line items grouped by InventoryItem
  const itemPurchaseMap = new Map();
  function registerPurchaseItem(it, p, isCurrent) {
    if (!it || !it.item) return;
    const itemId = it.item._id ? String(it.item._id) : String(it.item);
    const itemName = it.item.name || it.name || 'Unnamed Item';
    const unit = it.unit || 'unit';
    const pricePerUnit = Number(it.pricePerUnit) || 0;
    const qty = Number(it.quantity) || 0;
    const totalPrice = Number(it.totalPrice) || (pricePerUnit * qty);
    const supplier = p.supplier ? (p.supplier.name || String(p.supplier)) : 'Recorded Supplier';

    if (!itemPurchaseMap.has(itemId)) {
      itemPurchaseMap.set(itemId, {
        itemId,
        itemName,
        unit,
        currentEntries: [],
        baselineEntries: [],
      });
    }
    const entry = {
      date: new Date(p.date || p.createdAt),
      pricePerUnit,
      quantity: qty,
      totalPrice,
      supplier,
    };
    if (isCurrent) itemPurchaseMap.get(itemId).currentEntries.push(entry);
    else itemPurchaseMap.get(itemId).baselineEntries.push(entry);
  }

  for (const p of currentPurchases) {
    if (Array.isArray(p.items)) {
      p.items.forEach(it => registerPurchaseItem(it, p, true));
    }
  }
  for (const p of baselinePurchases) {
    if (Array.isArray(p.items)) {
      p.items.forEach(it => registerPurchaseItem(it, p, false));
    }
  }

  for (const [itemId, itemData] of itemPurchaseMap.entries()) {
    if (itemData.currentEntries.length === 0 || itemData.baselineEntries.length === 0) continue;

    const basePrices = itemData.baselineEntries.map(e => e.pricePerUnit).filter(p => p > 0);
    const baseQtys = itemData.baselineEntries.map(e => e.quantity).filter(q => q > 0);
    const baseTotals = itemData.baselineEntries.map(e => e.totalPrice);

    const baseSumQty = baseQtys.reduce((a, b) => a + b, 0);
    const baseSumTotal = baseTotals.reduce((a, b) => a + b, 0);
    const baselineWeightedPrice = baseSumQty > 0 ? baseSumTotal / baseSumQty : mean(basePrices);

    // Current price is latest or weighted average of current purchases
    const currPrices = itemData.currentEntries.map(e => e.pricePerUnit).filter(p => p > 0);
    const currQtys = itemData.currentEntries.map(e => e.quantity).filter(q => q > 0);
    const currTotals = itemData.currentEntries.map(e => e.totalPrice);
    const currSumQty = currQtys.reduce((a, b) => a + b, 0);
    const currSumTotal = currTotals.reduce((a, b) => a + b, 0);
    const currentPrice = currSumQty > 0 ? currSumTotal / currSumQty : mean(currPrices);

    if (baselineWeightedPrice <= 0 || currentPrice <= baselineWeightedPrice) continue;

    const priceDiff = currentPrice - baselineWeightedPrice;
    const priceIncreasePct = ((priceDiff) / baselineWeightedPrice) * 100;

    // Monthly usage estimate: scaled to 30 days
    const monthlyUsage = Math.round((currSumQty / currentDays) * 30);
    const estimatedMonthlyImpact = Math.round(priceDiff * monthlyUsage);

    // Trigger threshold: >= 15% increase and >= ₹5/unit diff and >= ₹1,000 monthly impact
    if (priceIncreasePct >= 14.5 && priceDiff >= 2 && estimatedMonthlyImpact >= 800) {
      const isHighRisk = priceIncreasePct >= 20 && estimatedMonthlyImpact >= 2500;
      const confidence = itemData.baselineEntries.length >= 3 ? 'high' : 'medium';
      const score = Math.min(95, Math.round(50 + (priceIncreasePct * 1.2) + Math.min(25, estimatedMonthlyImpact / 1000)));

      anomalies.push(enrichAnomaly({
        id: `price_spike_${itemId}`,
        detector: 'price_spike',
        domainGroup: `item_${itemId}`,
        category: 'Raw Materials',
        item: itemData.itemName,
        unit: itemData.unit,
        title: `${itemData.itemName} purchase price increased significantly`,
        severity: isHighRisk ? 'potential_leak' : 'unusual',
        score,
        confidence,
        currentValue: Math.round(currentPrice * 100) / 100,
        baselineValue: Math.round(baselineWeightedPrice * 100) / 100,
        difference: Math.round(priceDiff * 100) / 100,
        percentageIncrease: Math.round(priceIncreasePct * 10) / 10,
        estimatedMonthlyImpact,
        whyFlagged: [
          `Current price of ${formatInr(currentPrice)}/${itemData.unit} is ${Math.round(priceIncreasePct)}% above your historical average (${formatInr(baselineWeightedPrice)}/${itemData.unit}).`,
          `Estimated monthly consumption is ${monthlyUsage} ${itemData.unit}, adding approximately ${formatInr(estimatedMonthlyImpact)}/month to operating expenses.`,
          salesGrowthPct < priceIncreasePct
            ? `Sales grew by ${salesGrowthPct}% while unit purchase price grew by ${Math.round(priceIncreasePct)}%.`
            : 'Price increase outpaces standard inflation variance.',
        ],
        possibleCauses: [
          'Supplier price increase or revised contract terms',
          'Market-wide wholesale price fluctuation',
          'Change in raw material grade or portion specification',
          'Incorrect purchase invoice entry',
        ],
        recommendedActions: [
          'Compare recent invoices against previous purchase orders.',
          'Request quotes from alternative recorded suppliers for this item.',
          'Review if item recipe portion or packaging size has changed.',
        ],
        historicalTrend: [
          ...itemData.baselineEntries.slice(-4).map(e => ({ date: e.date.toISOString().slice(5, 10), price: e.pricePerUnit, qty: e.quantity })),
          ...itemData.currentEntries.map(e => ({ date: e.date.toISOString().slice(5, 10), price: e.pricePerUnit, qty: e.quantity })),
        ],
      }));
    }
  }

  // ── DETECTOR #2 & #4: CATEGORY SPENDING SPIKE & SALES-ADJUSTED ANOMALY ─
  // Group payments by category
  const categorySpending = new Map();
  function registerPaymentCategory(category, amount, isCurrent) {
    if (!category) category = 'Miscellaneous';
    if (!categorySpending.has(category)) {
      categorySpending.set(category, { current: 0, baseline: 0, currentCount: 0, baselineCount: 0 });
    }
    const stat = categorySpending.get(category);
    if (isCurrent) {
      stat.current += amount;
      stat.currentCount++;
    } else {
      stat.baseline += amount;
      stat.baselineCount++;
    }
  }

  for (const p of currentPayments) {
    registerPaymentCategory(p.category || 'Miscellaneous', p.amount || 0, true);
  }
  for (const p of baselinePayments) {
    registerPaymentCategory(p.category || 'Miscellaneous', p.amount || 0, false);
  }

  for (const [category, stats] of categorySpending.entries()) {
    if (stats.current <= 0 || stats.baseline <= 0) continue;

    const currentMonthlyRate = (stats.current / currentDays) * 30;
    const baselineMonthlyRate = (stats.baseline / baselineDays) * 30;
    const rawExpenseGrowth = baselineMonthlyRate > 0 ? (currentMonthlyRate - baselineMonthlyRate) / baselineMonthlyRate : 0;
    const rawExpenseGrowthPct = Math.round(rawExpenseGrowth * 100);

    // Sales-adjusted baseline calculation (Detector #4)
    const baselineExpenseToSalesRatio = baselineSalesTotal > 0 ? (stats.baseline / baselineSalesTotal) : 0;
    const currentExpenseToSalesRatio = currentSalesTotal > 0 ? (stats.current / currentSalesTotal) : 0;
    const ratioDiffPoints = (currentExpenseToSalesRatio - baselineExpenseToSalesRatio) * 100;

    // Expected monthly expense if expense grew in exact proportion with sales
    const expectedMonthlyExpense = baselineMonthlyRate * (1 + Math.max(0, salesGrowthRate));
    const estimatedExcessCost = Math.max(0, Math.round(currentMonthlyRate - expectedMonthlyExpense));

    // A) Sales-Adjusted Anomaly (Detector #4)
    if (ratioDiffPoints >= 2.5 && estimatedExcessCost >= 3000 && currentSalesTotal > 0) {
      const isCritical = ratioDiffPoints >= 5.0 && estimatedExcessCost >= 10000;
      anomalies.push(enrichAnomaly({
        id: `sales_adjusted_${category.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        detector: 'sales_adjusted',
        domainGroup: `category_${category.toLowerCase()}`,
        category,
        title: `${category} spending increased significantly faster than sales`,
        severity: isCritical ? 'potential_leak' : 'unusual',
        score: Math.min(95, Math.round(60 + (ratioDiffPoints * 3) + Math.min(20, estimatedExcessCost / 2000))),
        confidence: currentSalesTotal > 0 && stats.currentCount >= 2 ? 'high' : 'medium',
        currentValue: Math.round(currentExpenseToSalesRatio * 1000) / 10,
        baselineValue: Math.round(baselineExpenseToSalesRatio * 1000) / 10,
        unit: '% of sales',
        difference: Math.round(ratioDiffPoints * 10) / 10,
        percentageIncrease: rawExpenseGrowthPct,
        estimatedMonthlyImpact: estimatedExcessCost,
        whyFlagged: [
          `${category} accounted for ${(currentExpenseToSalesRatio * 100).toFixed(1)}% of total revenue this period, compared with a historical baseline of ${(baselineExpenseToSalesRatio * 100).toFixed(1)}%.`,
          `Sales grew by ${salesGrowthPct}%, while ${category} spending increased by ${rawExpenseGrowthPct}%.`,
          `Based on your historical sales ratio, expected spending was ${formatInr(expectedMonthlyExpense)}/month vs actual ${formatInr(currentMonthlyRate)}/month (excess: ${formatInr(estimatedExcessCost)}).`,
        ],
        possibleCauses: [
          'Purchase price escalation across key vendor supplies',
          'Internal food or utility wastage during preparation',
          'Menu pricing has not been updated to reflect increased raw material costs',
          'Unrecorded or miscategorized expense transactions',
        ],
        recommendedActions: [
          'Audit top expenditure line items in this category for recent price increases.',
          'Review kitchen portion control and high-volume ingredient usage.',
          'Check if sales discounts or free items have expanded without expense controls.',
        ],
        historicalTrend: [
          { name: 'Previous Period', expense: Math.round(baselineMonthlyRate), sales: Math.round(baselineDailySales * 30) },
          { name: 'Current Period', expense: Math.round(currentMonthlyRate), sales: Math.round(currentDailySales * 30) },
        ],
      }));
    }
    // B) Standard Categorical Expense Spike (Detector #2) — only if not already flagged by sales-adjusted
    else if (rawExpenseGrowthPct >= 30 && (currentMonthlyRate - baselineMonthlyRate) >= 3000) {
      const spendingDiff = Math.round(currentMonthlyRate - baselineMonthlyRate);
      anomalies.push(enrichAnomaly({
        id: `expense_spike_${category.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        detector: 'expense_spike',
        domainGroup: `category_${category.toLowerCase()}`,
        category,
        title: `${category} spending increased ${rawExpenseGrowthPct}% compared with normal level`,
        severity: 'unusual',
        score: Math.min(85, Math.round(55 + (rawExpenseGrowthPct * 0.5))),
        confidence: 'medium',
        currentValue: Math.round(currentMonthlyRate),
        baselineValue: Math.round(baselineMonthlyRate),
        unit: '₹/month',
        difference: spendingDiff,
        percentageIncrease: rawExpenseGrowthPct,
        estimatedMonthlyImpact: spendingDiff,
        whyFlagged: [
          `Current monthly spending rate is ${formatInr(currentMonthlyRate)} vs historical normal of ${formatInr(baselineMonthlyRate)} (+${rawExpenseGrowthPct}%).`,
          `Difference of ${formatInr(spendingDiff)}/month deserves operational review.`,
        ],
        possibleCauses: [
          'Ad-hoc or one-off equipment repairs and servicing',
          'Seasonal maintenance or inventory restocking',
          'Increased purchase volume',
        ],
        recommendedActions: [
          'Review individual payment receipts recorded in this category.',
          'Verify whether this represents a temporary seasonal cost or an ongoing commitment.',
        ],
        historicalTrend: [
          { name: 'Baseline', expense: Math.round(baselineMonthlyRate) },
          { name: 'Current', expense: Math.round(currentMonthlyRate) },
        ],
      }));
    }
  }

  // ── DETECTOR #3: USAGE SPIKE (Item Quantity vs Business Activity) ───
  for (const [itemId, itemData] of itemPurchaseMap.entries()) {
    if (itemData.currentEntries.length === 0 || itemData.baselineEntries.length === 0) continue;

    const baseSumQty = itemData.baselineEntries.reduce((s, e) => s + e.quantity, 0);
    const currSumQty = itemData.currentEntries.reduce((s, e) => s + e.quantity, 0);
    if (baseSumQty <= 0 || currSumQty <= 0) continue;

    const baseDailyQty = baseSumQty / baselineDays;
    const currDailyQty = currSumQty / currentDays;
    const qtyGrowthRate = (currDailyQty - baseDailyQty) / baseDailyQty;
    const qtyGrowthPct = Math.round(qtyGrowthRate * 100);

    // Compare against business activity (orders growth or sales growth)
    const activityGrowth = Math.max(ordersGrowthRate, salesGrowthRate, 0);
    const activityGrowthPct = Math.round(activityGrowth * 100);

    // If quantity consumption grew at least 25% faster than sales/orders
    if (qtyGrowthPct >= 25 && (qtyGrowthPct - activityGrowthPct) >= 20) {
      const expectedCurrQty = (baseDailyQty * (1 + activityGrowth)) * currentDays;
      const excessQty = Math.max(0, currSumQty - expectedCurrQty);
      const avgPrice = mean(itemData.currentEntries.map(e => e.pricePerUnit));
      const estimatedExcessCost = Math.round((excessQty / currentDays) * 30 * avgPrice);

      if (estimatedExcessCost >= 1200) {
        anomalies.push(enrichAnomaly({
          id: `usage_spike_${itemId}`,
          detector: 'usage_spike',
          domainGroup: `item_${itemId}`,
          category: 'Raw Materials',
          item: itemData.itemName,
          unit: itemData.unit,
          title: `${itemData.itemName} consumption increased significantly faster than sales`,
          severity: estimatedExcessCost >= 4000 ? 'potential_leak' : 'unusual',
          score: Math.min(90, Math.round(55 + (qtyGrowthPct - activityGrowthPct) + Math.min(20, estimatedExcessCost / 1000))),
          confidence: itemData.baselineEntries.length >= 2 ? 'high' : 'medium',
          currentValue: Math.round(currSumQty),
          baselineValue: Math.round((baseSumQty / baselineDays) * currentDays),
          unit: itemData.unit,
          difference: Math.round(excessQty * 10) / 10,
          percentageIncrease: qtyGrowthPct,
          estimatedMonthlyImpact: estimatedExcessCost,
          whyFlagged: [
            `${itemData.itemName} purchase volume increased by ${qtyGrowthPct}% while sales/orders grew by only ${activityGrowthPct}%.`,
            `Actual purchase: ${Math.round(currSumQty)} ${itemData.unit} vs expected: ${Math.round(expectedCurrQty)} ${itemData.unit} for this volume of business.`,
            `Estimated cost impact of excess usage is approximately ${formatInr(estimatedExcessCost)}/month.`,
          ],
          possibleCauses: [
            'Increased wastage during prep or storage spoilage',
            'Portion size changes in kitchen plating',
            'Inventory stock count adjustment or timing difference',
            'Bulk purchasing ahead of demand or festival anticipation',
          ],
          recommendedActions: [
            'Conduct an inventory stock audit to verify on-hand stock vs purchases.',
            'Inspect prep station yield and batch cooking waste logs.',
            'Verify standard recipe portion weights with kitchen staff.',
          ],
          historicalTrend: [
            { name: 'Baseline Qty', qty: Math.round((baseDailyQty) * 30) },
            { name: 'Current Qty', qty: Math.round((currDailyQty) * 30) },
          ],
        }));
      }
    }
  }

  // ── DETECTOR #5: SMALL EXPENSE ACCUMULATION ─────────────────────────
  // Identifies individually small recurring expenses that collectively sum to a significant drain
  const smallThreshold = 4000;
  const smallExpenses = currentPayments.filter(p => {
    const amt = p.amount || 0;
    const cat = p.category || '';
    // Focus on non-primary operational categories that often hide creep
    return amt > 0 && amt <= smallThreshold && cat !== 'Raw Materials' && cat !== 'Rent';
  });

  if (smallExpenses.length >= 4) {
    const smallTotal = smallExpenses.reduce((s, p) => s + (p.amount || 0), 0);
    const smallMonthlyNormalized = Math.round((smallTotal / currentDays) * 30);

    if (smallMonthlyNormalized >= 6000) {
      // Group by category for clear breakdown
      const catCountMap = {};
      smallExpenses.forEach(p => {
        const c = p.category || 'Miscellaneous';
        catCountMap[c] = (catCountMap[c] || 0) + (p.amount || 0);
      });
      const breakdownText = Object.entries(catCountMap)
        .map(([c, a]) => `${c}: ${formatInr(a)}`)
        .join(', ');

      anomalies.push(enrichAnomaly({
        id: 'small_expense_accumulation',
        detector: 'small_expense_accumulation',
        domainGroup: 'small_expenses_accumulation',
        category: 'Miscellaneous & Overhead',
        title: 'Small recurring expenses collectively adding up',
        severity: 'unusual',
        score: Math.min(80, Math.round(50 + (smallExpenses.length * 2) + Math.min(20, smallMonthlyNormalized / 2000))),
        confidence: 'high',
        currentValue: smallMonthlyNormalized,
        baselineValue: smallThreshold,
        unit: '₹/month',
        difference: smallTotal,
        percentageIncrease: smallExpenses.length,
        estimatedMonthlyImpact: smallMonthlyNormalized,
        whyFlagged: [
          `${smallExpenses.length} small expenses (under ${formatInr(smallThreshold)} each) total ${formatInr(smallTotal)} this period.`,
          `Annualized or monthly rate is approximately ${formatInr(smallMonthlyNormalized)}/month.`,
          `Category breakdown: ${breakdownText}.`,
        ],
        possibleCauses: [
          'Multiple ad-hoc trips for packaging, cleaning supplies or petty cash items',
          'Lack of centralized weekly purchasing for consumables',
          'Unmonitored incidental delivery or transport reimbursements',
        ],
        recommendedActions: [
          'Consolidate small repeat purchases into scheduled bulk orders to negotiate discounts.',
          'Set a weekly petty cash cap and require receipt attachments.',
          'Review the list of small recurring transactions below.',
        ],
        relatedExpenses: smallExpenses.slice(0, 10).map(p => ({
          date: new Date(p.date || p.createdAt).toISOString().slice(0, 10),
          category: p.category,
          payee: p.payee || p.description || 'Petty Cash',
          amount: p.amount,
        })),
      }));
    }
  }

  // ── DETECTOR #6: DUPLICATE EXPENSES ─────────────────────────────────
  // Scans for near-identical amounts, dates, and suppliers in current period
  const duplicatePairs = [];
  const checked = new Set();

  for (let i = 0; i < currentPayments.length; i++) {
    const p1 = currentPayments[i];
    if (checked.has(String(p1._id))) continue;

    for (let j = i + 1; j < currentPayments.length; j++) {
      const p2 = currentPayments[j];
      if (checked.has(String(p2._id))) continue;

      const amtMatch = Math.abs((p1.amount || 0) - (p2.amount || 0)) <= 1 && (p1.amount || 0) > 0;
      const catMatch = (p1.category || '') === (p2.category || '');
      const d1 = new Date(p1.date || p1.createdAt);
      const d2 = new Date(p2.date || p2.createdAt);
      const daysApart = Math.abs((d1.getTime() - d2.getTime()) / 86400000);

      // Same payee/supplier match or description match
      const payeeMatch = (p1.payee && p2.payee && p1.payee.toLowerCase().trim() === p2.payee.toLowerCase().trim()) ||
                         (p1.supplier && p2.supplier && String(p1.supplier) === String(p2.supplier));

      if (amtMatch && catMatch && daysApart <= 1.5 && (payeeMatch || (p1.description && p1.description === p2.description))) {
        checked.add(String(p1._id));
        checked.add(String(p2._id));
        duplicatePairs.push({ p1, p2, amount: p1.amount, category: p1.category });
        break;
      }
    }
  }

  for (const dup of duplicatePairs) {
    const p1Date = new Date(dup.p1.date || dup.p1.createdAt).toISOString().slice(0, 10);
    const p2Date = new Date(dup.p2.date || dup.p2.createdAt).toISOString().slice(0, 10);
    const payeeName = dup.p1.payee || dup.p1.description || dup.category;

    anomalies.push(enrichAnomaly({
      id: `duplicate_${dup.p1._id}_${dup.p2._id}`,
      detector: 'duplicate_expense',
      domainGroup: `duplicate_${dup.p1._id}`,
      category: dup.category,
      title: `Possible duplicate expense recorded for ${payeeName}`,
      severity: 'unusual',
      score: 72,
      confidence: 'medium',
      currentValue: dup.amount,
      baselineValue: 0,
      unit: '₹',
      difference: dup.amount,
      percentageIncrease: 100,
      estimatedMonthlyImpact: dup.amount,
      whyFlagged: [
        `Two identical transactions of ${formatInr(dup.amount)} were recorded within 24–48 hours (${p1Date} and ${p2Date}).`,
        `Both share category "${dup.category}" and payee "${payeeName}".`,
      ],
      possibleCauses: [
        'Accidental double-entry by staff or manager',
        'Invoice was entered once on arrival and again during payment reconciliation',
        'Legitimate repeat order for the same exact value on consecutive days',
      ],
      recommendedActions: [
        'Inspect both payment records to verify if two distinct goods/services were received.',
        'If one is a duplicate entry, delete or reverse the duplicate transaction.',
        'If legitimate, click "Mark as Normal" to dismiss this alert.',
      ],
      relatedExpenses: [
        { id: dup.p1._id, date: p1Date, category: dup.p1.category, payee: payeeName, amount: dup.p1.amount },
        { id: dup.p2._id, date: p2Date, category: dup.p2.category, payee: payeeName, amount: dup.p2.amount },
      ],
    }));
  }

  // ── DETECTOR #7: SUPPLIER PRICE ANOMALY (Multi-Supplier Variance) ───
  // Compares unit prices of the same item across different suppliers
  for (const [itemId, itemData] of itemPurchaseMap.entries()) {
    const allEntries = [...itemData.baselineEntries, ...itemData.currentEntries];
    if (allEntries.length < 2) continue;

    // Group by supplier
    const supplierPriceMap = new Map();
    for (const e of allEntries) {
      if (!e.supplier || e.pricePerUnit <= 0) continue;
      if (!supplierPriceMap.has(e.supplier)) {
        supplierPriceMap.set(e.supplier, []);
      }
      supplierPriceMap.get(e.supplier).push(e.pricePerUnit);
    }

    if (supplierPriceMap.size >= 2) {
      const supplierAvgs = [];
      for (const [suppName, prices] of supplierPriceMap.entries()) {
        supplierAvgs.push({ supplier: suppName, avgPrice: mean(prices), recentPrice: prices[prices.length - 1] });
      }
      supplierAvgs.sort((a, b) => b.recentPrice - a.recentPrice);

      const highest = supplierAvgs[0];
      const lowest = supplierAvgs[supplierAvgs.length - 1];

      if (lowest.recentPrice > 0 && highest.recentPrice > lowest.recentPrice) {
        const diff = highest.recentPrice - lowest.recentPrice;
        const diffPct = ((diff) / lowest.recentPrice) * 100;
        const totalRecentQty = itemData.currentEntries.reduce((s, e) => s + e.quantity, 0) || 30;
        const monthlyQty = Math.round((totalRecentQty / currentDays) * 30);
        const estimatedImpact = Math.round(diff * monthlyQty);

        if (diffPct >= 12 && estimatedImpact >= 1000) {
          anomalies.push(enrichAnomaly({
            id: `supplier_variance_${itemId}`,
            detector: 'supplier_price_anomaly',
            domainGroup: `item_${itemId}`,
            category: 'Raw Materials',
            item: itemData.itemName,
            unit: itemData.unit,
            supplier: highest.supplier,
            title: `Supplier price difference detected for ${itemData.itemName}`,
            severity: diffPct >= 20 ? 'potential_leak' : 'unusual',
            score: Math.min(90, Math.round(55 + (diffPct * 1.2) + Math.min(20, estimatedImpact / 1500))),
            confidence: 'high',
            currentValue: Math.round(highest.recentPrice * 100) / 100,
            baselineValue: Math.round(lowest.recentPrice * 100) / 100,
            unit: `${itemData.unit}`,
            difference: Math.round(diff * 100) / 100,
            percentageIncrease: Math.round(diffPct * 10) / 10,
            estimatedMonthlyImpact: estimatedImpact,
            whyFlagged: [
              `${highest.supplier} charges ${formatInr(highest.recentPrice)}/${itemData.unit}, which is ${Math.round(diffPct)}% higher than your alternative recorded supplier ${lowest.supplier} (${formatInr(lowest.recentPrice)}/${itemData.unit}).`,
              `Purchasing from the higher-priced supplier represents an estimated variance of ${formatInr(estimatedImpact)}/month.`,
            ],
            possibleCauses: [
              'Different quality grade, cut, or packaging specification between vendors',
              'Credit term premiums (supplier offering credit may charge higher than cash supplier)',
              'Lack of price comparison prior to placing emergency purchase orders',
            ],
            recommendedActions: [
              `Request price matching from ${highest.supplier} based on ${lowest.supplier}'s pricing.`,
              `Shift regular order volume to ${lowest.supplier} if quality is comparable.`,
              'Establish preferred supplier price locks for high-volume items.',
            ],
            supplierComparison: supplierAvgs.map(s => ({
              supplier: s.supplier,
              price: Math.round(s.recentPrice * 100) / 100,
              avgPrice: Math.round(s.avgPrice * 100) / 100,
              isHighest: s.supplier === highest.supplier,
            })),
          }));
        }
      }
    }
  }

  // ── DETECTOR #8: PURCHASE FREQUENCY ANOMALY ─────────────────────────
  for (const [category, stats] of categorySpending.entries()) {
    if (stats.baselineCount <= 0 || stats.currentCount <= 0) continue;

    const currentMonthlyFreq = (stats.currentCount / currentDays) * 30;
    const baselineMonthlyFreq = (stats.baselineCount / baselineDays) * 30;
    const freqRatio = baselineMonthlyFreq > 0 ? currentMonthlyFreq / baselineMonthlyFreq : 1;

    // Trigger if frequency doubled and at least 6 transactions in active period
    if (freqRatio >= 2.0 && stats.currentCount >= 6 && currentMonthlyFreq >= 8) {
      anomalies.push(enrichAnomaly({
        id: `frequency_anomaly_${category.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        detector: 'frequency_anomaly',
        domainGroup: `frequency_${category.toLowerCase()}`,
        category,
        title: `Purchase frequency for ${category} increased significantly`,
        severity: 'unusual',
        score: Math.min(80, Math.round(50 + (freqRatio * 10))),
        confidence: 'medium',
        currentValue: Math.round(currentMonthlyFreq),
        baselineValue: Math.round(baselineMonthlyFreq),
        unit: 'purchases/mo',
        difference: Math.round(currentMonthlyFreq - baselineMonthlyFreq),
        percentageIncrease: Math.round((freqRatio - 1) * 100),
        estimatedMonthlyImpact: 0, // Frequency alone doesn't directly compute monetary loss unless paired with delivery fees
        whyFlagged: [
          `${category} was purchased at a rate of ~${Math.round(currentMonthlyFreq)} times/month compared with a baseline of ~${Math.round(baselineMonthlyFreq)} times/month.`,
          `Purchasing in smaller, more frequent batches can lead to delivery overhead and missed volume discounts.`,
        ],
        possibleCauses: [
          'Reduced cash flow requiring smaller daily purchases',
          'Storage or refrigeration space constraints',
          'Lack of planned weekly inventory procurement schedule',
        ],
        recommendedActions: [
          'Review if small frequent orders incur extra delivery or logistics charges.',
          'Consolidate repeat purchases into 2–3 structured weekly supplier orders.',
        ],
      }));
    }
  }

  // ── ANTI-DOUBLE-COUNTING & ROOT CAUSE AGGREGATION ───────────────────
  // Group anomalies by domain/root cause to avoid counting overlapping impacts
  // e.g. Chicken Price Spike (₹18,000) inside Raw Materials Food Cost Anomaly (₹25,000)
  const rootCauseMap = new Map();

  for (const a of anomalies) {
    if (a.status === 'dismissed') continue; // Don't add dismissed alerts to active financial leak total

    const domain = a.domainGroup || a.id;
    // Map item-level raw material alerts and category raw material alerts to a shared cluster
    const clusterKey = (domain.startsWith('item_') || domain.includes('raw_materials') || a.category === 'Raw Materials')
      ? 'cluster_food_cost_and_raw_materials'
      : domain;

    if (!rootCauseMap.has(clusterKey)) {
      rootCauseMap.set(clusterKey, {
        clusterKey,
        anomalies: [],
        maxImpact: 0,
        sumImpact: 0,
      });
    }
    const cluster = rootCauseMap.get(clusterKey);
    cluster.anomalies.push(a);
    cluster.sumImpact += (a.estimatedMonthlyImpact || 0);
    cluster.maxImpact = Math.max(cluster.maxImpact, a.estimatedMonthlyImpact || 0);
  }

  // Deduplicated Total Impact calculation:
  // For each cluster, take the max impact (e.g. food cost macro excess) so item-level price
  // spikes that contributed to it are not added twice!
  let deduplicatedMonthlyImpact = 0;
  for (const cluster of rootCauseMap.values()) {
    deduplicatedMonthlyImpact += cluster.maxImpact;
    // Tag related anomalies for UI transparency
    if (cluster.anomalies.length > 1) {
      cluster.anomalies.forEach(a => {
        a.rootCauseCluster = {
          name: cluster.clusterKey === 'cluster_food_cost_and_raw_materials' ? 'Raw Materials & Food Cost Escalation' : 'Related Signals',
          relatedAlertCount: cluster.anomalies.length,
          combinedImpact: cluster.maxImpact,
          isDeduplicated: true,
        };
      });
    }
  }

  // Sort anomalies: high-risk first, then highest estimated monthly impact
  anomalies.sort((a, b) => {
    const sevScore = { potential_leak: 3, unusual: 2, normal: 1 };
    if (sevScore[b.severity] !== sevScore[a.severity]) {
      return sevScore[b.severity] - sevScore[a.severity];
    }
    return (b.estimatedMonthlyImpact || 0) - (a.estimatedMonthlyImpact || 0);
  });

  // KPI Summary Counts (excluding dismissed)
  const activeAnomalies = anomalies.filter(a => a.status !== 'dismissed');
  const highRiskCount = activeAnomalies.filter(a => a.severity === 'potential_leak').length;
  const needsAttentionCount = activeAnomalies.filter(a => a.severity === 'unusual').length;
  const normalCount = activeAnomalies.filter(a => a.severity === 'normal').length;
  const categoriesAnalyzed = categorySpending.size;

  // Top 3 Priorities
  const topPriorities = activeAnomalies
    .filter(a => (a.estimatedMonthlyImpact || 0) > 0)
    .slice(0, 3)
    .map((a, idx) => ({
      rank: idx + 1,
      id: a.id,
      title: a.title,
      itemOrCategory: a.item || a.category,
      estimatedMonthlyImpact: a.estimatedMonthlyImpact,
      severity: a.severity,
      action: a.recommendedActions?.[0] || 'Investigate invoice and pricing',
    }));

  return {
    summary: {
      totalPotentialImpact: deduplicatedMonthlyImpact,
      highRiskCount,
      needsAttentionCount,
      normalCount,
      categoriesAnalyzed,
      totalIssuesCount: activeAnomalies.length,
      reviewedCount: anomalies.filter(a => a.status === 'reviewed').length,
      dismissedCount: anomalies.filter(a => a.status === 'dismissed').length,
      priorities: topPriorities,
      salesTotal: currentSalesTotal,
      salesGrowthPct,
      hasEnoughData,
      insufficientDataReason,
    },
    anomalies,
    categories: Array.from(categorySpending.keys()),
    suppliers: Array.from(new Set(purchases.map(p => p.supplier?.name || (p.supplier ? String(p.supplier) : null)).filter(Boolean))),
  };
}

module.exports = {
  analyzeExpenseLeaks,
  mean,
  stdDev,
};
