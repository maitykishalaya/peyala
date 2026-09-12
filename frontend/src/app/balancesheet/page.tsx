// ─────────────────────────────────────────────────────────────────
// Balance Sheet Page
//
// Layout:
//   ┌─────────────┬──────────────────┬─────────────────┐
//   │   ASSETS    │   LIABILITIES    │     EQUITY      │
//   │  (accounts) │ GST + Dues +     │ Assets - Liab.  │
//   │  editable   │ Custom (editable)│  auto-calc      │
//   └─────────────┴──────────────────┴─────────────────┘
//
// GST section:
//   - Shows accumulated GST from outlet sales (auto-calculated)
//   - Editable — user can manually correct the amount
//   - "Pay GST" button resets it to zero and logs payment
//
// Updated daily — every time a sales entry is saved,
// 4.77% of outlet sales is automatically added to GST liability.
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { balanceSheetApi, accountsApi } from '@/lib/api';
import { formatCurrency, formatDate, today, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  Scale, Plus, Pencil, Trash2, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, History, IndianRupee
} from 'lucide-react';

const CACHE_KEY = 'peyala_balancesheet_cache_v1';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data: { bs: any; allAccounts: any[] }) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // ignore
  }
}

export default function BalanceSheetPage() {
  // ── Data state ──────────────────────────────────────────────────
  const [bs, setBs] = useState<any>(null);                // full balance sheet from API
  const [allAccounts, setAllAccounts] = useState<any[]>([]); // all accounts for picker
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── UI state ────────────────────────────────────────────────────
  const [showGstLog, setShowGstLog] = useState(false);    // toggle GST log panel
  const [editingGst, setEditingGst] = useState(false);     // editing GST amount inline
  const [gstEditValue, setGstEditValue] = useState('');    // temp value while editing

  // ── Modal state ─────────────────────────────────────────────────
  const [modal, setModal] = useState<'accounts' | 'addLiability' | 'payGst' | 'editLiability' | null>(null);
  const [editingLiability, setEditingLiability] = useState<any>(null); // which custom liability is being edited

  // ── Custom liability form ───────────────────────────────────────
  const [liabilityForm, setLiabilityForm] = useState({ label: '', amount: 0, notes: '' });

  // ── GST payment form ────────────────────────────────────────────
  const [gstPayForm, setGstPayForm] = useState({ amount: 0, paidFrom: '', date: today(), notes: '' });

  // ── Load balance sheet and all accounts ─────────────────────────
  const load = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [bsRes, accRes] = await Promise.all([
        balanceSheetApi.get(),
        accountsApi.list(),
      ]);
      setBs(bsRes.data);
      setAllAccounts(accRes.data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      writeCache({ bs: bsRes.data, allAccounts: accRes.data });
    } catch (err) {
      console.error('Failed to load balance sheet:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const cached = readCache();
    if (cached?.bs) {
      setBs(cached.bs);
      setAllAccounts(cached.allAccounts || []);
      if (cached.savedAt) {
        setLastUpdated(new Date(cached.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      setLoading(false);
      return;
    }
    load();
  }, []);

  // ── Save balance sheet config changes ───────────────────────────
  const save = async (updates: any) => {
    setSaving(true);
    try {
      await balanceSheetApi.update(updates);
      await load(); // reload to get fresh calculated totals
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update balance sheet');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle an account in/out of the Assets section ──────────────
  // Toggle an account in/out of Assets — always compare as strings
  const toggleAssetAccount = async (accountId: string) => {
    if (!bs) return;
    try {
      // Convert all stored IDs to strings for reliable comparison
      const current: string[] = (bs.assetAccountIds || []).map((id: any) => String(id));
      const updated = current.includes(accountId)
        ? current.filter((id: string) => id !== accountId)
        : [...current, accountId];
      await save({ assetAccountIds: updated });
      toast.success('Asset accounts updated');
      setModal(null);
    } catch {}
  };

  // ── Edit GST amount inline ──────────────────────────────────────
  const startEditGst = () => {
    setGstEditValue(String(bs?.liabilities?.gst || 0));
    setEditingGst(true);
  };

  const saveGstEdit = async () => {
    try {
      await save({ gstLiability: parseFloat(gstEditValue) || 0 });
      toast.success('GST liability updated');
      setEditingGst(false);
    } catch {}
  };

  // ── Add or update a custom liability ───────────────────────────
  const saveLiability = async () => {
    if (!liabilityForm.label.trim()) {
      toast.error('Liability label is required');
      return;
    }
    if (!liabilityForm.amount || liabilityForm.amount <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }

    const current = bs?.customLiabilities || [];
    let updated;

    if (editingLiability) {
      // Update existing
      updated = current.map((l: any) =>
        l._id === editingLiability._id
          ? { ...l, label: liabilityForm.label.trim(), amount: +liabilityForm.amount, notes: liabilityForm.notes }
          : l
      );
    } else {
      // Add new
      updated = [...current, {
        label: liabilityForm.label.trim(),
        amount: +liabilityForm.amount,
        notes: liabilityForm.notes,
      }];
    }

    try {
      await save({ customLiabilities: updated });
      toast.success(editingLiability ? 'Liability updated' : 'Liability added');
      setModal(null);
      setLiabilityForm({ label: '', amount: 0, notes: '' });
      setEditingLiability(null);
    } catch {}
  };

  // ── Delete a custom liability ───────────────────────────────────
  const deleteLiability = async (id: string) => {
    if (!confirm('Remove this liability?')) return;
    try {
      const updated = bs.customLiabilities.filter((l: any) => l._id !== id);
      await save({ customLiabilities: updated });
      toast.success('Liability removed');
    } catch {}
  };

  // ── Open edit liability modal ───────────────────────────────────
  const openEditLiability = (l: any) => {
    setEditingLiability(l);
    setLiabilityForm({ label: l.label, amount: l.amount, notes: l.notes || '' });
    setModal('editLiability');
  };

  // ── Pay GST ────────────────────────────────────────────────────
  const payGst = async () => {
    if (!gstPayForm.amount || gstPayForm.amount <= 0) {
      toast.error('Please enter an amount greater than 0');
      return;
    }
    setSaving(true);
    try {
      await balanceSheetApi.payGst({
        amount: +gstPayForm.amount,
        paidFrom: gstPayForm.paidFrom || undefined,
        date: gstPayForm.date,
        notes: gstPayForm.notes,
      });
      toast.success('GST payment recorded successfully');
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to record GST payment');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle supplier dues inclusion ──────────────────────────────
  const toggleSupplierDues = async () => {
    try {
      await save({ includeSupplierDues: !bs?.includeSupplierDues });
      toast.success(bs?.includeSupplierDues ? 'Supplier dues excluded' : 'Supplier dues included');
    } catch {}
  };

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  // Shorthand references for cleaner JSX
  const assets = bs?.assets || { accounts: [], total: 0 };
  const liabilities = bs?.liabilities || { gst: 0, supplierDues: { total: 0, breakdown: [] }, custom: [], total: 0 };
  const equity = bs?.equity || { value: 0, isPositive: true };
  const gstLog = bs?.gstLog || [];

  return (
    <AppLayout>
      <div className="space-y-6 w-full">

        {/* ── Page Header ──────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2.5">
              <Scale className="w-6 h-6 text-brand-500" /> Balance Sheet
            </h1>
            <p className="text-sm sm:text-base text-gray-500 mt-1">
              Daily updated · Last updated: {bs?.lastUpdated ? formatDate(bs.lastUpdated) : 'Never'}
              {bs?.lastUpdatedBy && <span className="text-gray-400"> by {bs.lastUpdatedBy}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs sm:text-sm text-gray-400 hidden sm:inline">
                Cached ({lastUpdated})
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(CACHE_KEY);
                load(true);
              }}
              disabled={refreshing}
              className="btn-secondary text-xs sm:text-sm py-2 px-3.5 flex items-center gap-1.5"
              title="Fetch latest data from server"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin text-brand-500")} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── Summary Bar ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {/* Total Assets */}
          <div className="card p-6 sm:p-7 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border-blue-100 dark:border-blue-900/30">
            <p className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Total Assets</p>
            <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-blue-700 dark:text-blue-300">{formatCurrency(assets.total)}</p>
            <p className="text-xs sm:text-sm text-blue-400 mt-1.5">{assets.accounts.length} account{assets.accounts.length !== 1 ? 's' : ''} included</p>
          </div>

          {/* Total Liabilities */}
          <div className="card p-6 sm:p-7 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10 border-red-100 dark:border-red-900/30">
            <p className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Total Liabilities</p>
            <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-red-600 dark:text-red-400">{formatCurrency(liabilities.total)}</p>
            <p className="text-xs sm:text-sm text-red-400 mt-1.5">GST + Dues + Other</p>
          </div>

          {/* Equity */}
          <div className={`card p-6 sm:p-7 bg-gradient-to-br border ${
            equity.isPositive
              ? 'from-green-50 to-emerald-50 dark:from-green-900/10 border-green-100 dark:border-green-900/30'
              : 'from-orange-50 to-red-50 dark:from-orange-900/10 border-orange-100 dark:border-orange-900/30'
          }`}>
            <p className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-1 ${equity.isPositive ? 'text-green-600 dark:text-green-400' : 'text-orange-600'}`}>
              Equity (Net Worth)
            </p>
            <p className={`text-3xl sm:text-4xl lg:text-5xl font-black ${equity.isPositive ? 'text-green-700 dark:text-green-300' : 'text-orange-600'}`}>
              {formatCurrency(equity.value)}
            </p>
            <div className={`flex items-center gap-1.5 mt-1.5 text-xs sm:text-sm ${equity.isPositive ? 'text-green-600 dark:text-green-400' : 'text-orange-600'}`}>
              {equity.isPositive
                ? <><CheckCircle2 className="w-4 h-4" /> Assets exceed liabilities</>
                : <><AlertTriangle className="w-4 h-4" /> Liabilities exceed assets</>
              }
            </div>
          </div>
        </div>

        {/* ── Main Three-Column Layout ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ══ ASSETS Column ══════════════════════════════════════ */}
          <div className="card p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" /> Assets
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setModal('accounts')}
                  className="text-xs sm:text-sm text-brand-600 font-bold flex items-center gap-1 hover:underline"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => save({ showPurchaseGstPaid: !bs?.showPurchaseGstPaid })}
                  className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-medium border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {bs?.showPurchaseGstPaid ? 'Hide' : 'Show'} Purchase GST
                </button>
              </div>
            </div>

            {/* List of included accounts with live balances */}
            {assets.accounts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm sm:text-base text-gray-400 mb-3">No accounts selected</p>
                <button onClick={() => setModal('accounts')} className="btn-secondary text-xs sm:text-sm">
                  <Plus className="w-4 h-4 inline mr-1" /> Add Accounts
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {assets.accounts.map((acc: any) => (
                  <div key={acc._id} className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/80 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      {/* Colour dot from account config */}
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: acc.color || '#6366f1' }} />
                      <span className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">{acc.name}</span>
                    </div>
                    <span className={`text-base sm:text-lg font-bold ${acc.currentBalance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>
                      {formatCurrency(acc.currentBalance)}
                    </span>
                  </div>
                ))}

                {/* Total row */}
                <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 mt-2">
                  <span className="text-base font-bold text-blue-700 dark:text-blue-300">Total Assets</span>
                  <span className="text-lg sm:text-xl font-extrabold text-blue-700 dark:text-blue-300">{formatCurrency(assets.total)}</span>
                </div>

                {bs?.showPurchaseGstPaid && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800 mt-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm sm:text-base font-semibold text-blue-700">Purchase GST Paid</span>
                      <span className="text-base sm:text-lg font-bold text-blue-700">{formatCurrency(bs.purchaseGstPaidTotal || 0)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">GST paid to suppliers from purchase entries.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ LIABILITIES Column ═════════════════════════════════ */}
          <div className="card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-500" /> Liabilities
              </h2>
              {/* Add custom liability */}
              <button
                onClick={() => { setLiabilityForm({ label: '', amount: 0, notes: '' }); setEditingLiability(null); setModal('addLiability'); }}
                className="text-xs sm:text-sm text-brand-600 font-bold flex items-center gap-1 hover:underline"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            <div className="space-y-3.5">

              {/* ── GST Liability ────────────────────────────── */}
              <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-900/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm sm:text-base font-bold text-orange-700 dark:text-orange-400">
                    GST Liability <span className="text-xs font-normal">(4.77% of outlet sales)</span>
                  </span>
                  {/* Action buttons for GST */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={startEditGst}
                      className="p-1.5 text-orange-500 hover:text-orange-700 rounded"
                      title="Edit GST amount"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setShowGstLog(!showGstLog)}
                      className="p-1.5 text-orange-500 hover:text-orange-700 rounded"
                      title="View GST history"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* GST amount — editable inline */}
                {editingGst ? (
                  <div className="flex gap-2 items-center">
                    <span className="text-gray-400 text-sm">₹</span>
                    <input
                      type="number"
                      className="input text-sm py-1 flex-1"
                      value={gstEditValue}
                      onChange={e => setGstEditValue(e.target.value)}
                      autoFocus
                    />
                    <button onClick={saveGstEdit} className="btn-primary text-xs py-1 px-2.5">Save</button>
                    <button onClick={() => setEditingGst(false)} className="btn-secondary text-xs py-1 px-2.5">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-2xl sm:text-3xl font-black text-orange-600 dark:text-orange-400">
                      {formatCurrency(liabilities.gst)}
                    </span>
                    {/* Pay GST button */}
                    <button
                      onClick={() => { setGstPayForm({ amount: liabilities.gst, paidFrom: '', date: today(), notes: '' }); setModal('payGst'); }}
                      className="text-xs sm:text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1.5 rounded-lg font-bold hover:bg-orange-200 transition-colors flex items-center gap-1"
                    >
                      <IndianRupee className="w-3.5 h-3.5" /> Pay GST
                    </button>
                  </div>
                )}

                {/* GST Log — expandable history */}
                {showGstLog && gstLog.length > 0 && (
                  <div className="mt-3.5 pt-3 border-t border-orange-200 dark:border-orange-800 space-y-1.5">
                    <p className="text-xs font-semibold text-orange-600 mb-2">GST History (last 30 entries)</p>
                    {gstLog.slice().reverse().map((entry: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-gray-500">{entry.date ? formatDate(entry.date) : '—'}</span>
                        <span className={entry.gstAdded >= 0 ? 'text-orange-600 font-semibold' : 'text-green-600 font-semibold'}>
                          {entry.gstAdded >= 0 ? '+' : ''}{formatCurrency(entry.gstAdded)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Supplier Dues ─────────────────────────────── */}
              <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm sm:text-base font-bold text-red-700 dark:text-red-400">Supplier Dues</span>
                  {/* Toggle inclusion */}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bs?.includeSupplierDues || false}
                      onChange={toggleSupplierDues}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                    />
                    <span className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-300">Include</span>
                  </label>
                </div>
                {bs?.includeSupplierDues ? (
                  <>
                    <p className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400 mb-2">
                      {formatCurrency(liabilities.supplierDues.total)}
                    </p>
                    {/* Per-supplier breakdown */}
                    {liabilities.supplierDues.breakdown?.length > 0 && (
                      <div className="space-y-1.5">
                        {liabilities.supplierDues.breakdown.map((s: any) => (
                          <div key={s.name} className="flex justify-between text-xs sm:text-sm">
                            <span className="text-gray-600 dark:text-gray-300 font-medium">{s.name}</span>
                            <span className="text-red-600 font-bold">{formatCurrency(s.outstanding)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {liabilities.supplierDues.breakdown?.length === 0 && (
                      <p className="text-xs sm:text-sm text-gray-500">No outstanding supplier dues 🎉</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs sm:text-sm text-gray-400">Not included in total</p>
                )}
              </div>

              {/* ── Custom Liabilities ────────────────────────── */}
              {liabilities.custom?.map((l: any) => (
                <div key={l._id} className="p-3.5 bg-gray-50 dark:bg-gray-800/80 rounded-xl flex items-center justify-between group">
                  <div>
                    <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200">{l.label}</p>
                    {l.notes && <p className="text-xs text-gray-400 mt-0.5">{l.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(l.amount)}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button onClick={() => openEditLiability(l)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteLiability(l._id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Total liabilities row */}
              <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 mt-2">
                <span className="text-base font-bold text-red-700 dark:text-red-300">Total Liabilities</span>
                <span className="text-lg sm:text-xl font-extrabold text-red-600 dark:text-red-400">{formatCurrency(liabilities.total)}</span>
              </div>
            </div>
          </div>

          {/* ══ EQUITY Column ══════════════════════════════════════ */}
          <div className="card p-6 space-y-5">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-green-500" /> Equity
            </h2>

            {/* Equation display */}
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800/80 rounded-xl">
                <p className="text-xs sm:text-sm text-gray-400 mb-2.5 font-bold uppercase tracking-wider">CALCULATION</p>
                <div className="space-y-2.5 text-sm sm:text-base">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Total Assets</span>
                    <span className="font-bold text-blue-600">{formatCurrency(assets.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">− Total Liabilities</span>
                    <span className="font-bold text-red-500">({formatCurrency(liabilities.total)})</span>
                  </div>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2.5 flex justify-between items-center">
                    <span className="font-bold text-gray-800 dark:text-gray-200">= Equity</span>
                    <span className={`font-black text-xl sm:text-2xl ${equity.isPositive ? 'text-green-600' : 'text-orange-500'}`}>
                      {formatCurrency(equity.value)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status indicator */}
              <div className={`p-5 sm:p-6 rounded-2xl text-center ${
                equity.isPositive
                  ? 'bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30'
                  : 'bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30'
              }`}>
                {equity.isPositive ? (
                  <>
                    <CheckCircle2 className="w-9 h-9 text-green-500 mx-auto mb-2" />
                    <p className="text-base sm:text-lg font-bold text-green-700 dark:text-green-300">Business is Solvent</p>
                    <p className="text-xs sm:text-sm text-green-600 mt-1 font-medium">Assets exceed liabilities by {formatCurrency(equity.value)}</p>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-9 h-9 text-orange-500 mx-auto mb-2" />
                    <p className="text-base sm:text-lg font-bold text-orange-700 dark:text-orange-300">Liabilities Exceed Assets</p>
                    <p className="text-xs sm:text-sm text-orange-600 mt-1 font-medium">Gap: {formatCurrency(Math.abs(equity.value))}</p>
                  </>
                )}
              </div>

              {/* GST quick summary */}
              <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl">
                <p className="text-xs sm:text-sm text-orange-700 font-bold mb-1">GST Liability Summary</p>
                <p className="text-xl sm:text-2xl font-black text-orange-600">{formatCurrency(liabilities.gst)}</p>
                <p className="text-xs text-gray-500 mt-1">Accumulates 4.77% on every outlet sale · Resets when you pay GST</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Account Picker Modal ────────────────────────────────────── */}
      <Modal open={modal === 'accounts'} onClose={() => setModal(null)} title="Select Asset Accounts" size="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Tick which accounts should appear as Assets in the balance sheet. Live balances are always pulled from the account records.</p>
          {allAccounts.map((acc: any) => {
            // Compare as strings to handle ObjectId vs string mismatch
            const isIncluded = (bs?.assetAccountIds || []).some(
              (id: any) => String(id) === String(acc._id) || String(id?._id) === String(acc._id)
            );
            return (
              <label key={acc._id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                isIncluded
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isIncluded}
                    onChange={() => toggleAssetAccount(acc._id)}
                    className="w-4 h-4"
                  />
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color || '#6366f1' }} />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{acc.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{acc.type}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold ${acc.currentBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {formatCurrency(acc.currentBalance)}
                </span>
              </label>
            );
          })}
          <button onClick={() => setModal(null)} className="btn-primary w-full mt-2">Done</button>
        </div>
      </Modal>

      {/* ── Add / Edit Custom Liability Modal ──────────────────────── */}
      <Modal
        open={modal === 'addLiability' || modal === 'editLiability'}
        onClose={() => setModal(null)}
        title={editingLiability ? 'Edit Liability' : 'Add Custom Liability'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Label *</label>
            <input
              className="input"
              placeholder="e.g. Bank Loan, Pending Rent"
              value={liabilityForm.label}
              onChange={e => setLiabilityForm({...liabilityForm, label: e.target.value})}
            />
          </div>
          <div>
            <label className="label">Amount (₹) *</label>
            <input
              type="number"
              className="input"
              value={liabilityForm.amount || ''}
              onChange={e => setLiabilityForm({...liabilityForm, amount: +e.target.value})}
            />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input
              className="input"
              placeholder="e.g. Due Jan 2025"
              value={liabilityForm.notes}
              onChange={e => setLiabilityForm({...liabilityForm, notes: e.target.value})}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={saveLiability}
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {saving ? (editingLiability ? 'Updating...' : 'Adding Liability...') : (editingLiability ? 'Update' : 'Add Liability')}
            </button>
            <button onClick={() => setModal(null)} disabled={saving} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Pay GST Modal ───────────────────────────────────────────── */}
      <Modal open={modal === 'payGst'} onClose={() => setModal(null)} title="Record GST Payment" size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <p className="text-xs text-orange-600 font-medium">Current GST Liability</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(liabilities.gst)}</p>
          </div>
          <div>
            <label className="label">Amount Being Paid (₹)</label>
            <input
              type="number"
              className="input"
              value={gstPayForm.amount || ''}
              onChange={e => setGstPayForm({...gstPayForm, amount: +e.target.value})}
            />
          </div>
          <div>
            <label className="label">Paid From Account (optional)</label>
            <select className="input" value={gstPayForm.paidFrom} onChange={e => setGstPayForm({...gstPayForm, paidFrom: e.target.value})}>
              <option value="">Select account (creates payment record)</option>
              {allAccounts.map((a: any) => (
                <option key={a._id} value={a._id}>{a.name} ({formatCurrency(a.currentBalance)})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={gstPayForm.date} onChange={e => setGstPayForm({...gstPayForm, date: e.target.value})} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" placeholder="e.g. Q4 GST filing" value={gstPayForm.notes} onChange={e => setGstPayForm({...gstPayForm, notes: e.target.value})} />
          </div>
          <p className="text-xs text-gray-400">After saving, GST liability will reduce by the paid amount. If you select an account, a payment record is also created automatically.</p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={payGst}
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {saving ? 'Recording GST Payment...' : 'Record GST Payment'}
            </button>
            <button onClick={() => setModal(null)} disabled={saving} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
