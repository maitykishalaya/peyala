// ─────────────────────────────────────────────────────────────────
// Sales Suggestion & Action Rule Engine
// Peyala v8 — Rule-based Sales Decision Engine
// Interprets sales data, checks thresholds, and generates actionable advice
// ─────────────────────────────────────────────────────────────────

/**
 * Format currency in Indian Rupees
 */
function formatInr(val) {
  return '₹' + Math.round(val || 0).toLocaleString('en-IN');
}

/**
 * Evaluates all sales suggestion rules against current period metrics,
 * previous period baseline, and configuration thresholds.
 *
 * @param {Object} params
 * @param {Object} params.kpis - Main KPI metrics (current vs previous)
 * @param {Object} params.todayStatus - Today's sales target & actuals
 * @param {Array}  params.dowStats - Day of week performance array (Mon-Sun)
 * @param {Array}  params.hourlyStats - Hourly sales array (0-23)
 * @param {Array}  params.channelStats - Sales by channel array
 * @param {Array}  params.deliveryStats - Platform performance (Zomato, Fatafat)
 * @param {Array}  params.itemStats - Item-wise sales performance
 * @param {Object} params.config - SalesAnalyticsConfig document
 * @returns {Object} { suggestions: Array, top3Actions: Array }
 */
function evaluateSalesSuggestions({
  kpis = {},
  todayStatus = {},
  dowStats = [],
  hourlyStats = [],
  channelStats = [],
  deliveryStats = [],
  itemStats = [],
  config = {},
}) {
  const suggestions = [];

  const targetAov = Number(config.targetAov) || 150;
  const weakDayThresholdPct = Number(config.weakDayThresholdPct) || 20;
  const deliveryDeductionThresholdPct = Number(config.deliveryDeductionThresholdPct) || 35;
  const lowItemSalesThresholdQty = Number(config.lowItemSalesThresholdQty) || 5;

  // Active actions map (to filter dismissed or snoozed rules)
  const actionsMap = new Map();
  if (Array.isArray(config.suggestionActions)) {
    const now = new Date();
    for (const act of config.suggestionActions) {
      if (act.status === 'dismissed') {
        actionsMap.set(act.actionId, 'dismissed');
      } else if (act.status === 'snoozed' && act.snoozedUntil && new Date(act.snoozedUntil) > now) {
        actionsMap.set(act.actionId, 'snoozed');
      } else if (act.status === 'completed') {
        actionsMap.set(act.actionId, 'completed');
      }
    }
  }

  // Helper to add suggestion if not dismissed or currently snoozed
  function addSuggestion(item) {
    const state = actionsMap.get(item.id);
    if (state === 'dismissed' || state === 'snoozed') {
      return;
    }
    item.isCompleted = state === 'completed';
    // Provide aliases for backwards/frontend compatibility
    if (!item.finding && item.explanation) item.finding = item.explanation;
    if (!item.action && item.recommendedAction) item.action = item.recommendedAction;
    if (!item.impact && item.supportingMetric) {
      item.impact = `${item.supportingMetric.label}: ${item.supportingMetric.current}`;
    }
    suggestions.push(item);
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 1: LOW_DAILY_SALES (Today's Sales vs Target)
  // ─────────────────────────────────────────────────────────────
  if (todayStatus.target > 0) {
    const achievementPct = todayStatus.achievementPct || 0;
    const remaining = todayStatus.remaining || 0;
    const targetLabel = todayStatus.isSuggested ? 'suggested target' : 'configured target';

    if (achievementPct < 70 && remaining > 0) {
      addSuggestion({
        id: `low_daily_sales_${todayStatus.dateStr || 'today'}`,
        ruleId: 'LOW_DAILY_SALES',
        category: 'sales',
        severity: achievementPct < 50 ? 'high' : 'medium',
        title: "Today's sales are trailing daily target",
        explanation: `Today's revenue is ${formatInr(todayStatus.actual)}, achieving only ${achievementPct.toFixed(1)}% of the ${targetLabel} (${formatInr(todayStatus.target)}). ${formatInr(remaining)} remaining.`,
        supportingMetric: {
          label: 'Target Achievement',
          current: `${achievementPct.toFixed(1)}%`,
          baseline: formatInr(todayStatus.target),
          diffPct: -(100 - achievementPct),
        },
        recommendedAction: 'Run an evening rush combo discount or promote popular quick bites on the dine-in floor.',
        targetTab: 'overview',
        targetAnchor: 'today-status-card',
        weight: 90,
      });
    } else if (achievementPct >= 100) {
      addSuggestion({
        id: `target_achieved_${todayStatus.dateStr || 'today'}`,
        ruleId: 'TARGET_ACHIEVED',
        category: 'sales',
        severity: 'positive',
        title: 'Daily sales target achieved!',
        explanation: `Today's revenue reached ${formatInr(todayStatus.actual)}, surpassing the ${targetLabel} of ${formatInr(todayStatus.target)} (${achievementPct.toFixed(1)}%).`,
        supportingMetric: {
          label: 'Achievement',
          current: `${achievementPct.toFixed(1)}%`,
          baseline: formatInr(todayStatus.target),
          diffPct: achievementPct - 100,
        },
        recommendedAction: 'Maintain current table turnaround speed and ensure top beverage and dessert stock is replenished for peak hours.',
        targetTab: 'overview',
        targetAnchor: 'today-status-card',
        weight: 30,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 2: LOW_WEEKDAY_SALES (Identify Consistently Weak Days)
  // ─────────────────────────────────────────────────────────────
  if (dowStats.length > 0) {
    const validDows = dowStats.filter((d) => d.daysCount > 0);
    if (validDows.length >= 3) {
      const overallAvg = validDows.reduce((sum, d) => sum + d.avgSales, 0) / validDows.length;
      if (overallAvg > 0) {
        // Find days falling below the threshold
        const weakDays = validDows.filter((d) => {
          const dropPct = ((overallAvg - d.avgSales) / overallAvg) * 100;
          return dropPct >= weakDayThresholdPct;
        });

        for (const wd of weakDays) {
          const dropPct = Math.round(((overallAvg - wd.avgSales) / overallAvg) * 100);
          addSuggestion({
            id: `low_weekday_${wd.dayName.toLowerCase()}`,
            ruleId: 'LOW_WEEKDAY_SALES',
            category: 'sales',
            severity: dropPct > 35 ? 'high' : 'opportunity',
            title: `${wd.dayName} sales are ${dropPct}% below average`,
            explanation: `${wd.dayName} average sales are ${formatInr(wd.avgSales)}, which is ${dropPct}% below the overall daily average of ${formatInr(overallAvg)} across ${wd.daysCount} recorded days.`,
            supportingMetric: {
              label: `${wd.dayName} vs Average`,
              current: formatInr(wd.avgSales),
              baseline: formatInr(overallAvg),
              diffPct: -dropPct,
            },
            recommendedAction: `Introduce a dedicated "${wd.dayName} Special Combo" (e.g. Burger + Cold Coffee or Chai + Snack pairing) to stimulate traffic on slower ${wd.dayName}s.`,
            targetTab: 'overview',
            targetAnchor: 'day-of-week-section',
            weight: 80 + Math.min(15, dropPct),
          });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 3: LOW_AOV & AOV_DECLINE (Average Order Value Engine)
  // ─────────────────────────────────────────────────────────────
  const currentAov = kpis.aov || 0;
  const prevAov = kpis.prevAov || 0;
  const aovGrowthPct = kpis.aovGrowthPct || 0;
  const orderGrowthPct = kpis.ordersGrowthPct || 0;

  if (currentAov > 0) {
    if (currentAov < targetAov) {
      const gapPct = Math.round(((targetAov - currentAov) / targetAov) * 100);
      addSuggestion({
        id: 'low_aov_gap',
        ruleId: 'LOW_AOV',
        category: 'pricing',
        severity: 'opportunity',
        title: `Average Order Value is ${formatInr(currentAov)} (Target: ${formatInr(targetAov)})`,
        explanation: `The average bill value of ${formatInr(currentAov)} is trailing your target of ${formatInr(targetAov)} by ${gapPct}%. Customers are ordering fewer companion items per table.`,
        supportingMetric: {
          label: 'AOV Gap',
          current: formatInr(currentAov),
          baseline: formatInr(targetAov),
          diffPct: -gapPct,
        },
        recommendedAction: 'Train service staff to suggest add-ons (cheese, extra dips) and beverages when taking food orders, or bundle appetizers as pre-meal starters.',
        targetTab: 'overview',
        targetAnchor: 'aov-analysis-card',
        weight: 75,
      });
    }

    // AOV Decline while order volume is stable/increasing
    if (prevAov > 0 && aovGrowthPct <= -5 && orderGrowthPct >= -2) {
      addSuggestion({
        id: 'aov_decline_volume_stable',
        ruleId: 'AOV_DECLINE',
        category: 'pricing',
        severity: 'medium',
        title: 'Order volume is steady but average spend per table has dropped',
        explanation: `Order count grew ${orderGrowthPct > 0 ? '+' : ''}${orderGrowthPct.toFixed(1)}%, but Average Order Value declined by ${Math.abs(aovGrowthPct).toFixed(1)}% (from ${formatInr(prevAov)} to ${formatInr(currentAov)}).`,
        supportingMetric: {
          label: 'AOV Trend',
          current: formatInr(currentAov),
          baseline: formatInr(prevAov),
          diffPct: aovGrowthPct,
        },
        recommendedAction: 'Review menu pricing on combo items and evaluate if low-ticket solo items are cannibalizing full-meal orders.',
        targetTab: 'overview',
        targetAnchor: 'aov-analysis-card',
        weight: 70,
      });
    } else if (aovGrowthPct >= 8) {
      addSuggestion({
        id: 'aov_growth_positive',
        ruleId: 'AOV_GROWTH',
        category: 'pricing',
        severity: 'positive',
        title: `Average Order Value grew by ${aovGrowthPct.toFixed(1)}%`,
        explanation: `Customers are spending more per order on average, rising from ${formatInr(prevAov)} to ${formatInr(currentAov)}.`,
        supportingMetric: {
          label: 'AOV Increase',
          current: formatInr(currentAov),
          baseline: formatInr(prevAov),
          diffPct: aovGrowthPct,
        },
        recommendedAction: 'Analyze your top-selling combos from this period to double down on what drove higher ticket sizes.',
        targetTab: 'overview',
        targetAnchor: 'aov-analysis-card',
        weight: 40,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 4: SALES_DECLINE & SALES_GROWTH
  // ─────────────────────────────────────────────────────────────
  const salesGrowthPct = kpis.salesGrowthPct || 0;
  if (kpis.prevNetSales > 0 && Math.abs(salesGrowthPct) > 0.1) {
    if (salesGrowthPct <= -12) {
      addSuggestion({
        id: 'sales_decline_warning',
        ruleId: 'SALES_DECLINE',
        category: 'sales',
        severity: salesGrowthPct <= -25 ? 'high' : 'medium',
        title: `Net revenue declined by ${Math.abs(salesGrowthPct).toFixed(1)}% compared to previous period`,
        explanation: `Net revenue was ${formatInr(kpis.netSales)} compared to ${formatInr(kpis.prevNetSales)} in the previous comparable timeframe.`,
        supportingMetric: {
          label: 'Revenue Change',
          current: formatInr(kpis.netSales),
          baseline: formatInr(kpis.prevNetSales),
          diffPct: salesGrowthPct,
        },
        recommendedAction: 'Inspect channel breakdowns to determine if the decline stems from dine-in floor footfall or online delivery volume.',
        targetTab: 'overview',
        targetAnchor: 'channel-breakdown-section',
        weight: 85,
      });
    } else if (salesGrowthPct >= 10) {
      addSuggestion({
        id: 'sales_growth_positive',
        ruleId: 'SALES_GROWTH',
        category: 'sales',
        severity: 'positive',
        title: `Strong sales expansion: +${salesGrowthPct.toFixed(1)}% revenue growth`,
        explanation: `Net sales increased to ${formatInr(kpis.netSales)} from ${formatInr(kpis.prevNetSales)} in the prior period.`,
        supportingMetric: {
          label: 'Revenue Growth',
          current: formatInr(kpis.netSales),
          baseline: formatInr(kpis.prevNetSales),
          diffPct: salesGrowthPct,
        },
        recommendedAction: 'Ensure inventory reorder points for your top-performing dishes are raised to avoid stockouts during demand surges.',
        targetTab: 'overview',
        targetAnchor: 'sales-trend-section',
        weight: 35,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 5: DELIVERY_LEAKAGE (Commission & Deductions Review)
  // ─────────────────────────────────────────────────────────────
  if (Array.isArray(deliveryStats) && deliveryStats.length > 0) {
    for (const platform of deliveryStats) {
      if (platform.grossSales > 1000 && platform.effectiveDeductionPct > deliveryDeductionThresholdPct) {
        addSuggestion({
          id: `delivery_leakage_${platform.platformName.toLowerCase()}`,
          ruleId: 'DELIVERY_LEAKAGE',
          category: 'delivery',
          severity: platform.effectiveDeductionPct > 45 ? 'high' : 'medium',
          title: `High platform deductions on ${platform.platformName} (${platform.effectiveDeductionPct.toFixed(1)}%)`,
          explanation: `On ${platform.platformName}, deductions (commissions of ${formatInr(platform.commission)}, discounts of ${formatInr(platform.restaurantDiscount + platform.platformDiscount)}) consumed ${platform.effectiveDeductionPct.toFixed(1)}% of gross sales (${formatInr(platform.grossSales)}), netting only ${formatInr(platform.netSettlement)}.`,
          supportingMetric: {
            label: `${platform.platformName} Deductions`,
            current: `${platform.effectiveDeductionPct.toFixed(1)}%`,
            baseline: `${deliveryDeductionThresholdPct}% Max`,
            diffPct: platform.effectiveDeductionPct - deliveryDeductionThresholdPct,
          },
          recommendedAction: `Audit your ${platform.platformName} discounting campaigns and assess menu markups or packaging charges to preserve unit margins.`,
          targetTab: 'overview',
          targetAnchor: 'delivery-performance-section',
          weight: 82,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 6: HOURLY_OPPORTUNITY (Slow Mid-Day or Evening Lull)
  // ─────────────────────────────────────────────────────────────
  if (Array.isArray(hourlyStats) && hourlyStats.length >= 6) {
    const operatingHours = hourlyStats.filter((h) => h.orders > 0 || (h.hour >= 11 && h.hour <= 22));
    if (operatingHours.length > 0) {
      const avgHourlySales = operatingHours.reduce((sum, h) => sum + h.sales, 0) / operatingHours.length;
      if (avgHourlySales > 300) {
        // Look for consecutive slow operational hours between 14:00 (2 PM) and 18:00 (6 PM)
        const afternoonLull = operatingHours.filter((h) => h.hour >= 14 && h.hour <= 17 && h.sales < avgHourlySales * 0.4);
        if (afternoonLull.length >= 2) {
          const hoursList = afternoonLull.map((h) => `${h.hour % 12 || 12} ${h.hour >= 12 ? 'PM' : 'AM'}`).join(', ');
          addSuggestion({
            id: 'slow_afternoon_hours',
            ruleId: 'HOURLY_OPPORTUNITY',
            category: 'operations',
            severity: 'opportunity',
            title: 'Afternoon hours (2 PM – 5 PM) have significant spare capacity',
            explanation: `Sales during ${hoursList} consistently drop more than 60% below your average peak operational volume.`,
            supportingMetric: {
              label: 'Afternoon Sales',
              current: formatInr(afternoonLull.reduce((sum, h) => sum + h.sales, 0) / afternoonLull.length),
              baseline: formatInr(avgHourlySales),
              diffPct: -60,
            },
            recommendedAction: 'Introduce an "Afternoon Chai & Bites" or "Work-from-Café" snack package to capture mid-day patrons and student traffic.',
            targetTab: 'overview',
            targetAnchor: 'hourly-sales-section',
            weight: 65,
          });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Rule 7: LOW_ITEM_SALES (Slow-moving Menu Items)
  // ─────────────────────────────────────────────────────────────
  if (Array.isArray(itemStats) && itemStats.length >= 10) {
    // Items with sales > 0 but below threshold
    const slowItems = itemStats.filter((it) => it.quantitySold > 0 && it.quantitySold <= lowItemSalesThresholdQty);
    if (slowItems.length >= 2) {
      const sampleNames = slowItems.slice(0, 3).map((it) => it.name).join(', ');
      addSuggestion({
        id: 'low_moving_items_review',
        ruleId: 'LOW_ITEM_SALES',
        category: 'items',
        severity: 'medium',
        title: `${slowItems.length} menu items had low sales in this period`,
        explanation: `Items such as ${sampleNames} sold ${lowItemSalesThresholdQty} or fewer portions during this selected timeframe.`,
        supportingMetric: {
          label: 'Low Selling Items',
          current: `${slowItems.length} items`,
          baseline: `> ${lowItemSalesThresholdQty} units`,
          diffPct: -50,
        },
        recommendedAction: 'Review item presentation on the menu, check if ingredients are at risk of spoiling in inventory, or bundle them into high-traffic meal combos.',
        targetTab: 'items',
        targetAnchor: 'slow-moving-items-table',
        weight: 60,
      });
    }

    // Top selling item momentum
    const topItem = itemStats[0];
    if (topItem && topItem.quantitySold >= 15) {
      addSuggestion({
        id: `top_item_hero_${topItem.itemId || topItem.name.toLowerCase().replace(/\s+/g, '_')}`,
        ruleId: 'ITEM_GROWTH',
        category: 'items',
        severity: 'positive',
        title: `"${topItem.name}" is your primary volume driver (${topItem.quantitySold} sold)`,
        explanation: `"${topItem.name}" contributed ${formatInr(topItem.netSales)} across ${topItem.quantitySold} portions, making it your highest-selling dish.`,
        supportingMetric: {
          label: 'Top Item Sales',
          current: formatInr(topItem.netSales),
          baseline: `${topItem.quantitySold} portions`,
          diffPct: 100,
        },
        recommendedAction: 'Ensure prep readiness and ingredient buffers for this dish during evening rush hours to prevent running out of stock.',
        targetTab: 'items',
        targetAnchor: 'item-sales-table',
        weight: 45,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Sort and select 🔥 Top 3 Actions
  // ─────────────────────────────────────────────────────────────
  // Prioritize active (uncompleted) suggestions, by weight descending
  const activeSuggestions = suggestions.filter((s) => !s.isCompleted);
  activeSuggestions.sort((a, b) => (b.weight || 0) - (a.weight || 0));

  const top3Actions = activeSuggestions.slice(0, 3);

  // Return both sorted suggestions and top 3
  suggestions.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1; // uncompleted first
    }
    return (b.weight || 0) - (a.weight || 0);
  });

  return {
    suggestions,
    top3Actions,
  };
}

module.exports = {
  evaluateSalesSuggestions,
};
