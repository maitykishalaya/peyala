'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import StatCard from '@/components/dashboard/StatCard';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { TrendingUp, ShoppingCart, Wallet, Package, AlertTriangle, CreditCard, TrendingDown } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';

const COLORS = ['#e26411', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.summary().then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(new Date())} · Peyala Café</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Open Hours</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">1:00 PM – 11:00 PM</p>
          </div>
        </div>

        {/* Yesterday's Summary Banner */}
        <div className="card p-5 bg-gradient-to-r from-brand-500 to-brand-600 text-white border-0">
          <p className="text-sm font-medium text-brand-100 mb-3">
            Yesterday's Summary{yesterday.date ? ` · ${formatDate(yesterday.date)}` : ''}
          </p>

          {(yesterday.sales || yesterday.purchases?.count > 0) ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Sales side */}
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-brand-200 mb-2">Sales</p>
                {yesterday.sales ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-brand-200">Outlet</span>
                      <span className="font-semibold">{formatCurrency(yesterday.sales.outlet || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-brand-200">Zomato</span>
                      <span className="font-semibold">{formatCurrency(yesterday.sales.zomato || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-brand-200">Fatafat</span>
                      <span className="font-semibold">{formatCurrency(yesterday.sales.fatafat || 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1.5 mt-1.5 border-t border-white/20">
                      <span className="font-medium">Total</span>
                      <span className="font-bold">{formatCurrency(yesterday.sales.total || 0)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-brand-200">No sales entry was made</p>
                )}
              </div>

              {/* Purchases side */}
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-xs text-brand-200 mb-2">
                  Purchases {yesterday.purchases?.count > 0 && `(${yesterday.purchases.count})`}
                </p>
                {yesterday.purchases?.count > 0 ? (
                  <div className="space-y-1">
                    {yesterday.purchases.entries.slice(0, 3).map((p: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-brand-200 truncate mr-2">{p.supplier}</span>
                        <span className="font-semibold flex items-center gap-1">
                          {formatCurrency(p.amount)}
                          {!p.isPaid && <span className="text-[10px] bg-yellow-400 text-yellow-900 px-1 rounded">Due</span>}
                        </span>
                      </div>
                    ))}
                    {yesterday.purchases.entries.length > 3 && (
                      <p className="text-[10px] text-brand-200">+{yesterday.purchases.entries.length - 3} more</p>
                    )}
                    <div className="flex justify-between text-sm pt-1.5 mt-1.5 border-t border-white/20">
                      <span className="font-medium">Total</span>
                      <span className="font-bold">{formatCurrency(yesterday.purchases.total)}</span>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="This Month Revenue" value={month.revenue || 0} icon={TrendingUp} accent="blue" subtitle={`Outlet + Zomato + Fatafat`} />
          <StatCard title="Month Expenses" value={month.expenses || 0} icon={ShoppingCart} accent="red" subtitle="All categories" />
          <StatCard title="Gross Profit" value={month.grossProfit || 0} icon={TrendingUp} accent="green" subtitle={`${month.revenue > 0 ? ((month.grossProfit / month.revenue) * 100).toFixed(1) : 0}% margin`} />
          <StatCard title="Net Profit" value={month.netProfit || 0} icon={TrendingDown} accent={month.netProfit >= 0 ? 'green' : 'red'} subtitle="After all expenses" />
        </div>

        {/* Accounts & Inventory */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Accounts */}
          <div className="lg:col-span-2 card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Wallet className="w-4 h-4 text-brand-500" /> Account Balances</h3>
            <div className="grid grid-cols-2 gap-3">
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
                <span className="text-sm text-gray-500">This Month Zomato</span>
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400">{formatCurrency(month.zomato || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">This Month Fatafat</span>
                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(month.fatafat || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales Trend */}
          <div className="lg:col-span-2 card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">30-Day Revenue Trend</h3>
            {salesTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={salesTrendData}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e26411" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#e26411" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="Revenue" stroke="#e26411" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400 text-center py-16">No sales data yet</p>}
          </div>

          {/* Expense Breakdown */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Expense Breakdown</h3>
            {pieData.length > 0 ? (
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
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">This Month — Sales Channel Performance</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Outlet Sales', value: month.outlet || 0, pct: month.revenue > 0 ? ((month.outlet / month.revenue) * 100).toFixed(0) : 0, color: '#e26411' },
              { label: 'Zomato Net', value: month.zomato || 0, pct: month.revenue > 0 ? ((month.zomato / month.revenue) * 100).toFixed(0) : 0, color: '#ef4444' },
              { label: 'Fatafat Net', value: month.fatafat || 0, pct: month.revenue > 0 ? ((month.fatafat / month.revenue) * 100).toFixed(0) : 0, color: '#f97316' },
            ].map(({ label, value, pct, color }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(value)}</p>
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mt-2">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{pct}% of total</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
