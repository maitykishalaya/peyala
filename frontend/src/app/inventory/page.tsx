'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { inventoryApi, suppliersApi, auditApi } from '@/lib/api';
import { formatCurrency, formatDate, UNITS, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { Plus, AlertTriangle, Package, Pencil, Trash2, ChevronDown, Search, History, RefreshCw, Clock, Calendar, Receipt, Store } from 'lucide-react';

const CACHE_KEY = 'peyala_inventory_cache_v2';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data: { items: any[]; categories: any[]; suppliers: any[] }) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable (private browsing) — safe to ignore, just no cache this time
  }
}

export default function InventoryPage() {
  const { canWrite } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'item' | 'cat' | 'edit' | 'editCat' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [catSaving, setCatSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [logsSearch, setLogsSearch] = useState('');

  // Last purchase history modal state
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [itemPurchases, setItemPurchases] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [itemForm, setItemForm] = useState({ name: '', category: '', unit: 'kg', currentStock: 0, minimumStock: 0, lastPurchasePrice: 0, preferredSupplier: '', notes: '' });
  const [catForm, setCatForm] = useState({ name: '', icon: '📦', color: '#10b981' });

  const openHistory = async (item: any) => {
    setHistoryItem(item);
    setItemPurchases([]);
    setHistoryLoading(true);
    try {
      const res = await inventoryApi.itemPurchases(item._id);
      setItemPurchases(res.data || []);
    } catch (err) {
      console.error('Failed to load item purchase history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const load = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    const params: any = {};
    if (selectedCat) params.category = selectedCat;
    if (lowStockOnly) params.lowStock = 'true';
    try {
      const [i, c, s] = await Promise.all([inventoryApi.items(params), inventoryApi.categories(), suppliersApi.list()]);
      setItems(i.data); setCategories(c.data); setSuppliers(s.data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      // Only cache the unfiltered "All" view, so cached data is always the full picture
      if (!selectedCat && !lowStockOnly) writeCache({ items: i.data, categories: c.data, suppliers: s.data });
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Show cached browser storage data on load, only query server upon manual refresh or filter change
    if (!selectedCat && !lowStockOnly) {
      const cached = readCache();
      if (cached?.items) {
        setItems(cached.items || []);
        setCategories(cached.categories || []);
        setSuppliers(cached.suppliers || []);
        if (cached.savedAt) {
          setLastUpdated(new Date(cached.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        setLoading(false);
        return;
      }
    }
    load();
  }, [selectedCat, lowStockOnly]);

  const openEdit = (item: any) => {
    setSelected(item);
    setItemForm({ name: item.name, category: item.category?._id || '', unit: item.unit, currentStock: item.currentStock, minimumStock: item.minimumStock, lastPurchasePrice: item.lastPurchasePrice, preferredSupplier: item.preferredSupplier?._id || '', notes: item.notes || '' });
    setSaveError('');
    setModal('edit');
  };

  const saveItem = async () => {
    if (!itemForm.name.trim()) {
      toast.error('Item name is required');
      return;
    }
    if (!itemForm.category) {
      toast.error('Category is required');
      return;
    }
    if (!itemForm.unit) {
      toast.error('Unit is required');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      if (modal === 'edit') {
        await inventoryApi.updateItem(selected._id, itemForm);
        toast.success(`Item "${itemForm.name}" updated successfully`);
      } else {
        await inventoryApi.createItem(itemForm);
        toast.success(`Item "${itemForm.name}" added successfully`);
      }
      setModal(null);
      await load();
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || 'Could not save the item. Please try again.';
      setSaveError(errMsg);
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const openLogs = async () => {
    setLogsOpen(true);
    setLogsLoading(true);
    setLogsError('');
    setLogsSearch('');
    try {
      const res = await auditApi.list({ module: 'Inventory', limit: 100 });
      setLogs(res.data.logs || res.data || []);
    } catch (err: any) {
      setLogsError(err?.response?.data?.message || 'Could not load logs. Please try again.');
    } finally {
      setLogsLoading(false);
    }
  };

  const openEditCat = (cat: any) => {
    setEditingCategory(cat);
    setCatForm({ name: cat.name, icon: cat.icon, color: cat.color });
    setModal('editCat');
  };

  const deleteCat = async (cat: any, itemCount: number) => {
    if (itemCount > 0) {
      toast.warning(`Can't delete "${cat.name}" — it still has ${itemCount} item(s) in it. Move or remove those items first.`);
      return;
    }
    if (!confirm(`Delete the empty category "${cat.name}"?`)) return;
    try {
      await inventoryApi.deleteCategory(cat._id);
      toast.success(`Category "${cat.name}" deleted`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not delete category');
    }
  };

  const saveCat = async () => {
    if (!catForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    setCatSaving(true);
    try {
      if (modal === 'editCat') {
        await inventoryApi.updateCategory(editingCategory._id, catForm);
        toast.success(`Category "${catForm.name}" updated successfully`);
      } else {
        await inventoryApi.createCategory(catForm);
        toast.success(`Category "${catForm.name}" created successfully`);
      }
      setModal(null);
      setEditingCategory(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not save category');
    } finally {
      setCatSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm('Remove item?')) return;
    try {
      await inventoryApi.deleteItem(id);
      toast.success('Item removed successfully');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not remove item');
    }
  };

  const totalValue = items.reduce((s, i) => s + (i.currentStock * i.averageCost), 0);
  const lowCount = items.filter(i => i.currentStock <= i.minimumStock).length;

  // Group by category — filtered by search text first
  const searchedItems = search.trim()
    ? items.filter(i => i.name?.toLowerCase().includes(search.trim().toLowerCase()))
    : items;
  const grouped = categories.reduce((acc: any, cat: any) => {
    acc[cat._id] = { cat, items: searchedItems.filter(i => i.category?._id === cat._id) };
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="space-y-5 pb-24">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Inventory</h1>
            <p className="text-sm text-gray-500">{items.length} items · Value: <strong>{formatCurrency(totalValue)}</strong> · {lowCount > 0 && <span className="text-yellow-600">{lowCount} low stock</span>}</p>
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
            <button onClick={openLogs} className="btn-secondary flex items-center gap-2"><History className="w-4 h-4" /> Check Logs</button>
            {canWrite ? (
              <>
                <button onClick={() => { setEditingCategory(null); setCatForm({ name: '', icon: '📦', color: '#10b981' }); setModal('cat'); }} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" /> Category</button>
                <button onClick={() => { setSelected(null); setItemForm({ name: '', category: '', unit: 'kg', currentStock: 0, minimumStock: 0, lastPurchasePrice: 0, preferredSupplier: '', notes: '' }); setSaveError(''); setModal('item'); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Item</button>
              </>
            ) : (
              <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                Read-only stock ledger
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value.trim()) { setSelectedCat(''); setLowStockOnly(false); } }}
            placeholder="Search items by name..."
            className="input pl-9"
          />
        </div>

        {/* Filters */}
        {!search.trim() && (
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => { setSelectedCat(''); setLowStockOnly(false); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!selectedCat && !lowStockOnly ? 'bg-brand-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>All</button>
          <button onClick={() => setLowStockOnly(!lowStockOnly)} className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${lowStockOnly ? 'bg-yellow-500 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}><AlertTriangle className="w-3.5 h-3.5" /> Low Stock {lowCount > 0 && `(${lowCount})`}</button>
          {categories.map(cat => (
            <button key={cat._id} onClick={() => setSelectedCat(selectedCat === cat._id ? '' : cat._id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedCat === cat._id ? 'text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
              style={selectedCat === cat._id ? { backgroundColor: cat.color } : {}}>
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
        )}

        {/* Items by Category */}
        {loading ? <div className="text-center py-16 text-gray-400">Loading...</div> : (
          <div className="space-y-4">
            {Object.values(grouped).map(({ cat, items: catItems }: any) => {
              if (selectedCat && selectedCat !== cat._id) return null;
              if (search.trim() && catItems.length === 0) return null;
              return (
                <div key={cat._id} className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2" style={{ borderLeftColor: cat.color, borderLeftWidth: 3 }}>
                    <span>{cat.icon}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{cat.name}</span>
                    <button onClick={() => openEditCat(cat)} className="p-1 text-gray-400 hover:text-brand-500 rounded" title="Rename category"><Pencil className="w-3.5 h-3.5" /></button>
                    <button
                      onClick={() => deleteCat(cat, catItems.length)}
                      className={`p-1 rounded ${catItems.length === 0 ? 'text-gray-400 hover:text-red-500' : 'text-gray-200 dark:text-gray-700 cursor-not-allowed'}`}
                      title={catItems.length === 0 ? 'Delete empty category' : `Can't delete — ${catItems.length} item(s) inside`}
                    ><Trash2 className="w-3.5 h-3.5" /></button>
                    <span className="badge-blue ml-1">{catItems.length}</span>
                    <span className="text-xs text-gray-400 ml-auto">{formatCurrency(catItems.reduce((s: number, i: any) => s + i.currentStock * i.averageCost, 0))}</span>
                  </div>
                  {catItems.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">{search.trim() ? 'No items match your search in this category' : 'No items in this category yet'}</div>
                  ) : (
                  <div className="table-responsive">
                    <table className="w-full min-w-max">
                      <thead className="bg-gray-50 dark:bg-gray-800/30">
                      <tr>
                        <th className="table-th">Item</th>
                        <th className="table-th">Stock</th>
                        <th className="table-th">Min Stock</th>
                        <th className="table-th">Avg Cost</th>
                        <th className="table-th">Stock Value</th>
                        <th className="table-th">Supplier</th>
                        <th className="table-th"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {catItems.map((item: any) => (
                        <tr key={item._id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${item.isLowStock ? 'bg-yellow-50/50 dark:bg-yellow-900/5' : ''}`}>
                          <td className="table-td font-medium">
                            <div className="flex items-center gap-2">
                              {item.isLowStock && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />}
                              <span>{item.name}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openHistory(item);
                                }}
                                className="p-1 rounded-md text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors inline-flex items-center justify-center flex-shrink-0 group"
                                title="View last purchase details (date, quantity, price)"
                                aria-label={`View last purchase details for ${item.name}`}
                              >
                                <Clock className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-500 group-hover:scale-110 transition-all" />
                              </button>
                            </div>
                          </td>
                          <td className="table-td">
                            <span className={`font-semibold ${item.isLowStock ? 'text-yellow-600' : 'text-gray-900 dark:text-white'}`}>{item.currentStock}</span>
                            <span className="text-gray-400 text-xs ml-1">{item.unit}</span>
                          </td>
                          <td className="table-td text-gray-400">{item.minimumStock} {item.unit}</td>
                          <td className="table-td">{formatCurrency(item.averageCost)}<span className="text-xs text-gray-400">/{item.unit}</span></td>
                          <td className="table-td font-medium text-brand-600">{formatCurrency(item.stockValue)}</td>
                          <td className="table-td text-gray-400 text-xs">{item.preferredSupplier?.name || '-'}</td>
                          <td className="table-td">
                            {canWrite && (
                              <div className="flex gap-1">
                                <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                                <button onClick={() => del(item._id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Item Modal */}
      <Modal open={modal === 'item' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Item' : 'Add Inventory Item'}>
        <div className="space-y-4">
          <div><label className="label">Item Name *</label><input className="input" value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Category *</label>
              <select className="input" value={itemForm.category} onChange={e => setItemForm({...itemForm, category: e.target.value})}>
                <option value="">Select</option>
                {categories.map(c => <option key={c._id} value={c._id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Unit *</label>
              <select className="input" value={itemForm.unit} onChange={e => setItemForm({...itemForm, unit: e.target.value})}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Current Stock</label><input type="number" step="0.1" className="input" value={itemForm.currentStock} onChange={e => setItemForm({...itemForm, currentStock: +e.target.value})} /></div>
            <div><label className="label">Minimum Stock Alert</label><input type="number" step="0.1" className="input" value={itemForm.minimumStock} onChange={e => setItemForm({...itemForm, minimumStock: +e.target.value})} /></div>
          </div>
          <div><label className="label">Last Purchase Price (₹)</label><input type="number" className="input" value={itemForm.lastPurchasePrice} onChange={e => setItemForm({...itemForm, lastPurchasePrice: +e.target.value})} /></div>
          <div><label className="label">Preferred Supplier</label>
            <select className="input" value={itemForm.preferredSupplier} onChange={e => setItemForm({...itemForm, preferredSupplier: e.target.value})}>
              <option value="">None</option>
              {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          {saveError && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{saveError}</div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={saveItem}
              disabled={saving}
              className="btn-primary flex-1 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {saving
                ? (modal === 'edit' ? 'Saving Changes...' : 'Saving Item...')
                : (modal === 'edit' ? 'Save Changes' : 'Save Item')}
            </button>
            <button onClick={() => setModal(null)} disabled={saving} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal open={modal === 'cat' || modal === 'editCat'} onClose={() => { setModal(null); setEditingCategory(null); }} title={modal === 'editCat' ? 'Rename Category' : 'Add Category'} size="sm">
        <div className="space-y-4">
          <div><label className="label">Category Name *</label><input className="input" value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} /></div>
          <div><label className="label">Icon (emoji)</label><input className="input" value={catForm.icon} onChange={e => setCatForm({...catForm, icon: e.target.value})} /></div>
          <div><label className="label">Color</label><input type="color" className="input h-10" value={catForm.color} onChange={e => setCatForm({...catForm, color: e.target.value})} /></div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={saveCat}
              disabled={catSaving}
              className="btn-primary flex-1 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {catSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {catSaving
                ? (modal === 'editCat' ? 'Saving Changes...' : 'Adding Category...')
                : (modal === 'editCat' ? 'Save Changes' : 'Add Category')}
            </button>
            <button onClick={() => { setModal(null); setEditingCategory(null); }} disabled={catSaving} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Logs Modal */}
      <Modal open={logsOpen} onClose={() => { setLogsOpen(false); setLogsSearch(''); }} title="Inventory Change Logs" size="lg">
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={logsSearch}
            onChange={e => setLogsSearch(e.target.value)}
            placeholder="Search logs by item, category, or user..."
            className="input pl-9"
          />
        </div>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {logsLoading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Loading logs...</div>
          ) : logsError ? (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{logsError}</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No inventory changes recorded yet.</div>
          ) : (
            (() => {
              const filtered = logsSearch.trim()
                ? logs.filter((entry: any) =>
                    entry.description?.toLowerCase().includes(logsSearch.trim().toLowerCase()) ||
                    entry.userName?.toLowerCase().includes(logsSearch.trim().toLowerCase())
                  )
                : logs;
              if (filtered.length === 0) {
                return <div className="text-center py-10 text-gray-400 text-sm">No logs match "{logsSearch}"</div>;
              }
              return filtered.map((entry: any) => (
                <div key={entry._id} className="border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{entry.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(entry.createdAt)}</p>
                </div>
              ));
            })()
          )}
        </div>
      </Modal>

      {/* Last Purchase Details Modal */}
      <Modal
        open={Boolean(historyItem)}
        onClose={() => setHistoryItem(null)}
        title="Last Purchase Details"
        size="lg"
      >
        {historyItem && (
          <div className="space-y-5">
            {/* Item Title & Overview Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{historyItem.category?.icon || '📦'}</span>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                    {historyItem.name}
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                      {historyItem.category?.name || 'Item'}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Current Stock: <strong className={historyItem.isLowStock ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-gray-200'}>{historyItem.currentStock} {historyItem.unit}</strong> · Average Cost: {formatCurrency(historyItem.averageCost)}/{historyItem.unit}
                  </p>
                </div>
              </div>
            </div>

            {/* Hero Cards for Last Purchase Info */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand-500" />
                Latest Purchase Information
              </h4>

              {historyItem.lastPurchase ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Date Card */}
                  <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Purchase Date</span>
                    </div>
                    <div className="text-base font-bold text-gray-900 dark:text-white">
                      {historyItem.lastPurchase.date ? formatDate(historyItem.lastPurchase.date) : 'Initial Record'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {historyItem.lastPurchase.date ? new Date(historyItem.lastPurchase.date).toLocaleDateString('en-IN', { weekday: 'long' }) : 'Initial setup baseline'}
                    </div>
                  </div>

                  {/* Quantity Card */}
                  <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
                      <Package className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Quantity</span>
                    </div>
                    <div className="text-base font-bold text-gray-900 dark:text-white">
                      {historyItem.lastPurchase.quantity != null
                        ? `${historyItem.lastPurchase.quantity} ${historyItem.lastPurchase.unit || historyItem.unit}`
                        : '—'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {historyItem.lastPurchase.totalPrice
                        ? `Invoice Total: ${formatCurrency(historyItem.lastPurchase.totalPrice)}`
                        : 'Recorded stock quantity'}
                    </div>
                  </div>

                  {/* Price Card */}
                  <div className="p-3.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30">
                    <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                      <Receipt className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Price / Unit</span>
                    </div>
                    <div className="text-base font-bold text-gray-900 dark:text-white">
                      {formatCurrency(historyItem.lastPurchase.pricePerUnit || historyItem.lastPurchasePrice || 0)}
                      <span className="text-xs font-normal text-gray-400 ml-1">/{historyItem.lastPurchase.unit || historyItem.unit}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={historyItem.lastPurchase.supplierName || historyItem.preferredSupplier?.name || 'No supplier listed'}>
                      Supplier: <strong>{historyItem.lastPurchase.supplierName || historyItem.preferredSupplier?.name || '—'}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-dashed border-gray-200 dark:border-gray-800 text-center text-sm text-gray-400">
                  <Package className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  No purchase entry recorded yet for <strong>{historyItem.name}</strong>.
                  <p className="text-xs text-gray-400 mt-1">Purchases added under the Purchases page will automatically track the date, quantity, and price here.</p>
                </div>
              )}
            </div>

            {/* Recent Purchases History Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-gray-400" />
                  Recent Purchase Invoices
                </h4>
                {itemPurchases.length > 0 && (
                  <span className="text-xs text-gray-400 font-medium">{itemPurchases.length} record{itemPurchases.length > 1 ? 's' : ''}</span>
                )}
              </div>

              {historyLoading ? (
                <div className="text-center py-6 text-xs text-gray-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-500" />
                  Loading past invoices...
                </div>
              ) : itemPurchases.length > 0 ? (
                <div className="table-responsive rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <table className="w-full text-xs min-w-max">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="table-th py-2">Date</th>
                        <th className="table-th py-2">Quantity</th>
                        <th className="table-th py-2">Price / Unit</th>
                        <th className="table-th py-2">Total Amount</th>
                        <th className="table-th py-2">Supplier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {itemPurchases.map((p: any, idx: number) => (
                        <tr key={p._id || idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                          <td className="table-td py-2 font-medium text-gray-900 dark:text-white">
                            {formatDate(p.date)}
                          </td>
                          <td className="table-td py-2">
                            {p.quantity} {p.unit}
                          </td>
                          <td className="table-td py-2 font-medium text-gray-700 dark:text-gray-300">
                            {formatCurrency(p.pricePerUnit)}/{p.unit}
                          </td>
                          <td className="table-td py-2 text-brand-600 font-semibold">
                            {formatCurrency(p.totalPrice)}
                          </td>
                          <td className="table-td py-2 text-gray-500 dark:text-gray-400">
                            {p.supplierName || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !historyItem.lastPurchase ? null : (
                <div className="text-xs text-gray-400 py-3 text-center bg-gray-50/50 dark:bg-gray-800/20 rounded-lg">
                  No additional past purchase bills found for this item.
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryItem(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
