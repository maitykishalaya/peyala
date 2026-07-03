// ─────────────────────────────────────────────────────────────────
// Sales Page
//
// Changes in this version:
//
// 1. Swiggy renamed → Fatafat Sales
//
// 2. Zomato and Fatafat sections are COLLAPSED by default.
//    Click the header to expand — because these are only entered
//    after the payout is received, not daily.
//
// 3. Outlet sales = Cash + UPI + Card + Bank Transfer (auto-summed).
//    User enters individual mode amounts — total is calculated live.
//    On save, cash portion credits Cash Counter, digital portions
//    credit Current Account automatically (handled in backend).
//
// 4. totalRevenue bug fixed — backend now calculates it correctly
//    before saving (was using pre('save') which doesn't fire on update).
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { salesApi, accountsApi } from '@/lib/api';
import { formatCurrency, formatDate, today } from '@/lib/utils';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Info } from 'lucide-react';

// ── Empty platform section (Zomato / Fatafat) ────────────────────
const emptyPlatform = {
  grossSales: 0,
  platformDiscount: 0,
  restaurantDiscount: 0,
  commission: 0,
  gst: 0,
  netSettlement: 0,
  settlementDate: '',
  isSettled: false,
};

// ── Calculate net settlement for a platform section ───────────────
// Net = Gross - Platform Discount - Restaurant Discount - Commission - GST
function calcNet(p: any): number {
  return Math.max(0,
    (p.grossSales || 0)
    - (p.platformDiscount || 0)
    - (p.restaurantDiscount || 0)
    - (p.commission || 0)
    - (p.gst || 0)
  );
}

