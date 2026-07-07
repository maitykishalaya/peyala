// ─────────────────────────────────────────────────────────────────
// Purchases Page
//
// New features:
//
// 1. QUICK-ADD ITEM ON THE GO
//    Each line item has a searchable text input.
//    As you type, it filters the existing inventory items.
//    If no match found → "Add new item" button appears inline.
//    Clicking it opens a small form to create the item on the spot.
//    The new item is saved to inventory and immediately usable.
//
// 2. DUE MODE
//    Payment mode dropdown includes "Due (Pay Later)".
//    If selected, the purchase is saved without debiting any account.
//    It appears in the Payments section as "pending".
//    "Clear Due" button appears on due purchases in the list.
//    Clearing the due picks an account and debits it.
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import PaymentModeSelect from '@/components/ui/PaymentModeSelect';
import { purchasesApi, suppliersApi, inventoryApi, accountsApi } from '@/lib/api';
import { getModesForAccount, getLabelForMode, ALL_PAYMENT_MODES } from '@/lib/paymentModes';
import { formatCurrency, formatDate, today, UNITS } from '@/lib/utils';
import { Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, Search, AlertCircle } from 'lucide-react';

const REFDATA_CACHE_KEY = 'peyala_purchases_refdata_cache_v1';
const LIST_CACHE_KEY = 'peyala_purchases_list_cache_v1';

function readCache(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable (private browsing) — safe to ignore, just no cache this time
  }
}

