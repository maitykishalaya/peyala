'use client';
import { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { menuApi, MenuCategory, MenuItem } from '@/lib/pos-api';
import { formatCurrency, cn } from '@/lib/utils';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Search, FolderPlus,
  UtensilsCrossed, Check, X, AlertCircle
} from 'lucide-react';

export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'non-veg'>('all');

  // Item Modal state
  const [itemModal, setItemModal] = useState<'create' | 'edit' | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    category: '',
    price: 0,
    isVeg: true,
    taxPercent: 5,
    description: '',
    isAvailable: true,
  });

  // Category Management Modal state
  const [categoryModal, setCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    sortOrder: 0,
    isActive: true,
  });
  const [categoryError, setCategoryError] = useState('');

  // Load data
  const loadData = async () => {
    try {
      setLoading(true);
      const [catRes, itemRes] = await Promise.all([
        menuApi.listCategories({ includeInactive: true }),
        menuApi.listItems(),
      ]);
      setCategories(catRes.data);
      setItems(itemRes.data);
    } catch (err: any) {
      console.error('Failed to load menu data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all') {
        const catId = typeof item.category === 'object' && item.category !== null
          ? item.category._id
          : item.category;
        if (catId !== selectedCategory) return false;
      }

      // Veg filter
      if (vegFilter === 'veg' && !item.isVeg) return false;
      if (vegFilter === 'non-veg' && item.isVeg) return false;

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      return true;
    });
  }, [items, selectedCategory, vegFilter, search]);

  // Open item create
  const openCreateItem = () => {
    setEditingItem(null);
    setItemForm({
      name: '',
      category: categories[0]?._id || '',
      price: 0,
      isVeg: true,
      taxPercent: 5,
      description: '',
      isAvailable: true,
    });
    setItemModal('create');
  };

  // Open item edit
  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    const catId = typeof item.category === 'object' && item.category !== null
      ? item.category._id
      : (item.category as string);
    setItemForm({
      name: item.name,
      category: catId || '',
      price: item.price,
      isVeg: item.isVeg,
      taxPercent: item.taxPercent !== undefined ? item.taxPercent : 5,
      description: item.description || '',
      isAvailable: item.isAvailable,
    });
    setItemModal('edit');
  };

  // Save item
  const saveItem = async () => {
    if (!itemForm.name.trim()) return alert('Item name is required');
    if (!itemForm.category) return alert('Category is required');
    if (itemForm.price < 0) return alert('Price cannot be negative');

    try {
      if (itemModal === 'edit' && editingItem) {
        await menuApi.updateItem(editingItem._id, itemForm);
      } else {
        await menuApi.createItem(itemForm);
      }
      setItemModal(null);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save menu item');
    }
  };

  // Toggle availability (86 item)
  const toggleAvailability = async (item: MenuItem) => {
    try {
      await menuApi.toggleAvailability(item._id);
      setItems((prev) =>
        prev.map((i) => (i._id === item._id ? { ...i, isAvailable: !i.isAvailable } : i))
      );
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to toggle availability');
    }
  };

  // Delete item
  const deleteItem = async (item: MenuItem) => {
    if (!confirm(`Delete "${item.name}" from menu?`)) return;
    try {
      await menuApi.deleteItem(item._id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete item');
    }
  };

  // Save category
  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      setCategoryError('Category name is required');
      return;
    }
    setCategoryError('');

    try {
      if (editingCategory) {
        await menuApi.updateCategory(editingCategory._id, categoryForm);
      } else {
        await menuApi.createCategory(categoryForm);
      }
      setCategoryForm({ name: '', description: '', sortOrder: 0, isActive: true });
      setEditingCategory(null);
      await loadData();
    } catch (err: any) {
      setCategoryError(err.response?.data?.message || 'Failed to save category');
    }
  };

  // Delete category
  const deleteCategory = async (cat: MenuCategory) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    setCategoryError('');
    try {
      await menuApi.deleteCategory(cat._id);
      if (selectedCategory === cat._id) setSelectedCategory('all');
      await loadData();
    } catch (err: any) {
      setCategoryError(err.response?.data?.message || 'Failed to delete category');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-brand-500" />
              Menu Management
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {items.length} items across {categories.length} categories · Dine-in POS
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                setCategoryForm({ name: '', description: '', sortOrder: categories.length, isActive: true });
                setEditingCategory(null);
                setCategoryError('');
                setCategoryModal(true);
              }}
              className="btn-secondary flex items-center justify-center gap-1.5 w-full sm:w-auto"
            >
              <FolderPlus className="w-4 h-4" />
              Manage Categories
            </button>
            <button
              onClick={openCreateItem}
              className="btn-primary flex items-center justify-center gap-1.5 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Add Menu Item
            </button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Search */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu items..."
                className="input pl-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Veg / Non-Veg Pills */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg self-start md:self-auto">
              <button
                onClick={() => setVegFilter('all')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  vegFilter === 'all'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                )}
              >
                All ({items.length})
              </button>
              <button
                onClick={() => setVegFilter('veg')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5',
                  vegFilter === 'veg'
                    ? 'bg-white dark:bg-gray-900 text-green-600 dark:text-green-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                )}
              >
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Veg ({items.filter((i) => i.isVeg).length})
              </button>
              <button
                onClick={() => setVegFilter('non-veg')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5',
                  vegFilter === 'non-veg'
                    ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                )}
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Non-Veg ({items.filter((i) => !i.isVeg).length})
              </button>
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                selectedCategory === 'all'
                  ? 'bg-brand-500 text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:border-gray-300'
              )}
            >
              All Categories
            </button>
            {categories.map((cat) => {
              const catItemCount = items.filter((i) => {
                const catId = typeof i.category === 'object' && i.category !== null ? i.category._id : i.category;
                return catId === cat._id;
              }).length;

              return (
                <button
                  key={cat._id}
                  onClick={() => setSelectedCategory(cat._id)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 flex-shrink-0',
                    selectedCategory === cat._id
                      ? 'bg-brand-500 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:border-gray-300',
                    !cat.isActive && 'opacity-60 line-through'
                  )}
                >
                  {cat.name}
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.2 rounded-full',
                      selectedCategory === cat._id
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    )}
                  >
                    {catItemCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Item Cards Grid */}
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="card p-12 text-center">
            <UtensilsCrossed className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-base">No menu items found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {search || selectedCategory !== 'all' || vegFilter !== 'all'
                ? 'Try adjusting your search or category filters.'
                : 'Get started by creating categories and adding your first menu items.'}
            </p>
            {categories.length > 0 && (
              <button onClick={openCreateItem} className="btn-primary mt-4 inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item) => {
              const catName = typeof item.category === 'object' && item.category !== null
                ? item.category.name
                : 'Uncategorized';

              return (
                <div
                  key={item._id}
                  className={cn(
                    'card p-4 flex flex-col justify-between transition-all duration-200 border',
                    item.isAvailable
                      ? 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700'
                      : 'opacity-70 bg-gray-50/70 dark:bg-gray-900/40 border-dashed border-gray-300 dark:border-gray-700'
                  )}
                >
                  <div>
                    {/* Top Row: Indicators & Actions */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Indian Veg / Non-Veg Icon */}
                        <span
                          className={cn(
                            'inline-flex items-center justify-center w-4 h-4 border rounded-sm p-0.5',
                            item.isVeg
                              ? 'border-green-600 bg-white dark:bg-gray-900'
                              : 'border-red-600 bg-white dark:bg-gray-900'
                          )}
                          title={item.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                        >
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full',
                              item.isVeg ? 'bg-green-600' : 'bg-red-600'
                            )}
                          />
                        </span>

                        {/* Category Badge */}
                        <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[11px]">
                          {catName}
                        </span>

                        {!item.isAvailable && (
                          <span className="badge-red text-[10px]">
                            86&apos;d (Unavailable)
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Toggle Availability */}
                        <button
                          onClick={() => toggleAvailability(item)}
                          className={cn(
                            'p-1.5 rounded transition-colors',
                            item.isAvailable
                              ? 'text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                              : 'text-amber-600 bg-amber-50 dark:bg-amber-950/30'
                          )}
                          title={item.isAvailable ? 'Mark unavailable (86)' : 'Mark available'}
                        >
                          {item.isAvailable ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {/* Edit */}
                        <button
                          onClick={() => openEditItem(item)}
                          className="p-1.5 text-gray-400 hover:text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                          title="Edit Item"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => deleteItem(item)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Item Name */}
                    <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-snug">
                      {item.name}
                    </h3>

                    {/* Description */}
                    {item.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Bottom Row: Price and Tax */}
                  <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-800 flex items-baseline justify-between">
                    <div>
                      <span className="text-base font-bold text-gray-900 dark:text-white">
                        {formatCurrency(item.price)}
                      </span>
                      <span className="text-[11px] text-gray-400 ml-1.5">
                        +{item.taxPercent || 0}% GST
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-gray-500">
                      Total: {formatCurrency(item.price * (1 + (item.taxPercent || 0) / 100))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* Create / Edit MenuItem Modal */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={itemModal === 'create' || itemModal === 'edit'}
        onClose={() => setItemModal(null)}
        title={itemModal === 'create' ? 'Add Menu Item' : 'Edit Menu Item'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Item Name *</label>
            <input
              type="text"
              className="input"
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              placeholder="e.g. Masala Chai, Chicken Sandwich"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Category *</label>
              <select
                className="input"
                value={itemForm.category}
                onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
              >
                {categories.length === 0 && <option value="">No categories available</option>}
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name} {!cat.isActive ? '(Inactive)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Food Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setItemForm({ ...itemForm, isVeg: true })}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors',
                    itemForm.isVeg
                      ? 'border-green-600 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500'
                  )}
                >
                  <span className="w-2 h-2 rounded-full bg-green-600" />
                  Veg
                </button>
                <button
                  type="button"
                  onClick={() => setItemForm({ ...itemForm, isVeg: false })}
                  className={cn(
                    'flex-1 py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors',
                    !itemForm.isVeg
                      ? 'border-red-600 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500'
                  )}
                >
                  <span className="w-2 h-2 rounded-full bg-red-600" />
                  Non-Veg
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Price (₹) *</label>
              <input
                type="number"
                min="0"
                step="any"
                className="input"
                value={itemForm.price}
                onChange={(e) => setItemForm({ ...itemForm, price: Math.max(0, +e.target.value) })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="label">Tax / GST %</label>
              <input
                type="number"
                min="0"
                step="any"
                className="input"
                value={itemForm.taxPercent}
                onChange={(e) => setItemForm({ ...itemForm, taxPercent: Math.max(0, +e.target.value) })}
                placeholder="5"
              />
            </div>
          </div>

          <div>
            <label className="label">Description / Ingredients (optional)</label>
            <textarea
              className="input"
              rows={2}
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              placeholder="Short description of taste or portions"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isAvailable"
              checked={itemForm.isAvailable}
              onChange={(e) => setItemForm({ ...itemForm, isAvailable: e.target.checked })}
              className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500"
            />
            <label htmlFor="isAvailable" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              Available for Ordering (uncheck to 86 this item)
            </label>
          </div>

          <div className="flex gap-3 pt-3">
            <button onClick={saveItem} className="btn-primary flex-1">
              {itemModal === 'create' ? 'Save Item' : 'Update Item'}
            </button>
            <button onClick={() => setItemModal(null)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ───────────────────────────────────────────────────────── */}
      {/* Category Management Modal */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={categoryModal}
        onClose={() => {
          setCategoryModal(false);
          setEditingCategory(null);
          setCategoryError('');
        }}
        title="Manage Menu Categories"
        size="lg"
      >
        <div className="space-y-6">
          {categoryError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{categoryError}</span>
            </div>
          )}

          {/* Form to add or edit category */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-3 border border-gray-200 dark:border-gray-800">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {editingCategory ? `Edit Category: ${editingCategory.name}` : 'Add New Category'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Category Name *</label>
                <input
                  type="text"
                  className="input"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="e.g. Starters, Beverages, Desserts"
                />
              </div>
              <div>
                <label className="label">Sort Order</label>
                <input
                  type="number"
                  className="input"
                  value={categoryForm.sortOrder}
                  onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: +e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <input
                type="text"
                className="input"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Optional short note"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={categoryForm.isActive}
                  onChange={(e) => setCategoryForm({ ...categoryForm, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500"
                />
                Active Category
              </label>
              <div className="flex gap-2">
                {editingCategory && (
                  <button
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryForm({ name: '', description: '', sortOrder: categories.length, isActive: true });
                    }}
                    className="btn-secondary text-xs py-1.5"
                  >
                    Cancel
                  </button>
                )}
                <button onClick={saveCategory} className="btn-primary text-xs py-1.5 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {editingCategory ? 'Update' : 'Add Category'}
                </button>
              </div>
            </div>
          </div>

          {/* Existing Categories Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Existing Categories</h4>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              {categories.map((cat) => {
                const count = items.filter((i) => {
                  const catId = typeof i.category === 'object' && i.category !== null ? i.category._id : i.category;
                  return catId === cat._id;
                }).length;

                return (
                  <div
                    key={cat._id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-white">{cat.name}</span>
                        {!cat.isActive && <span className="badge-red text-[10px]">Inactive</span>}
                        <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px]">
                          {count} item{count === 1 ? '' : 's'}
                        </span>
                      </div>
                      {cat.description && <p className="text-xs text-gray-400 mt-0.5">{cat.description}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Order: {cat.sortOrder}</span>
                      <button
                        onClick={() => {
                          setEditingCategory(cat);
                          setCategoryForm({
                            name: cat.name,
                            description: cat.description || '',
                            sortOrder: cat.sortOrder,
                            isActive: cat.isActive,
                          });
                        }}
                        className="p-1.5 text-gray-400 hover:text-brand-500 rounded"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteCategory(cat)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
