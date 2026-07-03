'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { inventoryApi, suppliersApi } from '@/lib/api';
import { formatCurrency, UNITS } from '@/lib/utils';
import { Plus, AlertTriangle, Package, Pencil, Trash2, ChevronDown } from 'lucide-react';

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [modal, setModal] = useState<'item' | 'cat' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [itemForm, setItemForm] = useState({ name: '', category: '', unit: 'kg', currentStock: 0, minimumStock: 0, lastPurchasePrice: 0, preferredSupplier: '', notes: '' });
  const [catForm, setCatForm] = useState({ name: '', icon: '📦', color: '#10b981' });

  const load = async () => {
    const params: any = {};
    if (selectedCat) params.category = selectedCat;
    if (lowStockOnly) params.lowStock = 'true';
    const [i, c, s] = await Promise.all([inventoryApi.items(params), inventoryApi.categories(), suppliersApi.list()]);
    setItems(i.data); setCategories(c.data); setSuppliers(s.data); setLoading(false);
  };

  useEffect(() => { load(); }, [selectedCat, lowStockOnly]);

  const openEdit = (item: any) => {
    setSelected(item);
    setItemForm({ name: item.name, category: item.category?._id || '', unit: item.unit, currentStock: item.currentStock, minimumStock: item.minimumStock, lastPurchasePrice: item.lastPurchasePrice, preferredSupplier: item.preferredSupplier?._id || '', notes: item.notes || '' });
    setModal('edit');
  };

  const saveItem = async () => {
    if (modal === 'edit') await inventoryApi.updateItem(selected._id, itemForm);
    else await inventoryApi.createItem(itemForm);
    setModal(null); load();
  };

  const saveCat = async () => {
    await inventoryApi.createCategory(catForm);
    setModal(null); load();
  };

  const del = async (id: string) => {
    if (!confirm('Remove item?')) return;
    await inventoryApi.deleteItem(id); load();
  };

  const totalValue = items.reduce((s, i) => s + (i.currentStock * i.averageCost), 0);
  const lowCount = items.filter(i => i.currentStock <= i.minimumStock).length;

  // Group by category
  const grouped = categories.reduce((acc: any, cat: any) => {
    acc[cat._id] = { cat, items: items.filter(i => i.category?._id === cat._id) };
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Inventory</h1>
            <p className="text-sm text-gray-500">{items.length} items · Value: <strong>{formatCurrency(totalValue)}</strong> · {lowCount > 0 && <span className="text-yellow-600">{lowCount} low stock</span>}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModal('cat')} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" /> Category</button>
            <button onClick={() => { setSelected(null); setItemForm({ name: '', category: '', unit: 'kg', currentStock: 0, minimumStock: 0, lastPurchasePrice: 0, preferredSupplier: '', notes: '' }); setModal('item'); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Item</button>
          </div>
        </div>

        {/* Filters */}
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

        {/* Items by Category */}
        {loading ? <div className="text-center py-16 text-gray-400">Loading...</div> : (
          <div className="space-y-4">
            {Object.values(grouped).map(({ cat, items: catItems }: any) => {
              if (catItems.length === 0 && selectedCat && selectedCat !== cat._id) return null;
              if (catItems.length === 0 && !selectedCat) return null;
              return (
                <div key={cat._id} className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2" style={{ borderLeftColor: cat.color, borderLeftWidth: 3 }}>
                    <span>{cat.icon}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{cat.name}</span>
                    <span className="badge-blue ml-1">{catItems.length}</span>
                    <span className="text-xs text-gray-400 ml-auto">{formatCurrency(catItems.reduce((s: number, i: any) => s + i.currentStock * i.averageCost, 0))}</span>
                  </div>
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
                          <td className="table-td font-medium flex items-center gap-2">
                            {item.isLowStock && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />}
                            {item.name}
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
                            <div className="flex gap-1">
                              <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => del(item._id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
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
          <div className="flex gap-3 pt-2">
            <button onClick={saveItem} className="btn-primary flex-1">Save Item</button>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal open={modal === 'cat'} onClose={() => setModal(null)} title="Add Category" size="sm">
        <div className="space-y-4">
          <div><label className="label">Category Name *</label><input className="input" value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} /></div>
          <div><label className="label">Icon (emoji)</label><input className="input" value={catForm.icon} onChange={e => setCatForm({...catForm, icon: e.target.value})} /></div>
          <div><label className="label">Color</label><input type="color" className="input h-10" value={catForm.color} onChange={e => setCatForm({...catForm, color: e.target.value})} /></div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveCat} className="btn-primary flex-1">Add Category</button>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
