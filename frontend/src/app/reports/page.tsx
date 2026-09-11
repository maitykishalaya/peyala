'use client';
import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { reportsApi } from '@/lib/api';
import { formatCurrency, monthStart, today, cn } from '@/lib/utils';
import {
  BarChart3, TrendingUp, TrendingDown, FileText, Calendar,
  Download, Search, Filter, ChevronDown, ChevronUp, Clock,
  Receipt, CheckCircle, AlertTriangle, Wallet, Smartphone,
  CreditCard, Building2, UtensilsCrossed, RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';

export default function ReportsPage() {
  const [pnl, setPnl] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState({ start: monthStart(), end: today() });
  const [tab, setTab] = useState<'pnl' | 'daily' | 'sales'>('sales');
  const [dailyDate, setDailyDate] = useState(today());
  const [daily, setDaily] = useState<any>(null);
  const [inventoryReport, setInventoryReport] = useState<any>(null);

  // Detailed Sales Report states
  const [salesRange, setSalesRange] = useState({ start: today(), end: today() });
  const [salesPaymentFilter, setSalesPaymentFilter] = useState('all');
  const [salesStatusFilter, setSalesStatusFilter] = useState('all');
  const [salesSearch, setSalesSearch] = useState('');
  const [salesData, setSalesData] = useState<any>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const loadPnl = async () => {
    setLoading(true);
    const r = await reportsApi.pnl(range.start, range.end);
    setPnl(r.data);
    const ir = await reportsApi.inventoryPurchases(range.start, range.end);
    setInventoryReport(ir.data);
    setLoading(false);
  };

  const loadDaily = async () => {
    setLoading(true);
    const r = await reportsApi.daily(dailyDate);
    setDaily(r.data);
    setLoading(false);
  };

  const loadSales = async () => {
    setSalesLoading(true);
    try {
      const res = await reportsApi.sales({
        startDate: salesRange.start,
        endDate: salesRange.end,
        paymentMethod: salesPaymentFilter !== 'all' ? salesPaymentFilter : undefined,
        status: salesStatusFilter !== 'all' ? salesStatusFilter : undefined,
        search: salesSearch.trim() || undefined,
        limit: 300,
      });
      setSalesData(res.data);
    } catch (err) {
      console.error('Failed to load detailed sales report:', err);
    } finally {
      setSalesLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'pnl') loadPnl();
    else if (tab === 'daily') loadDaily();
    else if (tab === 'sales') loadSales();
  }, [tab]);

  const exportSalesCsv = () => {
    if (!salesData || !salesData.orders || salesData.orders.length === 0) {
      alert('No sales data available to export');
      return;
    }

    const headers = [
      'Date',
      'Time',
      'Order / Bill No',
      'Table',
      'Status',
      'Staff / Biller',
      'KOT Rounds',
      'Items Count',
      'Items Detail',
      'Subtotal (₹)',
      'Tax Amount (₹)',
      'Discount Type',
      'Discount Value',
      'Discount Amount (₹)',
      'Grand Total (₹)',
      'Settled Amount (₹)',
      'Waived Off (₹)',
      'Payment Mode'
    ];

    const rows = salesData.orders.map((o: any) => {
      const d = new Date(o.createdAt);
      const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const itemsDetail = (o.items || [])
        .map((it: any) => `${it.quantity}x ${it.name}${it.status === 'cancelled' ? ' [CANCELLED]' : ''}${it.notes ? ` (${it.notes})` : ''}`)
        .join('; ');
      const settled = o.settledAmount !== null && o.settledAmount !== undefined ? o.settledAmount : o.total;

      return [
        `"${dateStr}"`,
        `"${timeStr}"`,
        `"${o.orderNumber || o._id.slice(-6)}"`,
        `"${o.table?.tableNumber || 'Takeaway'}"`,
        `"${o.status}"`,
        `"${o.createdBy?.name || 'Staff'}"`,
        `"${o.kotCount || 1}"`,
        `"${o.items?.length || 0}"`,
        `"${itemsDetail.replace(/"/g, '""')}"`,
        (o.subtotal || 0).toFixed(2),
        (o.taxAmount || 0).toFixed(2),
        `"${o.discountType || 'flat'}"`,
        o.discountValue || 0,
        (o.discount || 0).toFixed(2),
        (o.total || 0).toFixed(2),
        settled.toFixed(2),
        (o.waivedAmount || 0).toFixed(2),
        `"${(o.paymentMethod || 'other').toUpperCase()}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `peyala_sales_report_${salesRange.start}_to_${salesRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports & Sales</h1>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setTab('sales')} className={tab === 'sales' ? 'btn-primary' : 'btn-secondary'}>Detailed Sales Report</button>
            <button onClick={() => setTab('daily')} className={tab === 'daily' ? 'btn-primary' : 'btn-secondary'}>Daily Report</button>
            <button onClick={() => setTab('pnl')} className={tab === 'pnl' ? 'btn-primary' : 'btn-secondary'}>P&L Statement</button>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

                {/* Inventory Item Reports */}
                <div className="card p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-500" /> Inventory Item Reports</h3>
                  {inventoryReport?.items?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800">
                            <th className="table-th">Item</th>
                            <th className="table-th">Category</th>
                            <th className="table-th">Quantity Bought</th>
                            <th className="table-th">Amount Spent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {inventoryReport.items.map((it: any) => (
                            <tr key={it.itemId}>
                              <td className="table-td font-medium">{it.name}</td>
                              <td className="table-td text-gray-500">{it.category || '-'}</td>
                              <td className="table-td">{it.totalQuantity} {it.unit}</td>
                              <td className="table-td font-medium text-red-500">{formatCurrency(it.totalSpent)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 dark:border-gray-700">
                            <td className="table-td font-bold" colSpan={3}>Total</td>
                            <td className="table-td font-bold text-red-500">
                              {formatCurrency(inventoryReport.items.reduce((s: number, it: any) => s + it.totalSpent, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-10">No purchases in this period</p>
                  )}
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

        {tab === 'sales' && (
          <>
            {/* Filter & Date Range Bar */}
            <div className="card p-4 space-y-4">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end justify-between">
                {/* Dates & Presets */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="label text-xs">Start Date</label>
                    <input
                      type="date"
                      className="input py-1.5 text-xs"
                      value={salesRange.start}
                      onChange={(e) => setSalesRange({ ...salesRange, start: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">End Date</label>
                    <input
                      type="date"
                      className="input py-1.5 text-xs"
                      value={salesRange.end}
                      onChange={(e) => setSalesRange({ ...salesRange, end: e.target.value })}
                    />
                  </div>
                  {/* Quick Presets */}
                  <div className="flex gap-1.5 pb-0.5">
                    {[
                      { l: 'Today', s: today(), e: today() },
                      {
                        l: 'Yesterday',
                        s: new Date(Date.now() - 86400000).toISOString().split('T')[0],
                        e: new Date(Date.now() - 86400000).toISOString().split('T')[0],
                      },
                      {
                        l: 'Last 7 Days',
                        s: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
                        e: today(),
                      },
                      { l: 'This Month', s: monthStart(), e: today() },
                    ].map(({ l, s, e }) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setSalesRange({ start: s, end: e })}
                        className="btn-secondary text-[11px] px-2.5 py-1.5"
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export CSV Button */}
                <button
                  type="button"
                  onClick={exportSalesCsv}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 self-end"
                  title="Export filtered sales to CSV"
                >
                  <Download className="w-4 h-4 text-brand-600" />
                  Export CSV
                </button>
              </div>

              {/* Filters row: Payment method, Status, Search, and Apply button */}
              <div className="flex flex-col sm:flex-row gap-3 items-center pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="w-full sm:w-44">
                  <select
                    className="input py-1.5 text-xs"
                    value={salesPaymentFilter}
                    onChange={(e) => setSalesPaymentFilter(e.target.value)}
                  >
                    <option value="all">All Payment Modes</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="other">Other / Bank</option>
                  </select>
                </div>

                <div className="w-full sm:w-40">
                  <select
                    className="input py-1.5 text-xs"
                    value={salesStatusFilter}
                    onChange={(e) => setSalesStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="billed">Billed</option>
                    <option value="open">Open</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="relative flex-1 w-full">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by Bill #, Table #, Staff name, or item..."
                    className="input pl-8 py-1.5 text-xs w-full"
                    value={salesSearch}
                    onChange={(e) => setSalesSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadSales()}
                  />
                </div>

                <button
                  onClick={loadSales}
                  disabled={salesLoading}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 whitespace-nowrap w-full sm:w-auto"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', salesLoading && 'animate-spin')} />
                  {salesLoading ? 'Filtering...' : 'Apply Filters'}
                </button>
              </div>
            </div>

            {salesLoading ? (
              <div className="text-center py-20 text-gray-400">Loading detailed sales data...</div>
            ) : salesData && (
              <div className="space-y-6">
                {/* Financial Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="card p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 border-green-200 dark:border-green-900/40">
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Net Settled</p>
                    <p className="text-xl font-black text-green-600 mt-1">
                      {formatCurrency(salesData.summary?.totalSettled || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Total collected</p>
                  </div>

                  <div className="card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase">Gross Sales</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                      {formatCurrency(salesData.summary?.totalGrossSales || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Subtotal before disc</p>
                  </div>

                  <div className="card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase">Tax / GST</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                      {formatCurrency(salesData.summary?.totalTax || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">GST collected</p>
                  </div>

                  <div className="card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase">Discounts</p>
                    <p className="text-xl font-bold text-red-500 mt-1">
                      −{formatCurrency(salesData.summary?.totalDiscount || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Flat & % applied</p>
                  </div>

                  <div
                    className={cn(
                      'card p-4',
                      (salesData.summary?.totalWaived || 0) > 0
                        ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900/50'
                        : ''
                    )}
                  >
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase">Waived Off</p>
                    <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                      {formatCurrency(salesData.summary?.totalWaived || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Discrepancy / Rounding</p>
                  </div>

                  <div className="card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase">Orders Count</p>
                    <p className="text-xl font-bold text-brand-600 mt-1">{salesData.summary?.totalOrders || 0}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">In selected range</p>
                  </div>
                </div>

                {/* Payment Breakdown Bar */}
                <div className="card p-4 bg-gray-50 dark:bg-gray-800/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      Collections by Payment Mode:
                    </span>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Cash: {formatCurrency(salesData.summary?.paymentBreakdown?.cash || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-purple-600">
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>UPI: {formatCurrency(salesData.summary?.paymentBreakdown?.upi || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-blue-600">
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Card: {formatCurrency(salesData.summary?.paymentBreakdown?.card || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Other: {formatCurrency(salesData.summary?.paymentBreakdown?.other || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Orders Table */}
                <div className="card overflow-hidden">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-brand-600" />
                      Individual Order Records ({salesData.orders?.length || 0})
                    </h2>
                    <span className="text-xs text-gray-400">Click any row to expand full order timeline and KOT details</span>
                  </div>

                  {salesData.orders?.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 text-sm">
                      No sales or orders found for the selected criteria.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-700">
                            <th className="py-3 px-3 text-left">Time & Date</th>
                            <th className="py-3 px-3 text-left">Bill / Order #</th>
                            <th className="py-3 px-3 text-left">Table</th>
                            <th className="py-3 px-3 text-center">KOTs</th>
                            <th className="py-3 px-3 text-left">Items Ordered</th>
                            <th className="py-3 px-3 text-right">Bill Total</th>
                            <th className="py-3 px-3 text-right">Waived</th>
                            <th className="py-3 px-3 text-right">Settled Amount</th>
                            <th className="py-3 px-3 text-center">Payment Mode</th>
                            <th className="py-3 px-3 text-center">Status</th>
                            <th className="py-3 px-3 text-center">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {salesData.orders.map((o: any) => {
                            const d = new Date(o.createdAt);
                            const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                            const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                            const isExpanded = expandedOrderId === o._id;
                            const settled = o.settledAmount !== null && o.settledAmount !== undefined ? o.settledAmount : o.total;
                            const waived = o.waivedAmount || 0;
                            const cancelledItemsCount = (o.items || []).filter((i: any) => i.status === 'cancelled').length;

                            return (
                              <React.Fragment key={o._id}>
                                <tr
                                  onClick={() => setExpandedOrderId(isExpanded ? null : o._id)}
                                  className={cn(
                                    'cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                    isExpanded && 'bg-orange-50/40 dark:bg-brand-950/20'
                                  )}
                                >
                                  {/* Timestamp */}
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="font-semibold text-gray-900 dark:text-gray-100">{timeStr}</div>
                                    <div className="text-[10px] text-gray-400">{dateStr}</div>
                                  </td>

                                  {/* Bill / Order # */}
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <span className="font-bold text-brand-600 font-mono">
                                      #{o.orderNumber || o._id.slice(-6)}
                                    </span>
                                    <div className="text-[10px] text-gray-400">By {o.createdBy?.name || 'Staff'}</div>
                                  </td>

                                  {/* Table */}
                                  <td className="py-3 px-3 whitespace-nowrap font-medium text-gray-700 dark:text-gray-300">
                                    {o.table?.tableNumber ? `Table ${o.table.tableNumber}` : 'Takeaway'}
                                  </td>

                                  {/* KOT Rounds */}
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                      {o.kotCount || 1} {o.kotCount === 1 ? 'Round' : 'Rounds'}
                                    </span>
                                  </td>

                                  {/* Items Ordered preview */}
                                  <td className="py-3 px-3 max-w-xs">
                                    <div
                                      className="truncate text-gray-700 dark:text-gray-300 font-medium"
                                      title={o.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                                    >
                                      {o.items?.slice(0, 2).map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                                      {(o.items?.length || 0) > 2 && ` +${o.items.length - 2} more`}
                                    </div>
                                    {cancelledItemsCount > 0 && (
                                      <div className="text-[10px] text-red-500 font-semibold">
                                        ⚠️ {cancelledItemsCount} cancelled item{cancelledItemsCount > 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </td>

                                  {/* Bill Total */}
                                  <td className="py-3 px-3 text-right whitespace-nowrap font-medium text-gray-600 dark:text-gray-300">
                                    {formatCurrency(o.total)}
                                    {o.discount > 0 && (
                                      <div className="text-[10px] text-green-600">
                                        Disc: −{formatCurrency(o.discount)}
                                      </div>
                                    )}
                                  </td>

                                  {/* Waived Amount */}
                                  <td className="py-3 px-3 text-right whitespace-nowrap font-semibold">
                                    {waived > 0 ? (
                                      <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                        {formatCurrency(waived)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>

                                  {/* Settled Amount */}
                                  <td className="py-3 px-3 text-right whitespace-nowrap font-black text-green-600 text-sm">
                                    {formatCurrency(settled)}
                                  </td>

                                  {/* Payment Mode */}
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    {(() => {
                                      const m = (o.paymentMethod || 'other').toLowerCase();
                                      let color = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
                                      let Icon = Building2;
                                      if (m === 'cash') {
                                        color = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
                                        Icon = Wallet;
                                      } else if (m === 'upi') {
                                        color = 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800';
                                        Icon = Smartphone;
                                      } else if (m === 'card') {
                                        color = 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800';
                                        Icon = CreditCard;
                                      }
                                      return (
                                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase', color)}>
                                          <Icon className="w-3 h-3" />
                                          {m}
                                        </span>
                                      );
                                    })()}
                                  </td>

                                  {/* Status */}
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    {(() => {
                                      if (o.status === 'paid') {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                                            <CheckCircle className="w-3 h-3" /> Paid
                                          </span>
                                        );
                                      } else if (o.status === 'billed') {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                            <Receipt className="w-3 h-3" /> Billed
                                          </span>
                                        );
                                      } else if (o.status === 'cancelled') {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                                            <AlertTriangle className="w-3 h-3" /> Cancelled
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                                          Open
                                        </span>
                                      );
                                    })()}
                                  </td>

                                  {/* Expand Chevron */}
                                  <td className="py-3 px-3 text-center">
                                    <button
                                      type="button"
                                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                    >
                                      {isExpanded ? <ChevronUp className="w-4 h-4 text-brand-600" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded Order Details Panel */}
                                {isExpanded && (
                                  <tr className="bg-gray-50/70 dark:bg-gray-800/40">
                                    <td colSpan={11} className="p-4">
                                      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 space-y-4">
                                        {/* Header Row of Details */}
                                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
                                          <div className="flex items-center gap-3">
                                            <span className="font-bold text-sm text-gray-900 dark:text-white font-mono">
                                              Order #{o.orderNumber || o._id}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              Table: <strong>{o.table?.tableNumber || 'Takeaway'}</strong>
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              Staff: <strong>{o.createdBy?.name || 'Staff'}</strong>
                                            </span>
                                          </div>
                                          <div className="text-xs text-gray-500 flex items-center gap-4">
                                            <span>
                                              Created: <strong>{new Date(o.createdAt).toLocaleString('en-IN')}</strong>
                                            </span>
                                            {o.updatedAt && o.updatedAt !== o.createdAt && (
                                              <span>
                                                Last Change: <strong>{new Date(o.updatedAt).toLocaleTimeString('en-IN')}</strong>
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* KOT Rounds & Items Table */}
                                        <div>
                                          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                            <UtensilsCrossed className="w-3.5 h-3.5 text-brand-600" />
                                            Order Items & KOT Log ({o.items?.length || 0} items across {o.kotCount || 1} round{o.kotCount > 1 ? 's' : ''})
                                          </h4>
                                          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                                                  <th className="py-2 px-3 text-left">Item Name</th>
                                                  <th className="py-2 px-3 text-center">Qty</th>
                                                  <th className="py-2 px-3 text-right">Price</th>
                                                  <th className="py-2 px-3 text-right">Line Total</th>
                                                  <th className="py-2 px-3 text-left">Instructions / Notes</th>
                                                  <th className="py-2 px-3 text-center">Status / Change</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {o.items?.map((it: any, idx: number) => {
                                                  const isCancelled = it.status === 'cancelled';
                                                  return (
                                                    <tr key={idx} className={isCancelled ? 'bg-red-50/50 dark:bg-red-950/20 text-gray-400' : ''}>
                                                      <td className="py-2 px-3 font-semibold">
                                                        <span className={isCancelled ? 'line-through text-red-500' : 'text-gray-900 dark:text-white'}>
                                                          {it.name}
                                                        </span>
                                                      </td>
                                                      <td className="py-2 px-3 text-center font-bold">
                                                        {it.quantity}
                                                      </td>
                                                      <td className="py-2 px-3 text-right">
                                                        {formatCurrency(it.price)}
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-medium">
                                                        {formatCurrency(it.price * it.quantity)}
                                                      </td>
                                                      <td className="py-2 px-3 text-gray-500 italic">
                                                        {it.notes || '—'}
                                                      </td>
                                                      <td className="py-2 px-3 text-center">
                                                        {isCancelled ? (
                                                          <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded">
                                                            Cancelled {it.cancellationReason ? `(${it.cancellationReason})` : ''}
                                                          </span>
                                                        ) : (
                                                          <span className="text-[10px] font-semibold text-green-600 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded">
                                                            Active
                                                          </span>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>

                                        {/* Financial Reconciliation Box */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                                          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                                            <div className="flex justify-between">
                                              <span>Subtotal:</span>
                                              <span className="font-semibold">{formatCurrency(o.subtotal || 0)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span>Tax / GST:</span>
                                              <span className="font-semibold">{formatCurrency(o.taxAmount || 0)}</span>
                                            </div>
                                            {o.discount > 0 && (
                                              <div className="flex justify-between text-green-600 font-semibold">
                                                <span>
                                                  Discount ({o.discountType === 'percentage' ? `${o.discountValue}%` : 'Flat'}):
                                                </span>
                                                <span>−{formatCurrency(o.discount)}</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
                                              <span>Grand Total:</span>
                                              <span>{formatCurrency(o.total || 0)}</span>
                                            </div>
                                          </div>

                                          <div className="space-y-1 text-xs border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-700 pt-2 sm:pt-0 sm:pl-4">
                                            <div className="flex justify-between font-semibold text-gray-700 dark:text-gray-300">
                                              <span>Payment Method:</span>
                                              <span className="uppercase text-brand-600">{o.paymentMethod || 'OTHER'}</span>
                                            </div>
                                            <div className="flex justify-between text-green-600 font-bold text-sm">
                                              <span>Settled Amount Received:</span>
                                              <span>{formatCurrency(settled)}</span>
                                            </div>
                                            {waived > 0 && (
                                              <div className="flex justify-between text-amber-600 font-bold">
                                                <span>Waived Off / Discrepancy:</span>
                                                <span>{formatCurrency(waived)}</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between text-gray-500 text-[11px] pt-1">
                                              <span>KOT Reference:</span>
                                              <span>{`KOT-${o.orderNumber ? o.orderNumber : o._id.slice(-4)}-1 to -${o.kotCount || 1}`}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
