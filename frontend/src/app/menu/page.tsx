'use client';
import { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { menuApi, addonsApi, MenuCategory, MenuItem, Addon, MenuItemVariant } from '@/lib/pos-api';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Search, FolderPlus,
  UtensilsCrossed, Check, X, AlertCircle, Sparkles, Layers
} from 'lucide-react';

export default function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'non-veg'>('all');

  // Loading states for buttons
  const [itemSaving, setItemSaving] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [addonSaving, setAddonSaving] = useState(false);

  // Item Modal state
  const [itemModal, setItemModal] = useState<'create' | 'edit' | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState<{
    name: string;
    category: string;
    price: number;
    isVeg: boolean;
    taxPercent: number;
    description: string;
    isAvailable: boolean;
    hasVariants: boolean;
    variants: Array<{ name: string; price: number; isVeg?: boolean }>;
    addons: string[];
  }>({
    name: '',
    category: '',
    price: 0,
    isVeg: true,
    taxPercent: 5,
    description: '',
    isAvailable: true,
    hasVariants: false,
    variants: [],
    addons: [],
  });

  // Category Management Modal state
  const [categoryModal, setCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<{
    name: string;
    description: string;
    sortOrder: number;
    isActive: boolean;
    defaultAddons: string[];
  }>({
    name: '',
    description: '',
    sortOrder: 0,
    isActive: true,
    defaultAddons: [],
  });
  const [categoryError, setCategoryError] = useState('');

  // Add-on Management Modal state
  const [addonModal, setAddonModal] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [addonForm, setAddonForm] = useState<{
    name: string;
    price: number;
    isVeg: boolean;
    isActive: boolean;
    sortOrder: number;
  }>({
    name: '',
    price: 0,
    isVeg: true,
    isActive: true,
    sortOrder: 0,
  });
  const [addonError, setAddonError] = useState('');

  // Load data
  const loadData = async () => {
    try {
      setLoading(true);
      const [catRes, itemRes, addonRes] = await Promise.all([
        menuApi.listCategories({ includeInactive: true }),
        menuApi.listItems(),
        addonsApi.list(),
      ]);
      setCategories(catRes.data);
      setItems(itemRes.data);
      setAddons(addonRes.data);
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
      hasVariants: false,
      variants: [
        { name: 'Half Plate', price: 0 },
        { name: 'Full Plate', price: 0 },
      ],
      addons: [],
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
      hasVariants: Boolean(item.hasVariants),
      variants: item.variants && item.variants.length > 0
        ? item.variants.map((v) => ({ name: v.name, price: v.price, isVeg: v.isVeg }))
        : [
            { name: 'Half Plate', price: item.price },
            { name: 'Full Plate', price: item.price },
          ],
      addons: (item.addons || []).map((a) => (typeof a === 'object' && a !== null ? (a as any)._id : a)),
    });
    setItemModal('edit');
  };

  // Save item
  const saveItem = async () => {
    if (!itemForm.name.trim()) {
      toast.error('Item name is required');
      return;
    }
    if (!itemForm.category) {
      toast.error('Please select a menu category');
      return;
    }
    if (!itemForm.hasVariants && itemForm.price < 0) {
      toast.error('Price cannot be negative');
      return;
    }

    if (itemForm.hasVariants) {
      if (itemForm.variants.length === 0) {
        toast.error('Please add at least one portion variant or disable variants');
        return;
      }
      for (const v of itemForm.variants) {
        if (!v.name.trim()) {
          toast.error('All portion variants must have a name (e.g. Half Plate)');
          return;
        }
        if (v.price < 0) {
          toast.error('Variant price cannot be negative');
          return;
        }
      }
    }

    setItemSaving(true);
    try {
      const payload = {
        ...itemForm,
        // If item has variants, set base price to the first variant's price
        price: itemForm.hasVariants && itemForm.variants.length > 0 ? itemForm.variants[0].price : itemForm.price,
      };

      if (itemModal === 'edit' && editingItem) {
        await menuApi.updateItem(editingItem._id, payload);
        toast.success(`Item "${itemForm.name}" updated successfully!`);
      } else {
        await menuApi.createItem(payload);
        toast.success(`Item "${itemForm.name}" created successfully!`);
      }
      setItemModal(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save menu item');
    } finally {
      setItemSaving(false);
    }
  };

  // Toggle availability (86 item)
  const toggleAvailability = async (item: MenuItem) => {
    try {
      await menuApi.toggleAvailability(item._id);
      const nextState = !item.isAvailable;
      setItems((prev) =>
        prev.map((i) => (i._id === item._id ? { ...i, isAvailable: nextState } : i))
      );
      if (nextState) {
        toast.success(`"${item.name}" is now Available for ordering`);
      } else {
        toast.warning(`"${item.name}" marked Out of Stock (86'd)`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to toggle availability');
    }
  };

  // Delete item
  const deleteItem = async (item: MenuItem) => {
    if (!confirm(`Delete "${item.name}" from menu?`)) return;
    try {
      await menuApi.deleteItem(item._id);
      toast.success(`"${item.name}" deleted from menu`);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete item');
    }
  };

  // Save category
  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      setCategoryError('Category name is required');
      toast.error('Category name is required');
      return;
    }
    setCategoryError('');
    setCategorySaving(true);

    try {
      if (editingCategory) {
        await menuApi.updateCategory(editingCategory._id, categoryForm);
        toast.success(`Category "${categoryForm.name}" updated successfully!`);
      } else {
        await menuApi.createCategory(categoryForm);
        toast.success(`Category "${categoryForm.name}" created successfully!`);
      }
      setCategoryForm({ name: '', description: '', sortOrder: 0, isActive: true, defaultAddons: [] });
      setEditingCategory(null);
      await loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save category';
      setCategoryError(msg);
      toast.error(msg);
    } finally {
      setCategorySaving(false);
    }
  };

  // Delete category
  const deleteCategory = async (cat: MenuCategory) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    setCategoryError('');
    try {
      await menuApi.deleteCategory(cat._id);
      toast.success(`Category "${cat.name}" deleted`);
      if (selectedCategory === cat._id) setSelectedCategory('all');
      await loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to delete category';
      setCategoryError(msg);
      toast.error(msg);
    }
  };

  // Save Add-on
  const saveAddon = async () => {
    if (!addonForm.name.trim()) {
      setAddonError('Add-on name is required');
      toast.error('Add-on name is required');
      return;
    }
    if (addonForm.price < 0) {
      setAddonError('Price cannot be negative');
      toast.error('Price cannot be negative');
      return;
    }
    setAddonError('');
    setAddonSaving(true);

    try {
      if (editingAddon) {
        await addonsApi.update(editingAddon._id, addonForm);
        toast.success(`Add-on "${addonForm.name}" updated successfully!`);
      } else {
        await addonsApi.create(addonForm);
        toast.success(`Add-on "${addonForm.name}" created successfully!`);
      }
      setAddonForm({ name: '', price: 0, isVeg: true, isActive: true, sortOrder: 0 });
      setEditingAddon(null);
      await loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save add-on';
      setAddonError(msg);
      toast.error(msg);
    } finally {
      setAddonSaving(false);
    }
  };

  // Delete Add-on
  const deleteAddon = async (addon: Addon) => {
    if (!confirm(`Delete add-on "${addon.name}"?`)) return;
    setAddonError('');
    try {
      await addonsApi.delete(addon._id);
      toast.success(`Add-on "${addon.name}" deleted`);
      await loadData();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to delete add-on';
      setAddonError(msg);
      toast.error(msg);
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
              {items.length} items across {categories.length} categories · {addons.length} add-on{addons.length === 1 ? '' : 's'} · Dine-in POS
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                setAddonForm({ name: '', price: 0, isVeg: true, isActive: true, sortOrder: addons.length });
                setEditingAddon(null);
                setAddonError('');
                setAddonModal(true);
              }}
              className="btn-secondary flex items-center justify-center gap-1.5 w-full sm:w-auto text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/40 hover:bg-amber-50 dark:hover:bg-amber-950/20"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              Manage Add-ons ({addons.length})
            </button>
            <button
              onClick={() => {
                setCategoryForm({ name: '', description: '', sortOrder: categories.length, isActive: true, defaultAddons: [] });
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

                    {/* Portion Variants Badges */}
                    {item.hasVariants && item.variants && item.variants.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.variants.map((v, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-semibold px-2 py-0.5 rounded border border-brand-200 dark:border-brand-900/50"
                          >
                            {v.name}: {formatCurrency(v.price)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Assigned Addons Indicator */}
                    {item.addons && item.addons.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <span className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-900/40">
                          +{item.addons.length} Add-on{item.addons.length === 1 ? '' : 's'} assigned
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Price and Tax */}
                  <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-800 flex items-baseline justify-between">
                    <div>
                      <span className="text-base font-bold text-gray-900 dark:text-white">
                        {item.hasVariants && item.variants && item.variants.length > 0
                          ? `From ${formatCurrency(Math.min(...item.variants.map((v) => v.price)))}`
                          : formatCurrency(item.price)}
                      </span>
                      <span className="text-[11px] text-gray-400 ml-1.5">
                        +{item.taxPercent || 0}% GST
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-gray-500">
                      {item.hasVariants
                        ? `${item.variants?.length || 0} portions`
                        : `Total: ${formatCurrency(item.price * (1 + (item.taxPercent || 0) / 100))}`}
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
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Item Name *</label>
            <input
              type="text"
              className="input"
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              placeholder="e.g. Masala Chai, Chicken Sandwich, Hakka Noodles"
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

          {/* Pricing & Tax Section */}
          <div className="p-3.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemForm.hasVariants}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setItemForm({
                      ...itemForm,
                      hasVariants: checked,
                      variants: checked && itemForm.variants.length === 0
                        ? [
                            { name: 'Half Plate', price: itemForm.price || 100 },
                            { name: 'Full Plate', price: (itemForm.price || 100) * 1.8 },
                          ]
                        : itemForm.variants,
                    });
                  }}
                  className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-brand-500" />
                  Enable Portion Variants (e.g. Half / Full Plate, Regular / Large)
                </span>
              </label>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Tax / GST:</label>
                <div className="w-20">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="input text-xs py-1"
                    value={itemForm.taxPercent}
                    onChange={(e) => setItemForm({ ...itemForm, taxPercent: Math.max(0, +e.target.value) })}
                    placeholder="5%"
                  />
                </div>
              </div>
            </div>

            {/* If Single Price */}
            {!itemForm.hasVariants ? (
              <div>
                <label className="label text-xs font-semibold">Standard Price (₹) *</label>
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
            ) : (
              /* If Portion Variants */
              <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700/60">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Portion Options & Pricing
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setItemForm({
                        ...itemForm,
                        variants: [...itemForm.variants, { name: '', price: 0 }],
                      });
                    }}
                    className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Portion Row
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {itemForm.variants.map((variant, index) => (
                    <div key={index} className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-200 dark:border-gray-800">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={variant.name}
                          onChange={(e) => {
                            const newVariants = [...itemForm.variants];
                            newVariants[index].name = e.target.value;
                            setItemForm({ ...itemForm, variants: newVariants });
                          }}
                          placeholder="e.g. Half Plate, Full Plate, Large"
                          className="input text-xs py-1.5"
                        />
                      </div>
                      <div className="w-28 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={variant.price}
                          onChange={(e) => {
                            const newVariants = [...itemForm.variants];
                            newVariants[index].price = Math.max(0, +e.target.value);
                            setItemForm({ ...itemForm, variants: newVariants });
                          }}
                          placeholder="0"
                          className="input pl-5 text-xs py-1.5"
                        />
                      </div>
                      {itemForm.variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newVariants = itemForm.variants.filter((_, i) => i !== index);
                            setItemForm({ ...itemForm, variants: newVariants });
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                          title="Remove Variant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add-ons Assignment Section */}
          <div className="p-3.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Applicable Add-ons / Extras
                </label>
                <p className="text-[11px] text-gray-500">
                  Allow cashiers and guests to select these add-ons when ordering this item.
                </p>
              </div>
              {itemForm.addons.length > 0 && (
                <button
                  type="button"
                  onClick={() => setItemForm({ ...itemForm, addons: [] })}
                  className="text-[11px] text-gray-400 hover:text-red-500"
                >
                  Clear all
                </button>
              )}
            </div>

            {(() => {
              const currentCat = categories.find((c) => c._id === itemForm.category);
              const catDefaultIds = (currentCat?.defaultAddons || []).map((a: any) =>
                typeof a === 'object' && a !== null ? a._id : a
              );

              return (
                <div className="space-y-2 pt-1">
                  {catDefaultIds.length > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-900/40">
                      💡 Note: <strong>{currentCat?.name}</strong> category already provides {catDefaultIds.length} default add-on(s) automatically.
                    </p>
                  )}

                  {addons.length === 0 ? (
                    <div className="text-xs text-gray-400 py-2 italic text-center">
                      No add-ons created yet. Click &quot;Manage Add-ons&quot; in the menu bar to create add-ons like Cheese, Dips, or Extra Sauces.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                      {addons.map((addon) => {
                        const isChecked = itemForm.addons.includes(addon._id);
                        const isCatDefault = catDefaultIds.includes(addon._id);

                        return (
                          <label
                            key={addon._id}
                            className={cn(
                              'flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all text-xs',
                              isChecked || isCatDefault
                                ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/20'
                                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked || isCatDefault}
                                disabled={isCatDefault}
                                onChange={(e) => {
                                  if (isCatDefault) return;
                                  if (e.target.checked) {
                                    setItemForm({ ...itemForm, addons: [...itemForm.addons, addon._id] });
                                  } else {
                                    setItemForm({ ...itemForm, addons: itemForm.addons.filter((id) => id !== addon._id) });
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500"
                              />
                              <span className="font-medium text-gray-800 dark:text-gray-200">
                                {addon.name}
                              </span>
                              {isCatDefault && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                                  (Category default)
                                </span>
                              )}
                            </div>
                            <span className="font-bold text-gray-700 dark:text-gray-300">
                              +{formatCurrency(addon.price)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div>
            <label className="label">Description / Ingredients (optional)</label>
            <textarea
              className="input text-xs"
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
            <button
              onClick={saveItem}
              disabled={itemSaving}
              className="btn-primary flex-1 py-2.5 disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {itemSaving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {itemSaving ? 'Saving Item...' : itemModal === 'create' ? 'Save Item' : 'Update Item'}
            </button>
            <button onClick={() => setItemModal(null)} disabled={itemSaving} className="btn-secondary">
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

            {/* Category Default Add-ons */}
            <div>
              <label className="label text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Default Category Add-ons (Offered for all items under this category)
              </label>
              {addons.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No add-ons created yet. Create add-ons first using Manage Add-ons.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1 pt-1">
                  {addons.map((addon) => {
                    const isChecked = categoryForm.defaultAddons.includes(addon._id);
                    return (
                      <label
                        key={addon._id}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-lg border cursor-pointer text-xs transition-all',
                          isChecked ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : 'border-gray-200 dark:border-gray-800'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCategoryForm({ ...categoryForm, defaultAddons: [...categoryForm.defaultAddons, addon._id] });
                              } else {
                                setCategoryForm({ ...categoryForm, defaultAddons: categoryForm.defaultAddons.filter((id) => id !== addon._id) });
                              }
                            }}
                            className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500"
                          />
                          <span className="font-medium text-gray-800 dark:text-gray-200">{addon.name}</span>
                        </div>
                        <span className="font-bold text-gray-600 dark:text-gray-300">+{formatCurrency(addon.price)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
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
                      setCategoryForm({ name: '', description: '', sortOrder: categories.length, isActive: true, defaultAddons: [] });
                    }}
                    className="btn-secondary text-xs py-1.5"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={saveCategory}
                  disabled={categorySaving}
                  className="btn-primary text-xs py-1.5 flex items-center gap-1 disabled:opacity-60"
                >
                  {categorySaving ? (
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {categorySaving ? 'Saving...' : editingCategory ? 'Update' : 'Add Category'}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 dark:text-white">{cat.name}</span>
                        {!cat.isActive && <span className="badge-red text-[10px]">Inactive</span>}
                        <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px]">
                          {count} item{count === 1 ? '' : 's'}
                        </span>
                        {cat.defaultAddons && cat.defaultAddons.length > 0 && (
                          <span className="badge bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-[10px] border border-amber-200 dark:border-amber-900/40">
                            {cat.defaultAddons.length} Default Add-on{cat.defaultAddons.length === 1 ? '' : 's'}
                          </span>
                        )}
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
                            defaultAddons: (cat.defaultAddons || []).map((a: any) =>
                              typeof a === 'object' && a !== null ? a._id : a
                            ),
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

      {/* ───────────────────────────────────────────────────────── */}
      {/* Add-on Management Modal */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={addonModal}
        onClose={() => {
          setAddonModal(false);
          setEditingAddon(null);
          setAddonError('');
        }}
        title="Manage Add-ons & Extras"
        size="lg"
      >
        <div className="space-y-6">
          {addonError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{addonError}</span>
            </div>
          )}

          {/* Form to add or edit add-on */}
          <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl space-y-3 border border-amber-200 dark:border-amber-900/40">
            <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {editingAddon ? `Edit Add-on: ${editingAddon.name}` : 'Create New Add-on'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="label text-xs">Add-on Name *</label>
                <input
                  type="text"
                  className="input text-xs"
                  value={addonForm.name}
                  onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                  placeholder="e.g. Extra Cheese, Mayo Dip, Fried Egg"
                />
              </div>
              <div>
                <label className="label text-xs">Price (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="input text-xs"
                  value={addonForm.price}
                  onChange={(e) => setAddonForm({ ...addonForm, price: Math.max(0, +e.target.value) })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="label text-xs">Food Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAddonForm({ ...addonForm, isVeg: true })}
                    className={cn(
                      'flex-1 py-1.5 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors',
                      addonForm.isVeg
                        ? 'border-green-600 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-bold'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500'
                    )}
                  >
                    <span className="w-2 h-2 rounded-full bg-green-600" />
                    Veg
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddonForm({ ...addonForm, isVeg: false })}
                    className={cn(
                      'flex-1 py-1.5 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors',
                      !addonForm.isVeg
                        ? 'border-red-600 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 font-bold'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500'
                    )}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-600" />
                    Non-Veg
                  </button>
                </div>
              </div>

              <div className="flex items-end justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={addonForm.isActive}
                    onChange={(e) => setAddonForm({ ...addonForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-brand-500 focus:ring-brand-500"
                  />
                  Active (Available)
                </label>

                <div className="flex gap-2 pb-1">
                  {editingAddon && (
                    <button
                      onClick={() => {
                        setEditingAddon(null);
                        setAddonForm({ name: '', price: 0, isVeg: true, isActive: true, sortOrder: addons.length });
                      }}
                      className="btn-secondary text-xs py-1.5"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={saveAddon}
                    disabled={addonSaving}
                    className="btn-primary text-xs py-1.5 flex items-center gap-1 disabled:opacity-60"
                  >
                    {addonSaving ? (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    {addonSaving ? 'Saving...' : editingAddon ? 'Update Add-on' : 'Add Add-on'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Existing Add-ons Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Configured Add-ons ({addons.length})
            </h4>
            {addons.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400 border border-dashed rounded-lg">
                No add-ons configured yet. Create add-ons above to assign them to menu items or categories.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                {addons.map((addon) => (
                  <div
                    key={addon._id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-3.5 h-3.5 border rounded-xs p-0.5',
                          addon.isVeg ? 'border-green-600' : 'border-red-600'
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', addon.isVeg ? 'bg-green-600' : 'bg-red-600')} />
                      </span>
                      <span className="font-semibold text-sm text-gray-900 dark:text-white">{addon.name}</span>
                      <span className="font-bold text-xs text-brand-600">{formatCurrency(addon.price)}</span>
                      {!addon.isActive && <span className="badge-red text-[10px]">Inactive</span>}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingAddon(addon);
                          setAddonForm({
                            name: addon.name,
                            price: addon.price,
                            isVeg: addon.isVeg,
                            isActive: addon.isActive !== false,
                            sortOrder: addon.sortOrder || 0,
                          });
                        }}
                        className="p-1.5 text-gray-400 hover:text-brand-500 rounded"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteAddon(addon)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
