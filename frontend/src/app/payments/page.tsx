// ─────────────────────────────────────────────────────────────────
// Payments Page
//
// Changes in this version:
//   1. Categories loaded from API (editable) — not hardcoded
//   2. Subcategory dropdown updates based on selected category
//      (e.g. pick "Staff Expenses" → subcategories show Arpan, Joydev, etc.)
//   3. Due payments (from purchase entries) shown with a "Due" badge
//   4. Smart payment mode filtering per account still works
//   5. Every payment lists here — both manual and auto-created (salary, due, etc.)
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import PaymentModeSelect from '@/components/ui/PaymentModeSelect';
import { paymentsApi, accountsApi, suppliersApi, categoriesApi } from '@/lib/api';
import { getModesForAccount, getLabelForMode, ALL_PAYMENT_MODES } from '@/lib/paymentModes';
import { formatCurrency, formatDate, today } from '@/lib/utils';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

export default function PaymentsPage() {
  // ── Data state ──────────────────────────────────────────────────
  const [payments, setPayments] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);   // from API — editable
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', category: '' });

  // ── Modal state ─────────────────────────────────────────────────
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null); // payment being viewed (shows entered by)

  // ── Payment mode (smart filtering per account) ──────────────────
  const [allowedModes, setAllowedModes] = useState<{ value: string; label: string }[]>([]);

  // ── Subcategories for selected category ─────────────────────────
  const [subcategories, setSubcategories] = useState<string[]>([]);

  // ── Blank form ──────────────────────────────────────────────────
  const blank = () => ({
    date: today(), paidFrom: '', payee: '', category: '', subcategory: '',
    description: '', amount: 0, paymentMode: 'cash',
    referenceNumber: '', supplier: '', notes: ''
  });
  const [form, setForm] = useState<any>(blank());

  // ── Load payments list ──────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const params: any = { page, limit: 20 };
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.category) params.category = filters.category;

    const [p, a, s, c] = await Promise.all([
      paymentsApi.list(params),
      accountsApi.list(),
      suppliersApi.list(),
      categoriesApi.list(),
    ]);
    setPayments(p.data.payments);
    setTotal(p.data.total);
    setAccounts(a.data);
    setSuppliers(s.data);
    setCategories(c.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, filters]);

  // ── When category changes, update subcategory list ───────────────
  const handleCategoryChange = (catName: string) => {
    setForm((f: any) => ({ ...f, category: catName, subcategory: '' }));
    const cat = categories.find(c => c.name === catName);
    setSubcategories(cat?.subcategories || []);
  };

  // ── Handle account change → smart payment mode filter ────────────
  const handleAccountChange = async (accountId: string) => {
    setForm((f: any) => ({ ...f, paidFrom: accountId }));
    if (!accountId) { setAllowedModes([]); return; }
    const { modes, defaultMode } = await getModesForAccount(accountId);
    setAllowedModes(modes);
    setForm((f: any) => ({ ...f, paymentMode: defaultMode }));
  };

  // ── Open edit modal ─────────────────────────────────────────────
  const openEdit = async (p: any) => {
    setSelected(p);
    const f = {
      date: p.date?.split('T')[0] || today(),
      paidFrom: p.paidFrom?._id || '',
      payee: p.payee, category: p.category,
      subcategory: p.subcategory || '',
      description: p.description || '',
      amount: p.amount, paymentMode: p.paymentMode || 'cash',
      referenceNumber: p.referenceNumber || '',
      supplier: p.supplier?._id || '', notes: p.notes || ''
    };
    setForm(f);
    // Load subcategories for the existing category
    const cat = categories.find(c => c.name === p.category);
    setSubcategories(cat?.subcategories || []);
    // Load allowed modes for the account
    if (f.paidFrom) {
      const { modes } = await getModesForAccount(f.paidFrom);
      setAllowedModes(modes);
    }
    setModal('edit');
  };

  // ── Submit ──────────────────────────────────────────────────────
  const submit = async () => {
    const payload = { ...form, amount: +form.amount };
    if (modal === 'edit') await paymentsApi.update(selected._id, payload);
    else await paymentsApi.create(payload);
    setModal(null); setForm(blank()); setAllowedModes([]); setSubcategories([]);
    load();
  };

  // ── Delete ──────────────────────────────────────────────────────
  const del = async (id: string) => {
    if (!confirm('Delete this payment? Account balance will be restored.')) return;
    await paymentsApi.delete(id); load();
  };

  const pages = Math.ceil(total / 20);
  const totalShown = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Payments</h1>
            <p className="text-sm text-gray-500">
              {total} entries · Shown total: <span className="font-medium text-red-500">{formatCurrency(totalShown)}</span>
            </p>
          </div>
          <button onClick={() => { setForm(blank()); setAllowedModes([]); setSubcategories([]); setModal('create'); }}
            className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Payment
          </button>
        </div>

        {/* Filters */}
        <div className="card p-4 flex gap-3 flex-wrap items-end">
          <div><label className="label">From</label><input type="date" className="input" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} /></div>
          <div><label className="label">Category</label>
            <select className="input" value={filters.category} onChange={e => setFilters({...filters, category: e.target.value})}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c._id} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <button onClick={() => setFilters({ startDate: '', endDate: '', category: '' })} className="btn-secondary">Clear</button>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-responsive">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Payee</th>
                <th className="table-th">Category</th>
                <th className="table-th">Subcategory</th>
                <th className="table-th">Description</th>
                <th className="table-th">Paid From</th>
                <th className="table-th">Mode</th>
                <th className="table-th">By</th>
                <th className="table-th">Amount</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={10} className="table-td text-center py-12 text-gray-400">Loading...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={10} className="table-td text-center py-12 text-gray-400">No payments found</td></tr>
              ) : payments.map((p: any) => (
                <tr key={p._id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${p.isPending ? 'opacity-60' : ''}`} onClick={() => setDetail(p)}>
                  <td className="table-td">{formatDate(p.date)}</td>
                  <td className="table-td font-medium">{p.payee}</td>
                  <td className="table-td"><span className="badge-blue">{p.category}</span></td>
                  <td className="table-td text-sm text-gray-500">{p.subcategory || '—'}</td>
                  <td className="table-td text-xs text-gray-400 max-w-xs truncate">{p.description || '—'}</td>
                  <td className="table-td text-gray-400 text-sm">{p.paidFrom?.name || '—'}</td>
                  <td className="table-td text-xs">
                    {p.isPending
                      ? <span className="badge-yellow flex items-center gap-1 w-fit"><AlertCircle className="w-3 h-3" /> Due</span>
                      : <span className="text-gray-400">{getLabelForMode(p.paymentMode)}</span>
                    }
                  </td>
                  <td className="table-td text-xs text-gray-400">{p.createdBy?.name || '—'}</td>
                  <td className="table-td font-semibold text-red-500">{formatCurrency(p.amount)}</td>
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    {!p.isPending && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => del(p._id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {pages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-400">Page {page} of {pages} · {total} entries</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="btn-secondary p-2 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages} className="btn-secondary p-2 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Payment' : 'New Payment'} size="lg">        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Date *</label><input type="date" className="input" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
            <div><label className="label">Amount (₹) *</label><input type="number" className="input" value={form.amount || ''} onChange={e => setForm({...form, amount: +e.target.value})} /></div>
          </div>

          <div><label className="label">Payee *</label>
            <input className="input" placeholder="Who was paid?" value={form.payee} onChange={e => setForm({...form, payee: e.target.value})} />
          </div>

          {/* Category — from API (editable) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category *</label>
              <select className="input" value={form.category} onChange={e => handleCategoryChange(e.target.value)}>
                <option value="">Select Category</option>
                {categories.map(c => <option key={c._id} value={c.name}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Subcategory</label>
              {subcategories.length > 0 ? (
                // If the category has subcategories, show a dropdown
                <select className="input" value={form.subcategory} onChange={e => setForm({...form, subcategory: e.target.value})}>
                  <option value="">Select or type below</option>
                  {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                // Otherwise free-text input
                <input className="input" placeholder="e.g. Joydev Mahato" value={form.subcategory} onChange={e => setForm({...form, subcategory: e.target.value})} />
              )}
              {/* Always allow manual override */}
              {subcategories.length > 0 && (
                <input className="input mt-1 text-xs" placeholder="Or type custom subcategory" value={form.subcategory} onChange={e => setForm({...form, subcategory: e.target.value})} />
              )}
            </div>
          </div>

          <div><label className="label">Description</label>
            <input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
          </div>

          {/* Account + Payment Mode (smart) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Paid From Account *</label>
              <select className="input" value={form.paidFrom} onChange={e => handleAccountChange(e.target.value)}>
                <option value="">Select Account</option>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.name} ({formatCurrency(a.currentBalance)})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Payment Mode</label>
              <PaymentModeSelect
                value={form.paymentMode}
                onChange={mode => setForm({...form, paymentMode: mode})}
                allowedModes={allowedModes}
              />
            </div>
          </div>

          <div>
            <label className="label">Link to Supplier (optional)</label>
            <select className="input" value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})}>
              <option value="">None</option>
              {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>

          <div><label className="label">Reference / Cheque No.</label>
            <input className="input" value={form.referenceNumber} onChange={e => setForm({...form, referenceNumber: e.target.value})} />
          </div>

          <div><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={submit} className="btn-primary flex-1">Save Payment</button>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Payment Detail Modal (shows entered by) ──────────────────── */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`Payment Details${detail?.createdBy?.name ? ` (entered by ${detail.createdBy.name})` : ''}`}
        size="md"
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-400">Date:</span> <span className="font-medium">{formatDate(detail.date)}</span></div>
              <div><span className="text-gray-400">Amount:</span> <span className="font-bold text-red-500">{formatCurrency(detail.amount)}</span></div>
              <div><span className="text-gray-400">Payee:</span> <span className="font-medium">{detail.payee}</span></div>
              <div><span className="text-gray-400">Paid From:</span> <span className="font-medium">{detail.paidFrom?.name || '—'}</span></div>
              <div><span className="text-gray-400">Category:</span> <span className="font-medium">{detail.category}</span></div>
              <div><span className="text-gray-400">Subcategory:</span> <span className="font-medium">{detail.subcategory || '—'}</span></div>
              <div><span className="text-gray-400">Mode:</span> <span className="font-medium">{getLabelForMode(detail.paymentMode)}</span></div>
              {detail.referenceNumber && <div><span className="text-gray-400">Ref:</span> <span className="font-medium">{detail.referenceNumber}</span></div>}
              {detail.createdBy?.name && (
                <div className="col-span-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-gray-400">Entered by:</span>{' '}
                  <span className="font-semibold text-brand-600">{detail.createdBy.name}</span>
                </div>
              )}
            </div>
            {detail.description && <p className="text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-800">{detail.description}</p>}
            {detail.notes && <p className="text-gray-400 text-xs">{detail.notes}</p>}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
