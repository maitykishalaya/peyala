// ─────────────────────────────────────────────────────────────────
// Expense Leak Detector API Routes
// ─────────────────────────────────────────────────────────────────

const router = require('express').Router();
const Payment = require('../models/Payment');
const PurchaseEntry = require('../models/PurchaseEntry');
const SalesEntry = require('../models/SalesEntry');
const Order = require('../models/Order');
const ExpenseLeakReview = require('../models/ExpenseLeakReview');
const { auth } = require('../middleware/auth');
const { getIstDayRange } = require('../utils/date');
const { analyzeExpenseLeaks } = require('../utils/expenseLeakEngine');
const { log } = require('../utils/audit');

router.use(auth);

/**
 * Computes date ranges based on period preset
 */
function resolveDateRanges(period = '30d', customStart, customEnd) {
  const todayRange = getIstDayRange(new Date());
  const now = todayRange.end;

  let currentStart, currentEnd, baselineStart, baselineEnd, periodLabel;

  if (period === '7d') {
    periodLabel = 'Last 7 Days';
    currentEnd = now;
    currentStart = new Date(todayRange.start.getTime() - (6 * 86400000));
    baselineEnd = new Date(currentStart.getTime() - 1000);
    baselineStart = new Date(baselineEnd.getTime() - (30 * 86400000));
  } else if (period === 'month') {
    periodLabel = 'This Month';
    const [y, m] = todayRange.istDateStr.split('-').map(Number);
    currentStart = getIstDayRange(`${y}-${String(m).padStart(2, '0')}-01`).start;
    currentEnd = now;
    // Baseline is prior 60 days before this month
    baselineEnd = new Date(currentStart.getTime() - 1000);
    baselineStart = new Date(baselineEnd.getTime() - (60 * 86400000));
  } else if (period === 'last_month') {
    periodLabel = 'Last Month';
    const [y, m] = todayRange.istDateStr.split('-').map(Number);
    const lastMonthDate = new Date(y, m - 2, 1);
    const lastMonthRange = getIstDayRange(lastMonthDate);
    const [lmy, lmm] = lastMonthRange.istDateStr.split('-').map(Number);
    currentStart = getIstDayRange(`${lmy}-${String(lmm).padStart(2, '0')}-01`).start;
    const lastDayOfLastMonth = new Date(lmy, lmm, 0).getDate();
    currentEnd = getIstDayRange(`${lmy}-${String(lmm).padStart(2, '0')}-${lastDayOfLastMonth}`).end;

    baselineEnd = new Date(currentStart.getTime() - 1000);
    baselineStart = new Date(baselineEnd.getTime() - (60 * 86400000));
  } else if (period === '90d') {
    periodLabel = 'Last 90 Days';
    currentEnd = now;
    currentStart = new Date(todayRange.start.getTime() - (89 * 86400000));
    baselineEnd = new Date(currentStart.getTime() - 1000);
    baselineStart = new Date(baselineEnd.getTime() - (90 * 86400000));
  } else if (period === 'custom' && customStart && customEnd) {
    periodLabel = `${customStart} to ${customEnd}`;
    currentStart = getIstDayRange(customStart).start;
    currentEnd = getIstDayRange(customEnd).end;
    const diff = Math.max(7, Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000));
    baselineEnd = new Date(currentStart.getTime() - 1000);
    baselineStart = new Date(baselineEnd.getTime() - (Math.max(30, diff * 2) * 86400000));
  } else {
    // Default: 30 Days
    periodLabel = 'Last 30 Days';
    currentEnd = now;
    currentStart = new Date(todayRange.start.getTime() - (29 * 86400000));
    baselineEnd = new Date(currentStart.getTime() - 1000);
    baselineStart = new Date(baselineEnd.getTime() - (60 * 86400000));
  }

  return {
    currentRange: { start: currentStart, end: currentEnd, label: periodLabel },
    baselineRange: { start: baselineStart, end: baselineEnd },
  };
}

