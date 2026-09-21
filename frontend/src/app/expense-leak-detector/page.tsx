'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import { expenseLeakApi } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  ShieldAlert, AlertTriangle, AlertCircle, CheckCircle2, TrendingUp,
  TrendingDown, RefreshCw, Calendar, Filter, ArrowRight, Info,
  ThumbsUp, ThumbsDown, X, Layers, ArrowUpRight, Check, Sparkles, HelpCircle
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend
} from 'recharts';

export default function ExpenseLeakDetectorPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [period, setPeriod] = useState<string>('30d');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('impact_desc');

  // Interactive Modals
  const [selectedAnomaly, setSelectedAnomaly] = useState<any>(null);
  const [trendTab, setTrendTab] = useState<'comparison' | 'timeline'>('comparison');
  const [feedbackAnomaly, setFeedbackAnomaly] = useState<any>(null);
  const [feedbackReason, setFeedbackReason] = useState<string>('actual_issue');
  const [feedbackNotes, setFeedbackNotes] = useState<string>('');
  const [feedbackUseful, setFeedbackUseful] = useState<boolean>(true);
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Onboarding banner state
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('peyala_leak_detector_onboarding_dismissed');
    if (!dismissed) setShowOnboarding(true);
    loadAnalysis();
  }, [period, severityFilter, categoryFilter, supplierFilter, statusFilter, sortBy]);

  const loadAnalysis = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const params: any = {
        period,
        severity: severityFilter,
        category: categoryFilter,
        supplier: supplierFilter,
        status: statusFilter,
        sortBy,
      };
      if (period === 'custom') {
        params.startDate = customStart;
        params.endDate = customEnd;
      }
      const res = await expenseLeakApi.getAnalysis(params);
      setData(res.data);
    } catch (err: any) {
      console.error('Failed to load expense leak analysis:', err);
      toast.error(err.response?.data?.message || 'Could not complete expense analysis right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDismissOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('peyala_leak_detector_onboarding_dismissed', 'true');
  };

  const handleMarkAsNormal = async (anomaly: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setSubmittingAction(true);
      const isAlreadyDismissed = anomaly.status === 'dismissed';
      const nextStatus = isAlreadyDismissed ? 'new' : 'dismissed';

      await expenseLeakApi.reviewAnomaly(anomaly.id, {
        status: nextStatus,
        dismissDays: 30,
      });

      toast.success(isAlreadyDismissed ? 'Alert restored to active' : 'Marked as normal — alert suppressed for 30 days');
      loadAnalysis(true);
      if (selectedAnomaly?.id === anomaly.id) {
        setSelectedAnomaly(null);
      }
    } catch (err: any) {
      toast.error('Failed to update status');
    } finally {
      setSubmittingAction(false);
    }
  };

  const openFeedbackModal = (anomaly: any, isUseful: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFeedbackAnomaly(anomaly);
    setFeedbackUseful(isUseful);
    setFeedbackReason(isUseful ? 'actual_issue' : 'expected_expense');
    setFeedbackNotes('');
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackAnomaly) return;
    try {
      setSubmittingAction(true);
      await expenseLeakApi.submitFeedback(feedbackAnomaly.id, {
        isUseful: feedbackUseful,
        feedbackReason,
        feedbackNotes,
      });
      toast.success('Thank you! Your feedback helps tune future detection rules.');
      setFeedbackAnomaly(null);
      loadAnalysis(true);
    } catch (err: any) {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmittingAction(false);
    }
  };

  const summary = data?.summary || {};
  const anomalies = data?.anomalies || [];
  const categories = data?.categories || [];
  const suppliers = data?.suppliers || [];
  const priorities = summary.priorities || [];

  return (
    <AppLayout>
      <div className="space-y-6 pb-36 md:pb-24">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Expense Leak Detector
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Identify unusual spending, hidden cost increases and potential expense leaks across your business.
            </p>
          </div>

          {/* Refresh & Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAnalysis(true)}
              disabled={refreshing || loading}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              title="Re-run statistical detection engine"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', (refreshing || loading) && 'animate-spin')} />
              <span>{refreshing ? 'Analyzing...' : 'Run Analysis'}</span>
            </button>
          </div>
        </div>

        {/* First-Time Onboarding Banner */}
        {showOnboarding && (
          <div className="card p-5 border-l-4 border-l-brand-500 bg-gradient-to-r from-orange-50/70 to-amber-50/50 dark:from-brand-950/20 dark:to-amber-950/10 relative">
            <button
              onClick={handleDismissOnboarding}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-brand-500 text-white shrink-0 mt-0.5 shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-2 pr-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Find where your money is leaking
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  Expense Leak Detector continuously analyzes your real purchases, utility payments, and category spending against historical baselines and sales volume to flag cost increases before they compound.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs text-gray-700 dark:text-gray-300">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center shrink-0">1</span>
                    <span>Identifies price & consumption spikes</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center shrink-0">2</span>
                    <span>Cross-references sales growth ratios</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center shrink-0">3</span>
                    <span>Deduplicates multi-signal root causes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Insufficient Data Warning Banner */}
        {data && !summary.hasEnoughData && (
          <div className="card p-5 border-l-4 border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-300">
                  Not Enough Historical Data Yet
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-400 mt-1">
                  {summary.insufficientDataReason}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-2">
                  As you record regular daily purchases and operational expenses, the detector automatically computes baselines and unlocks unit-price spike tracking.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Primary Metric: Potential Monthly Impact */}
          <div className="sm:col-span-2 card p-5 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/10 border-red-200 dark:border-red-900/40 relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                  Potential Monthly Impact
                </span>
                <p className="text-3xl sm:text-4xl font-black text-red-600 dark:text-red-400 mt-1.5">
                  {formatCurrency(summary.totalPotentialImpact || 0)}
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">/ month</span>
                </p>
              </div>
              <span className="p-2.5 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300">
                <TrendingDown className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <Layers className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span>Deduplicated across overlapping item & category signals</span>
            </div>
          </div>

          {/* High Risk (Potential Leak) */}
          <div className="card p-4 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">High Risk</span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {summary.highRiskCount || 0}
              </p>
              <span className="text-xs text-red-500 font-medium">Potential Leaks</span>
            </div>
          </div>

          {/* Needs Attention (Unusual) */}
          <div className="card p-4 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Needs Attention</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {summary.needsAttentionCount || 0}
              </p>
              <span className="text-xs text-amber-500 font-medium">Unusual Anomalies</span>
            </div>
          </div>

          {/* Categories Monitored */}
          <div className="card p-4 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Categories</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {summary.categoriesAnalyzed || 0}
              </p>
              <span className="text-xs text-gray-400">Analyzed Categories</span>
            </div>
          </div>
        </div>

        {/* Top 3 Priorities Block */}
        {priorities.length > 0 && (
          <div className="card p-5 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white">
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Your Top {priorities.length} Action Priorities
              </h2>
              <span className="text-xs text-gray-400 hidden sm:inline">
                Highest estimated financial impact
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {priorities.map((item: any) => (
                <div
                  key={item.id}
                  onClick={() => {
                    const match = anomalies.find((a: any) => a.id === item.id);
                    if (match) setSelectedAnomaly(match);
                  }}
                  className="bg-white/10 hover:bg-white/15 p-3.5 rounded-xl transition cursor-pointer border border-white/10 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300">
                        #{item.rank}
                      </span>
                      <span className="text-xs font-extrabold text-amber-400">
                        {formatCurrency(item.estimatedMonthlyImpact)}/mo
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm mt-2 line-clamp-1">{item.title}</h3>
                    <p className="text-xs text-gray-300 mt-1 line-clamp-2">{item.action}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-white/10">
                    <span className="capitalize">{item.itemOrCategory}</span>
                    <span className="text-brand-300 flex items-center gap-1">Investigate <ArrowRight className="w-3 h-3" /></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter & Sort Controls */}
        <div className="card p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
            {/* Period Quick Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0 mr-1" />
              {[
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
                { id: 'month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: '90d', label: 'Last 90 Days' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap',
                    period === p.id
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input py-1.5 text-xs"
              >
                <option value="impact_desc">Highest Impact First</option>
                <option value="severity_desc">Highest Severity First</option>
                <option value="pct_desc">Largest Percentage Increase</option>
                <option value="category">Category (A-Z)</option>
                <option value="supplier">Supplier (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Secondary Filter Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
            {/* Severity Filter */}
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Severity</label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="input py-1 text-xs w-full"
              >
                <option value="all">All Severities</option>
                <option value="potential_leak">🔴 Potential Leak</option>
                <option value="unusual">🟠 Unusual</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input py-1 text-xs w-full"
              >
                <option value="all">All Categories</option>
                {categories.map((c: string) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Supplier Filter */}
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Supplier</label>
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="input py-1 text-xs w-full"
              >
                <option value="all">All Suppliers</option>
                {suppliers.map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Review Status Filter */}
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input py-1 text-xs w-full"
              >
                <option value="all">All Statuses</option>
                <option value="new">New (Active)</option>
                <option value="reviewed">Reviewed</option>
                <option value="dismissed">Dismissed (Normal)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        {loading && (
          <div className="card p-12 text-center text-gray-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-brand-500" />
            <p className="font-semibold text-gray-900 dark:text-white">Analyzing Financial Data...</p>
            <p className="text-xs text-gray-500 mt-1">Cross-referencing purchases, payments, and sales trends</p>
          </div>
        )}

        {/* Empty State: No Anomalies Detected */}
        {!loading && anomalies.length === 0 && (
          <div className="card p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Expense Leaks Detected</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1.5">
              All monitored expense categories and unit purchase prices are currently behaving within normal historical variance for this period.
            </p>
            <div className="flex items-center justify-center gap-3 mt-5">
              <Link href="/payments" className="btn-secondary text-xs">
                View Payments
              </Link>
              <Link href="/purchases" className="btn-secondary text-xs">
                View Purchases
              </Link>
            </div>
          </div>
        )}

        {/* Anomalies List / Cards */}
        {!loading && anomalies.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span>Showing <strong>{anomalies.length}</strong> flagged issues</span>
              <span>Sorted by {sortBy === 'impact_desc' ? 'Estimated Impact' : 'Selected Priority'}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {anomalies.map((a: any) => {
                const isPotentialLeak = a.severity === 'potential_leak';
                const isDismissed = a.status === 'dismissed';

                return (
                  <div
                    key={a.id}
                    className={cn(
                      'card p-5 transition flex flex-col justify-between relative overflow-hidden',
                      isDismissed
                        ? 'opacity-60 bg-gray-50 dark:bg-gray-900/40 border-dashed'
                        : isPotentialLeak
                          ? 'border-l-4 border-l-red-500 shadow-sm'
                          : 'border-l-4 border-l-amber-500'
                    )}
                  >
                    <div>
                      {/* Status Badges Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1',
                              isPotentialLeak
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            )}
                          >
                            {isPotentialLeak ? <AlertCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {isPotentialLeak ? 'POTENTIAL LEAK' : 'UNUSUAL EXPENSE'}
                          </span>

                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 capitalize">
                            {a.confidence} Confidence
                          </span>
                        </div>

                        {/* Review Status Tag */}
                        {isDismissed && (
                          <span className="text-[11px] font-medium text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded">
                            Marked as Normal
                          </span>
                        )}
                      </div>

                      {/* Title & Category */}
                      <div className="mb-3">
                        <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wide">
                          {a.category} {a.item ? `• ${a.item}` : ''}
                        </span>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                          {a.title}
                        </h3>
                        {a.supplier && (
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <span className="font-medium">Supplier:</span> {a.supplier}
                          </p>
                        )}
                      </div>

                      {/* Financial Comparison Metric Box */}
                      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 mb-3.5 text-center">
                        <div>
                          <span className="text-[10px] text-gray-400 uppercase block">Current</span>
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {typeof a.currentValue === 'number' && a.unit && !a.unit.startsWith('%') && a.unit !== 'purchases/mo'
                              ? `₹${a.currentValue}/${a.unit}`
                              : a.unit === '% of sales'
                                ? `${a.currentValue}%`
                                : a.unit === 'purchases/mo'
                                  ? `${a.currentValue}/mo`
                                  : formatCurrency(a.currentValue)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 uppercase block">Normal</span>
                          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                            {typeof a.baselineValue === 'number' && a.unit && !a.unit.startsWith('%') && a.unit !== 'purchases/mo'
                              ? `₹${a.baselineValue}/${a.unit}`
                              : a.unit === '% of sales'
                                ? `${a.baselineValue}%`
                                : a.unit === 'purchases/mo'
                                  ? `${a.baselineValue}/mo`
                                  : formatCurrency(a.baselineValue)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 uppercase block">Est. Impact</span>
                          <span className="text-sm font-extrabold text-red-600 dark:text-red-400">
                            {formatCurrency(a.estimatedMonthlyImpact)}
                            <span className="text-[10px] font-normal text-gray-400 block">/month</span>
                          </span>
                        </div>
                      </div>

                      {/* Why We Flagged This Bullet Points */}
                      <div className="space-y-1.5 mb-3.5">
                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider block">
                          Why We Flagged This
                        </span>
                        <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                          {a.whyFlagged?.map((reason: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-red-500 font-bold shrink-0 mt-0.5">•</span>
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Root Cause / Deduplication Cluster Tag */}
                      {a.rootCauseCluster?.isDeduplicated && (
                        <div className="p-2 rounded-lg bg-orange-50/80 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-900/30 text-[11px] text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 shrink-0 text-orange-600" />
                          <span>Part of <strong>{a.rootCauseCluster.name}</strong> (deduplicated in total monthly impact)</span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions & Feedback Bar */}
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedAnomaly(a);
                            setTrendTab('comparison');
                          }}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                        >
                          <span>View Details</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>

                        <button
                          onClick={(e) => handleMarkAsNormal(a, e)}
                          disabled={submittingAction}
                          className="btn-secondary text-xs py-1.5 px-2.5"
                          title="Dismiss alert if this expense change is expected"
                        >
                          {isDismissed ? 'Unmark Normal' : 'Mark as Normal'}
                        </button>
                      </div>

                      {/* User Feedback Thumbs */}
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span className="text-[11px] hidden sm:inline">Useful?</span>
                        <button
                          onClick={(e) => openFeedbackModal(a, true, e)}
                          className={cn(
                            'p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition',
                            a.isUseful === true && 'text-green-600 bg-green-50 dark:bg-green-950/30'
                          )}
                          title="Yes, this alert is useful"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => openFeedbackModal(a, false, e)}
                          className={cn(
                            'p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition',
                            a.isUseful === false && 'text-red-500 bg-red-50 dark:bg-red-950/30'
                          )}
                          title="No, this was not helpful"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DETAIL INVESTIGATION MODAL ─────────────────────────── */}
        {selectedAnomaly && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-5 bg-white dark:bg-gray-900 shadow-2xl">
              {/* Modal Header */}
              <div className="flex justify-between items-start pb-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <span className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide">
                    {selectedAnomaly.category} {selectedAnomaly.item ? `• ${selectedAnomaly.item}` : ''}
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mt-0.5">
                    {selectedAnomaly.title}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedAnomaly(null)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Financial Impact Banner */}
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 flex items-center justify-between">
                <div>
                  <span className="text-xs text-red-700 dark:text-red-300 font-semibold">Estimated Monthly Financial Impact</span>
                  <p className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400">
                    {formatCurrency(selectedAnomaly.estimatedMonthlyImpact)}
                    <span className="text-xs font-normal text-gray-500 ml-1">/ month</span>
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-600 text-white uppercase">
                  {selectedAnomaly.severity === 'potential_leak' ? 'Potential Leak' : 'Unusual'}
                </span>
              </div>

              {/* Historical Trend & Rate Comparison Chart */}
              {((selectedAnomaly.historicalTrend && selectedAnomaly.historicalTrend.length > 0) ||
                (selectedAnomaly.purchaseTimeline && selectedAnomaly.purchaseTimeline.length > 0)) && (() => {
                const hasTimeline = selectedAnomaly.purchaseTimeline && selectedAnomaly.purchaseTimeline.length > 0;
                const activeData = (trendTab === 'timeline' && hasTimeline)
                  ? selectedAnomaly.purchaseTimeline
                  : selectedAnomaly.historicalTrend || [];

                const isConsumption = selectedAnomaly.detector === 'usage_spike' ||
                  activeData.some((d: any) => d.qty !== undefined && d.price === undefined) ||
                  (trendTab === 'comparison' && selectedAnomaly.detector === 'usage_spike');

                const isPrice = selectedAnomaly.detector === 'price_spike' ||
                  selectedAnomaly.detector === 'supplier_price_anomaly' ||
                  (activeData.some((d: any) => d.price !== undefined && d.expense === undefined) && !isConsumption);

                const isExpenseVsSales = activeData.some((d: any) => d.expense !== undefined && d.sales !== undefined);

                // Prepare normalized chart data
                const chartData = activeData.map((d: any) => ({
                  ...d,
                  chartLabel: d.label || d.name || d.date || 'Period',
                  chartQty: d.qty !== undefined ? d.qty : (d.value ?? 0),
                  chartPrice: d.price !== undefined ? d.price : (d.value ?? 0),
                  chartExpense: d.expense !== undefined ? d.expense : (d.value ?? 0),
                  chartSales: d.sales !== undefined ? d.sales : 0,
                  chartValue: d.value ?? d.qty ?? d.price ?? d.expense ?? 0,
                }));

                const getConsumptionColor = (entry: any) => {
                  if (entry.type === 'baseline' || entry.chartLabel?.toLowerCase().includes('base')) return '#94a3b8'; // Slate
                  if (entry.type === 'expected' || entry.chartLabel?.toLowerCase().includes('expect')) return '#10b981'; // Green
                  if (entry.type === 'actual' || entry.chartLabel?.toLowerCase().includes('act') || entry.chartLabel?.toLowerCase().includes('curr')) return '#ef4444'; // Red
                  return '#e26411';
                };

                return (
                  <div className="card p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          {isConsumption
                            ? (trendTab === 'timeline'
                                ? `Purchase Quantities Timeline (${selectedAnomaly.unit || 'units'})`
                                : `Monthly Consumption Rate (${selectedAnomaly.unit || 'units'}/month)`)
                            : isPrice
                            ? `Price History & Comparison (₹ / ${selectedAnomaly.unit || 'unit'})`
                            : isExpenseVsSales
                            ? `Category Spending vs Total Sales (₹ / month)`
                            : `Historical Expense Rate (₹ / month)`}
                        </h3>
                        <p className="text-[11px] text-gray-500">
                          {isConsumption
                            ? (trendTab === 'timeline'
                                ? 'Individual purchase quantities recorded across baseline and current periods.'
                                : 'Baseline usage vs expected usage (scaled with sales growth) vs actual consumption.')
                            : isPrice
                            ? 'Recent unit price points recorded in purchase invoices.'
                            : 'Comparing historical baseline period against current monthly spending rate.'}
                        </p>
                      </div>

                      {/* Tab Switcher if Purchase Timeline exists */}
                      {hasTimeline && (
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg text-xs self-start shrink-0">
                          <button
                            type="button"
                            onClick={() => setTrendTab('comparison')}
                            className={cn(
                              'px-2.5 py-1 rounded-md font-medium transition',
                              trendTab === 'comparison'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            )}
                          >
                            Monthly Rate
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrendTab('timeline')}
                            className={cn(
                              'px-2.5 py-1 rounded-md font-medium transition',
                              trendTab === 'timeline'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            )}
                          >
                            Purchase Timeline
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Chart Container */}
                    <div className="w-full min-w-0 h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-gray-800" />
                          <XAxis
                            dataKey="chartLabel"
                            tick={{ fontSize: 10, fill: '#888' }}
                            interval={0}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: '#888' }}
                            tickFormatter={(v: any) => (isConsumption ? `${v}` : `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`)}
                          />
                          <Tooltip
                            formatter={(v: any, name: any) => {
                              if (isConsumption) {
                                return [`${v} ${selectedAnomaly.unit || 'units'}`, name === 'chartQty' ? 'Consumption' : name];
                              }
                              if (isPrice) {
                                return [`₹${v} / ${selectedAnomaly.unit || 'unit'}`, name === 'chartPrice' ? 'Unit Price' : name];
                              }
                              return [`₹${Number(v).toLocaleString('en-IN')}`, name];
                            }}
                            contentStyle={{
                              backgroundColor: 'rgba(255, 255, 255, 0.95)',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              fontSize: '11px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            }}
                          />

                          {isConsumption ? (
                            <Bar dataKey="chartQty" name="Consumption" radius={[4, 4, 0, 0]}>
                              {chartData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={getConsumptionColor(entry)} />
                              ))}
                            </Bar>
                          ) : isExpenseVsSales ? (
                            <>
                              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                              <Bar dataKey="chartExpense" name="Expense Rate" fill="#ef4444" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="chartSales" name="Sales Baseline" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </>
                          ) : isPrice ? (
                            <Bar dataKey="chartPrice" name="Unit Price" fill="#e26411" radius={[4, 4, 0, 0]}>
                              {chartData.map((entry: any, index: number) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.isHighest || entry.period === 'Current' ? '#e26411' : '#94a3b8'}
                                />
                              ))}
                            </Bar>
                          ) : (
                            <Bar dataKey="chartValue" name="Value" fill="#e26411" radius={[4, 4, 0, 0]} />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Consumption Legend Pills */}
                    {isConsumption && trendTab === 'comparison' && (
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                          <span>Historical Baseline</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                          <span>Expected Pace (from Sales)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                          <span>Actual Usage (Leak)</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Multi-Supplier Comparison Table (if applicable) */}
              {selectedAnomaly.supplierComparison?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Recorded Supplier Prices
                  </h3>
                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                        <tr>
                          <th className="p-2.5 text-left font-semibold">Supplier</th>
                          <th className="p-2.5 text-right font-semibold">Recent Price</th>
                          <th className="p-2.5 text-right font-semibold">Avg Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {selectedAnomaly.supplierComparison.map((s: any) => (
                          <tr key={s.supplier} className={s.isHighest ? 'bg-red-50/50 dark:bg-red-950/20 font-bold' : ''}>
                            <td className="p-2.5 text-gray-900 dark:text-white">
                              {s.supplier} {s.isHighest && <span className="text-[10px] text-red-500 font-bold ml-1">(Flagged)</span>}
                            </td>
                            <td className="p-2.5 text-right">{formatCurrency(s.price)}</td>
                            <td className="p-2.5 text-right text-gray-500">{formatCurrency(s.avgPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Related Expenses / Recent Invoices */}
              {selectedAnomaly.relatedExpenses?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Recent Matching Transactions
                  </h3>
                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                        <tr>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-left">Payee / Description</th>
                          <th className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {selectedAnomaly.relatedExpenses.map((e: any, idx: number) => (
                          <tr key={idx}>
                            <td className="p-2 text-gray-500">{e.date}</td>
                            <td className="p-2 text-gray-900 dark:text-white font-medium">{e.payee}</td>
                            <td className="p-2 text-right font-bold text-red-600">{formatCurrency(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Possible Causes & Recommended Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                    Possible Explanations
                  </h4>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                    {selectedAnomaly.possibleCauses?.map((c: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="text-gray-400">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                    Recommended Action Steps
                  </h4>
                  <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                    {selectedAnomaly.recommendedActions?.map((act: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center gap-3">
                <button
                  onClick={() => handleMarkAsNormal(selectedAnomaly)}
                  className="btn-secondary text-xs"
                >
                  {selectedAnomaly.status === 'dismissed' ? 'Unmark as Normal' : 'Mark as Normal (Dismiss 30d)'}
                </button>

                <button
                  onClick={() => setSelectedAnomaly(null)}
                  className="btn-primary text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── USER FEEDBACK MODAL ─────────────────────────────────── */}
        {feedbackAnomaly && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="card w-full max-w-md p-5 space-y-4 bg-white dark:bg-gray-900 shadow-2xl">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {feedbackUseful ? <ThumbsUp className="w-4 h-4 text-green-500" /> : <ThumbsDown className="w-4 h-4 text-red-500" />}
                  {feedbackUseful ? 'Why was this alert useful?' : 'Why was this alert not helpful?'}
                </h3>
                <button onClick={() => setFeedbackAnomaly(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Alert: <strong>{feedbackAnomaly.title}</strong>
              </p>

              <div>
                <label className="label text-xs">Primary Reason</label>
                <select
                  value={feedbackReason}
                  onChange={(e) => setFeedbackReason(e.target.value)}
                  className="input text-xs w-full"
                >
                  <option value="actual_issue">Actual issue / Found a genuine leak</option>
                  <option value="expected_expense">Expected operational expense</option>
                  <option value="seasonal_change">Normal seasonal price fluctuation</option>
                  <option value="supplier_change">Intentional supplier / quality upgrade</option>
                  <option value="data_mistake">Data entry mistake / typo</option>
                  <option value="other">Other reason</option>
                </select>
              </div>

              <div>
                <label className="label text-xs">Additional Notes (Optional)</label>
                <textarea
                  rows={3}
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  placeholder="e.g., Supplier informed us prices will return to normal next month"
                  className="input text-xs w-full"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFeedbackAnomaly(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitFeedback}
                  disabled={submittingAction}
                  className="btn-primary text-xs"
                >
                  Submit Feedback
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