export default function SalesPage() {
  // ── List state ──────────────────────────────────────────────────
  const [sales, setSales] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ startDate: '', endDate: '' });
  const [accounts, setAccounts] = useState<any[]>([]);

  // ── Modal state ─────────────────────────────────────────────────
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);

  // ── Section expand/collapse state (Zomato + Fatafat collapsed by default) ──
  const [zomatoOpen, setZomatoOpen] = useState(false);
  const [fatafatOpen, setFatafatOpen] = useState(false);

  // ── Form state ──────────────────────────────────────────────────
  const blank = (): any => ({
    date: today(),
    // Outlet payment breakdown — user fills these individually
    paymentBreakdown: { cash: 0, upi: 0, card: 0, bankTransfer: 0 },
    // Platform sections — only filled after payout received
    zomato: { ...emptyPlatform, receivedIn: '' },
    fatafat: { ...emptyPlatform, receivedIn: '' },
    // Other sales (catering, corporate, etc.)
    otherSales: 0,
    otherSalesReceivedIn: '',
    otherSalesDescription: '',
    notes: '',
  });
  const [form, setForm] = useState<any>(blank());

  // ── Computed values from form (live preview) ─────────────────────
  // Outlet sales = sum of all payment mode amounts
  const outletSalesCalc =
    (form.paymentBreakdown?.cash || 0) +
    (form.paymentBreakdown?.upi || 0) +
    (form.paymentBreakdown?.card || 0) +
    (form.paymentBreakdown?.bankTransfer || 0);

  // Total revenue preview
  const totalRevenueCalc =
    outletSalesCalc +
    (form.zomato?.netSettlement || 0) +
    (form.fatafat?.netSettlement || 0) +
    (form.otherSales || 0);

  // ── Load sales list ─────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const params: any = { page, limit: 30 };
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    const r = await salesApi.list(params);
    setSales(r.data.sales);
    setTotal(r.data.total);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, filters]);

  useEffect(() => {
    const loadAccounts = async () => {
      const res = await accountsApi.list();
      setAccounts(res.data);
    };
    loadAccounts();
  }, []);

  // ── Open edit modal — populate form from existing entry ──────────
  const openEdit = (s: any) => {
    setSelected(s);
    setForm({
      date: s.date?.split('T')[0] || today(),
      paymentBreakdown: s.paymentBreakdown || { cash: 0, upi: 0, card: 0, bankTransfer: 0 },
      zomato: { ...(s.zomato || { ...emptyPlatform }), receivedIn: s.zomato?.receivedIn?._id || s.zomato?.receivedIn || '' },
      fatafat: { ...(s.fatafat || { ...emptyPlatform }), receivedIn: s.fatafat?.receivedIn?._id || s.fatafat?.receivedIn || '' },
      otherSales: s.otherSales || 0,
      otherSalesReceivedIn: s.otherSalesReceivedIn?._id || s.otherSalesReceivedIn || '',
      otherSalesDescription: s.otherSalesDescription || '',
      notes: s.notes || '',
    });
    // Expand platform sections if they have data
    setZomatoOpen((s.zomato?.grossSales || 0) > 0);
    setFatafatOpen((s.fatafat?.grossSales || 0) > 0);
    setModal('edit');
  };

  // ── Update a platform section field ─────────────────────────────
  const updatePlatform = (platform: 'zomato' | 'fatafat', field: string, val: any) => {
    const updated = { ...form[platform], [field]: field === 'isSettled' ? val : +val };
    // Recalculate net settlement whenever any deduction changes
    updated.netSettlement = calcNet(updated);
    setForm({ ...form, [platform]: updated });
  };

  const normalizeSaleFormPayload = (payload: any) => {
    const normalized = { ...payload };
    normalized.zomato = { ...(normalized.zomato || {}), receivedIn: normalized.zomato?.receivedIn || undefined };
    normalized.fatafat = { ...(normalized.fatafat || {}), receivedIn: normalized.fatafat?.receivedIn || undefined };
    normalized.otherSalesReceivedIn = normalized.otherSalesReceivedIn || undefined;
    return normalized;
  };

  // ── Submit form ─────────────────────────────────────────────────
  const submit = async () => {
    const payload = normalizeSaleFormPayload(form);
    if (modal === 'edit') {
      await salesApi.update(selected._id, payload);
    } else {
      await salesApi.create(payload);
    }
    setModal(null);
    setForm(blank());
    setZomatoOpen(false);
    setFatafatOpen(false);
    load();
  };

  // ── Delete entry ─────────────────────────────────────────────────
  const del = async (id: string) => {
    if (!confirm('Delete this sales entry? Account credits and GST will be reversed.')) return;
    await salesApi.delete(id);
    load();
  };

  const pages = Math.ceil(total / 30);

  // ── Reusable platform section (Zomato / Fatafat) ─────────────────
  const PlatformSection = ({
    platform,
    label,
    emoji,
    isOpen,
    onToggle,
  }: {
    platform: 'zomato' | 'fatafat';
    label: string;
    emoji: string;
    isOpen: boolean;
    onToggle: () => void;
  }) => {
    const d = form[platform];
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {/* ── Collapsible Header ─────────────────────── */}
        <button
          type="button"
          onClick={onToggle}
          className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
            isOpen
              ? 'bg-gray-50 dark:bg-gray-800'
              : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{emoji}</span>
            <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{label}</span>
            {/* Show net settlement in header when collapsed — so you can see it without expanding */}
            {!isOpen && d.netSettlement > 0 && (
              <span className="text-xs text-green-600 font-semibold ml-2">
                Net: {formatCurrency(d.netSettlement)}
              </span>
            )}
            {!isOpen && (
              <span className="text-xs text-gray-400 ml-1">(click to expand — enter after payout received)</span>
            )}
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {/* ── Expandable Content ────────────────────── */}
        {isOpen && (
          <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-3">
              {/* Gross Sales */}
              <div>
                <label className="label">Gross Sales (₹)</label>
                <input type="number" className="input"
                  value={d.grossSales || ''}
                  onChange={e => updatePlatform(platform, 'grossSales', e.target.value)}
                  placeholder="Total ordered on platform"
                />
              </div>
              {/* Platform Discount */}
              <div>
                <label className="label">Platform Discount (₹)</label>
                <input type="number" className="input"
                  value={d.platformDiscount || ''}
                  onChange={e => updatePlatform(platform, 'platformDiscount', e.target.value)}
                />
              </div>
              {/* Restaurant Discount */}
              <div>
                <label className="label">Restaurant Discount (₹)</label>
                <input type="number" className="input"
                  value={d.restaurantDiscount || ''}
                  onChange={e => updatePlatform(platform, 'restaurantDiscount', e.target.value)}
                />
              </div>
              {/* Commission */}
              <div>
                <label className="label">Commission (₹)</label>
                <input type="number" className="input"
                  value={d.commission || ''}
                  onChange={e => updatePlatform(platform, 'commission', e.target.value)}
                />
              </div>
              {/* GST */}
              <div>
                <label className="label">GST Deducted (₹)</label>
                <input type="number" className="input"
                  value={d.gst || ''}
                  onChange={e => updatePlatform(platform, 'gst', e.target.value)}
                />
              </div>
              {/* Net Settlement — read only, auto-calculated */}
              <div>
                <label className="label">Net Settlement (auto-calculated)</label>
                <div className={`input font-bold text-base ${d.netSettlement >= 0 ? 'text-green-600' : 'text-red-500'} bg-gray-50 dark:bg-gray-800`}>
                  {formatCurrency(d.netSettlement)}
                </div>
              </div>
            </div>

            {/* Received in account */}
            <div>
              <label className="label">Received in Account</label>
              <select className="input"
                value={d.receivedIn || ''}
                onChange={e => setForm({ ...form, [platform]: { ...d, receivedIn: e.target.value } })}
              >
                <option value="">Select account (optional)</option>
                {accounts.map(a => (
                  <option key={a._id} value={a._id}>{a.name} ({a.type})</option>
                ))}
              </select>
            </div>

            {/* Settlement status */}
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={d.isSettled}
                  onChange={e => updatePlatform(platform, 'isSettled', e.target.checked)}
                />
                <span className="text-gray-600 dark:text-gray-400">Payout Received</span>
              </label>
              {d.isSettled && (
                <div className="flex-1">
                  <input type="date" className="input text-sm"
                    value={d.settlementDate || ''}
                    onChange={e => setForm({ ...form, [platform]: { ...d, settlementDate: e.target.value } })}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* ── Page Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sales</h1>
            <p className="text-sm text-gray-500">{total} entries</p>
          </div>
          <button
            onClick={() => { setForm(blank()); setZomatoOpen(false); setFatafatOpen(false); setModal('create'); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Sales Entry
          </button>
        </div>

        {/* ── Filters ──────────────────────────────────────────── */}
        <div className="card p-4 flex gap-3 flex-wrap items-end">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
          </div>
          <button onClick={() => setFilters({ startDate: '', endDate: '' })} className="btn-secondary">Clear</button>
        </div>

        {/* ── Sales Table ───────────────────────────────────────── */}
        <div className="card">
          <div className="table-responsive">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Outlet Sales</th>
                <th className="table-th">Cash</th>
                <th className="table-th">UPI/Card</th>
                <th className="table-th">Zomato Net</th>
                <th className="table-th">Fatafat Net</th>
                <th className="table-th">Other</th>
                <th className="table-th font-bold">Total</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={9} className="table-td text-center py-12 text-gray-400">Loading...</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={9} className="table-td text-center py-12 text-gray-400">No sales entries yet</td></tr>
              ) : sales.map((s: any) => (
                <tr key={s._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="table-td font-medium">{formatDate(s.date)}</td>
                  <td className="table-td">{formatCurrency(s.outletSales || 0)}</td>
                  <td className="table-td text-xs text-gray-400">{formatCurrency(s.paymentBreakdown?.cash || 0)}</td>
                  <td className="table-td text-xs text-gray-400">{formatCurrency((s.paymentBreakdown?.upi || 0) + (s.paymentBreakdown?.card || 0))}</td>
                  <td className="table-td">
                    {s.zomato?.grossSales > 0 ? (
                      <div>
                        <div>{formatCurrency(s.zomato.netSettlement || 0)}</div>
                        <div className="text-xs text-gray-400">Gross: {formatCurrency(s.zomato.grossSales)}</div>
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-td">
                    {s.fatafat?.grossSales > 0 ? (
                      <div>
                        <div>{formatCurrency(s.fatafat.netSettlement || 0)}</div>
                        <div className="text-xs text-gray-400">Gross: {formatCurrency(s.fatafat.grossSales)}</div>
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="table-td">{s.otherSales > 0 ? formatCurrency(s.otherSales) : <span className="text-gray-300">—</span>}</td>
                  <td className="table-td font-bold text-brand-600 text-base">{formatCurrency(s.totalRevenue || 0)}</td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => del(s._id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-400">Page {page} of {pages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="btn-secondary p-2 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages} className="btn-secondary p-2 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit Modal ─────────────────────────────────────── */}
      <Modal
        open={modal === 'create' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Edit Sales Entry' : 'New Sales Entry'}
        size="xl"
      >
        <div className="space-y-5">

          {/* Date */}
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
          </div>

          {/* ── OUTLET SALES SECTION ─────────────────────────── */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm text-gray-700 dark:text-gray-300">🏪 Outlet / Counter Sales</p>
              {/* Live total shown as you type */}
              <span className="text-sm font-bold text-brand-600">{formatCurrency(outletSalesCalc)}</span>
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Enter by payment mode below. Cash → credited to Cash Counter. UPI/Card/Bank → credited to Current Account automatically.
              </p>
            </div>

            {/* Payment mode breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">💵 Cash (₹)</label>
                <input type="number" className="input"
                  value={form.paymentBreakdown?.cash || ''}
                  onChange={e => setForm({ ...form, paymentBreakdown: { ...form.paymentBreakdown, cash: +e.target.value } })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">📱 UPI (₹)</label>
                <input type="number" className="input"
                  value={form.paymentBreakdown?.upi || ''}
                  onChange={e => setForm({ ...form, paymentBreakdown: { ...form.paymentBreakdown, upi: +e.target.value } })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">💳 Card (₹)</label>
                <input type="number" className="input"
                  value={form.paymentBreakdown?.card || ''}
                  onChange={e => setForm({ ...form, paymentBreakdown: { ...form.paymentBreakdown, card: +e.target.value } })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">🏦 Bank Transfer (₹)</label>
                <input type="number" className="input"
                  value={form.paymentBreakdown?.bankTransfer || ''}
                  onChange={e => setForm({ ...form, paymentBreakdown: { ...form.paymentBreakdown, bankTransfer: +e.target.value } })}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Auto-calculated outlet total */}
            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-gray-500">Outlet Sales Total (auto-calculated)</span>
              <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(outletSalesCalc)}</span>
            </div>

            {/* GST preview */}
            {outletSalesCalc > 0 && (
              <div className="flex justify-between items-center bg-orange-50 dark:bg-orange-900/10 rounded-lg px-3 py-2">
                <span className="text-xs font-medium text-orange-600">GST to be added (4.77% of outlet sales)</span>
                <span className="text-xs font-bold text-orange-600">+ {formatCurrency(outletSalesCalc * 0.0477)}</span>
              </div>
            )}
          </div>

          {/* ── ZOMATO — collapsed by default ───────────────────── */}
          <PlatformSection
            platform="zomato"
            label="Zomato Sales"
            emoji="🔴"
            isOpen={zomatoOpen}
            onToggle={() => setZomatoOpen(o => !o)}
          />

          {/* ── FATAFAT — collapsed by default ──────────────────── */}
          <PlatformSection
            platform="fatafat"
            label="Fatafat Sales"
            emoji="⚡"
            isOpen={fatafatOpen}
            onToggle={() => setFatafatOpen(o => !o)}
          />

          {/* ── OTHER SALES ─────────────────────────────────────── */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <p className="font-medium text-sm text-gray-700 dark:text-gray-300">📋 Other Sales</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount (₹)</label>
                <input type="number" className="input"
                  value={form.otherSales || ''}
                  onChange={e => setForm({...form, otherSales: +e.target.value})}
                  placeholder="Catering, corporate, etc."
                />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input"
                  value={form.otherSalesDescription}
                  onChange={e => setForm({...form, otherSalesDescription: e.target.value})}
                  placeholder="e.g. Corporate order"
                />
              </div>
            </div>
            <div>
              <label className="label">Received in Account</label>
              <select className="input"
                value={form.otherSalesReceivedIn || ''}
                onChange={e => setForm({ ...form, otherSalesReceivedIn: e.target.value })}
              >
                <option value="">Select account (optional)</option>
                {accounts.map(a => (
                  <option key={a._id} value={a._id}>{a.name} ({a.type})</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── TOTAL REVENUE PREVIEW ────────────────────────────── */}
          <div className="flex justify-between items-center bg-brand-50 dark:bg-brand-900/20 rounded-xl px-5 py-4 border border-brand-100 dark:border-brand-800">
            <div>
              <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Estimated Total Revenue</p>
              <p className="text-xs text-gray-400 mt-0.5">Outlet + Zomato + Fatafat + Other</p>
            </div>
            <span className="text-2xl font-bold text-brand-600">{formatCurrency(totalRevenueCalc)}</span>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button onClick={submit} className="btn-primary flex-1 py-2.5">
              Save Sales Entry
            </button>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
