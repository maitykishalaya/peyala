'use client';
import { useState, useEffect, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import {
  recipesApi,
  unitConversionsApi,
  posSettingsApi,
  inventoryApi,
  Recipe,
  UnitConversionRule,
  POSSetting,
} from '@/lib/api';
import { menuApi } from '@/lib/pos-api';
import { formatCurrency, formatDate, cn, UNITS } from '@/lib/utils';
import { matchesSearch } from '@/lib/search';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { realtime } from '@/lib/realtime';
import {
  CookingPot,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRightLeft,
  History,
  AlertTriangle,
  RefreshCw,
  Power,
  Pencil,
  Trash2,
  Check,
  ChevronRight,
  ShieldCheck,
  Package,
  Layers,
  Scale,
  Zap,
} from 'lucide-react';

export default function RecipesPage() {
  const { user, canWrite } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManagerOrAdmin = ['admin', 'manager'].includes(user?.role || '');

  // Active top-level tab
  const [activeTab, setActiveTab] = useState<'recipes' | 'conversions' | 'suggestions' | 'ledger'>('recipes');

  // Master settings
  const [posSetting, setPosSetting] = useState<POSSetting | null>(null);
  const [togglingMaster, setTogglingMaster] = useState(false);

  // Data states
  const [summary, setSummary] = useState<any>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [conversions, setConversions] = useState<UnitConversionRule[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);

  // Filtering states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recipeFilter, setRecipeFilter] = useState<'all' | 'active' | 'draft' | 'inactive'>('all');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [conversionSearch, setConversionSearch] = useState('');

  // Recipe Modal State
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [recipeForm, setRecipeForm] = useState({
    menuItemId: '',
    variantName: '',
    name: '',
    status: 'draft' as 'draft' | 'active' | 'inactive',
    prepYield: 1,
    preparationLossPercent: 0,
    notes: '',
    ingredients: [] as Array<{
      inventoryItem: string;
      ingredientName: string;
      recipeQuantity: number;
      recipeUnit: string;
      canonicalQuantity: number;
      canonicalUnit: string;
      lossPercent: number;
      notes: string;
    }>,
  });

  // Conversion Modal State
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [editingConversion, setEditingConversion] = useState<UnitConversionRule | null>(null);
  const [savingConversion, setSavingConversion] = useState(false);
  const [conversionForm, setConversionForm] = useState({
    inventoryItemId: '',
    canonicalUnit: 'bottle',
    purchaseUnit: 'box',
    conversionFactor: 1,
    packageSize: 1,
    packageLabel: '',
    notes: '',
    convertExistingStock: false,
  });

  // Auto-suggestion generator state
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);

  // Load all foundational data
  const loadData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [
        settingsRes,
        summaryRes,
        recipesRes,
        conversionsRes,
        movementsRes,
        menuRes,
        invRes,
      ] = await Promise.all([
        posSettingsApi.get().catch(() => ({ data: null })),
        recipesApi.getSummary().catch(() => ({ data: null })),
        recipesApi.list().catch(() => ({ data: [] })),
        unitConversionsApi.list().catch(() => ({ data: [] })),
        recipesApi.getMovements({ limit: 40 }).catch(() => ({ data: { movements: [] } })),
        menuApi.listItems().catch(() => ({ data: [] })),
        inventoryApi.items().catch(() => ({ data: [] })),
      ]);

      if (settingsRes.data) setPosSetting(settingsRes.data);
      if (summaryRes.data) setSummary(summaryRes.data);
      setRecipes(recipesRes.data || []);
      setConversions(conversionsRes.data || []);
      setMovements(movementsRes.data?.movements || []);
      setMenuItems(menuRes.data || []);
      setInventoryItems(invRes.data || []);
    } catch (err: any) {
      console.error('Failed to load recipe data:', err);
      toast.error('Failed to load recipe data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Realtime local WebSocket event listeners
    const unsubRecipe = realtime.on('RECIPE_UPDATED', () => loadData(false));
    const unsubConversion = realtime.on('UNITCONVERSION_UPDATED', () => loadData(false));
    const unsubMovement = realtime.on('INVENTORYMOVEMENT_UPDATED', () => loadData(false));

    // Listen to background cloud sync completion
    const handleSyncComplete = () => loadData(false);
    if (typeof window !== 'undefined') {
      window.addEventListener('peyala_data_synced', handleSyncComplete);
    }

    // Periodic auto-refresh every 20 seconds to guarantee cross-laptop synchronization
    const autoRefreshInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadData(false);
      }
    }, 20000);

    return () => {
      unsubRecipe();
      unsubConversion();
      unsubMovement();
      if (typeof window !== 'undefined') {
        window.removeEventListener('peyala_data_synced', handleSyncComplete);
      }
      clearInterval(autoRefreshInterval);
    };
  }, []);

  // Master Toggle Handler (Admin only)
  const handleToggleMasterAutomation = async () => {
    if (!isAdmin) {
      toast.error('Only Administrators can change automated inventory consumption settings.');
      return;
    }
    const current = Boolean(posSetting?.recipeInventoryAutomationEnabled);
    const nextState = !current;

    const confirmMsg = nextState
      ? 'Enable Automated Inventory Consumption?\n\nWhen enabled, only ACTIVE recipes will automatically consume inventory ingredients upon KOT dispatch and billing.'
      : 'Disable Automated Inventory Consumption?\n\nAutomated stock deduction will be paused. The POS will operate in manual inventory mode.';

    if (!window.confirm(confirmMsg)) return;

    setTogglingMaster(true);
    try {
      const res = await posSettingsApi.update({ recipeInventoryAutomationEnabled: nextState });
      setPosSetting(res.data);
      toast.success(
        nextState
          ? 'Automated Inventory Consumption is now ENABLED'
          : 'Automated Inventory Consumption is now DISABLED'
      );
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update automation toggle');
    } finally {
      setTogglingMaster(false);
    }
  };

  // Run Auto-Suggestions Engine
  const handleRunAutoSuggestions = async () => {
    if (!isManagerOrAdmin) {
      toast.error('Access restricted to managers and administrators.');
      return;
    }
    setGeneratingSuggestions(true);
    try {
      const res = await recipesApi.generateSuggestions({});
      toast.success(res.data.message || 'Auto-suggestions generated successfully!');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to generate suggestions');
    } finally {
      setGeneratingSuggestions(false);
    }
  };

  // One-click Recipe Activation
  const handleActivateRecipe = async (recipe: Recipe) => {
    if (!isManagerOrAdmin) return;
    try {
      await recipesApi.activate(recipe._id);
      toast.success(`Recipe "${recipe.name}" activated!`);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to activate recipe');
    }
  };

  // One-click Recipe Deactivation
  const handleDeactivateRecipe = async (recipe: Recipe) => {
    if (!isManagerOrAdmin) return;
    try {
      await recipesApi.deactivate(recipe._id);
      toast.success(`Recipe "${recipe.name}" deactivated.`);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to deactivate recipe');
    }
  };

  // Delete Draft Recipe
  const handleDeleteRecipe = async (recipe: Recipe) => {
    if (!isManagerOrAdmin) return;
    if (!window.confirm(`Delete recipe "${recipe.name}"? This cannot be undone.`)) return;
    try {
      await recipesApi.delete(recipe._id);
      toast.success('Recipe deleted.');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete recipe');
    }
  };

  // Open Recipe Editor Modal
  const openRecipeModal = (recipe: Recipe | null = null) => {
    if (recipe) {
      setEditingRecipe(recipe);
      setRecipeForm({
        menuItemId: typeof recipe.menuItem === 'object' ? recipe.menuItem?._id : recipe.menuItem,
        variantName: recipe.variantName || '',
        name: recipe.name,
        status: recipe.status,
        prepYield: recipe.prepYield || 1,
        preparationLossPercent: recipe.preparationLossPercent || 0,
        notes: recipe.notes || '',
        ingredients: recipe.ingredients.map(ing => ({
          inventoryItem: typeof ing.inventoryItem === 'object' ? ing.inventoryItem?._id : ing.inventoryItem,
          ingredientName: ing.ingredientName,
          recipeQuantity: ing.recipeQuantity,
          recipeUnit: ing.recipeUnit,
          canonicalQuantity: ing.canonicalQuantity,
          canonicalUnit: ing.canonicalUnit,
          lossPercent: ing.lossPercent || 0,
          notes: ing.notes || '',
        })),
      });
    } else {
      setEditingRecipe(null);
      setRecipeForm({
        menuItemId: '',
        variantName: '',
        name: '',
        status: 'draft',
        prepYield: 1,
        preparationLossPercent: 0,
        notes: '',
        ingredients: [],
      });
    }
    setRecipeModalOpen(true);
  };

  // Add ingredient line
  const handleAddIngredientLine = () => {
    if (inventoryItems.length === 0) {
      toast.error('No inventory items available.');
      return;
    }
    const defaultItem = inventoryItems[0];
    setRecipeForm(prev => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          inventoryItem: defaultItem._id,
          ingredientName: defaultItem.name,
          recipeQuantity: 1,
          recipeUnit: defaultItem.unit,
          canonicalQuantity: 1,
          canonicalUnit: defaultItem.unit,
          lossPercent: 0,
          notes: '',
        },
      ],
    }));
  };

  // Save Recipe
  const handleSaveRecipe = async (targetStatus?: 'draft' | 'active') => {
    if (!recipeForm.menuItemId) {
      toast.error('Please select a menu item.');
      return;
    }

    const selectedItem = menuItems.find(m => m._id === recipeForm.menuItemId);
    const hasItemVariants = Boolean(selectedItem?.hasVariants && Array.isArray(selectedItem?.variants) && selectedItem.variants.length > 0);
    if (hasItemVariants && !recipeForm.variantName) {
      toast.error(`Please select a variant for "${selectedItem.name}". Different variants require different ingredient amounts.`);
      return;
    }

    if (recipeForm.ingredients.length === 0) {
      toast.error('At least one ingredient is required.');
      return;
    }

    setSavingRecipe(true);
    try {
      const payload: any = {
        menuItemId: recipeForm.menuItemId,
        variantName: hasItemVariants ? (recipeForm.variantName || null) : null,
        name: recipeForm.name,
        status: targetStatus || recipeForm.status,
        prepYield: Number(recipeForm.prepYield) || 1,
        preparationLossPercent: Number(recipeForm.preparationLossPercent) || 0,
        notes: recipeForm.notes,
        ingredients: recipeForm.ingredients,
      };

      if (editingRecipe) {
        await recipesApi.update(editingRecipe._id, payload);
        toast.success(`Recipe "${payload.name}" updated!`);
      } else {
        await recipesApi.create(payload);
        toast.success(`Recipe "${payload.name}" created!`);
      }
      setRecipeModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save recipe');
    } finally {
      setSavingRecipe(false);
    }
  };

  // Open Conversion Modal
  const openConversionModal = (conv: UnitConversionRule | null = null) => {
    if (conv) {
      setEditingConversion(conv);
      setConversionForm({
        inventoryItemId: typeof conv.inventoryItem === 'object' ? conv.inventoryItem?._id : conv.inventoryItem,
        canonicalUnit: conv.canonicalUnit,
        purchaseUnit: conv.purchaseUnit,
        conversionFactor: conv.conversionFactor,
        packageSize: conv.packageSize || conv.conversionFactor,
        packageLabel: conv.packageLabel || '',
        notes: conv.notes || '',
        convertExistingStock: false,
      });
    } else {
      setEditingConversion(null);
      const defaultItem = inventoryItems[0];
      setConversionForm({
        inventoryItemId: defaultItem?._id || '',
        canonicalUnit: defaultItem?.unit || 'bottle',
        purchaseUnit: 'box',
        conversionFactor: 1,
        packageSize: 1,
        packageLabel: '',
        notes: '',
        convertExistingStock: false,
      });
    }
    setConversionModalOpen(true);
  };

  // Save Conversion
  const handleSaveConversion = async () => {
    if (!conversionForm.inventoryItemId) {
      toast.error('Please select an inventory item.');
      return;
    }
    if (!conversionForm.purchaseUnit.trim()) {
      toast.error('Purchase package unit is required.');
      return;
    }
    if (!conversionForm.canonicalUnit.trim()) {
      toast.error('Consumption / Recipe unit is required.');
      return;
    }
    if (conversionForm.conversionFactor <= 0) {
      toast.error('Conversion factor must be greater than zero.');
      return;
    }
    if (
      conversionForm.conversionFactor !== 1 &&
      conversionForm.purchaseUnit.trim().toLowerCase() === conversionForm.canonicalUnit.trim().toLowerCase()
    ) {
      toast.error('Purchase unit and consumption unit cannot be the same when factor is not 1.');
      return;
    }

    setSavingConversion(true);
    try {
      if (editingConversion) {
        await unitConversionsApi.update(editingConversion._id, conversionForm);
        toast.success('Unit conversion updated!');
      } else {
        await unitConversionsApi.create(conversionForm);
        toast.success('Unit conversion rule created!');
      }
      setConversionModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save conversion');
    } finally {
      setSavingConversion(false);
    }
  };

  // Delete / Deactivate Conversion
  const handleDeleteConversion = async (conv: UnitConversionRule) => {
    if (!confirm(`Are you sure you want to deactivate conversion rule: 1 ${conv.purchaseUnit} = ${conv.conversionFactor} ${conv.canonicalUnit}?`)) return;
    try {
      await unitConversionsApi.delete(conv._id);
      toast.success('Unit conversion deactivated');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to deactivate conversion');
    }
  };

  // Filtered recipes
  const filteredRecipes = useMemo(() => {
    return recipes.filter(r => {
      if (recipeFilter !== 'all' && r.status !== recipeFilter) return false;
      if (recipeSearch.trim()) {
        const menuItemName = typeof r.menuItem === 'object' ? r.menuItem?.name : '';
        const searchMatches = matchesSearch(
          [r.name, menuItemName, r.variantName, r.status],
          recipeSearch
        );
        if (!searchMatches) return false;
      }
      return true;
    });
  }, [recipes, recipeFilter, recipeSearch]);

  // Draft suggestions
  const draftSuggestions = useMemo(() => {
    return recipes.filter(r => r.status === 'draft');
  }, [recipes]);

  // Filtered unit conversions
  const filteredConversions = useMemo(() => {
    return conversions.filter(c => {
      if (!conversionSearch.trim()) return true;
      const itemName = typeof c.inventoryItem === 'object' ? c.inventoryItem?.name : '';
      return matchesSearch([itemName, c.purchaseUnit, c.canonicalUnit, c.packageLabel], conversionSearch);
    });
  }, [conversions, conversionSearch]);

  const isAutomationActive = Boolean(posSetting?.recipeInventoryAutomationEnabled);

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* ── TOP HEADER & MASTER AUTOMATION BANNER ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <CookingPot className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Recipe & Consumption Engine
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                    v12.1 Production
                  </span>
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Connect menu items with inventory raw materials, manage packaging units, and automate stock deduction.
                </p>
              </div>
            </div>
          </div>

          {/* Master Toggle Pill */}
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Power className={cn('w-3.5 h-3.5', isAutomationActive ? 'text-emerald-500' : 'text-gray-400')} />
                Auto-Deduction Engine
              </span>
              <span className={cn('text-xs font-bold', isAutomationActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                {isAutomationActive ? 'ACTIVE (Consuming Stock)' : 'PAUSED (Master Toggle OFF)'}
              </span>
            </div>
            {isAdmin ? (
              <button
                onClick={handleToggleMasterAutomation}
                disabled={togglingMaster}
                className={cn(
                  'px-3.5 py-2 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5',
                  isAutomationActive
                    ? 'bg-rose-500 hover:bg-rose-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                )}
              >
                {togglingMaster ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : isAutomationActive ? (
                  'Pause Automation'
                ) : (
                  'Turn ON Automation'
                )}
              </button>
            ) : (
              <span className="text-[11px] text-gray-400 italic">Admin toggle only</span>
            )}
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 transition"
              title="Refresh Data"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* ── KPI SUMMARY CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Recipe Coverage
              </span>
              <CookingPot className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">
                {summary?.coveragePercent || 0}%
              </span>
              <span className="text-xs text-gray-500">
                ({summary?.coveredMenuItems || 0} / {summary?.totalMenuItems || 0} items)
              </span>
            </div>
            <div className="mt-2 w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, summary?.coveragePercent || 0)}%` }}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Active Recipes
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {summary?.activeRecipes || 0}
              </span>
              <span className="text-xs text-gray-500">ready to consume</span>
            </div>
            <p className="mt-2 text-xs text-gray-400">Verified & approved recipes</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Draft Suggestions
              </span>
              <Sparkles className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {summary?.draftRecipes || 0}
              </span>
              <span className="text-xs text-gray-500">awaiting review</span>
            </div>
            <p className="mt-2 text-xs text-gray-400">Auto-generated drafts</p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Unit Conversions
              </span>
              <ArrowRightLeft className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">
                {conversions.length}
              </span>
              <span className="text-xs text-gray-500">package rules</span>
            </div>
            <p className="mt-2 text-xs text-gray-400">Packets, bottles, boxes to canonical</p>
          </div>
        </div>

        {/* ── TABS NAVIGATION ── */}
        <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('recipes')}
            className={cn(
              'pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all',
              activeTab === 'recipes'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <CookingPot className="w-4 h-4" />
            Recipe Directory ({recipes.length})
          </button>

          <button
            onClick={() => setActiveTab('conversions')}
            className={cn(
              'pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all',
              activeTab === 'conversions'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Unit Conversions ({conversions.length})
          </button>

          <button
            onClick={() => setActiveTab('suggestions')}
            className={cn(
              'pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all',
              activeTab === 'suggestions'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <Sparkles className="w-4 h-4" />
            Auto Suggestions ({draftSuggestions.length})
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={cn(
              'pb-3 px-4 text-sm font-semibold border-b-2 flex items-center gap-2 transition-all',
              activeTab === 'ledger'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <History className="w-4 h-4" />
            Stock Movements Ledger
          </button>
        </div>

        {/* ── TAB 1: RECIPE DIRECTORY ── */}
        {activeTab === 'recipes' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search & Status Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[240px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search recipes, menu items..."
                    value={recipeSearch}
                    onChange={e => setRecipeSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium">
                  {(['all', 'active', 'draft', 'inactive'] as const).map(st => (
                    <button
                      key={st}
                      onClick={() => setRecipeFilter(st)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg capitalize transition-all',
                        recipeFilter === st
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm font-bold'
                          : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {isManagerOrAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openRecipeModal(null)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Plus className="w-4 h-4" />
                    New Recipe
                  </button>
                </div>
              )}
            </div>

            {/* Recipes Grid / List */}
            {filteredRecipes.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 p-12 text-center rounded-2xl border border-gray-200 dark:border-gray-700">
                <CookingPot className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">No recipes found</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {recipeSearch || recipeFilter !== 'all'
                    ? 'Try adjusting your search query or filter.'
                    : 'Start by creating your first recipe or run the Auto-Suggestion engine.'}
                </p>
                {isManagerOrAdmin && (
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      onClick={() => openRecipeModal(null)}
                      className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl"
                    >
                      Create Custom Recipe
                    </button>
                    <button
                      onClick={handleRunAutoSuggestions}
                      disabled={generatingSuggestions}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl flex items-center gap-1.5"
                    >
                      <Sparkles className="w-4 h-4" />
                      Run Auto-Suggestions
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRecipes.map(recipe => {
                  const menuItem = typeof recipe.menuItem === 'object' ? recipe.menuItem : null;
                  const sellingPrice = menuItem?.price || 0;
                  const foodCost = recipe.estimatedCost || 0;
                  const margin = sellingPrice > 0 ? Math.round(((sellingPrice - foodCost) / sellingPrice) * 100) : 0;

                  return (
                    <div
                      key={recipe._id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-gray-900 dark:text-white text-base">
                              {recipe.name}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {menuItem?.name || 'Linked Menu Item'}{' '}
                              {recipe.variantName && `• ${recipe.variantName}`}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider',
                              recipe.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                                : recipe.status === 'draft'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            )}
                          >
                            {recipe.status}
                          </span>
                        </div>

                        {/* Cost & Margins */}
                        <div className="mt-4 grid grid-cols-3 gap-2 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 text-center">
                          <div>
                            <span className="text-[10px] text-gray-400 uppercase font-bold">Selling</span>
                            <div className="text-sm font-bold text-gray-900 dark:text-white">
                              {formatCurrency(sellingPrice)}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 uppercase font-bold">Cost (WAC)</span>
                            <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                              {formatCurrency(foodCost)}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-400 uppercase font-bold">Margin</span>
                            <div className={cn('text-sm font-bold', margin >= 60 ? 'text-emerald-600' : 'text-gray-700 dark:text-gray-300')}>
                              {margin}%
                            </div>
                          </div>
                        </div>

                        {/* Ingredients Preview */}
                        <div className="mt-4">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center justify-between">
                            <span>Ingredients ({recipe.ingredients.length})</span>
                            <span className="text-[10px] text-gray-400">v{recipe.version}</span>
                          </span>
                          <div className="mt-1.5 space-y-1">
                            {recipe.ingredients.slice(0, 3).map((ing, idx) => (
                              <div
                                key={idx}
                                className="text-xs text-gray-600 dark:text-gray-300 flex items-center justify-between py-0.5"
                              >
                                <span className="truncate pr-2">• {ing.ingredientName}</span>
                                <span className="font-mono text-gray-500 shrink-0">
                                  {ing.recipeQuantity} {ing.recipeUnit}
                                </span>
                              </div>
                            ))}
                            {recipe.ingredients.length > 3 && (
                              <p className="text-[11px] text-gray-400 italic">
                                +{recipe.ingredients.length - 3} more ingredients...
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                        {recipe.status === 'active' ? (
                          <button
                            onClick={() => handleDeactivateRecipe(recipe)}
                            className="text-xs font-semibold text-amber-600 hover:text-amber-700 dark:text-amber-400"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivateRecipe(recipe)}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Activate
                          </button>
                        )}

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openRecipeModal(recipe)}
                            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Edit Recipe"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {recipe.status !== 'active' && (
                            <button
                              onClick={() => handleDeleteRecipe(recipe)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title="Delete Draft"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: UNIT CONVERSIONS ── */}
        {activeTab === 'conversions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative min-w-[280px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search packaging unit rules..."
                  value={conversionSearch}
                  onChange={e => setConversionSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {isManagerOrAdmin && (
                <button
                  onClick={() => openConversionModal(null)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  New Unit Rule
                </button>
              )}
            </div>

            {/* Conversions Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs uppercase text-gray-500 font-bold border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="py-3 px-4">Inventory Ingredient</th>
                      <th className="py-3 px-4">Purchase Unit</th>
                      <th className="py-3 px-4">Formula / Factor</th>
                      <th className="py-3 px-4">Consumption / Recipe Unit</th>
                      <th className="py-3 px-4">Package Label</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                    {filteredConversions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-500">
                          No conversion rules configured yet.
                        </td>
                      </tr>
                    ) : (
                      filteredConversions.map(conv => {
                        const item = typeof conv.inventoryItem === 'object' ? conv.inventoryItem : null;
                        return (
                          <tr key={conv._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition">
                            <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white">
                              {item?.name || 'Raw Material'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase">
                                {conv.purchaseUnit}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-amber-600 dark:text-amber-400">
                              1 {conv.purchaseUnit} = {conv.conversionFactor} {conv.canonicalUnit}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 uppercase">
                                {conv.canonicalUnit}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs text-gray-500">
                              {conv.packageLabel || '-'}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openConversionModal(conv)}
                                  className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                                  title="Edit Rule"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                {isManagerOrAdmin && (
                                  <button
                                    onClick={() => handleDeleteConversion(conv)}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                    title="Deactivate Rule"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: AUTO-SUGGESTIONS ── */}
        {activeTab === 'suggestions' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-indigo-50/60 dark:bg-indigo-950/30 p-5 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/80">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">
                    AI & Heuristic Recipe Suggestion Engine
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 max-w-2xl">
                    Evaluates all 143 menu items against 241 inventory items using culinary taxonomy. Generated recipes are strictly saved as <strong>DRAFT</strong> with confidence scores, requiring manual administrative review before activation.
                  </p>
                </div>
              </div>

              {isManagerOrAdmin && (
                <button
                  onClick={handleRunAutoSuggestions}
                  disabled={generatingSuggestions}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  {generatingSuggestions ? 'Analyzing Database...' : 'Run Auto-Suggestions'}
                </button>
              )}
            </div>

            {/* Draft list */}
            {draftSuggestions.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 p-12 text-center rounded-2xl border border-gray-200 dark:border-gray-700">
                <Sparkles className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No pending draft recipes. Click "Run Auto-Suggestions" above to scan menu items.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {draftSuggestions.map(draft => (
                  <div
                    key={draft._id}
                    className="bg-white dark:bg-gray-800 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 p-5 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-gray-900 dark:text-white text-base">{draft.name}</h4>
                          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-full inline-block mt-1">
                            {draft.confidenceScore}% Confidence Match
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 space-y-1">
                        <span className="text-xs font-bold text-gray-500 uppercase">Suggested Ingredients:</span>
                        {draft.ingredients.map((ing, i) => (
                          <div key={i} className="text-xs text-gray-600 dark:text-gray-300 flex justify-between py-0.5">
                            <span>• {ing.ingredientName}</span>
                            <span className="font-mono text-gray-500">{ing.recipeQuantity} {ing.recipeUnit}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                      <button
                        onClick={() => openRecipeModal(draft)}
                        className="px-3 py-1.5 text-xs font-bold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg"
                      >
                        Review & Edit
                      </button>
                      <button
                        onClick={() => handleActivateRecipe(draft)}
                        className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve & Activate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: STOCK MOVEMENTS LEDGER ── */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">Realtime Stock Movements Ledger</h3>
                  <p className="text-xs text-gray-500">Immutable audit log of all automated ingredient deductions and reversals.</p>
                </div>
                <button
                  onClick={() => loadData(true)}
                  className="px-3 py-1.5 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs uppercase text-gray-500 font-bold border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Movement Type</th>
                      <th className="py-3 px-4">Order / KOT</th>
                      <th className="py-3 px-4">Inventory Item</th>
                      <th className="py-3 px-4">Delta</th>
                      <th className="py-3 px-4">Stock Before $\rightarrow$ After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                    {movements.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-500">
                          No stock movement records yet.
                        </td>
                      </tr>
                    ) : (
                      movements.map(mov => {
                        const inv = typeof mov.inventoryItem === 'object' ? mov.inventoryItem : null;
                        const isDeduction = mov.quantityDelta < 0;

                        return (
                          <tr key={mov._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition">
                            <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                              {formatDate(mov.createdAt)}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={cn(
                                  'text-xs px-2 py-0.5 rounded-full font-bold uppercase',
                                  mov.movementType.includes('reversal')
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                )}
                              >
                                {mov.movementType.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Order #{mov.orderNumber || '-'} {mov.kotRoundNumber ? `(Rnd ${mov.kotRoundNumber})` : ''}
                            </td>
                            <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">
                              {inv?.name || 'Raw Material'}
                            </td>
                            <td className={cn('py-3 px-4 font-mono font-bold', isDeduction ? 'text-rose-600' : 'text-emerald-600')}>
                              {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta} {mov.unit}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-gray-600 dark:text-gray-300">
                              {mov.previousStock} $\rightarrow$ {mov.newStock} {mov.unit}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── RECIPE EDITOR MODAL ── */}
        <Modal
          open={recipeModalOpen}
          onClose={() => setRecipeModalOpen(false)}
          title={editingRecipe ? `Edit Recipe: ${editingRecipe.name}` : 'Create New Recipe'}
          size="lg"
        >
          <div className="space-y-4">
            {(() => {
              const selectedItem = menuItems.find(m => m._id === recipeForm.menuItemId);
              const hasItemVariants = Boolean(selectedItem?.hasVariants && Array.isArray(selectedItem?.variants) && selectedItem.variants.length > 0);

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Menu Item *
                    </label>
                    <select
                      value={recipeForm.menuItemId}
                      onChange={e => {
                        const selId = e.target.value;
                        const selected = menuItems.find(m => m._id === selId);
                        setRecipeForm(prev => ({
                          ...prev,
                          menuItemId: selId,
                          variantName: '',
                          name: selected ? selected.name : '',
                        }));
                      }}
                      className="w-full text-sm p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
                    >
                      <option value="">Select Menu Item...</option>
                      {menuItems.map(m => (
                        <option key={m._id} value={m._id}>
                          {m.name} ({formatCurrency(m.price)}) {m.hasVariants && m.variants?.length ? `· ${m.variants.length} variants` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    {hasItemVariants ? (
                      <div>
                        <label className="block text-xs font-bold text-amber-700 dark:text-amber-400 mb-1 flex items-center justify-between">
                          <span>Variant * (Required)</span>
                          <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">
                            {selectedItem.variants.length} variant{selectedItem.variants.length > 1 ? 's' : ''} available
                          </span>
                        </label>
                        <select
                          value={recipeForm.variantName}
                          onChange={e => {
                            const vName = e.target.value;
                            setRecipeForm(prev => ({
                              ...prev,
                              variantName: vName,
                              name: vName ? `${selectedItem.name} (${vName})` : selectedItem.name,
                            }));
                          }}
                          className="w-full text-sm p-2.5 bg-white dark:bg-gray-800 border-2 border-amber-500/60 dark:border-amber-500/60 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">-- Select Variant (Required) --</option>
                          {selectedItem.variants.map((v: any, vIdx: number) => (
                            <option key={vIdx} value={v.name}>
                              {v.name} ({formatCurrency(v.price)}) {v.isVeg ? '🌱 Veg' : '🍗 Non-Veg'}
                            </option>
                          ))}
                        </select>
                        <span className="text-[11px] text-amber-700 dark:text-amber-300 mt-1 block">
                          Variants require distinct ingredient amounts.
                        </span>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                          Variant
                        </label>
                        <input
                          type="text"
                          disabled
                          value={recipeForm.menuItemId ? 'Base Item (No Variants Configured)' : 'Select menu item first'}
                          className="w-full text-sm p-2.5 bg-gray-100 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 dark:text-gray-500 italic cursor-not-allowed"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Recipe Display Name *
              </label>
              <input
                type="text"
                value={recipeForm.name}
                onChange={e => setRecipeForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Chicken Burger - Regular"
                className="w-full text-sm p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-bold"
              />
            </div>

            {/* Ingredients builder */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                  Recipe Ingredients
                </span>
                <button
                  type="button"
                  onClick={handleAddIngredientLine}
                  className="px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Ingredient
                </button>
              </div>

              {recipeForm.ingredients.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-4">
                  No ingredients added yet. Click "+ Add Ingredient" above.
                </p>
              ) : (
                <div className="space-y-2">
                  {recipeForm.ingredients.map((line, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-center bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
                    >
                      <div className="col-span-5">
                        <select
                          value={line.inventoryItem}
                          onChange={e => {
                            const inv = inventoryItems.find(i => i._id === e.target.value);
                            const updated = [...recipeForm.ingredients];
                            updated[idx].inventoryItem = e.target.value;
                            if (inv) {
                              updated[idx].ingredientName = inv.name;
                              updated[idx].canonicalUnit = inv.unit;
                              updated[idx].recipeUnit = inv.unit;
                            }
                            setRecipeForm(prev => ({ ...prev, ingredients: updated }));
                          }}
                          className="w-full text-xs p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                        >
                          {inventoryItems.map(inv => (
                            <option key={inv._id} value={inv._id}>
                              {inv.name} ({inv.unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3 flex items-center gap-1">
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          value={line.recipeQuantity}
                          onChange={e => {
                            const updated = [...recipeForm.ingredients];
                            const val = Number(e.target.value) || 0;
                            updated[idx].recipeQuantity = val;
                            updated[idx].canonicalQuantity = val;
                            setRecipeForm(prev => ({ ...prev, ingredients: updated }));
                          }}
                          className="w-full text-xs p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-right font-mono"
                        />
                        <span className="text-xs font-semibold text-gray-500 uppercase">{line.recipeUnit}</span>
                      </div>

                      <div className="col-span-3 flex items-center gap-1">
                        <span className="text-[10px] text-gray-400">Loss:</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={line.lossPercent}
                          onChange={e => {
                            const updated = [...recipeForm.ingredients];
                            updated[idx].lossPercent = Number(e.target.value) || 0;
                            setRecipeForm(prev => ({ ...prev, ingredients: updated }));
                          }}
                          className="w-16 text-xs p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-right"
                        />
                        <span className="text-xs text-gray-500">%</span>
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = recipeForm.ingredients.filter((_, i) => i !== idx);
                            setRecipeForm(prev => ({ ...prev, ingredients: updated }));
                          }}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRecipeModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveRecipe('draft')}
                disabled={savingRecipe}
                className="px-4 py-2 text-sm font-semibold bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl"
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={() => handleSaveRecipe('active')}
                disabled={savingRecipe}
                className="px-4 py-2 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm"
              >
                Save & Activate
              </button>
            </div>
          </div>
        </Modal>

        {/* ── UNIT CONVERSION MODAL ── */}
        <Modal
          open={conversionModalOpen}
          onClose={() => setConversionModalOpen(false)}
          title={editingConversion ? 'Edit Unit Conversion Rule' : 'New Packaging Unit Rule'}
          size="lg"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Inventory Raw Material *
              </label>
              <select
                value={conversionForm.inventoryItemId}
                onChange={e => {
                  const inv = inventoryItems.find(i => i._id === e.target.value);
                  setConversionForm(prev => ({
                    ...prev,
                    inventoryItemId: e.target.value,
                    canonicalUnit: inv?.unit || prev.canonicalUnit,
                  }));
                }}
                className="w-full text-sm p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-medium"
              >
                {inventoryItems.map(inv => (
                  <option key={inv._id} value={inv._id}>
                    {inv.name} (Current: {inv.currentStock} {inv.unit} · ₹{inv.averageCost || inv.lastPurchasePrice || 0}/{inv.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Current Item Status */}
            {(() => {
              const selectedInv = inventoryItems.find(i => i._id === conversionForm.inventoryItemId);
              if (!selectedInv) return null;
              return (
                <div className="text-xs px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2 text-gray-600 dark:text-gray-300">
                  <span>Current Stock: <strong className="text-gray-900 dark:text-white">{selectedInv.currentStock} {selectedInv.unit}</strong></span>
                  <span>Average Cost: <strong className="text-gray-900 dark:text-white">₹{selectedInv.averageCost || selectedInv.lastPurchasePrice || 0}/{selectedInv.unit}</strong></span>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Purchase Package Unit *
                </label>
                <input
                  type="text"
                  placeholder="e.g. box, packet, carton"
                  value={conversionForm.purchaseUnit}
                  onChange={e => setConversionForm(prev => ({ ...prev, purchaseUnit: e.target.value }))}
                  className="w-full text-sm p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold uppercase"
                />
                <span className="text-[11px] text-gray-400 mt-0.5 block">Used when adding Purchases</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Conversion Factor *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.000001"
                  value={conversionForm.conversionFactor}
                  onChange={e => setConversionForm(prev => ({ ...prev, conversionFactor: Number(e.target.value) || 1 }))}
                  className="w-full text-sm p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-mono font-bold text-right text-amber-600"
                />
                <span className="text-[11px] text-gray-400 mt-0.5 block">How many consumption units per package</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Consumption Unit *
                </label>
                <select
                  value={conversionForm.canonicalUnit}
                  onChange={e => setConversionForm(prev => ({ ...prev, canonicalUnit: e.target.value }))}
                  className="w-full text-sm p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold uppercase"
                >
                  {UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <span className="text-[11px] text-gray-400 mt-0.5 block">Stored in Inventory & used in Recipes</span>
              </div>
            </div>

            {/* Dynamic Formula Banner */}
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-sm text-amber-800 dark:text-amber-300">
                📦 1 {conversionForm.purchaseUnit || 'package'} = {conversionForm.conversionFactor} {conversionForm.canonicalUnit}
              </div>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80">
                Purchasing 1 {conversionForm.purchaseUnit || 'package'} adds {conversionForm.conversionFactor} {conversionForm.canonicalUnit} to inventory stock. In recipes, deduction happens in {conversionForm.canonicalUnit}.
              </p>
            </div>

            {/* Checkbox for updating existing inventory stock and unit costs */}
            {(() => {
              const selectedInv = inventoryItems.find(i => i._id === conversionForm.inventoryItemId);
              if (!selectedInv) return null;
              const factor = conversionForm.conversionFactor || 1;
              const convertedStock = (selectedInv.currentStock * factor).toFixed(2);
              const convertedCost = factor > 0 ? (selectedInv.averageCost / factor).toFixed(2) : '0';
              return (
                <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200/80 dark:border-blue-800/80 space-y-1.5">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(conversionForm.convertExistingStock)}
                      onChange={e => setConversionForm(prev => ({ ...prev, convertExistingStock: e.target.checked }))}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div className="text-xs text-gray-800 dark:text-gray-200 font-medium">
                      Update existing inventory stock and unit costs to <strong>{conversionForm.canonicalUnit}</strong>
                    </div>
                  </label>
                  {conversionForm.convertExistingStock && (
                    <div className="ml-5 text-[11px] text-blue-800 dark:text-blue-300 bg-white/70 dark:bg-gray-900/70 p-2 rounded-lg border border-blue-100 dark:border-blue-900">
                      Preview: <strong>{selectedInv.currentStock} {selectedInv.unit}</strong> will become <strong>{convertedStock} {conversionForm.canonicalUnit}</strong> · Cost: <strong>₹{selectedInv.averageCost}/{selectedInv.unit}</strong> will become <strong>₹{convertedCost}/{conversionForm.canonicalUnit}</strong>
                    </div>
                  )}
                </div>
              );
            })()}

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Package Label (Optional)
              </label>
              <input
                type="text"
                placeholder={`e.g. 1 ${conversionForm.purchaseUnit} of ${conversionForm.conversionFactor} ${conversionForm.canonicalUnit}`}
                value={conversionForm.packageLabel}
                onChange={e => setConversionForm(prev => ({ ...prev, packageLabel: e.target.value }))}
                className="w-full text-sm p-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
              />
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConversionModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConversion}
                disabled={savingConversion}
                className="px-4 py-2 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm"
              >
                Save Conversion Rule
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
