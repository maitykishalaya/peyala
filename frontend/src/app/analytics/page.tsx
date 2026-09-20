'use client';

import { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { analyticsApi } from '@/lib/api';
import { formatCurrency, formatDate, today, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { exportToCsv, exportToExcel, printReport } from '@/lib/export-utils';
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, Calendar, Clock,
  ArrowUpRight, ArrowDownRight, RefreshCw, Settings, Download, FileText,
  FileSpreadsheet, Printer, AlertTriangle, CheckCircle2, ChevronRight,
  Flame, Sparkles, Filter, Search, BarChart3, PieChart as PieIcon,
  ShieldCheck, AlertCircle, Info, ChevronDown, Check, X, RotateCcw
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie
} from 'recharts';

const CHART_COLORS = ['#d97706', '#2563eb', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'gst' | 'suggestions' | 'health'>('overview');

  // Global Date Filters
  const [period, setPeriod] = useState<string>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [compareEnabled, setCompareEnabled] = useState<boolean>(true);

  // Data states
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [overviewData, setOverviewData] = useState<any>(null);

  const [loadingItems, setLoadingItems] = useState<boolean>(false);
  const [itemsData, setItemsData] = useState<any>(null);
  const [itemSearch, setItemSearch] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<string>('all');
  const [itemSortBy, setItemSortBy] = useState<string>('revenue_desc');

  const [loadingGst, setLoadingGst] = useState<boolean>(false);
  const [gstData, setGstData] = useState<any>(null);
  const [gstPeriodMode, setGstPeriodMode] = useState<'filter' | 'monthly'>('filter');
  const [gstFilingMonth, setGstFilingMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Target Settings Modal
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [targetConfig, setTargetConfig] = useState<any>({
    dailyTarget: 10000,
    weekendTarget: 15000,
    targetAov: 400,
    suggestedGrowthPct: 10,
    weakDayThresholdPct: 20,
    deliveryDeductionThresholdPct: 25,
    lowItemSalesThresholdQty: 3,
  });
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Single Item Deep Dive Modal
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemDetail, setItemDetail] = useState<any>(null);
  const [loadingItemDetail, setLoadingItemDetail] = useState<boolean>(false);

  // Trend chart metric & interval toggles
  const [trendMetric, setTrendMetric] = useState<'sales' | 'orders' | 'aov' | 'discounts' | 'tax'>('sales');
  const [trendInterval, setTrendInterval] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Suggestions filter
  const [suggestionFilter, setSuggestionFilter] = useState<'all' | 'high' | 'medium' | 'growth'>('all');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch Overview Data
  const fetchOverview = async () => {
    setLoadingOverview(true);
    try {
      const params: any = { period };
      if (period === 'custom') {
        if (customStart) params.startDate = customStart;
        if (customEnd) params.endDate = customEnd;
      }
      const res = await analyticsApi.getOverview(params);
      setOverviewData(res.data);
      if (res.data?.config) {
        setTargetConfig((prev: any) => ({ ...prev, ...res.data.config }));
      }
    } catch (err: any) {
      toast.error('Failed to load sales analytics overview');
    } finally {
      setLoadingOverview(false);
    }
  };

  // Fetch Item Report Data
  const fetchItems = async () => {
    setLoadingItems(true);
    try {
      const params: any = {
        period,
        category: itemCategory,
        search: itemSearch,
        sortBy: itemSortBy,
      };
      if (period === 'custom') {
        if (customStart) params.startDate = customStart;
        if (customEnd) params.endDate = customEnd;
      }
      const res = await analyticsApi.getItems(params);
      setItemsData(res.data);
    } catch (err: any) {
      toast.error('Failed to load item-wise sales report');
    } finally {
      setLoadingItems(false);
    }
  };

  // Fetch GST Report Data
  const fetchGst = async () => {
    setLoadingGst(true);
    try {
      const params: any = {};
      if (gstPeriodMode === 'monthly') {
        params.filingMonth = gstFilingMonth;
      } else {
        params.period = period;
        if (period === 'custom') {
          if (customStart) params.startDate = customStart;
          if (customEnd) params.endDate = customEnd;
        }
      }
      const res = await analyticsApi.getGstReport(params);
      setGstData(res.data);
    } catch (err: any) {
      toast.error('Failed to load GST tax report');
    } finally {
      setLoadingGst(false);
    }
  };

  // Fetch Item Detail
  const openItemDetail = async (idOrName: string) => {
    setSelectedItemId(idOrName);
    setLoadingItemDetail(true);
    try {
      const params: any = { period };
      if (period === 'custom') {
        if (customStart) params.startDate = customStart;
        if (customEnd) params.endDate = customEnd;
      }
      const res = await analyticsApi.getItemDetail(idOrName, params);
      setItemDetail(res.data);
    } catch (err) {
      toast.error('Failed to load item analytics detail');
    } finally {
      setLoadingItemDetail(false);
    }
  };

  // Trigger data fetching on filter/tab changes
  useEffect(() => {
    if (!mounted) return;
    fetchOverview();
  }, [mounted, period, customStart, customEnd]);

  useEffect(() => {
    if (!mounted) return;
    if (activeTab === 'items') {
      fetchItems();
    }
  }, [mounted, activeTab, period, customStart, customEnd, itemCategory, itemSortBy]);

  useEffect(() => {
    if (!mounted) return;
    if (activeTab === 'gst') {
      fetchGst();
    }
  }, [mounted, activeTab, period, customStart, customEnd, gstPeriodMode, gstFilingMonth]);

  // Handle Search Debounce for Items
  useEffect(() => {
    if (!mounted || activeTab !== 'items') return;
    const timer = setTimeout(() => {
      fetchItems();
    }, 350);
    return () => clearTimeout(timer);
  }, [itemSearch]);

  // Handle Suggestion Action
  const handleSuggestionAction = async (id: string, action: 'complete' | 'dismiss' | 'snooze', snoozeDays = 7) => {
    try {
      await analyticsApi.suggestionAction(id, { action, snoozeDays });
      toast.success(action === 'complete' ? 'Marked as completed' : action === 'dismiss' ? 'Suggestion dismissed' : 'Snoozed for 7 days');
      fetchOverview();
    } catch (err) {
      toast.error('Failed to update suggestion');
    }
  };

  // Save Target Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await analyticsApi.updateConfig(targetConfig);
      toast.success('Sales targets and thresholds saved successfully');
      setSettingsOpen(false);
      fetchOverview();
    } catch (err) {
      toast.error('Failed to update target configurations');
    } finally {
      setSavingSettings(false);
    }
  };

  // Categories list derived from items
  const categoriesList = useMemo(() => {
    if (!itemsData?.items) return [];
    const set = new Set<string>();
    itemsData.items.forEach((it: any) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set).sort();
  }, [itemsData]);

  // Filtered Suggestions list
  const filteredSuggestions = useMemo(() => {
    if (!overviewData?.suggestions) return [];
    if (suggestionFilter === 'all') return overviewData.suggestions;
    if (suggestionFilter === 'high') return overviewData.suggestions.filter((s: any) => s.severity === 'high');
    if (suggestionFilter === 'medium') return overviewData.suggestions.filter((s: any) => s.severity === 'medium');
    if (suggestionFilter === 'growth') return overviewData.suggestions.filter((s: any) => s.severity === 'growth');
    return overviewData.suggestions;
  }, [overviewData, suggestionFilter]);

  // Format Helper for Percentage Changes
  const renderDelta = (pct: number | undefined) => {
    if (pct === undefined || pct === null || isNaN(pct)) return null;
    const isPositive = pct > 0;
    const isNeutral = pct === 0;
    return (
      <span
        className={cn(
          'inline-flex items-center text-xs font-semibold px-1.5 py-0.5 rounded ml-2',
          isNeutral && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
          isPositive && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
          !isPositive && !isNeutral && 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
        )}
      >
        {isPositive ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : !isNeutral ? <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" /> : null}
        {isPositive ? '+' : ''}
        {pct}%
      </span>
    );
  };

  // ── EXPORT HANDLERS ───────────────────────────────────────────────
  const handleExportItemsCsv = () => {
    if (!itemsData?.items?.length) return;
    const headers = ['Item Name', 'Category', 'Qty Sold', 'Base Price (₹)', 'Gross Sales (₹)', 'Discounts (₹)', 'Net Sales (₹)', 'GST (₹)', 'Total with GST (₹)'];
    const rows = itemsData.items.map((it: any) => [
      it.name,
      it.category,
      it.quantitySold,
      it.averageSellingPrice,
      it.grossSales,
      it.discounts,
      it.netSales,
      it.gst,
      it.totalWithGst,
    ]);
    exportToCsv('Peyala_Item_Sales_Report.csv', headers, rows);
    toast.success('Exported items report to CSV');
  };

  const handleExportItemsExcel = () => {
    if (!itemsData?.items?.length) return;
    const headers = ['Item Name', 'Category', 'Qty Sold', 'Base Price (₹)', 'Gross Sales (₹)', 'Discounts (₹)', 'Net Sales (₹)', 'GST (₹)', 'Total with GST (₹)'];
    const rows = itemsData.items.map((it: any) => [
      it.name,
      it.category,
      it.quantitySold,
      it.averageSellingPrice,
      it.grossSales,
      it.discounts,
      it.netSales,
      it.gst,
      it.totalWithGst,
    ]);
    exportToExcel('Peyala_Item_Sales_Report.xls', 'Item Sales', headers, rows);
    toast.success('Exported items report to Excel');
  };

  const handlePrintItemsPdf = () => {
    if (!itemsData?.items?.length) return;
    const headers = ['Item Name', 'Category', 'Qty', 'Unit Price', 'Gross Sales', 'Net Sales', 'GST', 'Total'];
    const rows = itemsData.items.map((it: any) => [
      it.name,
      it.category,
      it.quantitySold,
      formatCurrency(it.averageSellingPrice),
      formatCurrency(it.grossSales),
      formatCurrency(it.netSales),
      formatCurrency(it.gst),
      formatCurrency(it.totalWithGst),
    ]);
    const summary = [
      { label: 'Total Items Sold', value: String(itemsData.summary.totalQuantitySold) },
      { label: 'Gross Sales', value: formatCurrency(itemsData.summary.totalGrossSales) },
      { label: 'Net Sales', value: formatCurrency(itemsData.summary.totalNetSales) },
      { label: 'Total GST', value: formatCurrency(itemsData.summary.totalGst) },
    ];
    printReport(
      'Peyala — Item-Wise Sales Performance Report',
      `Period: ${period.replace('_', ' ').toUpperCase()} | Generated on ${new Date().toLocaleString()}`,
      headers,
      rows,
      summary
    );
  };

  const handleExportGstCsv = () => {
    if (!gstData?.dailyReport?.length) return;
    const headers = ['Date', 'Invoice Range (From - To)', 'Order Count', 'Taxable Sales (₹)', 'CGST 2.5% (₹)', 'SGST 2.5% (₹)', 'Total GST 5% (₹)', 'Invoice Value (₹)'];
    const rows = gstData.dailyReport.map((r: any) => [
      r.date,
      r.invoiceRange || 'N/A',
      r.orderCount,
      r.taxableSales,
      r.cgst,
      r.sgst,
      r.totalGst,
      r.totalSales,
    ]);
    exportToCsv('Peyala_GST_Filing_Report.csv', headers, rows);
    toast.success('Exported GST report to CSV');
  };

  const handleExportGstExcel = () => {
    if (!gstData?.dailyReport?.length) return;
    const headers = ['Date', 'Invoice Range (From - To)', 'Order Count', 'Taxable Sales (₹)', 'CGST 2.5% (₹)', 'SGST 2.5% (₹)', 'Total GST 5% (₹)', 'Invoice Value (₹)'];
    const rows = gstData.dailyReport.map((r: any) => [
      r.date,
      r.invoiceRange || 'N/A',
      r.orderCount,
      r.taxableSales,
      r.cgst,
      r.sgst,
      r.totalGst,
      r.totalSales,
    ]);
    exportToExcel('Peyala_GST_Filing_Report.xls', 'GST Register', headers, rows);
    toast.success('Exported GST register to Excel');
  };

  const handlePrintGstPdf = () => {
    if (!gstData?.dailyReport?.length) return;
    const headers = ['Date', 'Invoice Range', 'Orders', 'Taxable Sales', 'CGST (2.5%)', 'SGST (2.5%)', 'Total GST (5%)', 'Invoice Value'];
    const rows = gstData.dailyReport.map((r: any) => [
      r.date,
      r.invoiceRange || 'N/A',
      r.orderCount,
      formatCurrency(r.taxableSales),
      formatCurrency(r.cgst),
      formatCurrency(r.sgst),
      formatCurrency(r.totalGst),
      formatCurrency(r.totalSales),
    ]);
    const summary = [
      { label: 'Invoice Range', value: gstData.summary.invoiceRange || 'N/A' },
      { label: 'Taxable Turnover', value: formatCurrency(gstData.summary.taxableSales) },
      { label: 'CGST (2.5%)', value: formatCurrency(gstData.summary.cgst) },
      { label: 'SGST (2.5%)', value: formatCurrency(gstData.summary.sgst) },
      { label: 'Total GST Collected', value: formatCurrency(gstData.summary.totalGst) },
      { label: 'Total Invoiced Value', value: formatCurrency(gstData.summary.totalInvoiceValue) },
    ];
    const periodDesc = gstPeriodMode === 'monthly' ? `Filing Month: ${gstFilingMonth}` : `Period: ${period.replace('_', ' ').toUpperCase()}`;
    printReport('Peyala — GST Collection & Statutory Tax Filing Register', periodDesc, headers, rows, summary);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        {/* ── HEADER ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  Sales Analytics & Decision Engine
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Real-time sales performance, targets, delivery channel margins, and statutory GST filing
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              title="Configure Sales Targets & Thresholds"
            >
              <Settings className="w-4 h-4 text-gray-500" />
              <span>Target Settings</span>
            </button>
            <button
              onClick={() => {
                if (activeTab === 'overview') fetchOverview();
                else if (activeTab === 'items') fetchItems();
                else if (activeTab === 'gst') fetchGst();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition shadow-sm"
              title="Refresh Analytics"
            >
              <RefreshCw className={cn('w-4 h-4', (loadingOverview || loadingItems || loadingGst) && 'animate-spin')} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* ── GLOBAL DATE FILTER BAR ────────────────────────────── */}
        <div className="card p-3 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7d', label: 'Last 7D' },
              { id: '30d', label: 'Last 30D' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
              { id: 'prev_month', label: 'Prev Month' },
              { id: 'custom', label: 'Custom' },
            ].map((preset) => (
              <button
                key={preset.id}
                onClick={() => setPeriod(preset.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  period === preset.id
                    ? 'bg-primary-600 text-white font-semibold shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="input text-xs py-1 px-2 border rounded-md dark:bg-gray-800"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="input text-xs py-1 px-2 border rounded-md dark:bg-gray-800"
              />
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 border-t md:border-t-0 pt-2 md:pt-0">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={compareEnabled}
                onChange={(e) => setCompareEnabled(e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
              />
              <span>Compare with Previous Period</span>
            </label>
          </div>
        </div>

        {/* ── TAB SELECTOR ──────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 space-x-2 sm:space-x-4 overflow-x-auto scrollbar-none">
          {[
            { id: 'overview', label: 'Overview & Trends', icon: TrendingUp },
            { id: 'items', label: 'Item-Wise Sales', icon: ShoppingBag },
            { id: 'gst', label: 'GST & Tax Filing', icon: DollarSign },
            {
              id: 'suggestions',
              label: 'Action Recommendations',
              icon: Sparkles,
              badge: overviewData?.suggestions?.length || 0,
            },
            {
              id: 'health',
              label: 'Data Health & Audit',
              icon: ShieldCheck,
              status: overviewData?.dataQuality?.status,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition whitespace-nowrap',
                  isActive
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400 font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:border-gray-300'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                    {tab.badge}
                  </span>
                )}
                {tab.status && (
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full ml-1',
                      tab.status === 'good' && 'bg-emerald-500',
                      tab.status === 'review' && 'bg-amber-500',
                      tab.status === 'problem' && 'bg-rose-500'
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB 1: OVERVIEW & TRENDS                                  */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* TODAY'S BUSINESS STATUS HERO WIDGET */}
            {overviewData?.todayStatus && (
              <div className="card p-4 sm:p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-emerald-500/10 border border-amber-200/60 dark:border-amber-900/40 rounded-xl shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        <Flame className="w-3.5 h-3.5 text-amber-600" />
                        Today's Business Pace
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {overviewData.todayStatus.dateStr} (IST)
                      </span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                        {formatCurrency(overviewData.todayStatus.actual)}
                      </span>
                      <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        achieved of{' '}
                        <strong className="text-gray-800 dark:text-gray-200">
                          {formatCurrency(overviewData.todayStatus.target)}
                        </strong>{' '}
                        target
                      </span>
                    </div>
                  </div>

                  {/* Target Achievement Progress Bar */}
                  <div className="flex-1 max-w-md space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-gray-600 dark:text-gray-300">
                      <span>Progress: {overviewData.todayStatus.achievementPct}%</span>
                      {overviewData.todayStatus.remaining > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          ₹{overviewData.todayStatus.remaining.toLocaleString()} remaining to target
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          🎉 Target Achieved!
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          overviewData.todayStatus.achievementPct >= 100
                            ? 'bg-emerald-500'
                            : overviewData.todayStatus.achievementPct >= 60
                            ? 'bg-amber-500'
                            : 'bg-primary-500'
                        )}
                        style={{ width: `${Math.min(100, overviewData.todayStatus.achievementPct)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>0%</span>
                      <span>
                        {overviewData.todayStatus.isSuggested ? 'Dynamic Suggested Target' : 'Configured Daily Target'}
                      </span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TOP 3 EXECUTIVE ACTIONS BANNER */}
            {overviewData?.top3Actions && overviewData.top3Actions.length > 0 && (
              <div className="card p-4 sm:p-5 bg-gray-900 text-white border border-gray-800 rounded-xl shadow-md">
                <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-rose-500 animate-pulse" />
                    <h3 className="font-bold text-sm sm:text-base text-white">
                      🔥 Top 3 Actions to Boost Sales Today
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('suggestions')}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition"
                  >
                    <span>View all recommendations ({overviewData.suggestions?.length || 0})</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {overviewData.top3Actions.map((act: any) => (
                    <div
                      key={act.id}
                      className="p-3.5 bg-gray-800/80 rounded-lg border border-gray-700/60 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span
                            className={cn(
                              'text-[10px] uppercase font-bold px-1.5 py-0.5 rounded tracking-wider',
                              act.severity === 'high' && 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
                              act.severity === 'medium' && 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                              act.severity === 'growth' && 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
                              act.severity === 'low' && 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            )}
                          >
                            {act.severity === 'high' ? 'Critical' : act.severity === 'medium' ? 'Opportunity' : 'Growth'}
                          </span>
                          {act.impact && (
                            <span className="text-[11px] font-semibold text-emerald-400">{act.impact}</span>
                          )}
                        </div>
                        <h4 className="font-bold text-xs sm:text-sm text-gray-100">{act.title}</h4>
                        <p className="text-xs text-gray-300 line-clamp-3 leading-relaxed">{act.finding || act.explanation}</p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-gray-700/50 flex items-center justify-between">
                        <span className="text-[11px] text-amber-400 font-medium truncate mr-2">
                          👉 {act.action || act.recommendedAction}
                        </span>
                        <button
                          onClick={() => handleSuggestionAction(act.id, 'complete')}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold rounded transition shrink-0"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MAIN SALES KPI METRIC CARDS */}
            {overviewData?.kpis && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Gross Sales</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCurrency(overviewData.kpis.grossSales)}
                  </p>
                  {compareEnabled && renderDelta(overviewData.kpis.salesGrowthPct)}
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Net Sales</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCurrency(overviewData.kpis.netSales)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">Gross Sales − GST</p>
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">GST Collected (5%)</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(overviewData.kpis.gst)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">CGST: {formatCurrency(overviewData.kpis.cgst)}</p>
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Total Orders</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {overviewData.kpis.orders.toLocaleString()}
                  </p>
                  {compareEnabled && renderDelta(overviewData.kpis.ordersGrowthPct)}
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Average Order Value (AOV)</p>
                  <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                    {formatCurrency(overviewData.kpis.aov)}
                  </p>
                  {compareEnabled && renderDelta(overviewData.kpis.aovGrowthPct)}
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Total Discounts</p>
                  <p className="text-xl sm:text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                    {formatCurrency(overviewData.kpis.discounts)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {overviewData.kpis.grossSales > 0
                      ? `${Math.round((overviewData.kpis.discounts / overviewData.kpis.grossSales) * 1000) / 10}% of sales`
                      : '0%'}
                  </p>
                </div>
              </div>
            )}

            {/* ── CHARTS SECTION ──────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* SALES TREND CHART (SPAN 2 COLS) */}
              <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 lg:col-span-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                      Sales & Revenue Trend
                    </h3>
                    <p className="text-xs text-gray-500">
                      Historical trajectory over selected period
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Interval toggles */}
                    <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
                      {(['daily', 'weekly', 'monthly'] as const).map((intv) => (
                        <button
                          key={intv}
                          onClick={() => setTrendInterval(intv)}
                          className={cn(
                            'px-2 py-1 text-xs font-medium rounded-md capitalize transition',
                            trendInterval === intv
                              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-2xs'
                              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                          )}
                        >
                          {intv}
                        </button>
                      ))}
                    </div>

                    {/* Metric toggles */}
                    <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
                      {(['sales', 'orders', 'aov', 'discounts'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setTrendMetric(m)}
                          className={cn(
                            'px-2 py-1 text-xs font-medium rounded-md uppercase transition',
                            trendMetric === m
                              ? 'bg-primary-600 text-white font-semibold shadow-2xs'
                              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="h-64 sm:h-72 w-full">
                  {overviewData?.salesTrend && overviewData.salesTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={overviewData.salesTrend}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d97706" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#888888' }}
                          tickFormatter={(val) => {
                            try {
                              const parts = val.split('-');
                              return `${parts[2]}/${parts[1]}`;
                            } catch {
                              return val;
                            }
                          }}
                        />
                        <YAxis
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#888888' }}
                          tickFormatter={(val) => (trendMetric === 'orders' ? val : `₹${val >= 1000 ? `${Math.round(val / 1000)}k` : val}`)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1f2937',
                            borderColor: '#374151',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                          formatter={(value: any) => [
                            trendMetric === 'orders' ? `${value} orders` : formatCurrency(value),
                            trendMetric.toUpperCase(),
                          ]}
                        />
                        <Area
                          type="monotone"
                          dataKey={trendMetric}
                          stroke="#d97706"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#trendGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-gray-400">
                      No sales trend data recorded for this range.
                    </div>
                  )}
                </div>
              </div>

              {/* DAY OF WEEK PERFORMANCE */}
              <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="mb-3">
                  <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                    Day-of-Week Pattern
                  </h3>
                  <p className="text-xs text-gray-500">
                    Average revenue & order distribution
                  </p>
                </div>

                <div className="h-56 w-full">
                  {overviewData?.dayOfWeek && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overviewData.dayOfWeek} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                        <XAxis
                          dataKey="dayName"
                          tickLine={false}
                          tick={{ fontSize: 10, fill: '#888888' }}
                          tickFormatter={(str) => str.slice(0, 3)}
                        />
                        <YAxis tickLine={false} tick={{ fontSize: 10, fill: '#888888' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1f2937',
                            borderColor: '#374151',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                          formatter={(value: any) => [formatCurrency(value), 'Sales']}
                        />
                        <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                          {overviewData.dayOfWeek.map((entry: any, index: number) => {
                            const isWeak = entry.isWeak;
                            return (
                              <Cell
                                key={`cell-${index}`}
                                fill={isWeak ? '#ef4444' : '#d97706'}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" />
                    <span className="text-gray-600 dark:text-gray-300">Regular Day</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                    <span className="text-rose-600 dark:text-rose-400 font-medium">Weak Day Alert</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── HOURLY DISTRIBUTION & CHANNELS ROW ──────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* HOURLY SALES (SPAN 2 COLS) */}
              <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                      Hourly Sales Distribution (00:00 – 23:00 IST)
                    </h3>
                    <p className="text-xs text-gray-500">
                      Find peak rushes and slow hours to optimize staff and promos
                    </p>
                  </div>
                  {overviewData?.peakHour && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                      <Clock className="w-3.5 h-3.5" />
                      Peak: {overviewData.peakHour.label} ({formatCurrency(overviewData.peakHour.sales)})
                    </span>
                  )}
                </div>

                <div className="h-60 w-full">
                  {overviewData?.hourlySales && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={overviewData.hourlySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          tick={{ fontSize: 10, fill: '#888888' }}
                          interval={2}
                        />
                        <YAxis tickLine={false} tick={{ fontSize: 10, fill: '#888888' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1f2937',
                            borderColor: '#374151',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                          formatter={(val: any, name: any) => [
                            name === 'sales' ? formatCurrency(val) : `${val} orders`,
                            name === 'sales' ? 'Revenue' : 'Orders',
                          ]}
                        />
                        <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* SALES CHANNELS MIX */}
              <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="mb-3">
                  <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                    Sales Channel Breakdown
                  </h3>
                  <p className="text-xs text-gray-500">
                    Outlet Dine-in vs Delivery Platforms
                  </p>
                </div>

                {overviewData?.channelStats && (
                  <div className="space-y-3">
                    {overviewData.channelStats.map((ch: any) => (
                      <div key={ch.channel} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-gray-700 dark:text-gray-300">{ch.channel}</span>
                          <span className="text-gray-900 dark:text-white">
                            {formatCurrency(ch.netSales)} ({ch.percentage}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              ch.channel.includes('Outlet') && 'bg-primary-500',
                              ch.channel.includes('Zomato') && 'bg-rose-500',
                              ch.channel.includes('Fatafat') && 'bg-amber-500',
                              ch.channel.includes('Other') && 'bg-indigo-500'
                            )}
                            style={{ width: `${ch.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── DELIVERY PLATFORM PERFORMANCE & MARGINS ─────────── */}
            {overviewData?.deliveryStats && overviewData.deliveryStats.length > 0 && (
              <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                      Delivery Platforms Margin & Deductions
                    </h3>
                    <p className="text-xs text-gray-500">
                      Zomato & Fatafat Gross vs Net Settlement, Commissions, and Effective Cut
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {overviewData.deliveryStats.map((plat: any) => {
                    const isHighLeakage = plat.effectiveDeductionPct > (targetConfig?.deliveryDeductionThresholdPct || 25);
                    return (
                      <div
                        key={plat.platformName}
                        className={cn(
                          'p-4 rounded-xl border',
                          isHighLeakage
                            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                            : 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800'
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-base text-gray-900 dark:text-white">
                            {plat.platformName}
                          </h4>
                          <span
                            className={cn(
                              'text-xs font-bold px-2 py-0.5 rounded',
                              isHighLeakage
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                                : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            )}
                          >
                            Deduction: {plat.effectiveDeductionPct}%
                          </span>
                        </div>

                        {isHighLeakage && (
                          <div className="mb-3 p-2 bg-rose-100/80 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300 rounded text-xs flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                            <span>
                              Platform deductions exceed alert threshold ({targetConfig?.deliveryDeductionThresholdPct}%). Check discounts & ads.
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Gross Sales:</span>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {formatCurrency(plat.grossSales)}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Net Settlement:</span>
                            <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(plat.netSettlement)}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Commission:</span>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                              {formatCurrency(plat.commission)}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Restaurant Discount:</span>
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                              {formatCurrency(plat.restaurantDiscount)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TOP BEST SELLERS & SLOW MOVERS QUICK VIEW ────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* TOP SELLERS */}
              <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-500" />
                    Top 5 Best Selling Items
                  </h3>
                  <button
                    onClick={() => setActiveTab('items')}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-0.5"
                  >
                    <span>Full item report</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  {overviewData?.topSelling?.byRevenue?.map((it: any, idx: number) => (
                    <div
                      key={it.name}
                      onClick={() => openItemDetail(it.name)}
                      className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-bold text-gray-400 w-4">{idx + 1}.</span>
                        <div className="truncate">
                          <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {it.name}
                          </p>
                          <p className="text-[11px] text-gray-500">{it.quantitySold} units sold</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                          {formatCurrency(it.netSales)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SLOW MOVING ITEMS */}
              <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    Slow-Moving Items
                  </h3>
                  <span className="text-xs text-gray-400">
                    &le; {targetConfig.lowItemSalesThresholdQty} sold in period
                  </span>
                </div>

                <div className="space-y-2.5">
                  {overviewData?.slowMovingItems?.length > 0 ? (
                    overviewData.slowMovingItems.map((it: any) => (
                      <div
                        key={it.name}
                        onClick={() => openItemDetail(it.name)}
                        className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer flex items-center justify-between"
                      >
                        <div className="truncate">
                          <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {it.name}
                          </p>
                          <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                            Only {it.quantitySold} unit(s) sold
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {formatCurrency(it.netSales)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400">
                      No slow-moving items detected under threshold.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB 2: ITEM-WISE SALES REPORT                             */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'items' && (
          <div className="space-y-6">
            {/* ITEM SUMMARY CARDS */}
            {itemsData?.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Items Catalogued</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {itemsData.summary.itemCount}
                  </p>
                </div>
                <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Total Units Sold</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {itemsData.summary.totalQuantitySold.toLocaleString()}
                  </p>
                </div>
                <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Net Item Revenue</p>
                  <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">
                    {formatCurrency(itemsData.summary.totalNetSales)}
                  </p>
                </div>
                <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase">GST on Items</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(itemsData.summary.totalGst)}
                  </p>
                </div>
              </div>
            )}

            {/* FILTER & EXPORT BAR */}
            <div className="card p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search menu items or categories..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Category Dropdown */}
                <select
                  value={itemCategory}
                  onChange={(e) => setItemCategory(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                >
                  <option value="all">All Categories</option>
                  {categoriesList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {/* Sort Dropdown */}
                <select
                  value={itemSortBy}
                  onChange={(e) => setItemSortBy(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                >
                  <option value="revenue_desc">Revenue: High to Low</option>
                  <option value="revenue_asc">Revenue: Low to High</option>
                  <option value="qty_desc">Quantity: High to Low</option>
                  <option value="qty_asc">Quantity: Low to High</option>
                  <option value="name_asc">Name: A to Z</option>
                </select>
              </div>

              {/* Multi-format Export buttons (CSV, Excel, PDF) */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExportItemsCsv}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition"
                  title="Export as CSV"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={handleExportItemsExcel}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition"
                  title="Export as Excel (.xls)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Excel</span>
                </button>
                <button
                  onClick={handlePrintItemsPdf}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition"
                  title="Print / Save as PDF"
                >
                  <Printer className="w-3.5 h-3.5 text-gray-600" />
                  <span>Print / PDF</span>
                </button>
              </div>
            </div>

            {/* ITEM DATA TABLE */}
            <div className="card overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-bold uppercase border-b border-gray-200 dark:border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3 text-right">Qty Sold</th>
                      <th className="py-3 px-3 text-right">Avg Price</th>
                      <th className="py-3 px-3 text-right">Gross Sales</th>
                      <th className="py-3 px-3 text-right">Net Sales</th>
                      <th className="py-3 px-3 text-right">GST (5%)</th>
                      <th className="py-3 px-3 text-right">Total Invoiced</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {itemsData?.items && itemsData.items.length > 0 ? (
                      itemsData.items.map((it: any) => (
                        <tr
                          key={it.name}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition"
                        >
                          <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span
                              className={cn(
                                'w-2 h-2 rounded-full shrink-0',
                                it.isVeg ? 'bg-emerald-500' : 'bg-rose-500'
                              )}
                              title={it.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                            />
                            <span className="truncate">{it.name}</span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300">
                            {it.category}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-white">
                            {it.quantitySold}
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">
                            {formatCurrency(it.averageSellingPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-600 dark:text-gray-300">
                            {formatCurrency(it.grossSales)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-white">
                            {formatCurrency(it.netSales)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(it.gst)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-white">
                            {formatCurrency(it.totalWithGst)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => openItemDetail(it.name)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-primary-600 hover:text-white hover:bg-primary-600 rounded border border-primary-500/30 transition"
                            >
                              Deep Dive
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-gray-400">
                          {loadingItems ? 'Loading items report...' : 'No items match your filter criteria.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB 3: GST & STATUTORY TAX FILING                          */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'gst' && (
          <div className="space-y-6">
            {/* GST HEADER & FILING SELECTOR */}
            <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                  Statutory GST Collection & Filing Report
                </h3>
                <p className="text-xs text-gray-500">
                  Separated CGST (2.5%) and SGST (2.5%) for monthly and quarterly GSTR-3B compliance
                </p>
              </div>

              {/* Mode Toggle: Global Date Range vs Specific Monthly Filing */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
                  <button
                    onClick={() => setGstPeriodMode('filter')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition',
                      gstPeriodMode === 'filter'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-2xs font-bold'
                        : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                    )}
                  >
                    Custom Period
                  </button>
                  <button
                    onClick={() => setGstPeriodMode('monthly')}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition',
                      gstPeriodMode === 'monthly'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-2xs font-bold'
                        : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                    )}
                  >
                    Monthly Filing
                  </button>
                </div>

                {gstPeriodMode === 'monthly' && (
                  <input
                    type="month"
                    value={gstFilingMonth}
                    onChange={(e) => setGstFilingMonth(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                )}

                {/* Export Suite for GST */}
                <div className="flex items-center gap-1.5 ml-2 border-l border-gray-200 dark:border-gray-700 pl-2">
                  <button
                    onClick={handleExportGstCsv}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={handleExportGstExcel}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Excel</span>
                  </button>
                  <button
                    onClick={handlePrintGstPdf}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition"
                  >
                    <Printer className="w-3.5 h-3.5 text-gray-600" />
                    <span>Print / PDF</span>
                  </button>
                </div>
              </div>
            </div>

            {/* GST KPI SUMMARY CARDS */}
            {gstData?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Invoice Range (From – To)</p>
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mt-1 truncate font-mono" title={gstData.summary.invoiceRange || 'N/A'}>
                    {gstData.summary.invoiceRange || 'N/A'}
                  </p>
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Gross Sales Value</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCurrency(gstData.summary.grossSales)}
                  </p>
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Taxable Turnover</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCurrency(gstData.summary.taxableSales)}
                  </p>
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">CGST (2.5%)</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(gstData.summary.cgst)}
                  </p>
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">SGST (2.5%)</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(gstData.summary.sgst)}
                  </p>
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Total GST (5.0%)</p>
                  <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(gstData.summary.totalGst)}
                  </p>
                </div>

                <div className="card p-3.5 sm:p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase">Total Invoiced Amount</p>
                  <p className="text-xl sm:text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">
                    {formatCurrency(gstData.summary.totalInvoiceValue)}
                  </p>
                </div>
              </div>
            )}

            {/* RECONCILIATION AUDIT STATUS CARD */}
            {gstData?.reconciliation && (
              <div
                className={cn(
                  'p-4 rounded-xl border flex items-center justify-between gap-4',
                  gstData.reconciliation.isReconciled
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40'
                    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40'
                )}
              >
                <div className="flex items-center gap-3">
                  {gstData.reconciliation.isReconciled ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                      {gstData.reconciliation.isReconciled
                        ? 'GST Register is Fully Reconciled'
                        : `${gstData.reconciliation.discrepanciesCount} Tax Discrepancies Detected`}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      {gstData.reconciliation.isReconciled
                        ? 'Every paid order matches the standard 5% restaurant GST rate (CGST 2.5% + SGST 2.5%) perfectly.'
                        : 'Review discrepancies below where recorded invoice tax deviates by > ₹1 from 5%.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* RATE WISE BREAKDOWN TABLE */}
            <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-3">
                GST Rate-Wise Breakdown
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase font-bold border-b">
                    <tr>
                      <th className="py-2.5 px-3">Tax Slab</th>
                      <th className="py-2.5 px-3 text-right">Taxable Turnover</th>
                      <th className="py-2.5 px-3 text-right">CGST (2.5%)</th>
                      <th className="py-2.5 px-3 text-right">SGST (2.5%)</th>
                      <th className="py-2.5 px-3 text-right">Total GST</th>
                      <th className="py-2.5 px-3 text-right">Total Invoice Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {gstData?.rateWiseReport?.map((r: any) => (
                      <tr key={r.rate}>
                        <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white">
                          {r.rate} Restaurant Services
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(r.taxableValue)}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(r.cgst)}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(r.sgst)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(r.totalGst)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900 dark:text-white">
                          {formatCurrency(r.invoiceValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* DAILY GST REGISTER */}
            <div className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white mb-3">
                Daily GST Sales Register
              </h4>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 uppercase font-bold border-b sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Invoice No. (From – To)</th>
                      <th className="py-2.5 px-3 text-right">Invoices</th>
                      <th className="py-2.5 px-3 text-right">Taxable Sales</th>
                      <th className="py-2.5 px-3 text-right">CGST (2.5%)</th>
                      <th className="py-2.5 px-3 text-right">SGST (2.5%)</th>
                      <th className="py-2.5 px-3 text-right">Total GST</th>
                      <th className="py-2.5 px-3 text-right">Gross Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {gstData?.dailyReport?.map((day: any) => (
                      <tr key={day.date} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-2 px-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                          {day.date}
                        </td>
                        <td className="py-2 px-3 font-mono font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {day.invoiceRange || 'N/A'}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">
                          {day.orderCount}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900 dark:text-white">
                          {formatCurrency(day.taxableSales)}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(day.cgst)}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(day.sgst)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(day.totalGst)}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900 dark:text-white">
                          {formatCurrency(day.totalSales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB 4: ACTION RECOMMENDATIONS                             */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'suggestions' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  Intelligent Business Recommendations
                </h3>
                <p className="text-xs text-gray-500">
                  Data-driven opportunities generated from your real sales and operations logs
                </p>
              </div>

              {/* Filter pills */}
              <div className="flex items-center gap-1.5">
                {(['all', 'high', 'medium', 'growth'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setSuggestionFilter(f)}
                    className={cn(
                      'px-2.5 py-1 text-xs font-semibold rounded-md capitalize transition',
                      suggestionFilter === f
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {filteredSuggestions.length > 0 ? (
                filteredSuggestions.map((sug: any) => (
                  <div
                    key={sug.id}
                    className="card p-4 sm:p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-start justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-wider',
                            sug.severity === 'high' && 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
                            sug.severity === 'medium' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                            sug.severity === 'growth' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                            sug.severity === 'low' && 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          )}
                        >
                          {sug.severity}
                        </span>
                        <span className="text-xs text-gray-400 capitalize font-medium">
                          Category: {sug.category}
                        </span>
                        {sug.impact && (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                            {sug.impact}
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                        {sug.title}
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                        {sug.finding || sug.explanation}
                      </p>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/30">
                        <strong>Recommended Action:</strong> {sug.action || sug.recommendedAction}
                      </div>
                    </div>

                    <div className="flex items-center md:flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleSuggestionAction(sug.id, 'complete')}
                        className="flex-1 md:w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                      >
                        Mark Done
                      </button>
                      <button
                        onClick={() => handleSuggestionAction(sug.id, 'snooze', 7)}
                        className="flex-1 md:w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition"
                      >
                        Snooze 7d
                      </button>
                      <button
                        onClick={() => handleSuggestionAction(sug.id, 'dismiss')}
                        className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition"
                        title="Dismiss"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card p-8 text-center text-xs text-gray-400">
                  No active recommendations in this category.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB 5: DATA HEALTH & AUDIT                                */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'health' && (
          <div className="space-y-6">
            <div className="card p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">
                    Sales Data Integrity & Health Check
                  </h3>
                  <p className="text-xs text-gray-500">
                    Continuous automated audit of tax consistency, item records, and ledger balances
                  </p>
                </div>
              </div>

              {overviewData?.dataQuality && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 rounded-xl border bg-gray-50 dark:bg-gray-800/40">
                    <p className="text-xs text-gray-500 font-semibold">Orders Audited</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                      {overviewData.dataQuality.totalOrdersChecked}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">From live Order collection</p>
                  </div>

                  <div className="p-4 rounded-xl border bg-gray-50 dark:bg-gray-800/40">
                    <p className="text-xs text-gray-500 font-semibold">Untaxed Orders</p>
                    <p
                      className={cn(
                        'text-xl font-bold mt-1',
                        overviewData.dataQuality.unTaxedOrders > 0 ? 'text-amber-600' : 'text-emerald-600'
                      )}
                    >
                      {overviewData.dataQuality.unTaxedOrders}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {overviewData.dataQuality.unTaxedOrders === 0 ? 'All orders have tax recorded' : 'Orders without GST applied'}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border bg-gray-50 dark:bg-gray-800/40">
                    <p className="text-xs text-gray-500 font-semibold">Tax Calculation Deviations</p>
                    <p
                      className={cn(
                        'text-xl font-bold mt-1',
                        overviewData.dataQuality.taxMismatches > 0 ? 'text-rose-600' : 'text-emerald-600'
                      )}
                    >
                      {overviewData.dataQuality.taxMismatches}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Orders deviating by &gt; ₹1 from standard 5%
                    </p>
                  </div>
                </div>
              )}

              {/* PROFITABILITY / COSTING TRANSPARENCY NOTICE */}
              <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Recipe Costing & Profitability Transparency Note</span>
                </div>
                <p className="text-blue-700/80 dark:text-blue-300/80 leading-relaxed">
                  Peyala v8 tracks sales volume, gross revenue, net revenue, discounts, and GST collections with exact precision from your database records. Direct per-dish ingredient recipe costing is currently not linked to menu items. Costing and profitability figures are deliberately omitted rather than fabricated with mock estimations.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* MODAL: SINGLE ITEM DEEP DIVE                               */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Modal
          open={Boolean(selectedItemId)}
          onClose={() => {
            setSelectedItemId(null);
            setItemDetail(null);
          }}
          title={itemDetail?.item?.name ? `Item Analytics: ${itemDetail.item.name}` : 'Item Deep Dive'}
          size="lg"
        >
          {loadingItemDetail ? (
            <div className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-primary-500" />
              <span>Loading item performance analytics...</span>
            </div>
          ) : itemDetail ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b pb-3 dark:border-gray-800">
                <div>
                  <span className="text-xs text-gray-400 uppercase font-semibold">
                    Category: {itemDetail.item.category}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Base Unit Price: <strong>{formatCurrency(itemDetail.item.basePrice)}</strong>
                  </p>
                </div>
                <span
                  className={cn(
                    'px-2 py-0.5 text-xs font-semibold rounded',
                    itemDetail.item.isVeg
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  )}
                >
                  {itemDetail.item.isVeg ? 'Vegetarian' : 'Non-Veg'}
                </span>
              </div>

              {/* Item KPI Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">Units Sold</span>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {itemDetail.summary.totalQuantitySold}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">Gross Sales</span>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatCurrency(itemDetail.summary.totalGrossSales)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">Net Sales</span>
                  <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                    {formatCurrency(itemDetail.summary.totalNetSales)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-[10px] text-gray-500 uppercase font-bold">GST Collected</span>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(itemDetail.summary.totalTax)}
                  </p>
                </div>
              </div>

              {/* Daily Trend Chart for Item */}
              {itemDetail.dailyTrend && itemDetail.dailyTrend.length > 0 && (
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">
                    Daily Sales Trajectory
                  </h4>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={itemDetail.dailyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                        <XAxis dataKey="date" tickLine={false} tick={{ fontSize: 10, fill: '#888888' }} />
                        <YAxis tickLine={false} tick={{ fontSize: 10, fill: '#888888' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1f2937',
                            borderColor: '#374151',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                          formatter={(val: any, name: any) => [
                            name === 'sales' ? formatCurrency(val) : `${val} units`,
                            name === 'sales' ? 'Revenue' : 'Quantity',
                          ]}
                        />
                        <Area type="monotone" dataKey="quantity" stroke="#d97706" fill="#d9770620" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Item Profitability Note */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg text-xs text-gray-500 border border-gray-200/50 dark:border-gray-800">
                <strong>Costing Transparency:</strong> {itemDetail.profitabilityNote}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-gray-400">No details found for this item.</div>
          )}
        </Modal>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* MODAL: TARGET & THRESHOLD SETTINGS                         */}
        {/* ══════════════════════════════════════════════════════════ */}
        <Modal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Sales Targets & Decision Thresholds"
          size="md"
        >
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Configure baseline sales goals and alert sensitivity for suggestions. If a target is left empty, the engine dynamically calculates comparable historical averages.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Daily Sales Target (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={targetConfig.dailyTarget ?? ''}
                  onChange={(e) =>
                    setTargetConfig({ ...targetConfig, dailyTarget: Number(e.target.value) || 0 })
                  }
                  className="w-full text-xs input px-2.5 py-1.5 rounded-lg border dark:bg-gray-800"
                  placeholder="e.g. 10000"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Weekend Target (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={targetConfig.weekendTarget ?? ''}
                  onChange={(e) =>
                    setTargetConfig({ ...targetConfig, weekendTarget: Number(e.target.value) || 0 })
                  }
                  className="w-full text-xs input px-2.5 py-1.5 rounded-lg border dark:bg-gray-800"
                  placeholder="e.g. 15000"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Target Average Order Value (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={targetConfig.targetAov ?? ''}
                  onChange={(e) =>
                    setTargetConfig({ ...targetConfig, targetAov: Number(e.target.value) || 0 })
                  }
                  className="w-full text-xs input px-2.5 py-1.5 rounded-lg border dark:bg-gray-800"
                  placeholder="e.g. 400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Suggested Target Growth (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={targetConfig.suggestedGrowthPct ?? 10}
                  onChange={(e) =>
                    setTargetConfig({ ...targetConfig, suggestedGrowthPct: Number(e.target.value) || 10 })
                  }
                  className="w-full text-xs input px-2.5 py-1.5 rounded-lg border dark:bg-gray-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Weak Day Alert Threshold (%)
                </label>
                <input
                  type="number"
                  min="5"
                  max="80"
                  value={targetConfig.weakDayThresholdPct ?? 20}
                  onChange={(e) =>
                    setTargetConfig({ ...targetConfig, weakDayThresholdPct: Number(e.target.value) || 20 })
                  }
                  className="w-full text-xs input px-2.5 py-1.5 rounded-lg border dark:bg-gray-800"
                />
                <span className="text-[10px] text-gray-400">Triggered if a day is % below average</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Delivery Deduction Alert (%)
                </label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={targetConfig.deliveryDeductionThresholdPct ?? 25}
                  onChange={(e) =>
                    setTargetConfig({
                      ...targetConfig,
                      deliveryDeductionThresholdPct: Number(e.target.value) || 25,
                    })
                  }
                  className="w-full text-xs input px-2.5 py-1.5 rounded-lg border dark:bg-gray-800"
                />
                <span className="text-[10px] text-gray-400">Alert if Zomato/Fatafat cut exceeds %</span>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border text-gray-600 dark:text-gray-400 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition flex items-center gap-1.5"
              >
                {savingSettings && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Settings</span>
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AppLayout>
  );
}
