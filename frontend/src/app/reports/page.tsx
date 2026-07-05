'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { reportsApi } from '@/lib/api';
import { formatCurrency, monthStart, today } from '@/lib/utils';
import { BarChart3, TrendingUp, TrendingDown, FileText, Calendar } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';

export default function ReportsPage() {
  const [pnl, setPnl] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState({ start: monthStart(), end: today() });
  const [tab, setTab] = useState<'pnl' | 'daily'>('pnl');
  const [dailyDate, setDailyDate] = useState(today());
  const [daily, setDaily] = useState<any>(null);

  const loadPnl = async () => {
    setLoading(true);
    const r = await reportsApi.pnl(range.start, range.end);
    setPnl(r.data); setLoading(false);
  };

  const loadDaily = async () => {
    setLoading(true);
    const r = await reportsApi.daily(dailyDate);
    setDaily(r.data); setLoading(false);
  };

  useEffect(() => { if (tab === 'pnl') loadPnl(); else loadDaily(); }, [tab]);

  const expenseChartData = pnl?.expenses?.byCategory?.slice(0, 8).map((e: any) => ({
    name: e._id?.slice(0, 12) || 'Other',
    Amount: e.total,
  })) || [];

  const incomeVsExpense = pnl ? [
    { name: 'Revenue', value: pnl.income.total, fill: '#10b981' },
    { name: 'Expenses', value: pnl.expenses.total, fill: '#ef4444' },
    { name: 'Net Profit', value: pnl.netProfit, fill: pnl.netProfit >= 0 ? '#6366f1' : '#f97316' },
  ] : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <div className="flex gap-2">
            <button onClick={() => setTab('pnl')} className={tab === 'pnl' ? 'btn-primary' : 'btn-secondary'}>P&L Statement</button>
            <button onClick={() => setTab('daily')} className={tab === 'daily' ? 'btn-primary' : 'btn-secondary'}>Daily Report</button>
          </div>
        </div>

        {tab === 'pnl' && (
          <>
            {/* Date Range */}
            <div className="card p-4 flex gap-3 items-end flex-wrap">
              <div><label className="label">Start Date</label><input type="date" className="input" value={range.start} onChange={e => setRange({...range, start: e.target.value})} /></div>
              <div><label className="label">End Date</label><input type="date" className="input" value={range.end} onChange={e => setRange({...range, end: e.target.value})} /></div>
              {/* Quick presets */}
              <div className="flex gap-2">
                {[
                  { l: 'This Month', s: monthStart(), e: today() },
                  { l: 'Last 7 Days', s: new Date(Date.now() - 7*86400000).toISOString().split('T')[0], e: today() },
                  { l: 'Last 30 Days', s: new Date(Date.now() - 30*86400000).toISOString().split('T')[0], e: today() },
                ].map(({ l, s, e }) => (
                  <button key={l} onClick={() => setRange({ start: s, end: e })} className="btn-secondary text-xs px-2 py-1">{l}</button>
                ))}
              </div>
              <button onClick={loadPnl} className="btn-primary">Generate Report</button>
            </div>

            {loading ? <div className="text-center py-16 text-gray-400">Generating...</div> : pnl && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Revenue', value: pnl.income.total, color: 'text-brand-600', bg: 'from-brand-50 to-orange-50 dark:from-brand-900/10' },
                    { label: 'Total Expenses', value: pnl.expenses.total, color: 'text-red-500', bg: 'from-red-50 to-rose-50 dark:from-red-900/10' },
                    { label: 'Gross Profit', value: pnl.grossProfit, color: pnl.grossProfit >= 0 ? 'text-green-600' : 'text-red-500', bg: 'from-green-50 to-emerald-50 dark:from-green-900/10' },
                    { label: 'Net Profit', value: pnl.netProfit, color: pnl.netProfit >= 0 ? 'text-indigo-600' : 'text-red-500', bg: 'from-indigo-50 to-blue-50 dark:from-indigo-900/10' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`card p-5 bg-gradient-to-br ${bg}`}>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                      <p className={`text-2xl font-bold mt-1 ${color}`}>{formatCurrency(value)}</p>
                      {label === 'Gross Profit' && <p className="text-xs text-gray-400 mt-1">{pnl.grossMargin}% margin</p>}
                      {label === 'Net Profit' && <p className="text-xs text-gray-400 mt-1">{pnl.netMargin}% margin</p>}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Income Breakdown */}
                  <div className="card p-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" /> Income Breakdown</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Outlet Sales', value: pnl.income.outlet },
                        { label: 'Zomato (Net Settlement)', value: pnl.income.zomato },
                        { label: 'Fatafat (Net Settlement)', value: pnl.income.fatafat },
                        { label: 'Other Sales', value: pnl.income.other },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(value || 0)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Total Revenue</span>
                        <span className="text-base font-bold text-green-600">{formatCurrency(pnl.income.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expense Breakdown */}
                  <div className="card p-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" /> Expense Breakdown</h3>
                    <div className="space-y-2">
                      {pnl.expenses.byCategory?.map((e: any) => (
                        <div key={e._id} className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{e._id}</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(e.total)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Total Expenses</span>
                        <span className="text-base font-bold text-red-500">{formatCurrency(pnl.expenses.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="card p-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Revenue vs Expenses vs Profit</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={incomeVsExpense}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: any) => formatCurrency(v)} />
                        <Bar dataKey="value" radius={[4,4,0,0]}>
                          {incomeVsExpense.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card p-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Expense by Category</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={expenseChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                        <Tooltip formatter={(v: any) => formatCurrency(v)} />
                        <Bar dataKey="Amount" fill="#e26411" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'daily' && (
          <>
            <div className="card p-4 flex gap-3 items-end">
              <div><label className="label">Date</label><input type="date" className="input" value={dailyDate} onChange={e => setDailyDate(e.target.value)} /></div>
              <button onClick={loadDaily} className="btn-primary">Load Report</button>
            </div>

            {loading ? <div className="text-center py-16 text-gray-400">Loading...</div> : daily && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="card p-4 text-center">
                    <p className="text-xs text-gray-400">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(daily.totalRevenue)}</p>
                  </div>
                  <div className="card p-4 text-center">
                    <p className="text-xs text-gray-400">Total Expenses</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(daily.totalExpenses)}</p>
                  </div>
                  <div className="card p-4 text-center">
                    <p className="text-xs text-gray-400">Net Profit</p>
                    <p className={`text-2xl font-bold mt-1 ${daily.netProfit >= 0 ? 'text-brand-600' : 'text-red-500'}`}>{formatCurrency(daily.netProfit)}</p>
                  </div>
                </div>

                {daily.sales && (
                  <div className="card p-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Sales</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[['Outlet', daily.sales.outletSales], ['Zomato Net', daily.sales.zomato?.netSettlement], ['Fatafat Net', daily.sales.fatafat?.netSettlement], ['Other', daily.sales.otherSales]].map(([l, v]) => (
                        <div key={l as string} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <p className="text-xs text-gray-400">{l as string}</p>
                          <p className="text-base font-bold text-gray-900 dark:text-white">{formatCurrency(+(v || 0))}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {daily.purchases?.length > 0 && (
                  <div className="card p-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Purchases</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 dark:bg-gray-800"><th className="table-th">Supplier</th><th className="table-th">Items</th><th className="table-th">Total</th></tr></thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {daily.purchases.map((p: any) => (
                          <tr key={p._id}>
                            <td className="table-td">{p.supplier?.name}</td>
                            <td className="table-td">{p.items?.length} items</td>
                            <td className="table-td font-medium text-red-500">{formatCurrency(p.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {daily.payments?.length > 0 && (
                  <div className="card p-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Payments</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 dark:bg-gray-800"><th className="table-th">Payee</th><th className="table-th">Category</th><th className="table-th">Amount</th></tr></thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {daily.payments.map((p: any) => (
                          <tr key={p._id}>
                            <td className="table-td">{p.payee}</td>
                            <td className="table-td"><span className="badge-blue">{p.category}</span></td>
                            <td className="table-td font-medium text-red-500">{formatCurrency(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
