'use client';

import { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { wastageApi } from '@/lib/api';
import { menuApi } from '@/lib/pos-api';
import { formatCurrency, formatDate, today, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  Trash2,
  Plus,
  Pencil,
  AlertTriangle,
  Calendar,
  Search,
  RefreshCw,
  TrendingDown,
  Layers,
  Sparkles,
  ArrowUpDown,
  FileSpreadsheet,
  ShieldCheck,
} from 'lucide-react';

const PNL_CACHE_KEY = 'peyala_reports_pnl_cache_v2';
const WASTAGE_CACHE_KEY = 'peyala_wastage_cache_v1';

const COMMON_UNITS = ['kg', 'g', 'pcs', 'plates', 'portions', 'litres', 'ml', 'box', 'packet', 'units'];
const COMMON_REASONS = [
  'Spoiled / Rotten',
  'Expired',
  'Burnt / Cooking Error',
  'Dropped / Spilled',
  'Customer Return / Complaint',
  'Excess Prep / Leftover',
  'Packaging Damaged',
  'Other',
];

export default function WastagePage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodSummary, setPeriodSummary] = useState({ totalValue: 0, totalQty: 0, count: 0 });

  // Filters
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState<'today' | '7d' | 'month' | 'last_month' | 'all' | 'custom'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Zero wastage confirmation modal states
  const [zeroModalOpen, setZeroModalOpen] = useState(false);
  const [zeroConfirmed, setZeroConfirmed] = useState(false);
  const [zeroNotes, setZeroNotes] = useState('');
  const [savingZero, setSavingZero] = useState(false);

  // Autocomplete suggestions
  const [itemSuggestions, setItemSuggestions] = useState<string[]>([]);

  // Form State (featuring the 3 core fields)
  const initialForm = () => ({
    itemName: '',
    quantity: '',
    approxValue: '',
    unit: 'units',
    date: today(),
    reason: '',
  });
  const [form, setForm] = useState(initialForm());

  // Date Presets calculation
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();

    if (datePreset === 'today') {
      const t = today();
      setStartDate(t);
      setEndDate(t);
    } else if (datePreset === '7d') {
      const past = new Date(now.getTime() - 6 * 86400000);
      setStartDate(formatDateForInput(past));
      setEndDate(today());
    } else if (datePreset === 'month') {
      const start = new Date(y, m, 1);
      setStartDate(formatDateForInput(start));
      setEndDate(today());
    } else if (datePreset === 'last_month') {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      setStartDate(formatDateForInput(start));
      setEndDate(formatDateForInput(end));
    } else if (datePreset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  }, [datePreset]);

  function formatDateForInput(d: Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Load menu item names for autocomplete suggestions
  useEffect(() => {
    menuApi
      .listItems()
      .then((res: any) => {
        if (Array.isArray(res.data)) {
          const names = res.data.map((i: any) => i.name).filter(Boolean);
          setItemSuggestions(Array.from(new Set(names)));
        }
      })
      .catch(() => {});
  }, []);

  // Fetch entries
  const fetchEntries = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const params: any = { page, limit: 25 };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (search) params.search = search;

      const res = await wastageApi.list(params);
      setEntries(res.data.wastage || []);
      setTotal(res.data.total || 0);
      setPeriodSummary(res.data.summary || { totalValue: 0, totalQty: 0, count: 0 });
    } catch (err: any) {
      console.error('Failed to load wastage records:', err);
      toast.error(err.response?.data?.message || 'Failed to load wastage records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [page, startDate, endDate, search]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingEntry(null);
    setForm(initialForm());
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: any) => {
    setEditingEntry(item);
    setForm({
      itemName: item.itemName || '',
      quantity: String(item.quantity || ''),
      approxValue: String(item.approxValue || ''),
      unit: item.unit || 'units',
      date: item.date ? formatDateForInput(new Date(item.date)) : today(),
      reason: item.reason || '',
    });
    setModalOpen(true);
  };

  // Submit Create / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate 3 core fields
    if (!form.itemName.trim()) {
      toast.error('Please enter the name of the item');
      return;
    }

    const qty = Number(form.quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity greater than 0');
      return;
    }

    const val = Number(form.approxValue);
    if (Number.isNaN(val) || val < 0) {
      toast.error('Please enter a valid approximate value in ₹');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        itemName: form.itemName.trim(),
        quantity: qty,
        approxValue: val,
        unit: form.unit.trim() || 'units',
        date: form.date,
        reason: form.reason.trim(),
      };

      if (editingEntry) {
        await wastageApi.update(editingEntry._id, payload);
        toast.success(`Updated wastage for "${form.itemName}"`);
      } else {
        await wastageApi.create(payload);
        toast.success(`Recorded wastage for "${form.itemName}" (₹${val})`);
      }

      // Invalidate PNL report cache so P&L reflects updated wastage immediately
      try {
        localStorage.removeItem(PNL_CACHE_KEY);
      } catch {}

      setModalOpen(false);
      fetchEntries(true);
      window.dispatchEvent(new CustomEvent('peyala_wastage_updated'));
    } catch (err: any) {
      console.error('Error saving wastage:', err);
      toast.error(err.response?.data?.message || 'Failed to save wastage entry');
    } finally {
      setSaving(false);
    }
  };

  // Delete entry
  const handleDelete = async (id: string) => {
    try {
      await wastageApi.delete(id);
      toast.success('Wastage entry removed');
      try {
        localStorage.removeItem(PNL_CACHE_KEY);
      } catch {}
      setDeleteConfirmId(null);
      fetchEntries(true);
      window.dispatchEvent(new CustomEvent('peyala_wastage_updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete wastage entry');
    }
  };

  // Sign Zero Wastage
  const handleSignZeroWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zeroConfirmed) {
      toast.error('Please check the verification confirmation box');
      return;
    }

    setSavingZero(true);
    try {
      await wastageApi.signZeroWastage({
        notes: zeroNotes.trim() || 'Verified zero food or material wastage today',
      });
      toast.success('Zero wastage verified and signed for today!');
      try {
        localStorage.removeItem(PNL_CACHE_KEY);
      } catch {}
      setZeroModalOpen(false);
      setZeroConfirmed(false);
      setZeroNotes('');
      fetchEntries(true);
      window.dispatchEvent(new CustomEvent('peyala_wastage_updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to sign zero wastage');
    } finally {
      setSavingZero(false);
    }
  };

  // Days in range for daily average
  const daysInRange = useMemo(() => {
    if (!startDate || !endDate) return 30;
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    const diff = Math.max(1, Math.round((e - s) / 86400000) + 1);
    return diff;
  }, [startDate, endDate]);

  const dailyAvg = periodSummary.totalValue / daysInRange;

  return (
    <AppLayout>
      <div className="space-y-6 pb-36 md:pb-24">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
              <span className="p-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </span>
              Wastage Entry
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Record and audit spoiled, expired, or discarded food and raw materials. Shows automatically in P&L.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchEntries(true)}
              disabled={refreshing}
              className="btn-secondary text-sm flex items-center gap-1.5 py-2 px-3"
              title="Refresh entries"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => {
                setZeroConfirmed(false);
                setZeroNotes('');
                setZeroModalOpen(true);
              }}
              className="btn-secondary text-sm flex items-center gap-1.5 py-2 px-3 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              title="Sign zero food wastage for today"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Sign Zero Wastage</span>
            </button>
            <button
              onClick={handleOpenCreate}
              className="btn-primary text-sm flex items-center gap-1.5 py-2 px-4 shadow-lg shadow-brand-500/20"
            >
              <Plus className="w-4 h-4" />
              Record Wastage
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="card p-4 sm:p-5 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/20 dark:to-orange-950/10 border-rose-100 dark:border-rose-900/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Total Wastage Value
              </span>
              <TrendingDown className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-rose-700 dark:text-rose-300 mt-1">
              {formatCurrency(periodSummary.totalValue)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              For selected period ({datePreset})
            </p>
          </div>

          <div className="card p-4 sm:p-5 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/10 border-amber-100 dark:border-amber-900/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Total Quantity Lost
              </span>
              <Layers className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-300 mt-1">
              {Number(periodSummary.totalQty.toFixed(2))} <span className="text-base font-semibold">units</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Across {periodSummary.count} entries
            </p>
          </div>

          <div className="card p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/10 border-blue-100 dark:border-blue-900/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Recorded Incidents
              </span>
              <FileSpreadsheet className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-300 mt-1">
              {total}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Logged entries in period
            </p>
          </div>

          <div className="card p-4 sm:p-5 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-gray-900/40 dark:to-gray-800/30 border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                Daily Average Loss
              </span>
              <Calendar className="w-4 h-4 text-gray-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-gray-800 dark:text-gray-200 mt-1">
              {formatCurrency(dailyAvg)}
              <span className="text-xs font-normal text-gray-500">/day</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Based on {daysInRange} days span
            </p>
          </div>
        </div>

        {/* Filter & Toolbar */}
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'today', label: 'Today' },
                { id: '7d', label: 'Last 7D' },
                { id: 'month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'all', label: 'All Records' },
                { id: 'custom', label: 'Custom' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setDatePreset(p.id as any)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                    datePreset === p.id
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Date Inputs */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input py-1 px-2 text-xs"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input py-1 px-2 text-xs"
                />
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by item name or reason (e.g. Milk, Chicken, Expired)..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="input pl-9 text-sm"
            />
          </div>
        </div>

        {/* Wastage Table & List */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-500" />
              Loading wastage records...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-500 mx-auto flex items-center justify-center mb-3">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white">No Wastage Recorded</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1">
                {search || startDate || endDate
                  ? 'No entries match your search or date filters.'
                  : 'No wastage has been recorded for this period yet.'}
              </p>
              <button onClick={handleOpenCreate} className="btn-primary text-xs mt-4 py-2 px-4">
                <Plus className="w-4 h-4 inline mr-1" />
                Record First Entry
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800/60 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 dark:border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Name of Item</th>
                      <th className="py-3 px-4">Quantity</th>
                      <th className="py-3 px-4">Approx. Value</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                      <th className="py-3 px-4">Recorded By</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {entries.map((entry) => (
                      <tr key={entry._id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatDate(entry.date)}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white">
                          {entry.isZeroWastage ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              Zero Wastage Verified
                            </span>
                          ) : (
                            entry.itemName
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-gray-800 dark:text-gray-200">
                          {entry.isZeroWastage ? (
                            <span className="text-gray-400 font-normal">0 items</span>
                          ) : (
                            <>{entry.quantity} <span className="text-xs font-normal text-gray-500">{entry.unit || 'units'}</span></>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold">
                          {entry.isZeroWastage ? (
                            <span className="text-emerald-600 font-bold">₹0.00</span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400">{formatCurrency(entry.approxValue)}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-gray-500 text-xs">
                          {entry.reason ? (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              {entry.reason}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-gray-500">
                          {entry.createdBy?.name || 'Staff'}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {!entry.isZeroWastage && (
                              <button
                                onClick={() => handleOpenEdit(entry)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                                title="Edit entry"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteConfirmId(entry._id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                              title="Delete entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map((entry) => (
                  <div key={entry._id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        {entry.isZeroWastage ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Zero Wastage Verified
                          </span>
                        ) : (
                          <h4 className="font-bold text-base text-gray-900 dark:text-white">
                            {entry.itemName}
                          </h4>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(entry.date)} · by {entry.createdBy?.name || 'Staff'}
                        </p>
                      </div>
                      <span className="text-base font-black">
                        {entry.isZeroWastage ? (
                          <span className="text-emerald-600">₹0.00</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400">{formatCurrency(entry.approxValue)}</span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="flex items-center gap-2">
                        {!entry.isZeroWastage && (
                          <span className="font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                            Qty: {entry.quantity} {entry.unit}
                          </span>
                        )}
                        {entry.reason && (
                          <span className="text-gray-500 bg-gray-50 dark:bg-gray-900 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-800">
                            {entry.reason}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!entry.isZeroWastage && (
                          <button
                            onClick={() => handleOpenEdit(entry)}
                            className="p-1.5 text-gray-500 hover:text-brand-600"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteConfirmId(entry._id)}
                          className="p-1.5 text-gray-500 hover:text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {total > 25 && (
                <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Showing {entries.length} of {total} records
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="px-2 font-bold">{page}</span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page * 25 >= total}
                      className="btn-secondary py-1 px-2.5 text-xs disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Info Box explaining P&L reflection */}
        <div className="card p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 text-amber-900 dark:text-amber-200 text-xs leading-relaxed flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">P&L Integration Note: </span>
            Total recorded wastage for any selected date range is automatically aggregated and presented on the{' '}
            <a href="/reports" className="underline font-bold hover:text-amber-700">
              Profit & Loss (P&L) Statement
            </a>{' '}
            as an informational operational loss metric.
          </div>
        </div>

        {/* Add / Edit Wastage Modal */}
        {modalOpen && (
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title={editingEntry ? 'Edit Wastage Record' : 'Record Food / Material Wastage'}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <datalist id="item-suggestions">
                {itemSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              {/* Core Field 1: Name of the Item */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                  1. Name of the Item <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="item-suggestions"
                  placeholder="e.g. Chicken Steamed Momo, Basmati Rice, Milk"
                  value={form.itemName}
                  onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                  className="input w-full text-sm font-medium"
                  autoFocus
                />
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Type any raw ingredient or finished dish name.
                </p>
              </div>

              {/* Core Field 2: Quantity & Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                    2. Quantity (Qty) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 5 or 2.5"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="input w-full text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                    Unit of Measure
                  </label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="input w-full text-sm"
                  >
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Core Field 3: Approximate Value (₹) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                  3. Approximate Value (₹) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="e.g. 450"
                    value={form.approxValue}
                    onChange={(e) => setForm({ ...form, approxValue: e.target.value })}
                    className="input w-full pl-8 text-sm font-bold text-gray-900 dark:text-white"
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Estimated cost or purchase value of the discarded material.
                </p>
              </div>

              {/* Date of Wastage */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="input w-full text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                    Reason / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    list="common-reasons"
                    placeholder="e.g. Spoiled, Burnt, Expired"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    className="input w-full text-sm"
                  />
                  <datalist id="common-reasons">
                    {COMMON_REASONS.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-secondary text-sm py-2 px-4"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary text-sm py-2 px-5 flex items-center gap-1.5"
                >
                  {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {saving
                    ? 'Saving...'
                    : editingEntry
                    ? 'Update Wastage'
                    : 'Save Wastage Entry'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <Modal
            open={!!deleteConfirmId}
            onClose={() => setDeleteConfirmId(null)}
            title="Delete Wastage Entry"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Are you sure you want to permanently delete this wastage record? This action will adjust the period total on the P&L report.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="btn-secondary text-sm py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="btn-danger text-sm py-2 px-4 flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Permanently
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Double Confirmation: Sign Zero Wastage Modal */}
        {zeroModalOpen && (
          <Modal
            open={zeroModalOpen}
            onClose={() => setZeroModalOpen(false)}
            title="Double Confirmation: Sign Zero Wastage"
          >
            <form onSubmit={handleSignZeroWastage} className="space-y-4">
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
                  <span className="font-bold">Official Audit Verification: </span>
                  You are verifying that the restaurant, kitchen prep stations, bar, and storage experienced{' '}
                  <strong className="font-black text-rose-700 dark:text-rose-400">ZERO wastage or discarded food</strong> for today.
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    required
                    checked={zeroConfirmed}
                    onChange={(e) => setZeroConfirmed(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-snug">
                    I confirm and certify that all stations have been verified and there was absolutely zero discarded food or material wastage today.
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                  Optional Sign-off Remark
                </label>
                <input
                  type="text"
                  placeholder="e.g. All batch prep utilized, full stock accounted"
                  value={zeroNotes}
                  onChange={(e) => setZeroNotes(e.target.value)}
                  className="input w-full text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setZeroModalOpen(false)}
                  className="btn-secondary text-sm py-2 px-4"
                  disabled={savingZero}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!zeroConfirmed || savingZero}
                  className="btn-danger text-sm py-2 px-5 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingZero ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  {savingZero ? 'Signing...' : 'Yes, Confirm & Sign Zero Wastage'}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </AppLayout>
  );
}
