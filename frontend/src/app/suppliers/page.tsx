'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { suppliersApi } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { Plus, Phone, MapPin, Pencil, Trash2, RefreshCw } from 'lucide-react';

const CACHE_KEY = 'peyala_suppliers_cache_v1';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(suppliers: any[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ suppliers, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export default function SuppliersPage() {
  const { canWrite } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', category: '', notes: '', openingBalance: 0 });

  const load = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const r = await suppliersApi.list();
      setSuppliers(r.data);
      writeCache(r.data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const cached = readCache();
    if (cached?.suppliers) {
      setSuppliers(cached.suppliers);
      if (cached.savedAt) {
        setLastUpdated(new Date(cached.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      setLoading(false);
      return;
    }
    load();
  }, []);

  const openEdit = (s: any) => { setSelected(s); setForm({ name: s.name, phone: s.phone || '', address: s.address || '', category: s.category || '', notes: s.notes || '', openingBalance: s.openingBalance || 0 }); setModal('edit'); };
  const openDetail = async (s: any) => { const r = await suppliersApi.get(s._id); setDetail(r.data); };

  const remove = async (s: any) => {
    if (!confirm(`Deactivate supplier ${s.name}? Existing history will remain.`)) return;
    try {
      await suppliersApi.delete(s._id);
      toast.success(`Supplier "${s.name}" deactivated`);
      if (detail?.supplier?._id === s._id) setDetail(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not deactivate supplier');
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    setSaving(true);
    try {
      if (modal === 'edit') {
        await suppliersApi.update(selected._id, form);
        toast.success(`Supplier "${form.name}" updated successfully`);
      } else {
        await suppliersApi.create(form);
        toast.success(`Supplier "${form.name}" added successfully`);
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save supplier');
    } finally {
      setSaving(false);
    }
  };

  const totalDues = suppliers.reduce((s, sup) => s + (sup.outstanding || 0), 0);

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Suppliers</h1>
            <p className="text-sm text-gray-500">{suppliers.length} suppliers · Total dues: <span className="text-red-500 font-medium">{formatCurrency(totalDues)}</span></p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
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
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              title="Fetch latest data from server"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin text-brand-500")} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {canWrite ? (
              <button onClick={() => { setForm({ name: '', phone: '', address: '', category: '', notes: '', openingBalance: 0 }); setModal('create'); }} className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Supplier</button>
            ) : (
              <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                Read-only supplier ledger
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(sup => (
            <div key={sup._id} className="card p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(sup)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{sup.name}</h3>
                  {sup.category && <p className="text-xs text-gray-400 mt-0.5">{sup.category}</p>}
                </div>
                {canWrite && (
                  <div className="flex gap-2">
                    <button onClick={e => { e.stopPropagation(); openEdit(sup); }} className="p-1.5 text-gray-400 hover:text-brand-500 rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={e => { e.stopPropagation(); remove(sup); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              {sup.phone && <p className="text-sm text-gray-500 flex items-center gap-1.5 mb-1"><Phone className="w-3.5 h-3.5" /> {sup.phone}</p>}
              {sup.address && <p className="text-sm text-gray-500 flex items-center gap-1.5 mb-3"><MapPin className="w-3.5 h-3.5" /> {sup.address}</p>}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-xs text-gray-400">Total Purchased</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(sup.totalPurchased)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Outstanding</p>
                  <p className={`text-sm font-semibold ${sup.outstanding > 0 ? 'text-red-500' : 'text-green-600'}`}>{formatCurrency(sup.outstanding || 0)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'create' ? 'Add Supplier' : 'Edit Supplier'}>
        <div className="space-y-4">
          <div><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
          <div><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
          <div><label className="label">Category (e.g. Vegetables, Poultry)</label><input className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})} /></div>
          <div><label className="label">Opening Balance Due (₹)</label><input type="number" className="input" value={form.openingBalance} onChange={e => setForm({...form, openingBalance: +e.target.value})} /></div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary flex-1 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {saving
                ? (modal === 'edit' ? 'Saving Changes...' : 'Saving Supplier...')
                : (modal === 'edit' ? 'Save Changes' : 'Save Supplier')}
            </button>
            <button onClick={() => setModal(null)} disabled={saving} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.supplier?.name || ''} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {[
                { label: 'Total Purchased', value: formatCurrency(detail.supplier.totalPurchased), color: 'text-brand-600' },
                { label: 'Total Paid', value: formatCurrency(detail.supplier.totalPaid), color: 'text-green-600' },
                { label: 'Outstanding', value: formatCurrency(detail.supplier.outstanding || 0), color: detail.supplier.outstanding > 0 ? 'text-red-500' : 'text-green-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="pt-2">
              <button onClick={() => remove(detail.supplier)} className="btn-secondary text-red-600 hover:text-white hover:bg-red-600">Delete Supplier</button>
            </div>
            <h4 className="font-medium text-gray-800 dark:text-gray-200">Recent Purchases</h4>
            {detail.purchases?.length === 0 ? <p className="text-sm text-gray-400">No purchases yet</p> : (
              <div className="table-responsive">
                <table className="w-full min-w-max text-sm">
                  <thead><tr className="bg-gray-50 dark:bg-gray-800"><th className="table-th">Date</th><th className="table-th">Items</th><th className="table-th">Amount</th><th className="table-th">Status</th></tr></thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {detail.purchases.map((p: any) => (
                      <tr key={p._id}>
                        <td className="table-td">{formatDate(p.date)}</td>
                        <td className="table-td">{p.items?.length} items</td>
                        <td className="table-td font-medium">{formatCurrency(p.totalAmount)}</td>
                        <td className="table-td"><span className={p.isPaid ? 'badge-green' : 'badge-yellow'}>{p.isPaid ? 'Paid' : 'Credit'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
