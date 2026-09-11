'use client';
import { useEffect, useState, useMemo } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth';
import { tablesApi, ordersApi, menuApi, Table, Order, MenuItem, MenuCategory } from '@/lib/pos-api';
import { formatCurrency, cn } from '@/lib/utils';
import {
  LayoutGrid, Plus, Users, Utensils, Receipt, CheckCircle,
  XCircle, Clock, Search, Trash2, ChevronRight, AlertCircle,
  CreditCard, Wallet, Smartphone, Building2, PlusCircle, MinusCircle,
  ChefHat, RefreshCw, Printer, ShieldAlert
} from 'lucide-react';
import { printKOT, printCustomerBill, getPrintMode, setPrintMode, PrintMode } from '@/lib/thermal-print';

export default function TablesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'reserved'>('all');

  // Selected Table & Order Modal state
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [orderModalLoading, setOrderModalLoading] = useState(false);

  // Cart state for Opening New Order
  const [cart, setCart] = useState<Record<string, { quantity: number; notes: string }>>({});
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCatFilter, setMenuCatFilter] = useState('all');

  // Add Round (KOT) state for Occupied Table
  const [showAddRound, setShowAddRound] = useState(false);
  const [roundCart, setRoundCart] = useState<Record<string, { quantity: number; notes: string }>>({});
  const [roundSearch, setRoundSearch] = useState('');
  const [roundCatFilter, setRoundCatFilter] = useState('all');

  // Billing & Payment state
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [settlementInput, setSettlementInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'other'>('cash');
  const [actionLoading, setActionLoading] = useState(false);
  const [printMode, setPrintModeState] = useState<PrintMode>('test');

  // Table Management Modal
  const [tableModal, setTableModal] = useState<'create' | 'edit' | null>(null);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [tableForm, setTableForm] = useState<{
    tableNumber: string;
    capacity: number;
    status: 'available' | 'occupied' | 'reserved';
  }>({ tableNumber: '', capacity: 4, status: 'available' });

  // Load all tables and menu
  const loadData = async () => {
    try {
      setLoading(true);
      const [tableRes, itemRes, catRes] = await Promise.all([
        tablesApi.list(),
        menuApi.listItems({ availableOnly: true }),
        menuApi.listCategories(),
      ]);
      setTables(tableRes.data);
      setMenuItems(itemRes.data);
      setCategories(catRes.data);
    } catch (err: any) {
      console.error('Failed to load POS data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setPrintModeState(getPrintMode());

    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<PrintMode>;
      if (customEvent.detail) setPrintModeState(customEvent.detail);
    };

    window.addEventListener('peyala_pos_print_mode_changed', handleModeChange);
    return () => window.removeEventListener('peyala_pos_print_mode_changed', handleModeChange);
  }, []);

  const togglePrintMode = () => {
    if (printMode === 'test') {
      if (confirm('Switch to Production Mode?\n\nKOTs and Bills will be sent directly to your thermal printer silently without showing the test preview modal.')) {
        setPrintMode('production');
        setPrintModeState('production');
      }
    } else {
      setPrintMode('test');
      setPrintModeState('test');
    }
  };

  // Filtered tables
  const filteredTables = useMemo(() => {
    if (statusFilter === 'all') return tables;
    return tables.filter((t) => t.status === statusFilter);
  }, [tables, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = tables.length;
    const available = tables.filter((t) => t.status === 'available').length;
    const occupied = tables.filter((t) => t.status === 'occupied').length;
    const reserved = tables.filter((t) => t.status === 'reserved').length;
    return { total, available, occupied, reserved };
  }, [tables]);

  // Open Table Modal
  const handleTableClick = async (table: Table) => {
    setSelectedTable(table);
    setCart({});
    setRoundCart({});
    setShowAddRound(false);
    setMenuSearch('');
    setRoundSearch('');
    setMenuCatFilter('all');
    setRoundCatFilter('all');

    if (table.status === 'occupied') {
      try {
        setOrderModalLoading(true);
        const res = await ordersApi.getActiveForTable(table._id);
        setActiveOrder(res.data);
        setDiscountType((res.data?.discountType as 'flat' | 'percentage') || 'flat');
        setDiscountInput(res.data?.discountValue !== undefined ? res.data.discountValue : (res.data?.discount || 0));
        setSettlementInput(res.data?.settledAmount !== null && res.data?.settledAmount !== undefined ? String(res.data.settledAmount) : String(res.data?.total || 0));
      } catch (err) {
        console.error('Error fetching active order:', err);
      } finally {
        setOrderModalLoading(false);
      }
    } else {
      setActiveOrder(null);
    }
  };

  // Close Order Modal
  const closeOrderModal = () => {
    setSelectedTable(null);
    setActiveOrder(null);
    setCart({});
    setRoundCart({});
    setShowAddRound(false);
  };

  // Cart operations (for opening order)
  const updateCartQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[itemId] || { quantity: 0, notes: '' };
      const newQty = current.quantity + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { ...current, quantity: newQty } };
    });
  };

  const updateCartNotes = (itemId: string, notes: string) => {
    setCart((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { quantity: 1, notes: '' }), notes },
    }));
  };

  // Cart total preview
  const cartSummary = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;
    let itemCount = 0;

    Object.entries(cart).forEach(([itemId, data]) => {
      const item = menuItems.find((i) => i._id === itemId);
      if (item && data.quantity > 0) {
        const line = item.price * data.quantity;
        const tax = (line * (item.taxPercent || 0)) / 100;
        subtotal += line;
        taxAmount += tax;
        itemCount += data.quantity;
      }
    });

    return {
      subtotal,
      taxAmount,
      total: Math.round((subtotal + taxAmount) * 100) / 100,
      itemCount,
    };
  }, [cart, menuItems]);

  // Submit New Order (Open Order / First KOT)
  const handleOpenOrder = async () => {
    if (!selectedTable) return;
    const items = Object.entries(cart)
      .filter(([_, d]) => d.quantity > 0)
      .map(([itemId, d]) => ({
        menuItemId: itemId,
        quantity: d.quantity,
        notes: d.notes,
      }));

    if (items.length === 0) {
      alert('Please add at least one item to open an order');
      return;
    }

    try {
      setActionLoading(true);
      const res = await ordersApi.create({ tableId: selectedTable._id, items });
      setActiveOrder(res.data);
      setCart({});

      // Auto-print KOT for Initial Order (Round 1)
      const round1Items = items.map((it) => {
        const mi = menuItems.find((m) => m._id === it.menuItemId);
        return {
          name: mi?.name || 'Menu Item',
          quantity: it.quantity,
          notes: it.notes,
        };
      });

      const orderNum = res.data.orderNumber || res.data._id;
      printKOT({
        tableNumber: selectedTable.tableNumber,
        kotNumber: `KOT-${res.data.orderNumber ? res.data.orderNumber : res.data._id.slice(-4)}-1`,
        orderNumber: orderNum,
        tokenNo: res.data.orderNumber ? String(res.data.orderNumber).slice(-2) : res.data._id.slice(-2),
        billerName: res.data.createdBy?.name || 'Staff',
        roundTag: '[INITIAL ORDER]',
        createdAt: res.data.createdAt,
        items: round1Items,
      });

      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to open order');
    } finally {
      setActionLoading(false);
    }
  };

  // Round Cart operations (for additional KOT round)
  const updateRoundQty = (itemId: string, delta: number) => {
    setRoundCart((prev) => {
      const current = prev[itemId] || { quantity: 0, notes: '' };
      const newQty = current.quantity + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { ...current, quantity: newQty } };
    });
  };

  const updateRoundNotes = (itemId: string, notes: string) => {
    setRoundCart((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { quantity: 1, notes: '' }), notes },
    }));
  };

  // Submit additional KOT round
  const handleAddRound = async () => {
    if (!activeOrder) return;
    const items = Object.entries(roundCart)
      .filter(([_, d]) => d.quantity > 0)
      .map(([itemId, d]) => ({
        menuItemId: itemId,
        quantity: d.quantity,
        notes: d.notes,
      }));

    if (items.length === 0) {
      alert('Please select items for this KOT round');
      return;
    }

    try {
      setActionLoading(true);
      const res = await ordersApi.addItems(activeOrder._id, items);
      setActiveOrder(res.data);
      setRoundCart({});
      setShowAddRound(false);

      // Auto-print KOT for newly added round items only
      const roundItems = items.map((it) => {
        const mi = menuItems.find((m) => m._id === it.menuItemId);
        return {
          name: mi?.name || 'Menu Item',
          quantity: it.quantity,
          notes: it.notes,
        };
      });

      const orderNum = res.data.orderNumber || res.data._id;
      const roundNum = res.data.kotCount || 2;
      printKOT({
        tableNumber: selectedTable?.tableNumber || 'Table',
        kotNumber: `KOT-${res.data.orderNumber ? res.data.orderNumber : res.data._id.slice(-4)}-${roundNum}`,
        orderNumber: orderNum,
        tokenNo: res.data.orderNumber ? String(res.data.orderNumber).slice(-2) : res.data._id.slice(-2),
        billerName: res.data.createdBy?.name || 'Staff',
        roundTag: `[ROUND ${roundNum} - ADD-ON]`,
        createdAt: new Date(),
        items: roundItems,
      });

      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add KOT round');
    } finally {
      setActionLoading(false);
    }
  };

  // Update item status in live order
  const handleItemStatusChange = async (itemId: string, status: string) => {
    if (!activeOrder) return;
    try {
      const res = await ordersApi.updateItem(activeOrder._id, itemId, { status });
      setActiveOrder(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update item status');
    }
  };

  // Soft cancel an item from live order
  const handleCancelItem = async (itemId: string, itemName: string) => {
    if (!confirm(`Cancel "${itemName}" from this order?`)) return;
    if (!activeOrder) return;
    try {
      const res = await ordersApi.cancelItem(activeOrder._id, itemId);
      setActiveOrder(res.data);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to cancel item');
    }
  };

  // Apply discount to live order
  // Apply discount to live order
  const handleApplyDiscount = async () => {
    if (!activeOrder) return;
    try {
      const res = await ordersApi.applyDiscount(activeOrder._id, {
        discountType,
        discountValue: Number(discountInput) || 0,
      });
      setActiveOrder(res.data);
      setSettlementInput(String(res.data.total));
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to apply discount');
    }
  };

  // Finalize Bill
  const handleFinalizeBill = async () => {
    if (!activeOrder) return;
    try {
      setActionLoading(true);
      const res = await ordersApi.bill(activeOrder._id);
      setActiveOrder(res.data);
      setSettlementInput(String(res.data.total));
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to finalize bill');
    } finally {
      setActionLoading(false);
    }
  };

  // Print Customer Bill (80mm)
  const handlePrintCustomerBill = (orderToPrint?: Order, isPaidStatus: boolean = false) => {
    const targetOrder = orderToPrint || activeOrder;
    if (!targetOrder || !selectedTable) return;

    const billItems = targetOrder.items
      ?.filter((i: any) => i.status !== 'cancelled')
      .map((i: any) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        taxPercent: i.taxPercent,
      })) || [];

    const orderNum = targetOrder.orderNumber || targetOrder._id;
    const tokenNo = targetOrder.orderNumber ? String(targetOrder.orderNumber).slice(-2) : targetOrder._id.slice(-2);

    const enteredSettlement = settlementInput.trim() !== '' ? Number(settlementInput) : targetOrder.total;
    const finalSettled = targetOrder.settledAmount !== null && targetOrder.settledAmount !== undefined
      ? targetOrder.settledAmount
      : (isNaN(enteredSettlement) ? targetOrder.total : enteredSettlement);
    const finalWaived = targetOrder.waivedAmount !== undefined
      ? targetOrder.waivedAmount
      : Math.max(0, targetOrder.total - finalSettled);

    printCustomerBill({
      orderNumber: orderNum,
      tableNumber: selectedTable.tableNumber,
      billerName: targetOrder.createdBy?.name || 'biller',
      tokenNo: tokenNo,
      createdAt: targetOrder.createdAt,
      items: billItems,
      subtotal: targetOrder.subtotal,
      taxAmount: targetOrder.taxAmount,
      discount: targetOrder.discount,
      discountType: targetOrder.discountType,
      discountValue: targetOrder.discountValue,
      total: targetOrder.total,
      settledAmount: finalSettled,
      waivedAmount: finalWaived,
      paymentMethod: targetOrder.paymentMethod || paymentMethod,
      isPaid: isPaidStatus || targetOrder.status === 'paid',
    });
  };

  // Collect Payment
  const handleCollectPayment = async () => {
    if (!activeOrder) return;

    const enteredSettlement = settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total;
    if (isNaN(enteredSettlement) || enteredSettlement < 0) {
      alert('Please enter a valid non-negative settlement amount');
      return;
    }

    const waived = Math.max(0, Math.round((activeOrder.total - enteredSettlement) * 100) / 100);
    const confirmMsg = waived > 0
      ? `Collect ${formatCurrency(enteredSettlement)} via ${paymentMethod.toUpperCase()} (Waived: ${formatCurrency(waived)}) and free Table ${selectedTable?.tableNumber}?`
      : `Collect ${formatCurrency(enteredSettlement)} via ${paymentMethod.toUpperCase()} and free Table ${selectedTable?.tableNumber}?`;

    if (!confirm(confirmMsg)) return;

    try {
      setActionLoading(true);
      const res = await ordersApi.pay(activeOrder._id, paymentMethod, enteredSettlement);
      handlePrintCustomerBill(res.data, true);
      alert(`Payment of ${formatCurrency(res.data.settledAmount ?? enteredSettlement)} recorded successfully!${waived > 0 ? ` (Waived: ${formatCurrency(waived)})` : ''} Table ${selectedTable?.tableNumber} is now available.`);
      closeOrderModal();
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to collect payment');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Order
  const handleCancelOrder = async () => {
    if (!activeOrder) return;
    if (!confirm(`Are you sure you want to cancel the entire order for Table ${selectedTable?.tableNumber}? This will free the table.`)) return;

    try {
      setActionLoading(true);
      await ordersApi.cancel(activeOrder._id);
      closeOrderModal();
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to cancel order');
    } finally {
      setActionLoading(false);
    }
  };

  // Table CRUD handlers
  const openCreateTable = () => {
    setEditingTable(null);
    setTableForm({ tableNumber: `T${tables.length + 1}`, capacity: 4, status: 'available' });
    setTableModal('create');
  };

  const openEditTable = (table: Table) => {
    setEditingTable(table);
    setTableForm({
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      status: table.status,
    });
    setTableModal('edit');
  };

  const saveTable = async () => {
    if (!tableForm.tableNumber.trim()) return alert('Table number is required');
    try {
      if (tableModal === 'edit' && editingTable) {
        await tablesApi.update(editingTable._id, tableForm);
      } else {
        await tablesApi.create(tableForm);
      }
      setTableModal(null);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save table');
    }
  };

  const deleteTable = async (table: Table) => {
    if (table.status === 'occupied') {
      alert('Cannot delete an occupied table');
      return;
    }
    if (!confirm(`Delete Table ${table.tableNumber}?`)) return;
    try {
      await tablesApi.delete(table._id);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete table');
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-brand-500" />
              Dine-In POS & Tables
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Live table status, KOT orders, billing, and settlement
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={togglePrintMode}
              type="button"
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shadow-sm',
                printMode === 'test'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100'
              )}
              title="Click to toggle between Test Mode (Visual Preview & PDF) and Production Mode (Silent Print)"
            >
              {printMode === 'test' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>🧪 Test Mode (Preview &amp; PDF)</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>🚀 Production Mode (Silent Print)</span>
                </>
              )}
            </button>
            <button onClick={loadData} className="btn-secondary flex items-center gap-1.5" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            {isAdmin && (
              <button onClick={openCreateTable} className="btn-primary flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Add Table
              </button>
            )}
          </div>
        </div>

        {/* Non-Admin Notice Banner */}
        {!isAdmin && (
          <div className="flex items-center gap-2.5 p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl text-xs text-blue-800 dark:text-blue-300">
            <ShieldAlert className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <span className="font-bold">Staff View (Read-Only POS):</span> Order creation, item updates, billing, discounts, and settlements are restricted to Administrator accounts. You can monitor live table occupancy and reprint customer receipts/KOTs.
            </div>
          </div>
        )}

        {/* Status Summary & Filter Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'card p-4 text-left transition-all border-2',
              statusFilter === 'all'
                ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md'
                : 'border-transparent hover:border-gray-200'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase">All Tables</span>
              <LayoutGrid className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{stats.total}</p>
          </button>

          <button
            onClick={() => setStatusFilter('available')}
            className={cn(
              'card p-4 text-left transition-all border-2',
              statusFilter === 'available'
                ? 'border-green-500 ring-2 ring-green-500/20 shadow-md'
                : 'border-transparent hover:border-green-100'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase">Available</span>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">{stats.available}</p>
          </button>

          <button
            onClick={() => setStatusFilter('occupied')}
            className={cn(
              'card p-4 text-left transition-all border-2',
              statusFilter === 'occupied'
                ? 'border-red-500 ring-2 ring-red-500/20 shadow-md'
                : 'border-transparent hover:border-red-100'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">Occupied</span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            </div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">{stats.occupied}</p>
          </button>

          <button
            onClick={() => setStatusFilter('reserved')}
            className={cn(
              'card p-4 text-left transition-all border-2',
              statusFilter === 'reserved'
                ? 'border-yellow-500 ring-2 ring-yellow-500/20 shadow-md'
                : 'border-transparent hover:border-yellow-100'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 uppercase">Reserved</span>
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            </div>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">{stats.reserved}</p>
          </button>
        </div>

        {/* Table Cards Grid */}
        {loading ? (
          <div className="py-24 flex justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="card p-12 text-center">
            <LayoutGrid className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-base">No tables found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Add your restaurant tables to start seating guests and recording orders.
            </p>
            {isAdmin && (
              <button onClick={openCreateTable} className="btn-primary mt-4 inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Add First Table
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTables.map((table) => {
              const isOccupied = table.status === 'occupied';
              const isAvailable = table.status === 'available';
              const isReserved = table.status === 'reserved';
              const order = table.activeOrder;

              return (
                <div
                  key={table._id}
                  onClick={() => handleTableClick(table)}
                  className={cn(
                    'card p-4 transition-all duration-200 cursor-pointer border-2 relative overflow-hidden flex flex-col justify-between group',
                    isOccupied && 'border-red-400/80 bg-red-50/20 dark:bg-red-950/10 hover:border-red-500 hover:shadow-lg',
                    isAvailable && 'border-green-300 dark:border-green-900/60 hover:border-green-500 hover:shadow-lg',
                    isReserved && 'border-yellow-400/80 bg-yellow-50/20 dark:bg-yellow-950/10 hover:border-yellow-500 hover:shadow-lg'
                  )}
                >
                  {/* Top table info */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-lg text-gray-900 dark:text-white group-hover:text-brand-600 transition-colors">
                          {table.tableNumber}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                          <Users className="w-3 h-3" />
                          {table.capacity}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isAvailable && <span className="badge-green text-xs font-semibold">Available</span>}
                        {isOccupied && (
                          <span className="badge-red text-xs font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            Occupied
                          </span>
                        )}
                        {isReserved && <span className="badge-yellow text-xs font-semibold">Reserved</span>}
                      </div>
                    </div>

                    {/* Middle: Order Status or Seating helper */}
                    <div className="mt-3">
                      {isOccupied && order ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Status:</span>
                            <span
                              className={cn(
                                'font-medium uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded',
                                order.status === 'billed' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                                order.status === 'served' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              )}
                            >
                              {order.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Items:</span>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                              {order.items?.filter((i) => i.status !== 'cancelled').length || 0} items
                            </span>
                          </div>
                        </div>
                      ) : isAvailable ? (
                        <div className="text-xs text-gray-400 flex items-center gap-1.5 py-2">
                          <Utensils className="w-3.5 h-3.5 text-green-500" />
                          <span>Tap to open order & seat guests</span>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 py-2">Table currently reserved</div>
                      )}
                    </div>
                  </div>

                  {/* Bottom: Total / Actions */}
                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    {isOccupied && order ? (
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase">Running Total</span>
                        <p className="text-base font-bold text-gray-900 dark:text-white">
                          {formatCurrency(order.total)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Ready for service</span>
                    )}

                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditTable(table);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                          title="Edit Table"
                        >
                          <Users className="w-3.5 h-3.5" />
                        </button>
                        {!isOccupied && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTable(table);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                            title="Delete Table"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* Table Detail & Order Management Modal */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={!!selectedTable}
        onClose={closeOrderModal}
        title={
          selectedTable
            ? `${selectedTable.tableNumber} (${selectedTable.capacity} Seats) — ${
                selectedTable.status === 'occupied' ? 'Live Dine-In Order' : 'New Order'
              }`
            : ''
        }
        size="xl"
      >
        {selectedTable && (
          <div>
            {orderModalLoading ? (
              <div className="py-20 flex justify-center">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : selectedTable.status === 'available' || !activeOrder ? (
              /* ── CASE 1: Table is Available -> Open Order Screen ── */
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-300">
                      Table is Available — Select items to generate KOT &amp; Seat Guests
                    </span>
                  </div>
                  {selectedTable.status === 'reserved' && isAdmin && (
                    <button
                      onClick={async () => {
                        await tablesApi.update(selectedTable._id, { status: 'available' });
                        selectedTable.status = 'available';
                        await loadData();
                      }}
                      className="btn-secondary text-xs py-1"
                    >
                      Clear Reservation
                    </button>
                  )}
                </div>

                {!isAdmin && (
                  <div className="flex items-center gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
                    <span><strong>Admin Permission Required:</strong> Order handling is allowed through Admin accounts only. You can browse the menu and cart preview, but opening orders and sending KOTs is restricted.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Left Column: Menu Picker (7 cols) */}
                  <div className="md:col-span-7 space-y-3">
                    {/* Search & Category Tabs */}
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={menuSearch}
                          onChange={(e) => setMenuSearch(e.target.value)}
                          placeholder="Search items for order..."
                          className="input pl-9 text-xs"
                        />
                      </div>

                      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        <button
                          onClick={() => setMenuCatFilter('all')}
                          className={cn(
                            'px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                            menuCatFilter === 'all'
                              ? 'bg-brand-500 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                          )}
                        >
                          All
                        </button>
                        {categories.map((c) => (
                          <button
                            key={c._id}
                            onClick={() => setMenuCatFilter(c._id)}
                            className={cn(
                              'px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                              menuCatFilter === c._id
                                ? 'bg-brand-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                            )}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Menu Items List */}
                    <div className="max-h-96 overflow-y-auto space-y-2 pr-1 divide-y divide-gray-100 dark:divide-gray-800">
                      {menuItems
                        .filter((item) => {
                          if (menuCatFilter !== 'all') {
                            const cId = typeof item.category === 'object' && item.category !== null ? item.category._id : item.category;
                            if (cId !== menuCatFilter) return false;
                          }
                          if (menuSearch.trim()) {
                            return item.name.toLowerCase().includes(menuSearch.toLowerCase());
                          }
                          return true;
                        })
                        .map((item) => {
                          const inCart = cart[item._id]?.quantity || 0;
                          return (
                            <div key={item._id} className="pt-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'w-3 h-3 border rounded-sm flex items-center justify-center p-0.5',
                                    item.isVeg ? 'border-green-600' : 'border-red-600'
                                  )}
                                >
                                  <span className={cn('w-1.5 h-1.5 rounded-full', item.isVeg ? 'bg-green-600' : 'bg-red-600')} />
                                </span>
                                <div>
                                  <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">{item.name}</p>
                                  <p className="text-[11px] text-gray-500 font-medium">
                                    {formatCurrency(item.price)} <span className="text-gray-400">+{item.taxPercent}%</span>
                                  </p>
                                </div>
                              </div>

                              {/* Cart +/- */}
                              <div className="flex items-center gap-1.5">
                                {inCart > 0 ? (
                                  <div className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800/60 rounded-lg p-0.5">
                                    <button onClick={() => updateCartQty(item._id, -1)} className="p-1 text-brand-600 hover:bg-brand-100 rounded">
                                      <MinusCircle className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="text-xs font-bold text-brand-600 px-1">{inCart}</span>
                                    <button onClick={() => updateCartQty(item._id, +1)} className="p-1 text-brand-600 hover:bg-brand-100 rounded">
                                      <PlusCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => updateCartQty(item._id, 1)}
                                    className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-500 hover:text-brand-500 transition-colors"
                                  >
                                    + Add
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Right Column: Order Cart & Open Order (5 cols) */}
                  <div className="md:col-span-5 bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800 mb-3">
                        <span className="font-semibold text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300">
                          Initial Order (KOT Round 1)
                        </span>
                        <span className="badge-green text-[10px]">{cartSummary.itemCount} item(s)</span>
                      </div>

                      {cartSummary.itemCount === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-xs">
                          Select menu items from the left to start this table&apos;s order.
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                          {Object.entries(cart).map(([itemId, d]) => {
                            const item = menuItems.find((i) => i._id === itemId);
                            if (!item) return null;
                            return (
                              <div key={itemId} className="text-xs bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                                  <span className="font-semibold">{formatCurrency(item.price * d.quantity)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <button onClick={() => updateCartQty(itemId, -1)} className="text-gray-400 hover:text-red-500">
                                      <MinusCircle className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="font-bold text-xs">{d.quantity}</span>
                                    <button onClick={() => updateCartQty(itemId, 1)} className="text-gray-400 hover:text-green-500">
                                      <PlusCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={d.notes || ''}
                                    onChange={(e) => updateCartNotes(itemId, e.target.value)}
                                    placeholder="Add kitchen note (e.g. less spicy)..."
                                    className="input text-[11px] py-0.5 px-2 w-44"
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Cart Summary & Open Order Button */}
                    <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Items Subtotal:</span>
                        <span>{formatCurrency(cartSummary.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Tax / GST:</span>
                        <span>{formatCurrency(cartSummary.taxAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-800">
                        <span>Estimated Total:</span>
                        <span>{formatCurrency(cartSummary.total)}</span>
                      </div>

                      <button
                        onClick={handleOpenOrder}
                        disabled={!isAdmin || cartSummary.itemCount === 0 || actionLoading}
                        className="btn-primary w-full mt-3 flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <ChefHat className="w-4 h-4" />
                        {!isAdmin
                          ? 'Admin Access Required to Open Order'
                          : actionLoading
                          ? 'Creating Order...'
                          : 'Open Order & Send KOT'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── CASE 2: Table is Occupied -> Live Order, KOT Rounds, Billing & Payment ── */
              <div className="space-y-5">
                {!isAdmin && (
                  <div className="flex items-center gap-2.5 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl text-xs text-blue-800 dark:text-blue-300">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span><strong>Staff Mode (Read-Only Order View):</strong> You can review items and print customer receipts/KOTs. Adding KOT rounds, discounts, billing, and settlements are restricted to Administrators.</span>
                  </div>
                )}

                {/* Order Meta Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'badge text-xs font-bold uppercase tracking-wider px-2.5 py-1',
                        activeOrder.status === 'billed' ? 'badge-purple' :
                        activeOrder.status === 'served' ? 'badge-blue' :
                        'badge-yellow'
                      )}
                    >
                      Status: {activeOrder.status}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Opened {new Date(activeOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {activeOrder.createdBy && (
                      <span className="text-xs text-gray-400">By {activeOrder.createdBy.name}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const activeItems = activeOrder.items
                          ?.filter((i: any) => i.status !== 'cancelled')
                          .map((i: any) => ({
                            name: i.name,
                            quantity: i.quantity,
                            notes: i.notes,
                          })) || [];
                        const orderNum = activeOrder.orderNumber || activeOrder._id;
                        const tokenNo = activeOrder.orderNumber ? String(activeOrder.orderNumber).slice(-2) : activeOrder._id.slice(-2);
                        printKOT({
                          tableNumber: selectedTable.tableNumber,
                          kotNumber: `KOT-${activeOrder.orderNumber ? activeOrder.orderNumber : activeOrder._id.slice(-4)}-ALL`,
                          orderNumber: orderNum,
                          tokenNo: tokenNo,
                          billerName: activeOrder.createdBy?.name || 'Staff',
                          roundTag: '[FULL KOT REPRINT]',
                          createdAt: activeOrder.createdAt,
                          items: activeItems,
                        });
                      }}
                      className="btn-secondary text-xs py-1.5 flex items-center gap-1 text-gray-700 dark:text-gray-300"
                      title="Print or reprint 80mm KOT ticket"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print KOT
                    </button>
                    {isAdmin && activeOrder.status !== 'billed' && activeOrder.status !== 'paid' && (
                      <button
                        onClick={() => setShowAddRound(!showAddRound)}
                        className={cn(
                          'btn-secondary text-xs py-1.5 flex items-center gap-1',
                          showAddRound && 'bg-brand-50 border-brand-300 text-brand-600 dark:bg-brand-950/30'
                        )}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        {showAddRound ? 'Close Menu' : '+ Add KOT Round'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Optional Collapsible "Add KOT Round" Menu Picker */}
                {showAddRound && (
                  <div className="p-4 border-2 border-dashed border-brand-300 dark:border-brand-900 rounded-xl bg-brand-50/20 dark:bg-brand-950/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 flex items-center gap-1.5">
                        <ChefHat className="w-4 h-4" /> Add Another KOT Round
                      </h4>
                      <span className="text-xs text-gray-500">{Object.keys(roundCart).length} selected</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Search & Categories */}
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={roundSearch}
                            onChange={(e) => setRoundSearch(e.target.value)}
                            placeholder="Filter items..."
                            className="input text-xs py-1 pl-8"
                          />
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1 divide-y divide-gray-100 dark:divide-gray-800">
                          {menuItems
                            .filter((item) => {
                              if (roundSearch.trim()) {
                                return item.name.toLowerCase().includes(roundSearch.toLowerCase());
                              }
                              return true;
                            })
                            .map((item) => {
                              const qty = roundCart[item._id]?.quantity || 0;
                              return (
                                <div key={item._id} className="pt-1.5 flex items-center justify-between text-xs">
                                  <span>{item.name} ({formatCurrency(item.price)})</span>
                                  <div className="flex items-center gap-1">
                                    {qty > 0 ? (
                                      <div className="flex items-center gap-1 bg-white dark:bg-gray-900 px-1 py-0.5 rounded border">
                                        <button onClick={() => updateRoundQty(item._id, -1)} className="text-gray-500 hover:text-red-500">
                                          <MinusCircle className="w-3 h-3" />
                                        </button>
                                        <span className="font-bold text-xs">{qty}</span>
                                        <button onClick={() => updateRoundQty(item._id, 1)} className="text-gray-500 hover:text-green-500">
                                          <PlusCircle className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button onClick={() => updateRoundQty(item._id, 1)} className="btn-secondary text-[10px] py-0.5 px-2">
                                        + Add
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Selected Round Items Preview & Confirm */}
                      <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border flex flex-col justify-between">
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          <p className="text-[11px] font-semibold text-gray-500 uppercase">Selected for this round:</p>
                          {Object.keys(roundCart).length === 0 ? (
                            <p className="text-xs text-gray-400 py-3 text-center">No items chosen yet</p>
                          ) : (
                            Object.entries(roundCart).map(([itemId, d]) => {
                              const item = menuItems.find((i) => i._id === itemId);
                              return (
                                <div key={itemId} className="text-xs space-y-1 border-b pb-1">
                                  <div className="flex justify-between font-medium">
                                    <span>{item?.name} x {d.quantity}</span>
                                    <span>{formatCurrency((item?.price || 0) * d.quantity)}</span>
                                  </div>
                                  <input
                                    type="text"
                                    value={d.notes || ''}
                                    onChange={(e) => updateRoundNotes(itemId, e.target.value)}
                                    placeholder="Round notes (optional)..."
                                    className="input text-[10px] py-0.5 px-1.5 w-full"
                                  />
                                </div>
                              );
                            })
                          )}
                        </div>

                        <button
                          onClick={handleAddRound}
                          disabled={Object.keys(roundCart).length === 0 || actionLoading}
                          className="btn-primary text-xs py-1.5 w-full mt-2 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          <ChefHat className="w-3.5 h-3.5" />
                          Send KOT to Kitchen
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ordered Items Table */}
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800">
                      <tr>
                        <th className="table-th">Item</th>
                        <th className="table-th">Qty</th>
                        <th className="table-th">Price</th>
                        <th className="table-th">Tax</th>
                        <th className="table-th">Line Total</th>
                        <th className="table-th">Item Status</th>
                        <th className="table-th text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {activeOrder.items?.map((item: any) => {
                        const isCancelled = item.status === 'cancelled';
                        const lineTotal = item.price * item.quantity;

                        return (
                          <tr
                            key={item._id}
                            className={cn(
                              'transition-colors',
                              isCancelled && 'opacity-40 bg-gray-50/50 dark:bg-gray-900/30'
                            )}
                          >
                            <td className="table-td font-medium">
                              <span className={cn(isCancelled && 'line-through')}>{item.name}</span>
                              {item.notes && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                                  Note: {item.notes}
                                </p>
                              )}
                            </td>
                            <td className="table-td font-bold">{item.quantity}</td>
                            <td className="table-td text-gray-500">{formatCurrency(item.price)}</td>
                            <td className="table-td text-gray-400">+{item.taxPercent || 0}%</td>
                            <td className="table-td font-bold text-gray-900 dark:text-white">
                              {isCancelled ? '—' : formatCurrency(lineTotal)}
                            </td>
                            <td className="table-td">
                              {isCancelled ? (
                                <span className="badge-red text-[10px]">Cancelled</span>
                              ) : !isAdmin ? (
                                <span
                                  className={cn(
                                    'text-[11px] font-semibold py-1 px-2 rounded-md border inline-block uppercase tracking-wider',
                                    item.status === 'served' ? 'bg-green-50 border-green-300 text-green-700' :
                                    item.status === 'preparing' ? 'bg-blue-50 border-blue-300 text-blue-700' :
                                    'bg-yellow-50 border-yellow-300 text-yellow-700'
                                  )}
                                >
                                  {item.status}
                                </span>
                              ) : (
                                <select
                                  value={item.status}
                                  onChange={(e) => handleItemStatusChange(item._id, e.target.value)}
                                  className={cn(
                                    'text-[11px] font-semibold py-1 px-2 rounded-md border focus:outline-none transition-colors',
                                    item.status === 'served' ? 'bg-green-50 border-green-300 text-green-700' :
                                    item.status === 'preparing' ? 'bg-blue-50 border-blue-300 text-blue-700' :
                                    'bg-yellow-50 border-yellow-300 text-yellow-700'
                                  )}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="preparing">Preparing</option>
                                  <option value="served">Served</option>
                                </select>
                              )}
                            </td>
                            <td className="table-td text-right">
                              {!isCancelled && activeOrder.status !== 'paid' && isAdmin ? (
                                <button
                                  onClick={() => handleCancelItem(item._id, item.name)}
                                  className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                                  title="Cancel Item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Financial Breakdown & Discount Box */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                  {/* Left: Discount Adjustment */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="label text-xs font-semibold">Apply Discount</label>
                      {isAdmin && (
                        <div className="inline-flex rounded-lg bg-gray-200 dark:bg-gray-700 p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setDiscountType('flat')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-md transition-all',
                              discountType === 'flat'
                                ? 'bg-white dark:bg-gray-900 text-brand-600 shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                            )}
                          >
                            Flat (₹)
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountType('percentage')}
                            className={cn(
                              'px-2.5 py-0.5 rounded-md transition-all',
                              discountType === 'percentage'
                                ? 'bg-white dark:bg-gray-900 text-brand-600 shadow-sm'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                            )}
                          >
                            Percentage (%)
                          </button>
                        </div>
                      )}
                    </div>

                    {isAdmin ? (
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-semibold">
                            {discountType === 'flat' ? '₹' : '%'}
                          </span>
                          <input
                            type="number"
                            min="0"
                            max={discountType === 'percentage' ? 100 : undefined}
                            step="any"
                            value={discountInput}
                            onChange={(e) => setDiscountInput(Math.max(0, +e.target.value))}
                            placeholder={discountType === 'flat' ? '0.00' : '0%'}
                            className="input pl-6 text-xs h-9"
                          />
                        </div>
                        <button
                          onClick={handleApplyDiscount}
                          className="btn-secondary text-xs px-3 whitespace-nowrap h-9"
                        >
                          Apply Discount
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic py-1">
                        Discounts can only be configured by Administrators.
                      </p>
                    )}

                    {discountType === 'percentage' && discountInput > 0 && (
                      <p className="text-[11px] text-gray-500">
                        ≈ {formatCurrency(Math.round(((activeOrder.subtotal * discountInput) / 100) * 100) / 100)} off subtotal
                      </p>
                    )}

                    {activeOrder.discount > 0 && (
                      <p className="text-[11px] text-green-600 font-medium">
                        Discount of {formatCurrency(activeOrder.discount)} ({activeOrder.discountType === 'percentage' ? `${activeOrder.discountValue}%` : 'Flat'}) applied to bill.
                      </p>
                    )}
                  </div>

                  {/* Right: Totals */}
                  <div className="space-y-1.5 text-xs text-right">
                    <div className="flex justify-between text-gray-500">
                      <span>Subtotal:</span>
                      <span className="font-semibold">{formatCurrency(activeOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Tax / GST:</span>
                      <span className="font-semibold">{formatCurrency(activeOrder.taxAmount)}</span>
                    </div>
                    {activeOrder.discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>
                          Discount {activeOrder.discountType === 'percentage' ? `(${activeOrder.discountValue}%)` : ''}:
                        </span>
                        <span className="font-semibold">−{formatCurrency(activeOrder.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-black text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-800">
                      <span>Grand Total:</span>
                      <span className="text-brand-600">{formatCurrency(activeOrder.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Context-Aware Action Workflow Bar */}
                <div className="pt-3 border-t border-gray-200 dark:border-gray-800 space-y-3">
                  {/* Secondary actions row & Finalize Bill */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {/* Cancel order button (allowed only for admin unless paid) */}
                      {activeOrder.status !== 'paid' && isAdmin && (
                        <button
                          onClick={handleCancelOrder}
                          disabled={actionLoading}
                          className="btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs py-2 px-3 w-full sm:w-auto"
                        >
                          Cancel Order
                        </button>
                      )}

                      {/* Manual Print Bill Button */}
                      <button
                        onClick={() => handlePrintCustomerBill()}
                        className="btn-secondary text-gray-700 dark:text-gray-300 text-xs py-2 px-3 flex items-center justify-center gap-1.5 w-full sm:w-auto"
                        title="Print 80mm Customer Receipt"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Print Bill
                      </button>
                    </div>

                    {/* Flow 1: Not Billed -> "Finalize Bill" */}
                    {activeOrder.status !== 'billed' && activeOrder.status !== 'paid' && isAdmin && (
                      <button
                        onClick={handleFinalizeBill}
                        disabled={actionLoading}
                        className="btn-primary text-xs py-2.5 px-6 flex items-center justify-center gap-1.5 w-full sm:w-auto ml-auto"
                      >
                        <Receipt className="w-4 h-4" />
                        {actionLoading ? 'Finalizing...' : 'Finalize Bill'}
                      </button>
                    )}
                  </div>

                  {/* Flow 2: Once Billed -> Settlement Box & Payment Collection */}
                  {activeOrder.status === 'billed' && (
                    isAdmin ? (
                      <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-3">
                        {/* Settlement Input & Waived Indicator */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                              Settlement Amount:
                            </label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={settlementInput}
                                onChange={(e) => setSettlementInput(e.target.value)}
                                placeholder={String(activeOrder.total)}
                                className="input pl-6 py-1 text-sm font-bold w-36 h-9 bg-white dark:bg-gray-900"
                              />
                            </div>
                            {settlementInput !== '' && Number(settlementInput) !== activeOrder.total && (
                              <button
                                type="button"
                                onClick={() => setSettlementInput(String(activeOrder.total))}
                                className="text-[11px] text-brand-600 hover:underline font-medium"
                              >
                                Reset to {formatCurrency(activeOrder.total)}
                              </button>
                            )}
                          </div>

                          {/* Waived off alert */}
                          {(() => {
                            const entered = settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total;
                            const waived = !isNaN(entered) && entered < activeOrder.total
                              ? Math.max(0, Math.round((activeOrder.total - entered) * 100) / 100)
                              : 0;
                            if (waived > 0) {
                              return (
                                <div className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-2.5 py-1 rounded-md border border-amber-300 dark:border-amber-800">
                                  Waived Off: <span className="font-bold underline">{formatCurrency(waived)}</span> (discrepancy recorded)
                                </div>
                              );
                            }
                            return (
                              <div className="text-xs text-gray-500 font-medium">
                                Full settlement: {formatCurrency(activeOrder.total)}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Payment Mode Selector & Collect Button */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-amber-200/60 dark:border-amber-900/30">
                          {/* Payment mode buttons - 2x2 grid on mobile, flex row on sm+ */}
                          <div className="grid grid-cols-2 sm:flex items-center gap-1.5 bg-white dark:bg-gray-900 p-1.5 rounded-lg border border-gray-200 dark:border-gray-800 w-full sm:w-auto">
                            {[
                              { id: 'cash', label: 'Cash', icon: Wallet },
                              { id: 'upi', label: 'UPI', icon: Smartphone },
                              { id: 'card', label: 'Card', icon: CreditCard },
                              { id: 'other', label: 'Other', icon: Building2 },
                            ].map(({ id, label, icon: Icon }) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setPaymentMethod(id as any)}
                                className={cn(
                                  'px-3 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1 transition-colors',
                                  paymentMethod === id
                                    ? 'bg-brand-600 text-white shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                                )}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                              </button>
                            ))}
                          </div>

                          <button
                            onClick={handleCollectPayment}
                            disabled={actionLoading}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs py-2.5 px-6 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto ml-auto"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {actionLoading
                              ? 'Settling...'
                              : `Collect ${formatCurrency(
                                  settlementInput.trim() !== '' && !isNaN(Number(settlementInput))
                                    ? Number(settlementInput)
                                    : activeOrder.total
                                )}`}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-purple-50/80 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="text-xs text-purple-900 dark:text-purple-300 text-center sm:text-left">
                          <span className="font-bold">Bill Finalized ({formatCurrency(activeOrder.total)}).</span> Waiting for an Administrator to collect payment settlement and clear Table {selectedTable?.tableNumber}.
                        </div>
                        <button
                          onClick={() => handlePrintCustomerBill()}
                          className="btn-primary text-xs py-2 px-4 flex items-center justify-center gap-1.5 w-full sm:w-auto shrink-0"
                        >
                          <Receipt className="w-4 h-4" />
                          Print Customer Bill
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ───────────────────────────────────────────────────────── */}
      {/* Create / Edit Table Modal */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={tableModal === 'create' || tableModal === 'edit'}
        onClose={() => setTableModal(null)}
        title={tableModal === 'create' ? 'Add New Dining Table' : 'Edit Dining Table'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Table Number / Name *</label>
            <input
              type="text"
              className="input"
              value={tableForm.tableNumber}
              onChange={(e) => setTableForm({ ...tableForm, tableNumber: e.target.value })}
              placeholder="e.g. Table 01, Patio 2, Bar 1"
            />
          </div>

          <div>
            <label className="label">Seating Capacity</label>
            <input
              type="number"
              min="1"
              className="input"
              value={tableForm.capacity}
              onChange={(e) => setTableForm({ ...tableForm, capacity: Math.max(1, +e.target.value) })}
              placeholder="4"
            />
          </div>

          <div>
            <label className="label">Initial Status</label>
            <select
              className="input"
              value={tableForm.status}
              onChange={(e) => setTableForm({ ...tableForm, status: e.target.value as 'available' | 'reserved' })}
            >
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>

          <div className="flex gap-3 pt-3">
            <button onClick={saveTable} className="btn-primary flex-1">
              {tableModal === 'create' ? 'Create Table' : 'Update Table'}
            </button>
            <button onClick={() => setTableModal(null)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
