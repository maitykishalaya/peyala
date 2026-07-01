// ─────────────────────────────────────────────────────────────────
// Payment Categories Settings Page
// Accessible from Settings → Categories
//
// Features:
//   - View all payment categories and their subcategories
//   - Add/remove categories
//   - Add/remove subcategories within each category
//   - Click a subcategory → see total paid + full payment history
//     (e.g. click "Joydev Mahato" → see all his salary payments + total)
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { categoriesApi, paymentsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Trash2, ChevronRight, Tag, X, IndianRupee, Pencil } from 'lucide-react';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── New category form ───────────────────────────────────────────
  const [newCatModal, setNewCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', icon: '💰', color: '#6366f1' });

  // ── Subcategory drill-down state ────────────────────────────────
  const [ledgerModal, setLedgerModal] = useState(false);
  const [ledgerCat, setLedgerCat] = useState<any>(null);          // which category
  const [ledgerSub, setLedgerSub] = useState('');                  // which subcategory (if any)
  const [ledgerData, setLedgerData] = useState<any>(null);         // API response
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // ── Add subcategory state ───────────────────────────────────────
  const [addSubModal, setAddSubModal] = useState<any>(null);       // which category
  const [newSubName, setNewSubName] = useState('');

  // ── Edit category state ─────────────────────────────────────────
  const [editModal, setEditModal] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', icon: '', color: '' });

  const load = async () => {
    setLoading(true);
    const r = await categoriesApi.list();
    setCategories(r.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Open ledger for a category or subcategory ───────────────────
  const openLedger = async (cat: any, sub?: string) => {
    setLedgerCat(cat);
    setLedgerSub(sub || '');
    setLedgerModal(true);
    setLedgerLoading(true);
    try {
      const params: any = {};
      if (sub) params.subcategory = sub;
      const r = await categoriesApi.getLedger(cat._id, params);
      setLedgerData(r.data);
    } catch (err) {
      console.error('Failed to load category ledger:', err);
    }
    setLedgerLoading(false);
  };

  // ── Save new category ───────────────────────────────────────────
  const saveCategory = async () => {
    await categoriesApi.create({ ...catForm, subcategories: [] });
    setNewCatModal(false);
    setCatForm({ name: '', icon: '💰', color: '#6366f1' });
    load();
  };

  // ── Save edited category ────────────────────────────────────────
  const saveEdit = async () => {
    await categoriesApi.update(editModal._id, editForm);
    setEditModal(null);
    load();
  };

  // ── Delete a category ───────────────────────────────────────────
  const deleteCategory = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? Existing payments will keep this category label.`)) return;
    await categoriesApi.delete(id);
    load();
  };

  // ── Add a subcategory ───────────────────────────────────────────
  const addSubcategory = async () => {
    if (!newSubName.trim()) return;
    await categoriesApi.addSubcategory(addSubModal._id, newSubName.trim());
    setAddSubModal(null);
    setNewSubName('');
    load();
  };

  // ── Remove a subcategory ────────────────────────────────────────
  const removeSubcategory = async (catId: string, name: string) => {
    if (!confirm(`Remove subcategory "${name}"?`)) return;
    await categoriesApi.deleteSubcategory(catId, name);
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-4xl">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-brand-500" /> Payment Categories
            </h1>
            <p className="text-sm text-gray-500">
              Manage categories and subcategories. Click any subcategory to see total paid and history.
            </p>
          </div>
          <button onClick={() => setNewCatModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>

        {/* ── Category Cards ──────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-3">
            {categories.map(cat => (
              <div key={cat._id} className="card p-0 overflow-hidden">

                {/* Category Header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => openLedger(cat)}
                >
                  <div className="flex items-center gap-3">
                    {/* Colour indicator */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ backgroundColor: cat.color + '20' }}>
                      {cat.icon}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{cat.name}</p>
                      <p className="text-xs text-gray-400">{cat.subcategories?.length || 0} subcategories · click to see total paid</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setAddSubModal(cat); setNewSubName(''); }}
                      className="text-xs text-brand-600 hover:underline font-medium px-2 py-1"
                    >
                      + Sub
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setEditModal(cat); setEditForm({ name: cat.name, icon: cat.icon, color: cat.color }); }}
                      className="p-1.5 text-gray-400 hover:text-brand-500 rounded"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); deleteCategory(cat._id, cat.name); }}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </div>

                {/* Subcategories */}
                {cat.subcategories?.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3 flex flex-wrap gap-2">
                    {cat.subcategories.map((sub: string) => (
                      <div
                        key={sub}
                        className="group flex items-center gap-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1 hover:border-brand-400 transition-colors cursor-pointer"
                        onClick={() => openLedger(cat, sub)}
                      >
                        {/* Subcategory name — click to drill down */}
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-brand-600">{sub}</span>
                        {/* Remove button — only visible on hover */}
                        <button
                          onClick={e => { e.stopPropagation(); removeSubcategory(cat._id, sub); }}
                          className="ml-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New Category Modal ──────────────────────────────────────── */}
      <Modal open={newCatModal} onClose={() => setNewCatModal(false)} title="Add Payment Category" size="sm">
        <div className="space-y-4">
          <div><label className="label">Category Name *</label>
            <input className="input" value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} placeholder="e.g. Staff Expenses" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Icon (emoji)</label>
              <input className="input" value={catForm.icon} onChange={e => setCatForm({...catForm, icon: e.target.value})} />
            </div>
            <div><label className="label">Colour</label>
              <input type="color" className="input h-10" value={catForm.color} onChange={e => setCatForm({...catForm, color: e.target.value})} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveCategory} className="btn-primary flex-1">Add Category</button>
            <button onClick={() => setNewCatModal(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Category Modal ─────────────────────────────────────── */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={`Edit — ${editModal?.name}`} size="sm">
        <div className="space-y-4">
          <div><label className="label">Name *</label>
            <input className="input" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Icon</label>
              <input className="input" value={editForm.icon} onChange={e => setEditForm({...editForm, icon: e.target.value})} />
            </div>
            <div><label className="label">Colour</label>
              <input type="color" className="input h-10" value={editForm.color} onChange={e => setEditForm({...editForm, color: e.target.value})} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveEdit} className="btn-primary flex-1">Save Changes</button>
            <button onClick={() => setEditModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Add Subcategory Modal ───────────────────────────────────── */}
      <Modal open={!!addSubModal} onClose={() => setAddSubModal(null)} title={`Add Subcategory to "${addSubModal?.name}"`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Subcategories let you track payments at a deeper level. For example, under "Staff Expenses" you might add "Joydev Mahato" — then you can see exactly how much you've paid him.
          </p>
          <div><label className="label">Subcategory Name *</label>
            <input
              className="input"
              value={newSubName}
              onChange={e => setNewSubName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addSubcategory(); }}
              placeholder="e.g. Joydev Mahato, Electricity, Internet"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={addSubcategory} className="btn-primary flex-1">Add Subcategory</button>
            <button onClick={() => setAddSubModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Category/Subcategory Ledger Modal ───────────────────────── */}
      <Modal
        open={ledgerModal}
        onClose={() => { setLedgerModal(false); setLedgerData(null); }}
        title={ledgerSub ? `${ledgerCat?.name} › ${ledgerSub}` : ledgerCat?.name}
        size="lg"
      >
        {ledgerLoading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : ledgerData ? (
          <div className="space-y-4">

            {/* ── Total Paid Summary ──────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-brand-50 dark:bg-brand-900/20 rounded-xl">
                <p className="text-xs text-brand-600 font-medium uppercase tracking-wide">Total Paid</p>
                <p className="text-3xl font-bold text-brand-600 mt-1">{formatCurrency(ledgerData.totalPaid)}</p>
                <p className="text-xs text-gray-400 mt-1">{ledgerData.total} payment{ledgerData.total !== 1 ? 's' : ''}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Category</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{ledgerCat?.icon} {ledgerCat?.name}</p>
                {ledgerSub && <p className="text-sm text-gray-500 mt-0.5">› {ledgerSub}</p>}
              </div>
            </div>

            {/* ── Subcategory Breakdown (when viewing full category) ── */}
            {!ledgerSub && ledgerData.subcategoryTotals?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Subcategory</p>
                <div className="space-y-1.5">
                  {ledgerData.subcategoryTotals.map((s: any) => (
                    <div
                      key={s._id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => openLedger(ledgerCat, s._id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s._id}</span>
                        <span className="text-xs text-gray-400">{s.count} payment{s.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-red-500">{formatCurrency(s.total)}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Payment List ────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment History</p>
              {ledgerData.payments?.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No payments yet</p>
              ) : (
                <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                      <tr>
                        <th className="table-th">Date</th>
                        <th className="table-th">Payee</th>
                        <th className="table-th">Subcategory</th>
                        <th className="table-th">Description</th>
                        <th className="table-th">Paid From</th>
                        <th className="table-th text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {ledgerData.payments.map((p: any) => (
                        <tr key={p._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="table-td text-sm">{formatDate(p.date)}</td>
                          <td className="table-td font-medium text-sm">{p.payee}</td>
                          <td className="table-td text-xs text-gray-400">{p.subcategory || '—'}</td>
                          <td className="table-td text-xs text-gray-400 max-w-xs truncate">{p.description || '—'}</td>
                          <td className="table-td text-xs text-gray-400">{p.paidFrom?.name || '—'}</td>
                          <td className="table-td text-right font-semibold text-red-500">{formatCurrency(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </AppLayout>
  );
}
