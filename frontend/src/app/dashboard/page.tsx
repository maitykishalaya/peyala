'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/dashboard/StatCard';
import { dashboardApi, ownerNoteApi } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { TrendingUp, ShoppingCart, Wallet, Package, AlertTriangle, CreditCard, TrendingDown, RefreshCw, ShieldAlert, ArrowRight, EyeOff } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';

const COLORS = ['#e26411', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const CACHE_KEY = 'peyala_dashboard_cache_v3';

function readCache(role = 'default') {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}_${role}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(role = 'default', data: any) {
  try {
    localStorage.setItem(`${CACHE_KEY}_${role}`, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable (private browsing) — safe to ignore, just no cache this time
  }
}

export default function DashboardPage() {
  const { user, isViewer } = useAuth();
  const userRole = user?.role || 'default';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [ownerNote, setOwnerNote] = useState<string>('');

  const fetchFresh = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [r, noteRes] = await Promise.allSettled([
        dashboardApi.summary(),
        ownerNoteApi.get(),
      ]);

      let noteText = '';
      if (noteRes.status === 'fulfilled' && noteRes.value.data?.note !== undefined) {
        noteText = noteRes.value.data.note || '';
        setOwnerNote(noteText);
      }

      if (r.status === 'fulfilled') {
        const d = r.value.data;
        if (!noteText && d.ownerNote) {
          noteText = d.ownerNote;
          setOwnerNote(noteText);
        }
        setData(d);
        writeCache(userRole, { ...d, ownerNote: noteText });
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // 1. Always fetch live owner note so any updates in settings appear immediately
    ownerNoteApi.get().then(r => {
      const note = r.data.note || '';
      setOwnerNote(note);
    }).catch(() => {});

    // 2. Read local dashboard cache scoped to user role
    const cached = readCache(userRole);
    if (cached?.data) {
      setData(cached.data);
      if (cached.data.ownerNote) {
        setOwnerNote(cached.data.ownerNote);
      }
      if (cached.savedAt) {
        setLastUpdated(new Date(cached.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      setLoading(false);
      return;
    }

    // 3. Only hit server on initial load if no cache exists
    fetchFresh();
  }, [userRole]);

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  const month = data?.month || {};
  const todaySales = data?.today?.sales;
  const yesterday = data?.yesterday || {};
  const accounts = data?.accounts || [];
  const charts = data?.charts || {};

  const daysElapsed = month.daysElapsed || Math.max(1, new Date().getDate());
  const dailyAverage = month.dailyAverage || {
    revenue: Math.round((month.revenue || 0) / daysElapsed),
    outlet: Math.round((month.outlet || 0) / daysElapsed),
    zomato: Math.round((month.zomato || 0) / daysElapsed),
    fatafat: Math.round((month.fatafat || 0) / daysElapsed),
    other: Math.round((month.other || 0) / daysElapsed),
    expenses: Math.round((month.expenses || 0) / daysElapsed),
  };

  // Fill sales trend gaps
  const salesTrendData = charts.salesTrend?.map((d: any) => ({
    date: d._id.slice(5), // MM-DD
    Revenue: d.revenue,
    Outlet: d.outlet,
    Zomato: d.zomato || 0,
    Fatafat: d.fatafat || 0,
  })) || [];

  const expenseTrendData = charts.expenseTrend?.map((d: any) => ({
    date: d._id.slice(5),
    Expenses: d.amount,
  })) || [];

  const pieData = charts.expenseByCategory?.slice(0, 6).map((d: any) => ({
    name: d._id,
    value: d.total,
  })) || [];

  return (
    <AppLayout>
      <div className="space-y-6 pb-20 sm:pb-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span>{formatDate(new Date())} · Peyala Café</span>
              {lastUpdated && <span className="text-xs text-gray-400">· Cached ({lastUpdated})</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchFresh(true)}
              disabled={refreshing}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              title="Fetch fresh dashboard data from server"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin text-brand-500")} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-400">Open Hours</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">1:00 PM – 11:00 PM</p>
            </div>
          </div>
        </div>

        {ownerNote ? (
          <div className="card border-l-4 border-brand-500 bg-brand-50 dark:bg-brand-900/20 p-4">
            <p className="text-sm font-semibold text-brand-700 dark:text-brand-200">Owner Notice</p>
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ownerNote}</p>
          </div>
        ) : null}

        {/* Yesterday's Summary Banner */}
        <div className="card p-5 bg-gradient-to-r from-brand-500 to-brand-600 text-white border-0">
          <p className="text-sm font-medium text-brand-100 mb-3">
            Yesterday's Summary{yesterday.date ? ` · ${formatDate(yesterday.date)}` : ''}
          </p>

          {(yesterday.sales || yesterday.purchases?.count > 0) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Sales side */}
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-brand-200">Sales</p>
                  {isViewer && (
                    <span className="text-[10px] bg-white/20 text-white font-semibold px-1.5 py-0.5 rounded">
                      Protected
                    </span>
                  )}
                </div>
                {yesterday.sales ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-brand-200">Outlet</span>
                      <span className="font-semibold">{isViewer ? '••••••' : formatCurrency(yesterday.sales.outlet || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-brand-200">Zomato</span>
                      <span className="font-semibold">{isViewer ? '••••••' : formatCurrency(yesterday.sales.zomato || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-brand-200">Fatafat</span>
                      <span className="font-semibold">{isViewer ? '••••••' : formatCurrency(yesterday.sales.fatafat || 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1.5 mt-1.5 border-t border-white/20">
                      <span className="font-medium">Total</span>
                      <span className="font-bold">{isViewer ? '••••••' : formatCurrency(yesterday.sales.total || 0)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-brand-200">No sales entry was made</p>
                )}
              </div>

              {/* Purchases side */}
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-brand-200">
                    Purchases {yesterday.purchases?.count > 0 && `(${yesterday.purchases.count})`}
                  </p>
                  {isViewer && (
                    <span className="text-[10px] bg-white/20 text-white font-semibold px-1.5 py-0.5 rounded">
                      Protected
                    </span>
                  )}
                </div>
                {yesterday.purchases?.count > 0 ? (
                  <div className="space-y-1">
                    {yesterday.purchases.entries.slice(0, 3).map((p: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-brand-200 truncate mr-2">{p.supplier}</span>
                        <span className="font-semibold flex items-center gap-1">
                          {isViewer ? '••••••' : formatCurrency(p.amount)}
                          {!p.isPaid && <span className="text-[10px] bg-yellow-400 text-yellow-900 px-1 rounded">Due</span>}
                        </span>
                      </div>
                    ))}
                    {yesterday.purchases.entries.length > 3 && (
                      <p className="text-[10px] text-brand-200">+{yesterday.purchases.entries.length - 3} more</p>
                    )}
                    <div className="flex justify-between text-sm pt-1.5 mt-1.5 border-t border-white/20">
                      <span className="font-medium">Total</span>
                      <span className="font-bold">{isViewer ? '••••••' : formatCurrency(yesterday.purchases.total)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-brand-200">No purchases recorded</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-brand-100">No sales or purchases recorded yesterday.</p>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="This Month Revenue"
            value={isViewer ? '••••••' : (month.revenue || 0)}
            isMasked={isViewer}
            icon={TrendingUp}
            accent="blue"
            badge={isViewer ? 'Protected in Demo' : `Avg: ${formatCurrency(dailyAverage.revenue || 0)}/day`}
            subtitle={isViewer ? 'Hidden in Demo' : `Outlet + Zomato + Fatafat`}
          />
          <StatCard
            title="Month Expenses"
            value={isViewer ? '••••••' : (month.expenses || 0)}
            isMasked={isViewer}
            icon={ShoppingCart}
            accent="red"
            badge={isViewer ? 'Protected in Demo' : undefined}
            subtitle={isViewer ? 'Hidden in Demo' : 'All categories'}
          />
          <StatCard
            title="Gross Profit"
            value={isViewer ? '••••••' : (month.grossProfit || 0)}
            isMasked={isViewer}
            icon={TrendingUp}
            accent="green"
            badge={isViewer ? 'Protected in Demo' : undefined}
            subtitle={isViewer ? 'Hidden in Demo' : `${month.revenue > 0 ? ((month.grossProfit / month.revenue) * 100).toFixed(1) : 0}% margin`}
          />
          <StatCard
            title="Net Profit"
            value={isViewer ? '••••••' : (month.netProfit || 0)}
            isMasked={isViewer}
            icon={TrendingDown}
            accent={!isViewer && month.netProfit >= 0 ? 'green' : 'red'}
            badge={isViewer ? 'Protected in Demo' : undefined}
            subtitle={isViewer ? 'Hidden in Demo' : 'After all expenses'}
          />
        </div>

        {/* Accounts & Inventory */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Accounts */}
          <div className="lg:col-span-2 card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Wallet className="w-4 h-4 text-brand-500" /> Account Balances</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {accounts.map((acc: any) => (
                <div key={acc._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color || '#6366f1' }} />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{acc.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{acc.type}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold ${acc.currentBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {formatCurrency(acc.currentBalance)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500" /> Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Inventory Value</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(data?.inventoryValue || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Low Stock Items</span>
                <span className={`badge ${data?.lowStockCount > 0 ? 'badge-yellow' : 'badge-green'}`}>{data?.lowStockCount || 0} items</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Supplier Dues</span>
                <span className="text-sm font-semibold text-red-500">{formatCurrency(data?.supplierDues || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">This Month Outlet</span>
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{isViewer ? '••••••' : formatCurrency(month.outlet || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">This Month Zomato</span>
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">{isViewer ? '••••••' : formatCurrency(month.zomato || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">This Month Fatafat</span>
                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">{isViewer ? '••••••' : formatCurrency(month.fatafat || 0)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-gray-800">
                <span className="text-sm text-gray-500 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  Expense Leaks
                </span>
                <Link
                  href="/expense-leak-detector"
                  className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                >
                  Run Detector <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales Trend */}
          <div className="lg:col-span-2 card p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">30-Day Revenue Trend</h3>
              {isViewer ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  Protected in Demo
                </span>
              ) : salesTrendData.length > 0 && (
                <span className="text-xs text-gray-400">
                  {salesTrendData.length} {salesTrendData.length === 1 ? 'day recorded' : 'days recorded'}
                </span>
              )}
            </div>
            {isViewer ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center mb-3">
                  <EyeOff className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Revenue Trend Protected</h4>
                <p className="text-xs text-gray-400 max-w-sm mt-1">
                  Sales charts and daily revenue trends are confidential and hidden in Viewer demo mode.
                </p>
              </div>
            ) : salesTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={salesTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  <Bar dataKey="Revenue" fill="#e26411" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 text-center py-16">No sales data yet</p>}
          </div>

          {/* Expense Breakdown */}
          <div className="card p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Expense Breakdown</h3>
              {isViewer && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                  Protected in Demo
                </span>
              )}
            </div>
            {isViewer ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center justify-center mb-3">
                  <EyeOff className="w-6 h-6 text-red-500 dark:text-red-400" />
                </div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Expense Breakdown Protected</h4>
                <p className="text-xs text-gray-400 max-w-xs mt-1">
                  Categorized expense distribution is confidential and hidden in Viewer demo mode.
                </p>
              </div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 text-center py-16">No expense data yet</p>}
          </div>
        </div>

        {/* Channel Performance */}
        <div className="card p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">This Month — Sales Channel Performance</h3>
              <p className="text-xs text-gray-400">Channel revenue and current daily average breakdown</p>
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/60 px-2.5 py-1 rounded-md border border-gray-200/50 dark:border-gray-700/50 self-start sm:self-auto">
              Day {daysElapsed}{month.totalDaysInMonth ? ` of ${month.totalDaysInMonth}` : ''}
            </span>
          </div>

          <div className={cn(
            'grid gap-3 sm:gap-4',
            (month.other || 0) > 0 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'
          )}>
            {[
              {
                label: 'Outlet Sales',
                value: isViewer ? '••••••' : (month.outlet || 0),
                avg: isViewer ? '••••••' : (dailyAverage.outlet || 0),
                pct: isViewer ? 0 : (month.revenue > 0 ? ((month.outlet / month.revenue) * 100).toFixed(0) : 0),
                color: '#e26411',
              },
              {
                label: 'Zomato Net',
                value: isViewer ? '••••••' : (month.zomato || 0),
                avg: isViewer ? '••••••' : (dailyAverage.zomato || 0),
                pct: isViewer ? 0 : (month.revenue > 0 ? ((month.zomato / month.revenue) * 100).toFixed(0) : 0),
                color: '#ef4444',
              },
              {
                label: 'Fatafat Net',
                value: isViewer ? '••••••' : (month.fatafat || 0),
                avg: isViewer ? '••••••' : (dailyAverage.fatafat || 0),
                pct: isViewer ? 0 : (month.revenue > 0 ? ((month.fatafat / month.revenue) * 100).toFixed(0) : 0),
                color: '#f97316',
              },
              ...((month.other || 0) > 0 ? [{
                label: 'Other Sales',
                value: isViewer ? '••••••' : (month.other || 0),
                avg: isViewer ? '••••••' : (dailyAverage.other || 0),
                pct: isViewer ? 0 : (month.revenue > 0 ? ((month.other / month.revenue) * 100).toFixed(0) : 0),
                color: '#8b5cf6',
              }] : []),
            ].map(({ label, value, avg, pct, color }) => (
              <div
                key={label}
                className="text-center p-3.5 rounded-xl bg-gray-50/60 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 flex flex-col justify-between"
              >
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {typeof value === 'string' ? value : formatCurrency(value)}
                  </p>

                  {/* Daily Average Sales Badge */}
                  <div className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 px-2.5 py-1 rounded-full mt-2 shadow-2xs">
                    <span className="text-gray-400 font-normal">Daily Avg:</span>
                    <span className="font-bold text-brand-600 dark:text-brand-400">
                      {typeof avg === 'string' ? avg : formatCurrency(avg)}
                    </span>
                    {!isViewer && <span className="text-gray-400 text-[10px] font-normal">/day</span>}
                  </div>
                </div>

                <div className="mt-3.5">
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {isViewer ? 'Protected in Demo' : `${pct}% of total`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
