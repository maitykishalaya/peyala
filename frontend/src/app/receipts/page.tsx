'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { receiptsApi, accountsApi } from '@/lib/api';
import { formatCurrency, formatDate, today } from '@/lib/utils';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const RECEIPT_CATS = [
  { value: 'zomato_settlement', label: '🔴 Zomato Settlement' },
  { value: 'swiggy_settlement', label: '🟠 Swiggy Settlement' },
  { value: 'cash_deposit', label: '💰 Cash Deposit' },
  { value: 'loan', label: '🏦 Loan Received' },
  { value: 'investment', label: '📈 Investment' },
  { value: 'other', label: '📋 Other' },
];

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null); // receipt being viewed
  const [filters, setFilters] = useState({ startDate: '', endDate: '' });

  const blank = () => ({ date: today(), receivedIn: '', source: '', category: 'other', description: '', amount: 0, referenceNumber: '', notes: '' });
  const [form, setForm] = useState<any>(blank());

  const load = async () => {
    setLoading(true);
    const params: any = { page, limit: 20 };
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    const [r, a] = await Promise.all([receiptsApi.list(params), accountsApi.list()]);
    setReceipts(r.data.receipts); setTotal(r.data.total); setAccounts(a.data); setLoading(false);
  };

  useEffect(() => { load(); }, [page, filters]);

  const submit = async () => {
    await receiptsApi.create({ ...form, amount: +form.amount });
    setModal(false); setForm(blank()); load();
  };

  const del = async (id: string) => {
    if (!confirm('Delete this receipt?')) return;
    await receiptsApi.delete(id); load();
  };

  const pages = Math.ceil(total / 20);
  const totalShown = receipts.reduce((s, r) => s + r.amount, 0);

  const catLabel = (v: string) => RECEIPT_CATS.find(c => c.value === v)?.label || v;

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Receipts</h1>
            <p className="text-sm text-gray-500">{total} entries · Shown: <span className="font-medium text-green-600">{formatCurrency(totalShown)}</span></p>
          </div>
          <button onClick={() => { setForm(blank()); setModal(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Receipt</button>
        </div>

        <div className="card p-4 flex gap-3 flex-wrap items-end">
          <div><label className="label">From</label><input type="date" className="input" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} /></div>
          <button onClick={() => setFilters({ startDate: '', endDate: '' })} className="btn-secondary">Clear</button>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Source</th>
                <th className="table-th">Category</th>
                <th className="table-th">Received In</th>
                <th className="table-th">Description</th>
                <th className="table-th">Entered By</th>
                <th className="table-th">Amount</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">Loading...</td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={8} className="table-td text-center py-12 text-gray-400">No receipts found</td></tr>
              ) : receipts.map((r: any) => (
                <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => setDetail(r)}>
                  <td className="table-td">{formatDate(r.date)}</td>
                  <td className="table-td font-medium">{r.source}</td>
                  <td className="table-td"><span className="badge-green text-xs">{catLabel(r.category)}</span></td>
                  <td className="table-td text-gray-400">{r.receivedIn?.name || '-'}</td>
                  <td className="table-td text-gray-400 max-w-xs truncate">{r.description || '-'}</td>
                  <td className="table-td text-xs text-gray-400">{r.createdBy?.name || '—'}</td>
                  <td className="table-td font-semibold text-green-600">{formatCurrency(r.amount)}</td>
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    <button onClick={() => del(r._id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <Modal open={modal} onClose={() => setModal(false)} title="New Receipt">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Date *</label><input type="date" className="input" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
            <div><label className="label">Amount (₹) *</label><input type="number" className="input" value={form.amount || ''} onChange={e => setForm({...form, amount: +e.target.value})} /></div>
          </div>
          <div><label className="label">Source *</label><input className="input" placeholder="e.g. Zomato, Customer Name" value={form.source} onChange={e => setForm({...form, source: e.target.value})} /></div>
          <div><label className="label">Category</label>
            <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
              {RECEIPT_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div><label className="label">Received In Account *</label>
            <select className="input" value={form.receivedIn} onChange={e => setForm({...form, receivedIn: e.target.value})}>
              <option value="">Select Account</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.name} ({formatCurrency(a.currentBalance)})</option>)}
            </select>
          </div>
          <div><label className="label">Description</label><input className="input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
          <div><label className="label">Reference Number</label><input className="input" value={form.referenceNumber} onChange={e => setForm({...form, referenceNumber: e.target.value})} /></div>
          <div className="flex gap-3 pt-2">
            <button onClick={submit} className="btn-primary flex-1">Save Receipt</button>
            <button onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Receipt Detail Modal (shows entered by) ──────────────────── */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`Receipt Details${detail?.createdBy?.name ? ` (entered by ${detail.createdBy.name})` : ''}`}
        size="md"
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-400">Date:</span> <span className="font-medium">{formatDate(detail.date)}</span></div>
              <div><span className="text-gray-400">Amount:</span> <span className="font-bold text-green-600">{formatCurrency(detail.amount)}</span></div>
              <div><span className="text-gray-400">Source:</span> <span className="font-medium">{detail.source}</span></div>
              <div><span className="text-gray-400">Received In:</span> <span className="font-medium">{detail.receivedIn?.name || '—'}</span></div>
              <div><span className="text-gray-400">Category:</span> <span className="font-medium">{catLabel(detail.category)}</span></div>
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