// ── Inline Item Search + Quick Add ───────────────────────────────
// This sub-component renders per line item.
// Shows a search box; when user types it filters items.
// If no match, shows "Create [name]" option.
function ItemSearchCell({
  value,           // currently selected item ID
  onChange,        // callback when item selected
  items,           // full list of inventory items from API
  onQuickAdd,      // callback when user wants to quick-add a new item
}: {
  value: string;
  onChange: (id: string, unit: string) => void;
  items: any[];
  onQuickAdd: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // When value changes externally, find item name to show
  const selectedItem = items.find(i => i._id === value);

  // Filter items by search query
  const filtered = query.length > 0
    ? items.filter(i => i.name.toLowerCase().includes(query.toLowerCase()))
    : items.slice(0, 10); // show first 10 when no query

  // Check if query exactly matches any item
  const exactMatch = items.some(i => i.name.toLowerCase() === query.toLowerCase());

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (item: any) => {
    onChange(item._id, item.unit);
    setQuery(item.name);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
        <input
          className="input text-xs py-1.5 pl-6"
          placeholder="Search or type new item..."
          value={selectedItem && !open ? selectedItem.name : query}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
        />
      </div>

      {open && (
        <div className="absolute z-50 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl mt-1 max-h-48 overflow-y-auto">
          {/* Filtered items */}
          {filtered.map(item => (
            <button
              key={item._id}
              type="button"
              onClick={() => select(item)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between"
            >
              <span className="font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
              <span className="text-gray-400">{item.unit} · {item.category?.name}</span>
            </button>
          ))}

          {/* Quick-add option — shown when query typed and no exact match */}
          {query.length > 1 && !exactMatch && (
            <button
              type="button"
              onClick={() => { onQuickAdd(query); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2 text-brand-600 dark:text-brand-400 font-medium"
            >
              <Plus className="w-3 h-3" /> Add "{query}" as new item
            </button>
          )}

          {filtered.length === 0 && query.length <= 1 && (
            <p className="px-3 py-2 text-xs text-gray-400">Type to search items...</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PurchasesPage() {
  // ── List state ──────────────────────────────────────────────────
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ startDate: '', endDate: '', supplier: '' });

  // ── Modal state ─────────────────────────────────────────────────
  const [modal, setModal] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [clearDueModal, setClearDueModal] = useState<any>(null); // purchase being cleared

  // ── Quick-add item state ────────────────────────────────────────
  const [quickAddModal, setQuickAddModal] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');  // pre-filled from what user typed
  const [quickAddForm, setQuickAddForm] = useState({ name: '', category: '', unit: 'kg', lastPurchasePrice: 0 });
  const [quickAddTargetLine, setQuickAddTargetLine] = useState(-1); // which line triggered quick-add

  // ── Payment mode state ──────────────────────────────────────────
  const [allowedModes, setAllowedModes] = useState<{ value: string; label: string }[]>([]);

  // ── Clear due form ──────────────────────────────────────────────
  const [clearDueForm, setClearDueForm] = useState({ paidFrom: '', paymentMode: 'cash', date: today() });
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);

  const blankPurchaseForm = () => ({
    date: today(), supplier: '', paidFrom: '', paymentMode: 'cash',
    isPaid: true, notes: '', referenceNumber: '',
    isGstBill: false,
    lines: [{ item: '', quantity: 0, unit: 'kg', pricePerUnit: 0, gstPercent: 0, gstAmount: 0, totalPrice: 0 }]
  });

  // ── Form state ──────────────────────────────────────────────────
  const [form, setForm] = useState<any>(blankPurchaseForm());

  const load = async () => {
    const isDefaultView = page === 1 && !filters.startDate && !filters.endDate && !filters.supplier;
    setLoading(true);
    const params: any = { page, limit: 20 };
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    if (filters.supplier) params.supplier = filters.supplier;
    const res = await purchasesApi.list(params);
    setPurchases(res.data.purchases);
    setTotal(res.data.total);
    setLoading(false);
    if (isDefaultView) writeCache(LIST_CACHE_KEY, { purchases: res.data.purchases, total: res.data.total });
  };

  useEffect(() => {
    const isDefaultView = page === 1 && !filters.startDate && !filters.endDate && !filters.supplier;
    if (isDefaultView) {
      const cached = readCache(LIST_CACHE_KEY);
      if (cached) {
        setPurchases(cached.purchases || []);
        setTotal(cached.total || 0);
        setLoading(false);
        load(); // quietly refresh in the background
        return;
      }
    }
    load();
  }, [page, filters]);

  useEffect(() => {
    const cached = readCache(REFDATA_CACHE_KEY);
    if (cached) {
      setSuppliers(cached.suppliers || []);
      setItems(cached.items || []);
      setAccounts(cached.accounts || []);
      setCategories(cached.categories || []);
    }
    // Always refresh from the server too — cached data (if any) just avoids
    // a blank picker while this fetch is in flight.
    Promise.all([suppliersApi.list(), inventoryApi.items(), accountsApi.list(), inventoryApi.categories()])
      .then(([s, i, a, c]) => {
        setSuppliers(s.data); setItems(i.data); setAccounts(a.data); setCategories(c.data);
        writeCache(REFDATA_CACHE_KEY, { suppliers: s.data, items: i.data, accounts: a.data, categories: c.data });
      });
  }, []);

  // ── Handle account change → update allowed payment modes ────────
  const handleAccountChange = async (accountId: string) => {
    setForm((f: any) => ({ ...f, paidFrom: accountId }));
    if (!accountId) { setAllowedModes([]); return; }
    const { modes, defaultMode } = await getModesForAccount(accountId);
    // Add "Due" to allowed modes always — it's always an option
    const withDue = [...modes, { value: 'due', label: '⏳ Due (Pay Later)' }];
    setAllowedModes(withDue);
    setForm((f: any) => ({ ...f, paymentMode: defaultMode }));
  };

  // ── Update a line item field ────────────────────────────────────
  const updateLine = (idx: number, field: string, val: any) => {
    const lines = [...form.lines];
    lines[idx] = { ...lines[idx], [field]: val };

    const recalcLine = (line: any) => {
      const quantity = line.quantity || 0;
      const pricePerUnit = line.pricePerUnit || 0;
      const gstPercent = line.gstPercent || 0;
      const baseAmount = quantity * pricePerUnit;
      const gstAmount = +(baseAmount * (gstPercent / 100)).toFixed(2);
      const totalPrice = +(baseAmount + gstAmount).toFixed(2);
      return { ...line, gstAmount, totalPrice };
    };

    if (['quantity', 'pricePerUnit', 'gstPercent'].includes(field)) {
      lines[idx] = recalcLine(lines[idx]);
    } else if (field === 'totalPrice') {
      if (lines[idx].quantity > 0) {
        const gstPercent = lines[idx].gstPercent || 0;
        const baseAmount = +(val / (1 + gstPercent / 100)).toFixed(2);
        lines[idx].pricePerUnit = +(baseAmount / lines[idx].quantity).toFixed(2);
        lines[idx].gstAmount = +(val - baseAmount).toFixed(2);
        lines[idx].totalPrice = +val;
      }
    }

    setForm({ ...form, lines });
  };

  // ── Item selected from search ───────────────────────────────────
  const handleItemSelect = (idx: number, itemId: string, unit: string) => {
    const lines = [...form.lines];
    lines[idx] = { ...lines[idx], item: itemId, unit };
    setForm({ ...form, lines });
  };

  // ── Quick-add triggered ─────────────────────────────────────────
  const handleQuickAdd = (idx: number, name: string) => {
    setQuickAddTargetLine(idx);
    setQuickAddName(name);
    setQuickAddForm({ name, category: categories[0]?._id || '', unit: 'kg', lastPurchasePrice: 0 });
    setQuickAddModal(true);
  };

  // ── Save quick-added item and populate the line ─────────────────
  const saveQuickAdd = async () => {
    try {
      const res = await purchasesApi.quickAddItem(quickAddForm);
      const newItem = res.data.item;
      // Add to local items list so it appears immediately
      setItems(prev => {
        const exists = prev.find(i => i._id === newItem._id);
        return exists ? prev : [...prev, newItem];
      });
      // Populate the line that triggered quick-add
      if (quickAddTargetLine >= 0) {
        handleItemSelect(quickAddTargetLine, newItem._id, newItem.unit);
      }
      setQuickAddModal(false);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add item');
    }
  };

  const openNewPurchase = () => {
    setEditingPurchase(null);
    setForm(blankPurchaseForm());
    setAllowedModes(modesWithDue);
    setModal(true);
  };

  const openEditPurchase = async (purchase: any) => {
    setEditingPurchase(purchase);
    const prefilled = {
      date: new Date(purchase.date).toISOString().slice(0, 10),
      supplier: purchase.supplier?._id || '',
      paidFrom: purchase.paidFrom?._id || '',
      paymentMode: purchase.paymentMode || 'cash',
      isPaid: purchase.isPaid,
      isGstBill: (purchase.items || []).some((it: any) => (it.gstPercent || 0) > 0),
      notes: purchase.notes || '',
      referenceNumber: purchase.referenceNumber || '',
      lines: purchase.items.map((item: any) => ({
        item: item.item?._id || item.item,
        quantity: item.quantity,
        unit: item.unit,
        pricePerUnit: item.pricePerUnit,
        gstPercent: item.gstPercent || 0,
        gstAmount: item.gstAmount || 0,
        totalPrice: item.totalPrice,
      })),
    };
    setForm(prefilled);

    if (prefilled.paidFrom) {
      const { modes } = await getModesForAccount(prefilled.paidFrom);
      setAllowedModes([...modes, { value: 'due', label: '⏳ Due (Pay Later)' }]);
    } else {
      setAllowedModes(modesWithDue);
    }

    setModal(true);
  };

  const addLine = () => setForm({ ...form, lines: [...form.lines, { item: '', quantity: 0, unit: 'kg', pricePerUnit: 0, gstPercent: 0, gstAmount: 0, totalPrice: 0 }] });
  const removeLine = (idx: number) => setForm({ ...form, lines: form.lines.filter((_: any, i: number) => i !== idx) });
  const subTotal = form.lines.reduce((s: number, l: any) => s + ((l.quantity || 0) * (l.pricePerUnit || 0)), 0);
  const purchaseGstTotal = form.lines.reduce((s: number, l: any) => s + (l.gstAmount || 0), 0);
  const grandTotal = form.lines.reduce((s: number, l: any) => s + l.totalPrice, 0);

  const getInventoryUnit = (itemId: string) => {
    return items.find((i: any) => i._id === itemId)?.unit || '';
  };

  const validatePurchaseForm = () => {
    const errors: string[] = [];
    if (!form.supplier) errors.push('Choose a supplier before saving.');
    const isDue = form.paymentMode === 'due';
    if (!isDue && !form.paidFrom) {
      errors.push('Select an account or switch payment mode to Due.');
    }

    if (!Array.isArray(form.lines) || form.lines.length === 0) {
      errors.push('Add at least one purchase line item.');
    } else {
      form.lines.forEach((line: any, idx: number) => {
        const lineNumber = idx + 1;
        if (!line.item) errors.push(`Line ${lineNumber}: select or add an item.`);
        if (line.quantity === undefined || line.quantity === null || line.quantity <= 0) {
          errors.push(`Line ${lineNumber}: quantity must be greater than 0.`);
        }
        if (line.pricePerUnit === undefined || line.pricePerUnit === null || line.pricePerUnit < 0) {
          errors.push(`Line ${lineNumber}: rate must be 0 or higher.`);
        }
        if (line.totalPrice === undefined || line.totalPrice === null || line.totalPrice <= 0) {
          errors.push(`Line ${lineNumber}: total must be greater than 0.`);
        }
        if (line.item) {
          const expectedUnit = getInventoryUnit(line.item);
          if (expectedUnit && line.unit !== expectedUnit) {
            errors.push(`Line ${lineNumber}: unit must match saved inventory unit '${expectedUnit}'.`);
          }
        }
      });
    }

    return errors;
  };

  const submit = async () => {
    const errors = validatePurchaseForm();
    if (errors.length > 0) {
      setFormErrors(errors);
      setErrorModalOpen(true);
      return;
    }

    setSaving(true);
    try {
      const isDue = form.paymentMode === 'due';
      const payload = {
        ...form,
        isPaid: !isDue,
        paidFrom: isDue ? null : form.paidFrom,
        items: form.lines.map((l: any) => ({
          item: l.item,
          quantity: l.quantity,
          unit: l.unit,
          pricePerUnit: l.pricePerUnit,
          gstPercent: l.gstPercent || 0,
          gstAmount: l.gstAmount || 0,
          totalPrice: l.totalPrice,
        }))
      };
      if (editingPurchase) {
        await purchasesApi.update(editingPurchase._id, payload);
      } else {
        await purchasesApi.create(payload);
      }
      setModal(false);
      setEditingPurchase(null);
      setForm(blankPurchaseForm());
      setAllowedModes([]);
      load();
    } catch (err: any) {
      const message = err.response?.data?.message || 'Purchase could not be saved. Please check the form.';
      setFormErrors([message]);
      setErrorModalOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this purchase and reverse inventory?')) return;
    await purchasesApi.delete(id); load();
  };

  const clearDue = async () => {
    await purchasesApi.clearDue(clearDueModal._id, clearDueForm);
    setClearDueModal(null);
    load();
  };

  const pages = Math.ceil(total / 20);

  // All payment modes including due for the dropdown when no account selected
  const modesWithDue = [
    ...ALL_PAYMENT_MODES,
    { value: 'due', label: '⏳ Due (Pay Later)' }
  ];

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Raw Material Purchases</h1>
            <p className="text-sm text-gray-500">{total} entries · inventory auto-updated</p>
          </div>
          <button onClick={openNewPurchase} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Purchase
          </button>
        </div>

        {/* Filters */}
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div><label className="label">From</label><input type="date" className="input" value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} /></div>
          <div><label className="label">Supplier</label>
            <select className="input" value={filters.supplier} onChange={e => setFilters({...filters, supplier: e.target.value})}>
              <option value="">All Suppliers</option>
              {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <button onClick={() => setFilters({ startDate: '', endDate: '', supplier: '' })} className="btn-secondary">Clear</button>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-responsive">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">Supplier</th>
                <th className="table-th">Items</th>
                <th className="table-th">Description</th>
                <th className="table-th">Total</th>
                <th className="table-th">Paid From</th>
                <th className="table-th">Mode</th>
                <th className="table-th">Status</th>
                <th className="table-th">By</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={10} className="table-td text-center py-12 text-gray-400">Loading...</td></tr>
              ) : purchases.length === 0 ? (
                <tr><td colSpan={10} className="table-td text-center py-12 text-gray-400">No purchases found</td></tr>
              ) : purchases.map((p: any) => (
                <tr key={p._id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${!p.isPaid ? 'bg-yellow-50/30 dark:bg-yellow-900/5' : ''}`} onClick={() => setDetail(p)}>
                  <td className="table-td">{formatDate(p.date)}</td>
                  <td className="table-td font-medium">{p.supplier?.name}</td>
                  <td className="table-td text-gray-400">{p.items?.length} item{p.items?.length !== 1 ? 's' : ''}</td>
                  <td className="table-td text-gray-400 text-xs max-w-xs truncate">
                    {p.items?.map((i: any) => i.item?.name).filter(Boolean).slice(0, 3).join(', ')}
                    {p.items?.length > 3 ? ` +${p.items.length - 3} more` : ''}
                  </td>
                  <td className="table-td font-semibold text-brand-600">{formatCurrency(p.totalAmount)}</td>
                  <td className="table-td text-gray-400">{p.paidFrom?.name || '—'}</td>
                  <td className="table-td text-xs text-gray-400">{getLabelForMode(p.paymentMode)}</td>
                  <td className="table-td">
                    {p.isPaid
                      ? <span className="badge-green">Paid</span>
                      : <span className="badge-yellow flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Due</span>
                    }
                  </td>
                  <td className="table-td text-xs text-gray-400">{p.createdBy?.name || '—'}</td>
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {!p.isPaid && (
                        <button
                          onClick={() => { setClearDueModal(p); setClearDueForm({ paidFrom: accounts[0]?._id || '', paymentMode: 'cash', date: today() }); }}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium hover:bg-green-200"
                        >
                          Clear Due
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditPurchase(p); }}
                        className="p-1.5 text-gray-400 hover:text-brand-500 rounded"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); del(p._id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

      {/* ── New Purchase Modal ───────────────────────────────────────── */}
      <Modal open={modal} onClose={() => { setModal(false); setEditingPurchase(null); }} title={editingPurchase ? 'Edit Purchase Entry' : 'New Purchase Entry'} size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Date *</label><input type="date" className="input" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
            <div><label className="label">Supplier *</label>
              <select className="input" value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})}>
                <option value="">Select Supplier</option>
                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="inline-flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={!!form.isGstBill}
                  onChange={e => {
                    const isGstBill = e.target.checked;
                    if (!isGstBill) {
                      // Clear any GST already set on lines so it can't silently affect the total
                      const lines = form.lines.map((l: any) => {
                        const baseAmount = (l.quantity || 0) * (l.pricePerUnit || 0);
                        return { ...l, gstPercent: 0, gstAmount: 0, totalPrice: +baseAmount.toFixed(2) };
                      });
                      setForm({ ...form, isGstBill, lines });
                    } else {
                      setForm({ ...form, isGstBill });
                    }
                  }}
                  className="mr-2 h-4 w-4"
                />
                Is this a GST bill?
              </label>
            </div>
          </div>

          {/* Line Items with quick-add search */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Items *</label>
            </div>
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1 mb-1">
              <span className="col-span-12 sm:col-span-3">Item (search or add new)</span>
              <span className="col-span-6 sm:col-span-2">Qty</span>
              <span className="col-span-6 sm:col-span-1">Unit</span>
              <span className="col-span-6 sm:col-span-2">Rate (₹)</span>
              {form.isGstBill && <span className="col-span-6 sm:col-span-1">GST %</span>}
              <span className="col-span-6 sm:col-span-2">Total (₹)</span>
              <span className="hidden sm:block sm:col-span-1"></span>
            </div>
            {form.lines.map((line: any, idx: number) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center mb-2">
                <div className="col-span-12 sm:col-span-3">
                  {/* Smart search input with quick-add */}
                  <ItemSearchCell
                    value={line.item}
                    onChange={(id, unit) => handleItemSelect(idx, id, unit)}
                    items={items}
                    onQuickAdd={(name) => handleQuickAdd(idx, name)}
                  />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <input type="number" step="0.1" className="input text-xs py-1 sm:py-1.5" value={line.quantity || ''} onChange={e => updateLine(idx, 'quantity', +e.target.value)} placeholder="Qty" />
                </div>
                <div className="col-span-6 sm:col-span-1">
                  {line.item ? (
                    <input
                      className="input text-xs py-1 sm:py-1.5 bg-gray-100 dark:bg-gray-900"
                      value={getInventoryUnit(line.item)}
                      disabled
                    />
                  ) : (
                    <select className="input text-xs py-1 sm:py-1.5" value={line.unit} onChange={e => updateLine(idx, 'unit', e.target.value)}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  )}
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <input type="number" className="input text-xs py-1 sm:py-1.5" value={line.pricePerUnit || ''} onChange={e => updateLine(idx, 'pricePerUnit', +e.target.value)} placeholder="₹/unit" />
                </div>
                {form.isGstBill && (
                  <div className="col-span-6 sm:col-span-1">
                    <input type="number" min={0} step="0.1" className="input text-xs py-1 sm:py-1.5" value={line.gstPercent || 0} onChange={e => updateLine(idx, 'gstPercent', +e.target.value)} placeholder="GST" />
                  </div>
                )}
                <div className="col-span-6 sm:col-span-2">
                  <input type="number" className="input text-xs py-1 sm:py-1.5 font-medium" value={line.totalPrice || ''} onChange={e => updateLine(idx, 'totalPrice', +e.target.value)} placeholder="₹ total" />
                  {form.isGstBill && <p className="text-[11px] text-gray-400 mt-1">GST ₹{formatCurrency(line.gstAmount || 0)}</p>}
                </div>
                <div className="col-span-12 sm:col-span-1 flex justify-end">
                  {form.lines.length > 1 && <button onClick={() => removeLine(idx)} className="p-1 text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
            ))}
            <button onClick={addLine} className="mt-1 mb-2 text-xs text-brand-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Add Item</button>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>{formatCurrency(subTotal)}</span>
              </div>
              {form.isGstBill && (
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Purchase GST</span>
                  <span>{formatCurrency(purchaseGstTotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-2 font-semibold text-gray-900 dark:text-gray-100">
                <span>Total</span>
                <span>{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Payment section */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Paid From Account</label>
              <select className="input" value={form.paidFrom} onChange={e => handleAccountChange(e.target.value)}>
                <option value="">Select account (or leave blank for Due)</option>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.name} ({formatCurrency(a.currentBalance)})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Payment Mode</label>
              <PaymentModeSelect
                value={form.paymentMode}
                onChange={mode => { setForm({...form, paymentMode: mode}); }}
                allowedModes={allowedModes.length > 0 ? allowedModes : modesWithDue}
              />
              {form.paymentMode === 'due' && (
                <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Will appear in liabilities. Clear due when you pay.
                </p>
              )}
            </div>
          </div>

          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>

          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button onClick={submit} disabled={saving} className="btn-primary flex-1 py-2.5 disabled:opacity-60">
              {saving ? 'Saving...' : editingPurchase ? `Save Changes · ${formatCurrency(grandTotal)}` : `Save Purchase · ${formatCurrency(grandTotal)}`}
              {form.paymentMode === 'due' && !saving && ' (Due)'}
            </button>
            <button onClick={() => { setModal(false); setEditingPurchase(null); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Validation Error Modal ─────────────────────────────────── */}
      <Modal open={errorModalOpen} onClose={() => setErrorModalOpen(false)} title="Please fix purchase details" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">The purchase could not be saved because of the following issue(s):</p>
          <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 space-y-1">
            {formErrors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
          <div className="text-right">
            <button onClick={() => setErrorModalOpen(false)} className="btn-primary">Okay</button>
          </div>
        </div>
      </Modal>

      {/* ── Quick-Add Item Modal ─────────────────────────────────────── */}
      <Modal open={quickAddModal} onClose={() => setQuickAddModal(false)} title={`Add New Item — "${quickAddName}"`} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-gray-400">This item will be saved to inventory and added to this purchase line.</p>
          <div><label className="label">Item Name *</label><input className="input" value={quickAddForm.name} onChange={e => setQuickAddForm({...quickAddForm, name: e.target.value})} /></div>
          <div><label className="label">Category *</label>
            <select className="input" value={quickAddForm.category} onChange={e => setQuickAddForm({...quickAddForm, category: e.target.value})}>
              <option value="">Select Category</option>
              {categories.map(c => <option key={c._id} value={c._id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Unit *</label>
              <select className="input" value={quickAddForm.unit} onChange={e => setQuickAddForm({...quickAddForm, unit: e.target.value})}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div><label className="label">Approx. Price (₹)</label>
              <input type="number" className="input" value={quickAddForm.lastPurchasePrice || ''} onChange={e => setQuickAddForm({...quickAddForm, lastPurchasePrice: +e.target.value})} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveQuickAdd} className="btn-primary flex-1">Add to Inventory & Use</button>
            <button onClick={() => setQuickAddModal(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Clear Due Modal ──────────────────────────────────────────── */}
      <Modal open={!!clearDueModal} onClose={() => setClearDueModal(null)} title="Clear Due Payment" size="sm">
        {clearDueModal && (
          <div className="space-y-4">
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-xs text-yellow-600 font-medium">Due Amount</p>
              <p className="text-2xl font-bold text-yellow-700">{formatCurrency(clearDueModal.totalAmount)}</p>
              <p className="text-xs text-yellow-500">{clearDueModal.supplier?.name}</p>
            </div>
            <div><label className="label">Pay From Account *</label>
              <select className="input" value={clearDueForm.paidFrom} onChange={e => setClearDueForm({...clearDueForm, paidFrom: e.target.value})}>
                <option value="">Select Account</option>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.name} ({formatCurrency(a.currentBalance)})</option>)}
              </select>
            </div>
            <div><label className="label">Payment Mode</label>
              <select className="input" value={clearDueForm.paymentMode} onChange={e => setClearDueForm({...clearDueForm, paymentMode: e.target.value})}>
                {ALL_PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div><label className="label">Date</label><input type="date" className="input" value={clearDueForm.date} onChange={e => setClearDueForm({...clearDueForm, date: e.target.value})} /></div>
            <div className="flex gap-3 pt-2">
              <button onClick={clearDue} className="btn-primary flex-1">Clear Due · {formatCurrency(clearDueModal.totalAmount)}</button>
              <button onClick={() => setClearDueModal(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Detail Modal ─────────────────────────────────────────────── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Purchase Details${detail?.createdBy?.name ? ` (entered by ${detail.createdBy.name})` : ''}`} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-400">Date:</span> <span className="font-medium">{formatDate(detail.date)}</span></div>
              <div><span className="text-gray-400">Supplier:</span> <span className="font-medium">{detail.supplier?.name}</span></div>
              <div><span className="text-gray-400">Paid From:</span> <span className="font-medium">{detail.paidFrom?.name || 'Not paid yet'}</span></div>
              <div><span className="text-gray-400">Mode:</span> <span className="font-medium">{getLabelForMode(detail.paymentMode)}</span></div>
              <div><span className="text-gray-400">Status:</span> <span className={detail.isPaid ? 'badge-green' : 'badge-yellow'}>{detail.isPaid ? 'Paid' : 'Due'}</span></div>
              {detail.createdBy?.name && (
                <div><span className="text-gray-400">Entered by:</span> <span className="font-medium text-brand-600">{detail.createdBy.name}</span></div>
              )}
            </div>
            <table className="w-full text-sm border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="table-th">Item</th><th className="table-th">Qty</th><th className="table-th">Rate</th><th className="table-th">GST</th><th className="table-th">Total</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {detail.items?.map((i: any, idx: number) => (
                  <tr key={idx}><td className="table-td">{i.item?.name || 'Unknown'}</td><td className="table-td">{i.quantity} {i.unit}</td><td className="table-td">{formatCurrency(i.pricePerUnit)}</td><td className="table-td">{formatCurrency(i.gstAmount || 0)}{i.gstPercent ? ` (${i.gstPercent}%)` : ''}</td><td className="table-td font-medium">{formatCurrency(i.totalPrice)}</td></tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-800"><tr><td colSpan={4} className="table-td font-semibold">Purchase GST</td><td className="table-td font-semibold text-brand-600">{formatCurrency(detail.items?.reduce((s: number, i: any) => s + (i.gstAmount || 0), 0))}</td></tr><tr><td colSpan={4} className="table-td font-semibold">Total</td><td className="table-td font-bold text-brand-600">{formatCurrency(detail.totalAmount)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