// ── GET /api/expense-leaks ─────────────────────────────────────────
// Runs analysis, merges reviews, and returns complete report
router.get('/', async (req, res) => {
  try {
    const {
      period = '30d',
      startDate,
      endDate,
      severity,
      category,
      supplier,
      status,
      sortBy = 'impact_desc',
    } = req.query;

    const { currentRange, baselineRange } = resolveDateRanges(period, startDate, endDate);

    // Query window encompasses both baseline and current range
    const totalQueryStart = baselineRange.start;
    const totalQueryEnd = currentRange.end;

    const [payments, purchases, salesEntries, orders, reviews] = await Promise.all([
      Payment.find({ date: { $gte: totalQueryStart, $lte: totalQueryEnd } })
        .populate('supplier', 'name')
        .lean(),
      PurchaseEntry.find({ date: { $gte: totalQueryStart, $lte: totalQueryEnd } })
        .populate('supplier', 'name')
        .populate('items.item', 'name unit')
        .lean(),
      SalesEntry.find({ date: { $gte: totalQueryStart, $lte: totalQueryEnd } })
        .select('date totalRevenue outletSales zomato fatafat otherSales')
        .lean(),
      Order.find({
        status: 'paid',
        paidAt: { $gte: totalQueryStart, $lte: totalQueryEnd }
      })
        .select('paidAt total settledAmount')
        .lean(),
      ExpenseLeakReview.find().lean(),
    ]);

    // Build map of review states
    const reviewsMap = new Map();
    for (const r of reviews) {
      // Check if dismissal has expired
      if (r.status === 'dismissed' && r.dismissedUntil && new Date() > new Date(r.dismissedUntil)) {
        r.status = 'new';
      }
      reviewsMap.set(r.anomalyId, r);
    }

    const analysis = analyzeExpenseLeaks({
      payments,
      purchases,
      salesEntries,
      orders,
      currentRange,
      baselineRange,
      reviewsMap,
    });

    // Apply Client Filters
    let filteredAnomalies = [...analysis.anomalies];

    if (severity && severity !== 'all') {
      filteredAnomalies = filteredAnomalies.filter(a => a.severity === severity);
    }
    if (category && category !== 'all') {
      filteredAnomalies = filteredAnomalies.filter(a => a.category === category);
    }
    if (supplier && supplier !== 'all') {
      filteredAnomalies = filteredAnomalies.filter(a => a.supplier === supplier);
    }
    if (status && status !== 'all') {
      filteredAnomalies = filteredAnomalies.filter(a => a.status === status);
    }

    // Apply Sorting
    filteredAnomalies.sort((a, b) => {
      if (sortBy === 'severity_desc') {
        const rank = { potential_leak: 3, unusual: 2, normal: 1 };
        return rank[b.severity] - rank[a.severity] || (b.estimatedMonthlyImpact || 0) - (a.estimatedMonthlyImpact || 0);
      }
      if (sortBy === 'pct_desc') {
        return (b.percentageIncrease || 0) - (a.percentageIncrease || 0);
      }
      if (sortBy === 'category') {
        return (a.category || '').localeCompare(b.category || '');
      }
      if (sortBy === 'supplier') {
        return (a.supplier || '').localeCompare(b.supplier || '');
      }
      // Default: impact_desc (Highest estimated financial impact first)
      return (b.estimatedMonthlyImpact || 0) - (a.estimatedMonthlyImpact || 0);
    });

    res.json({
      period: {
        preset: period,
        label: currentRange.label,
        currentStart: currentRange.start,
        currentEnd: currentRange.end,
        baselineStart: baselineRange.start,
        baselineEnd: baselineRange.end,
      },
      summary: analysis.summary,
      anomalies: filteredAnomalies,
      totalCount: analysis.anomalies.length,
      filteredCount: filteredAnomalies.length,
      categories: analysis.categories,
      suppliers: analysis.suppliers,
    });
  } catch (err) {
    console.error('Expense leak analysis error:', err);
    res.status(500).json({ message: 'We couldn’t complete the analysis right now. Your expense data is safe. Please try again.' });
  }
});

// ── POST /api/expense-leaks/:anomalyId/review ──────────────────────
// Marks anomaly as reviewed or dismissed ("Mark as Normal")
router.post('/:anomalyId/review', async (req, res) => {
  try {
    const { anomalyId } = req.params;
    const { status = 'reviewed', dismissDays = 30 } = req.body;

    if (!['new', 'reviewed', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    let dismissedUntil = null;
    if (status === 'dismissed') {
      dismissedUntil = new Date(Date.now() + (dismissDays * 86400000));
    }

    const review = await ExpenseLeakReview.findOneAndUpdate(
      { anomalyId },
      {
        anomalyId,
        status,
        dismissedUntil,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await log(req.user, 'update', 'ExpenseLeak', anomalyId, `Marked anomaly as ${status}`);
    res.json({ success: true, review });
  } catch (err) {
    console.error('Review anomaly error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/expense-leaks/:anomalyId/feedback ────────────────────
// Records user thumbs up/down and learning feedback
router.post('/:anomalyId/feedback', async (req, res) => {
  try {
    const { anomalyId } = req.params;
    const { isUseful, feedbackReason, feedbackNotes } = req.body;

    const review = await ExpenseLeakReview.findOneAndUpdate(
      { anomalyId },
      {
        anomalyId,
        isUseful: Boolean(isUseful),
        feedbackReason: feedbackReason || null,
        feedbackNotes: feedbackNotes || '',
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, review });
  } catch (err) {
    console.error('Feedback anomaly error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
