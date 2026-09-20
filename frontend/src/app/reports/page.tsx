'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import { reportsApi } from '@/lib/api';
import { ordersApi, menuApi, MenuItem } from '@/lib/pos-api';
import { useAuth } from '@/lib/auth';
import { formatCurrency, monthStart, today, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { printCustomerBill, BillItem } from '@/lib/thermal-print';
import {
  BarChart3, TrendingUp, TrendingDown, FileText, Calendar,
  Download, Search, Filter, ChevronDown, ChevronUp, Clock,
  Receipt, CheckCircle, AlertTriangle, Wallet, Smartphone,
  CreditCard, Building2, UtensilsCrossed, RefreshCw,
  Pencil, Trash2, Plus, X, AlertCircle, Check, ArrowRight, Layers, EyeOff, BookOpen,
  Printer
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';

const SALES_CACHE_KEY = 'peyala_reports_sales_cache_v1';
const DAILY_CACHE_KEY = 'peyala_reports_daily_cache_v1';
const PNL_CACHE_KEY = 'peyala_reports_pnl_cache_v2';

function readCache(key: string, role = 'default') {
  try {
    const raw = localStorage.getItem(`${key}_${role}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(key: string, data: any, role = 'default') {
  try {
    localStorage.setItem(`${key}_${role}`, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // ignore
  }
}

export default function ReportsPage() {
  const [pnl, setPnl] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState({ start: monthStart(), end: today() });
  const [tab, setTab] = useState<'pnl' | 'daily' | 'sales'>('sales');
  const [dailyDate, setDailyDate] = useState(today());
  const [daily, setDaily] = useState<any>(null);
  const [inventoryReport, setInventoryReport] = useState<any>(null);

  // Detailed Sales Report states
  const [salesRange, setSalesRange] = useState({ start: today(), end: today() });
  const [salesPaymentFilter, setSalesPaymentFilter] = useState('all');
  const [salesStatusFilter, setSalesStatusFilter] = useState('all');
  const [salesSearch, setSalesSearch] = useState('');
  const [salesData, setSalesData] = useState<any>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const { user, isViewer } = useAuth();
  const userRole = user?.role || 'default';
  const isAdmin = user?.role === 'admin';

  // Settled Bill Edit & Delete Admin States
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);

  // Edit Modal internal form states
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editDiscountType, setEditDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [editDiscountValue, setEditDiscountValue] = useState<number | ''>(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'other' | 'part'>('cash');
  const [editSettlementAmount, setEditSettlementAmount] = useState<number | ''>('');
  const [editPartCash, setEditPartCash] = useState<string>('');
  const [editPartUpi, setEditPartUpi] = useState<string>('');
  const [editPartCard, setEditPartCard] = useState<string>('');
  const [editPartOther, setEditPartOther] = useState<string>('');

  // Add item selector inside Edit Modal
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>('');
  const [selectedVariantName, setSelectedVariantName] = useState<string>('');
  const [addItemQty, setAddItemQty] = useState<number>(1);

  const invalidateFinancialCaches = () => {
    try {
      const keys = [
        SALES_CACHE_KEY,
        DAILY_CACHE_KEY,
        PNL_CACHE_KEY,
        'peyala_sales_list_cache_v1',
        'peyala_accounts_cache_v1',
        'peyala_balancesheet_cache_v1',
        'peyala_dashboard_cache_v1',
      ];
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.error('Failed to invalidate financial caches:', e);
    }
  };

  // Print Customer Bill from Detailed Sales Report
  const handlePrintOrderBill = (orderToPrint: any) => {
    if (!orderToPrint) return;

    const printableBillItems: BillItem[] = (orderToPrint.items || [])
      .filter((it: any) => it.status !== 'cancelled')
      .map((it: any) => ({
        name: it.name || 'Item',
        quantity: it.quantity || 1,
        price: it.price || 0,
        taxPercent: it.taxPercent,
        variantName: it.variant?.name || it.variantName,
        addons: it.selectedAddons?.map((a: any) => ({ name: a.name, price: a.price || 0 })),
      }));

    const billerDisplayName = orderToPrint.createdBy?.name || user?.name || 'Staff';
    const isPaid = orderToPrint.status === 'paid';
    const billOrOrderNum = orderToPrint.billNumber || orderToPrint.orderNumber || orderToPrint._id?.slice(-6) || '—';

    try {
      printCustomerBill({
        billNumber: orderToPrint.billNumber,
        orderNumber: orderToPrint.orderNumber,
        tokenNo: orderToPrint.orderNumber ? String(orderToPrint.orderNumber).slice(-2) : orderToPrint._id?.slice(-2),
        tableNumber: orderToPrint.table?.tableNumber ? String(orderToPrint.table.tableNumber) : 'Takeaway',
        billerName: billerDisplayName,
        createdAt: new Date(orderToPrint.createdAt || Date.now()),
        items: printableBillItems,
        subtotal: orderToPrint.subtotal || 0,
        taxAmount: orderToPrint.taxAmount || 0,
        discount: orderToPrint.discount || 0,
        discountType: orderToPrint.discountType,
        discountValue: orderToPrint.discountValue,
        total: orderToPrint.total || 0,
        settledAmount: orderToPrint.settledAmount ?? undefined,
        waivedAmount: orderToPrint.waivedAmount,
        paymentMethod: orderToPrint.paymentMethod || undefined,
        paymentBreakdown: orderToPrint.paymentBreakdown,
        isPaid,
        isReprint: true,
      });

      toast.success(`Printing Bill #${billOrOrderNum}...`);
    } catch (err: any) {
      console.error('Error printing bill:', err);
      toast.error('Failed to print bill slip');
    }
  };

  const openEditModal = async (o: any) => {
    setEditOrder(o);
    const mappedItems = (o.items || []).map((it: any) => ({
      _id: it._id,
      menuItem: it.menuItem?._id || it.menuItem || it.menuItemId,
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      taxPercent: it.taxPercent !== undefined ? it.taxPercent : 5,
      notes: it.notes || '',
      variant: it.variant ? { name: it.variant.name, price: it.variant.price } : undefined,
      selectedAddons: it.selectedAddons || [],
      status: it.status || 'served',
    }));
    setEditItems(mappedItems);
    setEditDiscountType(o.discountType === 'percentage' ? 'percentage' : 'flat');
    setEditPaymentMethod((o.paymentMethod || 'cash').toLowerCase() as any);
    const pb = o.paymentBreakdown || {};
    setEditPartCash(pb.cash ? String(pb.cash) : '');
    setEditPartUpi(pb.upi ? String(pb.upi) : '');
    setEditPartCard(pb.card ? String(pb.card) : '');
    setEditPartOther(pb.other ? String(pb.other) : '');
    const settled = o.settledAmount !== null && o.settledAmount !== undefined ? o.settledAmount : o.total;
    setEditSettlementAmount(settled);

    setSelectedMenuItemId('');
    setSelectedVariantName('');
    setAddItemQty(1);

    if (menuItems.length === 0) {
      try {
        setMenuLoading(true);
        const res = await menuApi.listItems();
        setMenuItems(res.data);
      } catch (err) {
        console.error('Failed to load menu items:', err);
      } finally {
        setMenuLoading(false);
      }
    }
  };

  const handleAddItemToEdit = () => {
    if (!selectedMenuItemId) return;
    const item = menuItems.find((m) => m._id === selectedMenuItemId);
    if (!item) return;

    let itemPrice = item.price;
    let variantObj: { name: string; price: number } | undefined = undefined;

    if (item.hasVariants && item.variants && item.variants.length > 0) {
      const selectedVar = item.variants.find((v) => v.name === selectedVariantName) || item.variants[0];
      if (selectedVar) {
        itemPrice = selectedVar.price;
        variantObj = { name: selectedVar.name, price: selectedVar.price };
      }
    }

    const newItem = {
      menuItem: item._id,
      name: variantObj ? `${item.name} (${variantObj.name})` : item.name,
      price: itemPrice,
      quantity: Math.max(1, addItemQty),
      taxPercent: item.taxPercent !== undefined ? item.taxPercent : 5,
      notes: '',
      variant: variantObj,
      selectedAddons: [],
      status: 'served',
    };

    setEditItems((prev) => [...prev, newItem]);
    setSelectedMenuItemId('');
    setSelectedVariantName('');
    setAddItemQty(1);
  };

  const handleRemoveItemFromEdit = (index: number) => {
    setEditItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItemFromEdit(index);
      return;
    }
    setEditItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, quantity: newQty } : it))
    );
  };

  // Derived calculations for Edit Modal
  const activeEditItems = editItems.filter((it) => it.status !== 'cancelled');
  const editSubtotal = activeEditItems.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0),
    0
  );
  const editTaxAmount = activeEditItems.reduce((sum, it) => {
    const lineTotal = (Number(it.price) || 0) * (Number(it.quantity) || 0);
    const taxPct = it.taxPercent !== undefined ? Number(it.taxPercent) : 5;
    return sum + (lineTotal * taxPct) / 100;
  }, 0);

  const numDiscountValue = Math.max(0, Number(editDiscountValue) || 0);
  const editDiscountAmount = editDiscountType === 'percentage'
    ? Math.round(((editSubtotal * numDiscountValue) / 100) * 100) / 100
    : Math.min(editSubtotal, numDiscountValue);

  const editGrandTotal = Math.max(0, Math.round((editSubtotal - editDiscountAmount + editTaxAmount) * 100) / 100);

  const numEditPartCash = Math.max(0, parseFloat(editPartCash) || 0);
  const numEditPartUpi = Math.max(0, parseFloat(editPartUpi) || 0);
  const numEditPartCard = Math.max(0, parseFloat(editPartCard) || 0);
  const numEditPartOther = Math.max(0, parseFloat(editPartOther) || 0);
  const totalEditPartAllocated = Math.round((numEditPartCash + numEditPartUpi + numEditPartCard + numEditPartOther) * 100) / 100;

  const numEditSettled = editPaymentMethod === 'part'
    ? totalEditPartAllocated
    : (editSettlementAmount === '' ? editGrandTotal : Math.max(0, Number(editSettlementAmount) || 0));
  const editWaived = Math.max(0, Math.round((editGrandTotal - numEditSettled) * 100) / 100);
  const editPartDifference = Math.round((editGrandTotal - totalEditPartAllocated) * 100) / 100;

  // Snapshot comparisons against original order
  const origSettled = editOrder
    ? (editOrder.settledAmount !== null && editOrder.settledAmount !== undefined
      ? editOrder.settledAmount
      : editOrder.total)
    : 0;
  const origMethod = (editOrder?.paymentMethod || 'other').toLowerCase();
  const origTax = editOrder?.taxAmount > 0
    ? editOrder.taxAmount
    : Math.round(origSettled * 0.0477 * 100) / 100;

  const diffSettled = Math.round((numEditSettled - origSettled) * 100) / 100;
  const diffTax = Math.round((editTaxAmount - origTax) * 100) / 100;

  // Split account reconciliation for preview
  const origBreakdown = editOrder?.paymentBreakdown || {};
  const origCash = origMethod === 'part'
    ? (origBreakdown.cash || 0)
    : (origMethod === 'cash' ? origSettled : 0);
  const origDigital = origMethod === 'part'
    ? ((origBreakdown.upi || 0) + (origBreakdown.card || 0) + (origBreakdown.other || 0))
    : (origMethod !== 'cash' ? origSettled : 0);

  const newCash = editPaymentMethod === 'part'
    ? numEditPartCash
    : (editPaymentMethod === 'cash' ? numEditSettled : 0);
  const newDigital = editPaymentMethod === 'part'
    ? (numEditPartUpi + numEditPartCard + numEditPartOther)
    : (editPaymentMethod !== 'cash' ? numEditSettled : 0);

  const diffCash = Math.round((newCash - origCash) * 100) / 100;
  const diffDigital = Math.round((newDigital - origDigital) * 100) / 100;

  const handleSaveEditSettled = async () => {
    if (!editOrder) return;
    if (activeEditItems.length === 0) {
      toast.error('The bill must contain at least one active item.');
      return;
    }
    if (editPaymentMethod === 'part' && totalEditPartAllocated <= 0) {
      toast.error('Please enter at least one part payment amount (Cash, UPI, Card, or Other).');
      return;
    }

    setActionLoading(true);
    try {
      await ordersApi.updateSettled(editOrder._id, {
        items: editItems.map((it) => ({
          menuItem: it.menuItem,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          taxPercent: it.taxPercent,
          notes: it.notes,
          variant: it.variant,
          selectedAddons: it.selectedAddons,
          status: it.status,
        })),
        discountType: editDiscountType,
        discountValue: numDiscountValue,
        paymentMethod: editPaymentMethod,
        settlementAmount: numEditSettled,
        paymentBreakdown: editPaymentMethod === 'part' ? {
          cash: numEditPartCash,
          upi: numEditPartUpi,
          card: numEditPartCard,
          other: numEditPartOther,
        } : undefined,
      });

      invalidateFinancialCaches();
      toast.success('Settled bill updated and reconciled successfully');
      setEditOrder(null);
      await loadSales(true);
    } catch (err: any) {
      console.error('Failed to update settled order:', err);
      toast.error(err?.response?.data?.message || err.message || 'Failed to update settled order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSettled = async () => {
    if (!deleteOrder) return;
    setActionLoading(true);
    try {
      await ordersApi.deleteSettled(deleteOrder._id);
      invalidateFinancialCaches();
      toast.success('Settled bill deleted and financial records updated');
      setDeleteOrder(null);
      if (expandedOrderId === deleteOrder._id) {
        setExpandedOrderId(null);
      }
      await loadSales(true);
    } catch (err: any) {
      console.error('Failed to delete settled order:', err);
      toast.error(err?.response?.data?.message || err.message || 'Failed to delete settled order');
    } finally {
      setActionLoading(false);
    }
  };

  const loadPnl = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setLoading(true);
    try {
      const [r, ir] = await Promise.all([
        reportsApi.pnl(range.start, range.end),
        reportsApi.inventoryPurchases(range.start, range.end)
      ]);
      setPnl(r.data);
      setInventoryReport(ir.data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      writeCache(PNL_CACHE_KEY, { pnl: r.data, inventoryReport: ir.data }, userRole);
    } catch (err) {
      console.error('Failed to load PnL report:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadDaily = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setLoading(true);
    try {
      const r = await reportsApi.daily(dailyDate);
      setDaily(r.data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      writeCache(DAILY_CACHE_KEY, { daily: r.data }, userRole);
    } catch (err) {
      console.error('Failed to load daily report:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSales = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setSalesLoading(true);
    try {
      const res = await reportsApi.sales({
        startDate: salesRange.start,
        endDate: salesRange.end,
        paymentMethod: salesPaymentFilter !== 'all' ? salesPaymentFilter : undefined,
        status: salesStatusFilter !== 'all' ? salesStatusFilter : undefined,
        search: salesSearch.trim() || undefined,
        limit: 300,
      });
      setSalesData(res.data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      writeCache(SALES_CACHE_KEY, { salesData: res.data }, userRole);
    } catch (err) {
      console.error('Failed to load detailed sales report:', err);
    } finally {
      setSalesLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (tab === 'sales') {
      const cached = readCache(SALES_CACHE_KEY, userRole);
      if (cached?.salesData) {
        setSalesData(cached.salesData);
        if (cached.savedAt) {
          setLastUpdated(new Date(cached.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        return;
      }
      loadSales();
    } else if (tab === 'daily') {
      const cached = readCache(DAILY_CACHE_KEY, userRole);
      if (cached?.daily) {
        setDaily(cached.daily);
        if (cached.savedAt) {
          setLastUpdated(new Date(cached.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        return;
      }
      loadDaily();
    } else if (tab === 'pnl') {
      const cached = readCache(PNL_CACHE_KEY, userRole);
      if (cached?.pnl) {
        setPnl(cached.pnl);
        setInventoryReport(cached.inventoryReport || null);
        if (cached.savedAt) {
          setLastUpdated(new Date(cached.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        return;
      }
      loadPnl();
    }
  }, [tab, userRole]);

  const handleRefresh = () => {
    if (tab === 'sales') {
      localStorage.removeItem(SALES_CACHE_KEY);
      loadSales(true);
    } else if (tab === 'daily') {
      localStorage.removeItem(DAILY_CACHE_KEY);
      loadDaily(true);
    } else if (tab === 'pnl') {
      localStorage.removeItem(PNL_CACHE_KEY);
      loadPnl(true);
    }
  };

  const exportSalesCsv = () => {
    if (isViewer) {
      toast.error('Exporting sales reports is disabled for Viewer demo accounts.');
      return;
    }

    if (!salesData || !salesData.orders || salesData.orders.length === 0) {
      toast.warning('No sales data available to export');
      return;
    }

    const headers = [
      'Date',
      'Time',
      'Order / Bill No',
      'Table',
      'Status',
      'Staff / Biller',
      'KOT Rounds',
      'Items Count',
      'Items Detail',
      'Subtotal (₹)',
      'Tax Amount (₹)',
      'Discount Type',
      'Discount Value',
      'Discount Amount (₹)',
      'Grand Total (₹)',
      'Settled Amount (₹)',
      'Waived Off (₹)',
      'Payment Mode'
    ];

    const rows = salesData.orders.map((o: any) => {
      const d = new Date(o.createdAt);
      const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const itemsDetail = (o.items || [])
        .map((it: any) => `${it.quantity}x ${it.name}${it.status === 'cancelled' ? ' [CANCELLED]' : ''}${it.notes ? ` (${it.notes})` : ''}`)
        .join('; ');
      const settled = o.settledAmount !== null && o.settledAmount !== undefined ? o.settledAmount : o.total;

      return [
        `"${dateStr}"`,
        `"${timeStr}"`,
        `"${o.billNumber || o.orderNumber || o._id.slice(-6)}"`,
        `"${o.table?.tableNumber || 'Takeaway'}"`,
        `"${o.status}"`,
        `"${o.createdBy?.name || 'Staff'}"`,
        `"${o.kotCount || 1}"`,
        `"${o.items?.length || 0}"`,
        `"${itemsDetail.replace(/"/g, '""')}"`,
        (o.subtotal || 0).toFixed(2),
        (o.taxAmount || 0).toFixed(2),
        `"${o.discountType || 'flat'}"`,
        o.discountValue || 0,
        (o.discount || 0).toFixed(2),
        (o.total || 0).toFixed(2),
        settled.toFixed(2),
        (o.waivedAmount || 0).toFixed(2),
        `"${(o.paymentMethod || 'other').toUpperCase()}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `peyala_sales_report_${salesRange.start}_to_${salesRange.end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const expenseChartData = pnl?.expenses?.byCategory?.slice(0, 8).map((e: any) => ({
    name: e._id?.slice(0, 12) || 'Other',
    Amount: e.total,
  })) || [];

  const incomeVsExpense = pnl ? [
    { name: 'Revenue', value: pnl.income.total, fill: '#10b981' },
    { name: 'Expenses', value: pnl.expenses.total, fill: '#ef4444' },
    { name: 'Net Profit', value: pnl.netProfit, fill: pnl.netProfit >= 0 ? '#6366f1' : '#f97316' },
  ] : [];

  const formatDayLabel = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const m = parseInt(parts[1], 10) - 1;
      return `${parseInt(parts[2], 10)} ${months[m] || parts[1]}`;
    }
    return dateStr;
  };

  const dailySalesData = pnl?.dailySales?.map((d: any) => ({
    fullDate: d.date,
    displayDate: formatDayLabel(d.date),
    Sales: d.total || 0,
    Outlet: d.outlet || 0,
    Zomato: d.zomato || 0,
    Fatafat: d.fatafat || 0,
    Other: d.other || 0,
  })) || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports & Sales</h1>
            <p className="text-sm text-gray-500">Analytics, sales history and performance reports</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Cached ({lastUpdated})
              </span>
            )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || loading || salesLoading}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              title="Fetch latest data from server"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin text-brand-500")} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <div className="h-5 w-[1px] bg-gray-200 dark:bg-gray-700 hidden sm:block mx-1" />
            <button onClick={() => setTab('sales')} className={tab === 'sales' ? 'btn-primary' : 'btn-secondary'}>Detailed Sales Report</button>
            <button onClick={() => setTab('daily')} className={tab === 'daily' ? 'btn-primary' : 'btn-secondary'}>Daily Report</button>
            <button onClick={() => setTab('pnl')} className={tab === 'pnl' ? 'btn-primary' : 'btn-secondary'}>P&L Statement</button>
            <Link href="/dues" className="btn-secondary text-xs sm:text-sm py-2 px-3 flex items-center gap-1.5 text-amber-700 dark:text-amber-400 hover:border-amber-400">
              <BookOpen className="w-3.5 h-3.5" /> Customer Dues
            </Link>
          </div>
        </div>

        {tab === 'pnl' && (
          <>
            {/* Date Range */}
            <div className="card p-4 flex gap-3 items-end flex-wrap">
              <div><label className="label">Start Date</label><input type="date" className="input" value={range.start} onChange={e => setRange({...range, start: e.target.value})} /></div>
              <div><label className="label">End Date</label><input type="date" className="input" value={range.end} onChange={e => setRange({...range, end: e.target.value})} /></div>
              {/* Quick presets */}
              <div className="flex gap-2">
                {[
                  { l: 'This Month', s: monthStart(), e: today() },
                  { l: 'Last 7 Days', s: new Date(Date.now() - 7*86400000).toISOString().split('T')[0], e: today() },
                  { l: 'Last 30 Days', s: new Date(Date.now() - 30*86400000).toISOString().split('T')[0], e: today() },
                ].map(({ l, s, e }) => (
                  <button key={l} onClick={() => setRange({ start: s, end: e })} className="btn-secondary text-xs px-2 py-1">{l}</button>
                ))}
              </div>
              <button onClick={() => loadPnl(true)} className="btn-primary">Generate Report</button>
            </div>

            {loading ? <div className="text-center py-16 text-gray-400">Generating...</div> : pnl && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
                  {[
                    { label: 'Total Revenue', value: isViewer ? null : pnl.income.total, color: 'text-brand-600', bg: 'from-brand-50 to-orange-50 dark:from-brand-900/10' },
                    { label: 'Total Expenses', value: isViewer ? null : pnl.expenses.total, color: 'text-red-500', bg: 'from-red-50 to-rose-50 dark:from-red-900/10' },
                    { label: 'Gross Profit', value: isViewer ? null : pnl.grossProfit, color: !isViewer && pnl.grossProfit >= 0 ? 'text-green-600' : 'text-red-500', bg: 'from-green-50 to-emerald-50 dark:from-green-900/10' },
                    { label: 'Net Profit', value: isViewer ? null : pnl.netProfit, color: !isViewer && pnl.netProfit >= 0 ? 'text-indigo-600' : 'text-red-500', bg: 'from-indigo-50 to-blue-50 dark:from-indigo-900/10' },
                    { label: 'Recorded Wastage', value: pnl.wastage?.total || 0, color: 'text-rose-600', bg: 'from-rose-50 to-pink-50 dark:from-rose-950/20' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`card p-5 bg-gradient-to-br ${bg}`}>
                      <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center justify-between">
                        <span>{label}</span>
                        {label === 'Recorded Wastage' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                            Info
                          </span>
                        ) : isViewer ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            Protected
                          </span>
                        ) : null}
                      </p>
                      <p className={`text-2xl font-bold mt-1 ${color}`}>
                        {isViewer && label !== 'Recorded Wastage' ? '••••••' : formatCurrency(value)}
                      </p>
                      {label === 'Gross Profit' && (
                        <p className="text-xs text-gray-400 mt-1">
                          {isViewer ? 'Protected in Demo' : `${pnl.grossMargin}% margin`}
                        </p>
                      )}
                      {label === 'Net Profit' && (
                        <p className="text-xs text-gray-400 mt-1">
                          {isViewer ? 'Protected in Demo' : `${pnl.netMargin}% margin`}
                        </p>
                      )}
                      {label === 'Recorded Wastage' && (
                        <p className="text-xs text-gray-400 mt-1">
                          {pnl.wastage?.count || 0} entries · {Number((pnl.wastage?.totalQty || 0).toFixed(1))} units
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Informational Recorded Wastage Banner */}
                {pnl.wastage?.total > 0 && (
                  <div className="card p-4 bg-gradient-to-r from-rose-50/70 via-orange-50/40 to-transparent dark:from-rose-950/20 dark:via-orange-950/10 dark:to-transparent border-rose-200/80 dark:border-rose-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-rose-100 dark:bg-rose-900/40 text-rose-600 rounded-xl flex-shrink-0 mt-0.5">
                        <Trash2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Logged Discarded Items Summary</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                            Operational Info
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Total value of discarded or expired food items logged for this date range is{' '}
                          <strong className="text-rose-600 font-bold">{formatCurrency(pnl.wastage.total)}</strong> across{' '}
                          {pnl.wastage.count} recorded entries ({Number(pnl.wastage.totalQty.toFixed(1))} units).{' '}
                          <span className="italic">Note: Provided for operational visibility; does not impact financial net profit.</span>
                        </p>
                      </div>
                    </div>
                    <a
                      href="/wastage"
                      className="btn-secondary text-xs py-2 px-3 self-start sm:self-center whitespace-nowrap flex items-center gap-1 hover:text-brand-600"
                    >
                      View Wastage Log <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Income Breakdown */}
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" /> Income Breakdown</h3>
                      {isViewer && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          Protected
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {[
                        { label: 'Outlet Sales', value: pnl.income.outlet },
                        { label: 'Zomato (Net Settlement)', value: pnl.income.zomato },
                        { label: 'Fatafat (Net Settlement)', value: pnl.income.fatafat },
                        { label: 'Other Sales', value: pnl.income.other },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{isViewer ? '••••••' : formatCurrency(value || 0)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Total Revenue</span>
                        <span className="text-base font-bold text-green-600">{isViewer ? '••••••' : formatCurrency(pnl.income.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expense Breakdown */}
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" /> Expense Breakdown</h3>
                      {isViewer && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                          Protected
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {isViewer ? (
                        <div className="py-8 text-center text-xs text-gray-400">
                          Detailed expense itemization is confidential and protected in Viewer demo mode.
                        </div>
                      ) : (
                        pnl.expenses.byCategory?.map((e: any) => (
                          <div key={e._id} className="flex justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
                            <span className="text-sm text-gray-600 dark:text-gray-400">{e._id}</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(e.total)}</span>
                          </div>
                        ))
                      )}
                      <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Total Expenses</span>
                        <span className="text-base font-bold text-red-500">{isViewer ? '••••••' : formatCurrency(pnl.expenses.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daily Sales Bar Chart for Selected Period */}
                <div className="card p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-brand-500" />
                        Daily Sales
                      </h3>
                      <p className="text-xs text-gray-500">Per-day sales breakdown across the selected period ({range.start} to {range.end})</p>
                    </div>
                    {isViewer ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        Protected in Demo
                      </span>
                    ) : dailySalesData.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          Total: <strong className="text-gray-900 dark:text-white">{formatCurrency(pnl.income.total)}</strong>
                        </span>
                        <span className="text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-2.5 py-0.5 rounded-full">
                          {dailySalesData.length} {dailySalesData.length === 1 ? 'day' : 'days'}
                        </span>
                      </div>
                    )}
                  </div>
                  {isViewer ? (
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                      <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center mb-3">
                        <EyeOff className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Daily Sales Chart Protected</h4>
                      <p className="text-xs text-gray-400 max-w-sm mt-1">
                        Individual daily sales bars and totals are confidential and hidden in Viewer demo mode.
                      </p>
                    </div>
                  ) : dailySalesData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={dailySalesData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="displayDate" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                        <Tooltip
                          formatter={(v: any, name: string) => [formatCurrency(v), name]}
                          labelFormatter={(label, payload) => {
                            const item = payload?.[0]?.payload;
                            return item ? `${item.fullDate} (${label})` : label;
                          }}
                        />
                        <Bar dataKey="Sales" fill="#e26411" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-12">No sales entries recorded for this period</p>
                  )}
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="card p-5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Revenue vs Expenses vs Profit</h3>
                      {isViewer && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          Protected in Demo
                        </span>
                      )}
                    </div>
                    {isViewer ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center mb-2">
                          <EyeOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <p className="text-xs text-gray-400 max-w-xs">
                          Comparison chart is confidential and hidden in Viewer demo mode.
                        </p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={incomeVsExpense}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: any) => formatCurrency(v)} />
                          <Bar dataKey="value" radius={[4,4,0,0]}>
                            {incomeVsExpense.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="card p-5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Expense by Category</h3>
                      {isViewer && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                          Protected in Demo
                        </span>
                      )}
                    </div>
                    {isViewer ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center justify-center mb-2">
                          <EyeOff className="w-5 h-5 text-red-500 dark:text-red-400" />
                        </div>
                        <p className="text-xs text-gray-400 max-w-xs">
                          Category expenses chart is confidential and hidden in Viewer demo mode.
                        </p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={expenseChartData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                          <Tooltip formatter={(v: any) => formatCurrency(v)} />
                          <Bar dataKey="Amount" fill="#e26411" radius={[0,4,4,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Inventory Item Reports */}
                <div className="card p-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-500" /> Inventory Item Reports</h3>
                  {inventoryReport?.items?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800">
                            <th className="table-th">Item</th>
                            <th className="table-th">Category</th>
                            <th className="table-th">Quantity Bought</th>
                            <th className="table-th">Amount Spent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {inventoryReport.items.map((it: any) => (
                            <tr key={it.itemId}>
                              <td className="table-td font-medium">{it.name}</td>
                              <td className="table-td text-gray-500">{it.category || '-'}</td>
                              <td className="table-td">{it.totalQuantity} {it.unit}</td>
                              <td className="table-td font-medium text-red-500">{isViewer ? '••••••' : formatCurrency(it.totalSpent)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 dark:border-gray-700">
                            <td className="table-td font-bold" colSpan={3}>Total</td>
                            <td className="table-td font-bold text-red-500">
                              {isViewer ? '••••••' : formatCurrency(inventoryReport.items.reduce((s: number, it: any) => s + it.totalSpent, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-10">No purchases in this period</p>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'daily' && (
          <>
            <div className="card p-4 flex gap-3 items-end">
              <div><label className="label">Date</label><input type="date" className="input" value={dailyDate} onChange={e => setDailyDate(e.target.value)} /></div>
              <button onClick={() => loadDaily(true)} className="btn-primary">Load Report</button>
            </div>

            {loading ? <div className="text-center py-16 text-gray-400">Loading...</div> : daily && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="card p-4 text-center">
                    <p className="text-xs text-gray-400">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {isViewer ? '••••••' : formatCurrency(daily.totalRevenue)}
                    </p>
                    {isViewer && <p className="text-[10px] text-gray-400 mt-0.5">Protected in Demo</p>}
                  </div>
                  <div className="card p-4 text-center">
                    <p className="text-xs text-gray-400">Total Expenses</p>
                    <p className="text-2xl font-bold text-red-500 mt-1">
                      {isViewer ? '••••••' : formatCurrency(daily.totalExpenses)}
                    </p>
                    {isViewer && <p className="text-[10px] text-gray-400 mt-0.5">Protected in Demo</p>}
                  </div>
                  <div className="card p-4 text-center">
                    <p className="text-xs text-gray-400">Net Profit</p>
                    <p className={`text-2xl font-bold mt-1 ${!isViewer && daily.netProfit >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                      {isViewer ? '••••••' : formatCurrency(daily.netProfit)}
                    </p>
                    {isViewer && <p className="text-[10px] text-gray-400 mt-0.5">Protected in Demo</p>}
                  </div>
                </div>

                {daily.sales && (
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Sales</h3>
                      {isViewer && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          Protected
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[['Outlet', daily.sales.outletSales], ['Zomato Net', daily.sales.zomato?.netSettlement], ['Fatafat Net', daily.sales.fatafat?.netSettlement], ['Other', daily.sales.otherSales]].map(([l, v]) => (
                        <div key={l as string} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <p className="text-xs text-gray-400">{l as string}</p>
                          <p className="text-base font-bold text-gray-900 dark:text-white">
                            {isViewer ? '••••••' : formatCurrency(+(v || 0))}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {daily.purchases?.length > 0 && (
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Purchases</h3>
                      {isViewer && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          Protected
                        </span>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 dark:bg-gray-800"><th className="table-th">Supplier</th><th className="table-th">Items</th><th className="table-th">Total</th></tr></thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {daily.purchases.map((p: any) => (
                          <tr key={p._id}>
                            <td className="table-td">{p.supplier?.name}</td>
                            <td className="table-td">{p.items?.length} items</td>
                            <td className="table-td font-medium text-red-500">
                              {isViewer ? '••••••' : formatCurrency(p.totalAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {daily.payments?.length > 0 && (
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Payments</h3>
                      {isViewer && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          Protected
                        </span>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 dark:bg-gray-800"><th className="table-th">Payee</th><th className="table-th">Category</th><th className="table-th">Amount</th></tr></thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {daily.payments.map((p: any) => (
                          <tr key={p._id}>
                            <td className="table-td">{p.payee}</td>
                            <td className="table-td"><span className="badge badge-gray">{p.category}</span></td>
                            <td className="table-td font-medium text-red-500">
                              {isViewer ? '••••••' : formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'sales' && (
          <>
            {/* Filter & Date Range Bar */}
            <div className="card p-4 space-y-4">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end justify-between">
                {/* Dates & Presets */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="label text-xs">Start Date</label>
                    <input
                      type="date"
                      className="input py-1.5 text-xs"
                      value={salesRange.start}
                      onChange={(e) => setSalesRange({ ...salesRange, start: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">End Date</label>
                    <input
                      type="date"
                      className="input py-1.5 text-xs"
                      value={salesRange.end}
                      onChange={(e) => setSalesRange({ ...salesRange, end: e.target.value })}
                    />
                  </div>
                  {/* Quick Presets */}
                  <div className="flex gap-1.5 pb-0.5">
                    {[
                      { l: 'Today', s: today(), e: today() },
                      {
                        l: 'Yesterday',
                        s: new Date(Date.now() - 86400000).toISOString().split('T')[0],
                        e: new Date(Date.now() - 86400000).toISOString().split('T')[0],
                      },
                      {
                        l: 'Last 7 Days',
                        s: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
                        e: today(),
                      },
                      { l: 'This Month', s: monthStart(), e: today() },
                    ].map(({ l, s, e }) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setSalesRange({ start: s, end: e })}
                        className="btn-secondary text-[11px] px-2.5 py-1.5"
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export CSV Button */}
                <button
                  type="button"
                  onClick={exportSalesCsv}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 self-end"
                  title="Export filtered sales to CSV"
                >
                  <Download className="w-4 h-4 text-brand-600" />
                  Export CSV
                </button>
              </div>

              {/* Filters row: Payment method, Status, Search, and Apply button */}
              <div className="flex flex-col sm:flex-row gap-3 items-center pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="w-full sm:w-44">
                  <select
                    className="input py-1.5 text-xs"
                    value={salesPaymentFilter}
                    onChange={(e) => setSalesPaymentFilter(e.target.value)}
                  >
                    <option value="all">All Payment Modes</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="other">Other / Bank</option>
                    <option value="part">Part Payment</option>
                  </select>
                </div>

                <div className="w-full sm:w-40">
                  <select
                    className="input py-1.5 text-xs"
                    value={salesStatusFilter}
                    onChange={(e) => setSalesStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="billed">Billed</option>
                    <option value="open">Open</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="relative flex-1 w-full">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by Bill #, Table #, Staff name, or item..."
                    className="input pl-8 py-1.5 text-xs w-full"
                    value={salesSearch}
                    onChange={(e) => setSalesSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadSales()}
                  />
                </div>

                <button
                  onClick={() => loadSales(true)}
                  disabled={salesLoading}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 whitespace-nowrap w-full sm:w-auto"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', salesLoading && 'animate-spin')} />
                  {salesLoading ? 'Filtering...' : 'Apply Filters'}
                </button>
              </div>
            </div>

            {salesLoading ? (
              <div className="text-center py-20 text-gray-400">Loading detailed sales data...</div>
            ) : salesData && (
              <div className="space-y-6">
                {/* Financial Summary KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="card p-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 border-green-200 dark:border-green-900/40">
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Net Settled</p>
                    <p className="text-xl font-black text-green-600 mt-1">
                      {isViewer ? '••••••' : formatCurrency(salesData.summary?.totalSettled || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isViewer ? 'Protected in Demo' : 'Total collected'}
                    </p>
                  </div>

                  <div className="card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase">Gross Sales</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                      {isViewer ? '••••••' : formatCurrency(salesData.summary?.totalGrossSales || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isViewer ? 'Protected in Demo' : 'Subtotal before disc'}
                    </p>
                  </div>

                  <div className="card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase">Tax / GST</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                      {isViewer ? '••••••' : formatCurrency(salesData.summary?.totalTax || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isViewer ? 'Protected in Demo' : 'GST collected'}
                    </p>
                  </div>

                  <div className="card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase">Discounts</p>
                    <p className="text-xl font-bold text-red-500 mt-1">
                      {isViewer ? '••••••' : `−${formatCurrency(salesData.summary?.totalDiscount || 0)}`}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isViewer ? 'Protected in Demo' : 'Flat & % applied'}
                    </p>
                  </div>

                  <div
                    className={cn(
                      'card p-4',
                      (salesData.summary?.totalWaived || 0) > 0
                        ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900/50'
                        : ''
                    )}
                  >
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase">Waived Off</p>
                    <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                      {isViewer ? '••••••' : formatCurrency(salesData.summary?.totalWaived || 0)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isViewer ? 'Protected in Demo' : 'Discrepancy / Rounding'}
                    </p>
                  </div>

                  <div className="card p-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase">Orders Count</p>
                    <p className="text-xl font-bold text-brand-600 mt-1">{salesData.summary?.totalOrders || 0}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">In selected range</p>
                  </div>
                </div>

                {/* Payment Breakdown Bar */}
                <div className="card p-4 bg-gray-50 dark:bg-gray-800/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      Collections by Payment Mode:
                    </span>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                      <div className="flex items-center gap-1.5 text-emerald-600">
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Cash: {isViewer ? '••••••' : formatCurrency(salesData.summary?.paymentBreakdown?.cash || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-purple-600">
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>UPI: {isViewer ? '••••••' : formatCurrency(salesData.summary?.paymentBreakdown?.upi || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-blue-600">
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Card: {isViewer ? '••••••' : formatCurrency(salesData.summary?.paymentBreakdown?.card || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Other: {isViewer ? '••••••' : formatCurrency(salesData.summary?.paymentBreakdown?.other || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Orders Table */}
                <div className="card overflow-hidden">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-brand-600" />
                      Individual Order Records ({salesData.orders?.length || 0})
                    </h2>
                    <span className="text-xs text-gray-400">Click any row to expand full order timeline and KOT details</span>
                  </div>

                  {salesData.orders?.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 text-sm">
                      No sales or orders found for the selected criteria.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-700">
                            <th className="py-3 px-3 text-left">Time & Date</th>
                            <th className="py-3 px-3 text-left">Bill / Order #</th>
                            <th className="py-3 px-3 text-left">Table</th>
                            <th className="py-3 px-3 text-center">KOTs</th>
                            <th className="py-3 px-3 text-left">Items Ordered</th>
                            <th className="py-3 px-3 text-right">Bill Total</th>
                            <th className="py-3 px-3 text-right">Waived</th>
                            <th className="py-3 px-3 text-right">Settled Amount</th>
                            <th className="py-3 px-3 text-center">Payment Mode</th>
                            <th className="py-3 px-3 text-center">Status</th>
                            <th className="py-3 px-3 text-center">{isAdmin ? 'Actions / Details' : 'Details'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {salesData.orders.map((o: any) => {
                            const d = new Date(o.createdAt);
                            const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                            const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                            const isExpanded = expandedOrderId === o._id;
                            const settled = o.settledAmount !== null && o.settledAmount !== undefined ? o.settledAmount : o.total;
                            const waived = o.waivedAmount || 0;
                            const cancelledItemsCount = (o.items || []).filter((i: any) => i.status === 'cancelled').length;

                            return (
                              <React.Fragment key={o._id}>
                                <tr
                                  onClick={() => setExpandedOrderId(isExpanded ? null : o._id)}
                                  className={cn(
                                    'cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
                                    isExpanded && 'bg-orange-50/40 dark:bg-brand-950/20'
                                  )}
                                >
                                  {/* Timestamp */}
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="font-semibold text-gray-900 dark:text-gray-100">{timeStr}</div>
                                    <div className="text-[10px] text-gray-400">{dateStr}</div>
                                  </td>

                                  {/* Bill / Order # */}
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-brand-600 font-mono">
                                        #{o.billNumber || o.orderNumber || o._id.slice(-6)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handlePrintOrderBill(o);
                                        }}
                                        title={`Print Bill #${o.billNumber || o.orderNumber || o._id.slice(-6)}`}
                                        className="p-1 rounded-md text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:text-gray-400 dark:hover:text-brand-400 dark:hover:bg-brand-950/50 border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700 transition-all cursor-pointer shadow-2xs"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <div className="text-[10px] text-gray-400">By {o.createdBy?.name || 'Staff'}</div>
                                  </td>

                                  {/* Table */}
                                  <td className="py-3 px-3 whitespace-nowrap font-medium text-gray-700 dark:text-gray-300">
                                    {o.table?.tableNumber ? `Table ${o.table.tableNumber}` : 'Takeaway'}
                                  </td>

                                  {/* KOT Rounds */}
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                      {o.kotCount || 1} {o.kotCount === 1 ? 'Round' : 'Rounds'}
                                    </span>
                                  </td>

                                  {/* Items Ordered preview */}
                                  <td className="py-3 px-3 max-w-xs">
                                    <div
                                      className="truncate text-gray-700 dark:text-gray-300 font-medium"
                                      title={o.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                                    >
                                      {o.items?.slice(0, 2).map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                                      {(o.items?.length || 0) > 2 && ` +${o.items.length - 2} more`}
                                    </div>
                                    {cancelledItemsCount > 0 && (
                                      <div className="text-[10px] text-red-500 font-semibold">
                                        ⚠️ {cancelledItemsCount} cancelled item{cancelledItemsCount > 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </td>

                                  {/* Bill Total */}
                                  <td className="py-3 px-3 text-right whitespace-nowrap font-medium text-gray-600 dark:text-gray-300">
                                    {isViewer ? '••••••' : formatCurrency(o.total)}
                                    {o.discount > 0 && (
                                      <div className="text-[10px] text-green-600">
                                        Disc: −{isViewer ? '••••••' : formatCurrency(o.discount)}
                                      </div>
                                    )}
                                  </td>

                                  {/* Waived Amount */}
                                  <td className="py-3 px-3 text-right whitespace-nowrap font-semibold">
                                    {waived > 0 ? (
                                      <span className="text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                        {isViewer ? '••••••' : formatCurrency(waived)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>

                                  {/* Settled Amount */}
                                  <td className="py-3 px-3 text-right whitespace-nowrap font-black text-green-600 text-sm">
                                    {isViewer ? '••••••' : formatCurrency(settled)}
                                  </td>

                                  {/* Payment Mode */}
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    {(() => {
                                      const m = (o.paymentMethod || 'other').toLowerCase();
                                      let color = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
                                      let Icon = Building2;
                                      if (m === 'cash') {
                                        color = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
                                        Icon = Wallet;
                                      } else if (m === 'upi') {
                                        color = 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800';
                                        Icon = Smartphone;
                                      } else if (m === 'card') {
                                        color = 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800';
                                        Icon = CreditCard;
                                      } else if (m === 'part') {
                                        color = 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800';
                                        Icon = Layers;
                                      }
                                      return (
                                        <div className="inline-flex flex-col items-center">
                                          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase', color)}>
                                            <Icon className="w-3 h-3" />
                                            {m}
                                          </span>
                                          {m === 'part' && o.paymentBreakdown && (
                                            <span className="text-[10px] text-gray-500 font-medium mt-0.5 whitespace-nowrap">
                                              {[
                                                o.paymentBreakdown.cash > 0 ? `C:₹${o.paymentBreakdown.cash}` : null,
                                                o.paymentBreakdown.upi > 0 ? `U:₹${o.paymentBreakdown.upi}` : null,
                                                o.paymentBreakdown.card > 0 ? `Cr:₹${o.paymentBreakdown.card}` : null,
                                                o.paymentBreakdown.other > 0 ? `O:₹${o.paymentBreakdown.other}` : null,
                                              ].filter(Boolean).join(' ')}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </td>

                                  {/* Status */}
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    {(() => {
                                      if (o.status === 'paid') {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                                            <CheckCircle className="w-3 h-3" /> Paid
                                          </span>
                                        );
                                      } else if (o.status === 'billed') {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                            <Receipt className="w-3 h-3" /> Billed
                                          </span>
                                        );
                                      } else if (o.status === 'cancelled') {
                                        return (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                                            <AlertTriangle className="w-3 h-3" /> Cancelled
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                                          Open
                                        </span>
                                      );
                                    })()}
                                  </td>

                                  {/* Actions & Expand Chevron */}
                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={() => handlePrintOrderBill(o)}
                                        title={`Print Bill #${o.billNumber || o.orderNumber || o._id.slice(-6)}`}
                                        className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:text-gray-400 dark:hover:text-brand-400 dark:hover:bg-brand-950/50 rounded-md transition-colors cursor-pointer"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                      </button>
                                      {isAdmin && o.status === 'paid' && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openEditModal(o)}
                                            title="Edit Settled Bill (Admin)"
                                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-md transition-colors"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setDeleteOrder(o)}
                                            title="Delete Settled Bill & Reverse Financials (Admin)"
                                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/50 rounded-md transition-colors"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setExpandedOrderId(isExpanded ? null : o._id)}
                                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                                        title={isExpanded ? 'Collapse' : 'Expand'}
                                      >
                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-brand-600" /> : <ChevronDown className="w-4 h-4" />}
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {/* Expanded Order Details Panel */}
                                {isExpanded && (
                                  <tr className="bg-gray-50/70 dark:bg-gray-800/40">
                                    <td colSpan={11} className="p-4">
                                      <div className="p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 space-y-4">
                                        {/* Header Row of Details */}
                                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
                                          <div className="flex items-center gap-3">
                                            <span className="font-bold text-sm text-gray-900 dark:text-white font-mono">
                                              {o.billNumber ? `Bill #${o.billNumber} (Order #${o.orderNumber || o._id.slice(-6)})` : `Order #${o.orderNumber || o._id}`}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => handlePrintOrderBill(o)}
                                              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-brand-50 hover:text-brand-600 hover:border-brand-300 dark:hover:bg-brand-950/40 flex items-center gap-1.5 transition-colors cursor-pointer"
                                              title="Print 80mm Bill Receipt"
                                            >
                                              <Printer className="w-3.5 h-3.5 text-brand-600" />
                                              <span>Print Bill</span>
                                            </button>
                                            <span className="text-xs text-gray-500">
                                              Table: <strong>{o.table?.tableNumber || 'Takeaway'}</strong>
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              Staff: <strong>{o.createdBy?.name || 'Staff'}</strong>
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <div className="text-xs text-gray-500 flex items-center gap-4">
                                              <span>
                                                Created: <strong>{new Date(o.createdAt).toLocaleString('en-IN')}</strong>
                                              </span>
                                              {o.updatedAt && o.updatedAt !== o.createdAt && (
                                                <span>
                                                  Last Change: <strong>{new Date(o.updatedAt).toLocaleTimeString('en-IN')}</strong>
                                                </span>
                                              )}
                                            </div>

                                            {isAdmin && o.status === 'paid' && (
                                              <div className="flex items-center gap-2 pl-3 border-l border-gray-200 dark:border-gray-700">
                                                <button
                                                  type="button"
                                                  onClick={() => openEditModal(o)}
                                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 rounded-lg transition-colors shadow-sm"
                                                >
                                                  <Pencil className="w-3.5 h-3.5" /> Edit Bill
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => setDeleteOrder(o)}
                                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-800 rounded-lg transition-colors shadow-sm"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" /> Delete & Reverse
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* KOT Rounds & Items Table */}
                                        <div>
                                          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                            <UtensilsCrossed className="w-3.5 h-3.5 text-brand-600" />
                                            Order Items & KOT Log ({o.items?.length || 0} items across {o.kotCount || 1} round{o.kotCount > 1 ? 's' : ''})
                                          </h4>
                                          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                                                  <th className="py-2 px-3 text-left">Item Name</th>
                                                  <th className="py-2 px-3 text-center">Qty</th>
                                                  <th className="py-2 px-3 text-right">Price</th>
                                                  <th className="py-2 px-3 text-right">Line Total</th>
                                                  <th className="py-2 px-3 text-left">Instructions / Notes</th>
                                                  <th className="py-2 px-3 text-center">Status / Change</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {o.items?.map((it: any, idx: number) => {
                                                  const isCancelled = it.status === 'cancelled';
                                                  return (
                                                    <tr key={idx} className={isCancelled ? 'bg-red-50/50 dark:bg-red-950/20 text-gray-400' : ''}>
                                                      <td className="py-2 px-3 font-semibold">
                                                        <span className={isCancelled ? 'line-through text-red-500' : 'text-gray-900 dark:text-white'}>
                                                          {it.name}
                                                        </span>
                                                      </td>
                                                      <td className="py-2 px-3 text-center font-bold">
                                                        {it.quantity}
                                                      </td>
                                                      <td className="py-2 px-3 text-right">
                                                        {formatCurrency(it.price)}
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-medium">
                                                        {formatCurrency(it.price * it.quantity)}
                                                      </td>
                                                      <td className="py-2 px-3 text-gray-500 italic">
                                                        {it.notes || '—'}
                                                      </td>
                                                      <td className="py-2 px-3 text-center">
                                                        {isCancelled ? (
                                                          <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded">
                                                            Cancelled {it.cancellationReason ? `(${it.cancellationReason})` : ''}
                                                          </span>
                                                        ) : (
                                                          <span className="text-[10px] font-semibold text-green-600 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded">
                                                            Active
                                                          </span>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>

                                        {/* Financial Reconciliation Box */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                                          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                                            <div className="flex justify-between">
                                              <span>Subtotal:</span>
                                              <span className="font-semibold">{formatCurrency(o.subtotal || 0)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span>Tax / GST:</span>
                                              <span className="font-semibold">{formatCurrency(o.taxAmount || 0)}</span>
                                            </div>
                                            {o.discount > 0 && (
                                              <div className="flex justify-between text-green-600 font-semibold">
                                                <span>
                                                  Discount ({o.discountType === 'percentage' ? `${o.discountValue}%` : 'Flat'}):
                                                </span>
                                                <span>−{formatCurrency(o.discount)}</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
                                              <span>Grand Total:</span>
                                              <span>{formatCurrency(o.total || 0)}</span>
                                            </div>
                                          </div>

                                          <div className="space-y-1 text-xs border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-700 pt-2 sm:pt-0 sm:pl-4">
                                            <div className="flex justify-between font-semibold text-gray-700 dark:text-gray-300">
                                              <span>Payment Method:</span>
                                              <span className="uppercase text-brand-600">{o.paymentMethod || 'OTHER'}</span>
                                            </div>
                                            {o.paymentMethod === 'part' && o.paymentBreakdown && (
                                              <div className="p-2 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg text-[11px] space-y-1">
                                                <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                                                  <Layers className="w-3 h-3" /> Split Breakdown:
                                                </div>
                                                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-gray-700 dark:text-gray-300">
                                                  {o.paymentBreakdown.cash > 0 && <div>Cash: <span className="font-bold">{formatCurrency(o.paymentBreakdown.cash)}</span></div>}
                                                  {o.paymentBreakdown.upi > 0 && <div>UPI: <span className="font-bold">{formatCurrency(o.paymentBreakdown.upi)}</span></div>}
                                                  {o.paymentBreakdown.card > 0 && <div>Card: <span className="font-bold">{formatCurrency(o.paymentBreakdown.card)}</span></div>}
                                                  {o.paymentBreakdown.other > 0 && <div>Other: <span className="font-bold">{formatCurrency(o.paymentBreakdown.other)}</span></div>}
                                                </div>
                                              </div>
                                            )}
                                            <div className="flex justify-between text-green-600 font-bold text-sm">
                                              <span>Settled Amount Received:</span>
                                              <span>{formatCurrency(settled)}</span>
                                            </div>
                                            {waived > 0 && (
                                              <div className="flex justify-between text-amber-600 font-bold">
                                                <span>Waived Off / Discrepancy:</span>
                                                <span>{formatCurrency(waived)}</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between text-gray-500 text-[11px] pt-1">
                                              <span>KOT Reference:</span>
                                              <span>{`KOT-${o.orderNumber ? o.orderNumber : o._id.slice(-4)}-1 to -${o.kotCount || 1}`}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* Edit Settled Bill Modal (Admin Only) */}
        {/* ───────────────────────────────────────────────────────────── */}
        {editOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative w-full max-w-3xl my-8 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-850">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      Edit Settled Bill
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 border border-blue-200 dark:border-blue-800">
                        #{editOrder.billNumber || editOrder.orderNumber || editOrder._id.slice(-6)}
                      </span>
                    </h3>
                    <p className="text-xs text-gray-500">
                      Table {editOrder.table?.tableNumber || 'Takeaway'} • Settled {new Date(editOrder.paidAt || editOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at {new Date(editOrder.paidAt || editOrder.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditOrder(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Admin Reversal Notice */}
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <strong className="font-bold">Automatic Accounting Reconciliation:</strong> Modifying this settled bill will automatically reconcile account balances (Cash counter / Current Account), adjust the Daily Sales register for {new Date(editOrder.paidAt || editOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, and adjust output GST liabilities.
                  </div>
                </div>

                {/* 1. Line Items Editor */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <UtensilsCrossed className="w-4 h-4 text-brand-600" />
                      Bill Line Items ({editItems.length})
                    </h4>
                  </div>

                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                    {editItems.map((item, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-gray-900 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xs text-gray-900 dark:text-white truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                            <span>Rate: {formatCurrency(item.price)}</span>
                            <span>•</span>
                            <span>GST: {item.taxPercent || 5}%</span>
                          </div>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, item.quantity - 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-bold text-gray-900 dark:text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, item.quantity + 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold"
                          >
                            +
                          </button>
                        </div>

                        {/* Line Total */}
                        <div className="w-20 text-right font-bold text-xs text-gray-900 dark:text-white">
                          {formatCurrency((item.price || 0) * (item.quantity || 1))}
                        </div>

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItemFromEdit(idx)}
                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                          title="Remove item"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {editItems.length === 0 && (
                      <div className="p-4 text-center text-xs text-red-500 font-medium">
                        No items in bill. Please add at least one item below.
                      </div>
                    )}
                  </div>

                  {/* Add Item Bar */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-850 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 flex flex-wrap items-center gap-2">
                    <select
                      value={selectedMenuItemId}
                      onChange={(e) => {
                        setSelectedMenuItemId(e.target.value);
                        setSelectedVariantName('');
                      }}
                      disabled={menuLoading}
                      className="flex-1 min-w-[200px] text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">{menuLoading ? 'Loading menu...' : 'Select item from menu to add...'}</option>
                      {menuItems.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.name} — ₹{m.price}
                        </option>
                      ))}
                    </select>

                    {/* Variant selector if item has variants */}
                    {(() => {
                      const item = menuItems.find((m) => m._id === selectedMenuItemId);
                      if (item?.hasVariants && item.variants && item.variants.length > 0) {
                        return (
                          <select
                            value={selectedVariantName || item.variants[0].name}
                            onChange={(e) => setSelectedVariantName(e.target.value)}
                            className="text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                          >
                            {item.variants.map((v) => (
                              <option key={v.name} value={v.name}>
                                {v.name} (₹{v.price})
                              </option>
                            ))}
                          </select>
                        );
                      }
                      return null;
                    })()}

                    <input
                      type="number"
                      min="1"
                      value={addItemQty}
                      onChange={(e) => setAddItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 text-xs p-2 text-center rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                      title="Quantity"
                    />

                    <button
                      type="button"
                      onClick={handleAddItemToEdit}
                      disabled={!selectedMenuItemId}
                      className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                  </div>
                </div>

                {/* 2. Discounts & Pricing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-800">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                      Discount Adjustment
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setEditDiscountType('flat')}
                          className={cn(
                            'px-3 py-1.5 text-xs font-bold transition-colors',
                            editDiscountType === 'flat'
                              ? 'bg-brand-600 text-white'
                              : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'
                          )}
                        >
                          Flat ₹
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditDiscountType('percentage')}
                          className={cn(
                            'px-3 py-1.5 text-xs font-bold transition-colors',
                            editDiscountType === 'percentage'
                              ? 'bg-brand-600 text-white'
                              : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'
                          )}
                        >
                          %
                        </button>
                      </div>

                      <input
                        type="number"
                        min="0"
                        value={editDiscountValue}
                        onChange={(e) => setEditDiscountValue(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder={editDiscountType === 'percentage' ? 'e.g. 10%' : 'e.g. 50'}
                        className="flex-1 text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </div>

                  {/* Pricing breakdown summary */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Items Subtotal:</span>
                      <span className="font-semibold">{formatCurrency(editSubtotal)}</span>
                    </div>
                    {editDiscountAmount > 0 && (
                      <div className="flex justify-between text-green-600 font-semibold">
                        <span>Discount ({editDiscountType === 'percentage' ? `${numDiscountValue}%` : 'Flat'}):</span>
                        <span>−{formatCurrency(editDiscountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Tax / GST:</span>
                      <span className="font-semibold">{formatCurrency(editTaxAmount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-700">
                      <span>Calculated Grand Total:</span>
                      <span className="text-sm text-brand-600">{formatCurrency(editGrandTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Payment Method & Settlement Amount */}
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                        Settlement Payment Method
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(editPaymentMethod === 'other'
                          ? (['cash', 'upi', 'card', 'part', 'other'] as const)
                          : (['cash', 'upi', 'card', 'part'] as const)
                        ).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setEditPaymentMethod(m)}
                            className={cn(
                              'py-2 px-3 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 border',
                              editPaymentMethod === m
                                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                            )}
                          >
                            {m === 'cash' && <Wallet className="w-3.5 h-3.5" />}
                            {m === 'upi' && <Smartphone className="w-3.5 h-3.5" />}
                            {m === 'card' && <CreditCard className="w-3.5 h-3.5" />}
                            {m === 'other' && <Building2 className="w-3.5 h-3.5" />}
                            {m === 'part' && <Layers className="w-3.5 h-3.5" />}
                            {m === 'part' ? 'Part' : m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {editPaymentMethod !== 'part' ? (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                            Amount Received / Settled (₹)
                          </label>
                          <button
                            type="button"
                            onClick={() => setEditSettlementAmount(editGrandTotal)}
                            className="text-[11px] font-semibold text-brand-600 hover:underline"
                          >
                            Match Grand Total ({formatCurrency(editGrandTotal)})
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={editSettlementAmount}
                          onChange={(e) => setEditSettlementAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                          placeholder="Settled Amount"
                          className="w-full text-xs p-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-bold focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        {editWaived > 0 && (
                          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-1 flex items-center justify-between">
                            <span>Waived Off / Short Settlement:</span>
                            <span>{formatCurrency(editWaived)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center text-xs text-gray-500">
                        <div className="font-semibold text-gray-800 dark:text-gray-200">
                          Part Payment Mode Selected
                        </div>
                        <p className="text-[11px] mt-0.5">
                          Allocate split amounts below across Cash, UPI, and Card.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Part Payment Split Input Grid */}
                  {editPaymentMethod === 'part' && (
                    <div className="p-3 bg-white dark:bg-gray-900 rounded-xl border border-amber-300 dark:border-amber-800 space-y-2.5">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-gray-100 dark:border-gray-800">
                        <span className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-amber-600" />
                          Split Allocation (Target: {formatCurrency(editGrandTotal)})
                        </span>
                        <div className="text-[11px] text-gray-500">
                          Allocated: <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(totalEditPartAllocated)}</span>
                        </div>
                      </div>

                      <div className={`grid grid-cols-1 sm:grid-cols-2 ${numEditPartOther > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-2`}>
                        {/* Cash */}
                        <div className="p-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
                            <span className="flex items-center gap-1">
                              <Wallet className="w-3.5 h-3.5 text-emerald-600" /> Cash Counter
                            </span>
                            {editPartDifference > 0 && numEditPartCash === 0 && (
                              <button
                                type="button"
                                onClick={() => setEditPartCash(String(editPartDifference))}
                                className="text-[10px] text-brand-600 hover:underline font-bold"
                              >
                                + Fill
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={editPartCash}
                              onChange={(e) => setEditPartCash(e.target.value)}
                              placeholder="0.00"
                              className="input pl-6 py-1 text-xs font-bold w-full h-8 bg-white dark:bg-gray-900"
                            />
                          </div>
                        </div>

                        {/* UPI */}
                        <div className="p-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
                            <span className="flex items-center gap-1">
                              <Smartphone className="w-3.5 h-3.5 text-blue-600" /> UPI / QR
                            </span>
                            {editPartDifference > 0 && numEditPartUpi === 0 && (
                              <button
                                type="button"
                                onClick={() => setEditPartUpi(String(editPartDifference))}
                                className="text-[10px] text-brand-600 hover:underline font-bold"
                              >
                                + Fill
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={editPartUpi}
                              onChange={(e) => setEditPartUpi(e.target.value)}
                              placeholder="0.00"
                              className="input pl-6 py-1 text-xs font-bold w-full h-8 bg-white dark:bg-gray-900"
                            />
                          </div>
                        </div>

                        {/* Card */}
                        <div className="p-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5 text-indigo-600" /> Card / POS
                            </span>
                            {editPartDifference > 0 && numEditPartCard === 0 && (
                              <button
                                type="button"
                                onClick={() => setEditPartCard(String(editPartDifference))}
                                className="text-[10px] text-brand-600 hover:underline font-bold"
                              >
                                + Fill
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={editPartCard}
                              onChange={(e) => setEditPartCard(e.target.value)}
                              placeholder="0.00"
                              className="input pl-6 py-1 text-xs font-bold w-full h-8 bg-white dark:bg-gray-900"
                            />
                          </div>
                        </div>

                        {/* Other */}
                        {numEditPartOther > 0 && (
                          <div className="p-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5 text-purple-600" /> Other / Bank
                              </span>
                              {editPartDifference > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setEditPartOther(String(editPartDifference))}
                                  className="text-[10px] text-brand-600 hover:underline font-bold"
                                >
                                  + Fill
                                </button>
                              )}
                            </div>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={editPartOther}
                                onChange={(e) => setEditPartOther(e.target.value)}
                                placeholder="0.00"
                                className="input pl-6 py-1 text-xs font-bold w-full h-8 bg-white dark:bg-gray-900"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-800">
                        {editPartDifference === 0 && totalEditPartAllocated > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                            ✓ Matches Calculated Grand Total exactly
                          </span>
                        ) : editPartDifference > 0 ? (
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            {formatCurrency(editPartDifference)} unallocated (will be recorded as waived off)
                          </span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 font-bold">
                            ⚠ Over-allocated by {formatCurrency(Math.abs(editPartDifference))}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Live Financial Reconciliation Diff Preview */}
                <div className="p-4 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
                  <h5 className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wide flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Accounting Impact Preview (On Save)
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/50">
                      <div className="text-gray-400 text-[11px]">Settlement Amount</div>
                      <div className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5 mt-0.5">
                        <span>{formatCurrency(origSettled)}</span>
                        <ArrowRight className="w-3 h-3 text-gray-400" />
                        <span className="text-brand-600 font-black">{formatCurrency(numEditSettled)}</span>
                      </div>
                      <div className={cn('text-[10px] font-bold mt-1', diffSettled >= 0 ? 'text-green-600' : 'text-red-500')}>
                        Net Change: {diffSettled >= 0 ? `+${formatCurrency(diffSettled)}` : `−${formatCurrency(Math.abs(diffSettled))}`}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/50">
                      <div className="text-gray-400 text-[11px]">Account Adjustments</div>
                      <div className="space-y-0.5 text-[11px] mt-0.5">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 dark:text-gray-400">Cash Counter:</span>
                          <span className={cn('font-bold', diffCash > 0 ? 'text-green-600' : diffCash < 0 ? 'text-red-500' : 'text-gray-500')}>
                            {diffCash > 0 ? `+${formatCurrency(diffCash)}` : diffCash < 0 ? `−${formatCurrency(Math.abs(diffCash))}` : '₹0.00'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 dark:text-gray-400">Bank / Digital:</span>
                          <span className={cn('font-bold', diffDigital > 0 ? 'text-green-600' : diffDigital < 0 ? 'text-red-500' : 'text-gray-500')}>
                            {diffDigital > 0 ? `+${formatCurrency(diffDigital)}` : diffDigital < 0 ? `−${formatCurrency(Math.abs(diffDigital))}` : '₹0.00'}
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        Live net ledger adjustment
                      </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/50">
                      <div className="text-gray-400 text-[11px]">GST Liability Impact</div>
                      <div className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5 mt-0.5">
                        <span>{formatCurrency(origTax)}</span>
                        <ArrowRight className="w-3 h-3 text-gray-400" />
                        <span className="font-black">{formatCurrency(editTaxAmount)}</span>
                      </div>
                      <div className={cn('text-[10px] font-bold mt-1', diffTax >= 0 ? 'text-blue-600' : 'text-amber-600')}>
                        GST Diff: {diffTax >= 0 ? `+${formatCurrency(diffTax)}` : `−${formatCurrency(Math.abs(diffTax))}`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3 bg-gray-50/50 dark:bg-gray-850">
                <button
                  type="button"
                  onClick={() => setEditOrder(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditSettled}
                  disabled={actionLoading || activeEditItems.length === 0 || (editPaymentMethod === 'part' && totalEditPartAllocated <= 0)}
                  className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving & Reconciling...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" /> Save & Reconcile Bill
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* Delete Settled Bill Modal (Admin Only) */}
        {/* ───────────────────────────────────────────────────────────── */}
        {deleteOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative w-full max-w-lg my-8 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-2xl">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">
                      Delete Settled Bill & Reverse Financials
                    </h3>
                    <p className="text-xs text-gray-500">
                      Bill #{deleteOrder.billNumber || deleteOrder.orderNumber || deleteOrder._id.slice(-6)} • Table {deleteOrder.table?.tableNumber || 'Takeaway'}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  Are you sure you want to delete this settled bill? This is an <strong className="text-red-600 font-bold">Admin-only permanent action</strong> that will reverse all associated accounting entries:
                </p>

                <div className="p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl space-y-2 text-xs">
                  {(() => {
                    const settled = deleteOrder.settledAmount !== null && deleteOrder.settledAmount !== undefined
                      ? deleteOrder.settledAmount
                      : deleteOrder.total;
                    const method = (deleteOrder.paymentMethod || 'other').toLowerCase();
                    const tax = deleteOrder.taxAmount > 0
                      ? deleteOrder.taxAmount
                      : Math.round(settled * 0.0477 * 100) / 100;
                    const pb = deleteOrder.paymentBreakdown || {};
                    const cashAmt = method === 'part' ? (pb.cash || 0) : (method === 'cash' ? settled : 0);
                    const digitalAmt = method === 'part'
                      ? ((pb.upi || 0) + (pb.card || 0) + (pb.other || 0))
                      : (method !== 'cash' ? settled : 0);
                    const dateStr = new Date(deleteOrder.paidAt || deleteOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

                    return (
                      <>
                        {method === 'part' ? (
                          <>
                            {cashAmt > 0 && (
                              <div className="flex items-start gap-2 text-red-900 dark:text-red-300">
                                <span className="font-black text-red-600">•</span>
                                <span>
                                  Deduct <strong>{formatCurrency(cashAmt)}</strong> from <strong>Cash Counter</strong>.
                                </span>
                              </div>
                            )}
                            {digitalAmt > 0 && (
                              <div className="flex items-start gap-2 text-red-900 dark:text-red-300">
                                <span className="font-black text-red-600">•</span>
                                <span>
                                  Deduct <strong>{formatCurrency(digitalAmt)}</strong> from <strong>Current Account / Bank</strong>.
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-start gap-2 text-red-900 dark:text-red-300">
                            <span className="font-black text-red-600">•</span>
                            <span>
                              Deduct <strong>{formatCurrency(settled)}</strong> from <strong>{method === 'cash' ? 'Cash Counter' : 'Current Account / Bank'}</strong>.
                            </span>
                          </div>
                        )}
                        <div className="flex items-start gap-2 text-red-900 dark:text-red-300">
                          <span className="font-black text-red-600">•</span>
                          <span>
                            Reverse <strong>{formatCurrency(tax)}</strong> from GST Liability ledger.
                          </span>
                        </div>
                        <div className="flex items-start gap-2 text-red-900 dark:text-red-300">
                          <span className="font-black text-red-600">•</span>
                          <span>
                            Reduce <strong>{method === 'part' ? 'PART PAYMENT' : method.toUpperCase()}</strong> daily sales for <strong>{dateStr}</strong> by <strong>{formatCurrency(settled)}</strong>.
                          </span>
                        </div>
                        <div className="flex items-start gap-2 text-red-900 dark:text-red-300">
                          <span className="font-black text-red-600">•</span>
                          <span>
                            Order record will be permanently erased.
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3 bg-gray-50/50 dark:bg-gray-850">
                <button
                  type="button"
                  onClick={() => setDeleteOrder(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSettled}
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Deleting & Reversing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" /> Confirm Delete & Reversal
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
