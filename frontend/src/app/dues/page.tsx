'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import {
  customersApi,
  accountsApi,
  Customer,
  DueReportBillItem,
  DueReportResponse,
} from '@/lib/api';
import { ordersApi } from '@/lib/pos-api';
import { generateBillHtml, dispatchSlipPreview } from '@/lib/thermal-print';
import { formatCurrency, formatDate, cn, getInitials } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import {
  BookOpen,
  Users,
  TrendingDown,
  TrendingUp,
  Receipt,
  Search,
  Plus,
  RefreshCw,
  IndianRupee,
  Calendar,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CreditCard,
  Smartphone,
  Wallet,
  Printer,
  Eye,
  History,
  UserPlus,
  FileText,
  Check,
  X,
  Phone,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

const DUES_CACHE_KEY = 'peyala_dues_report_cache_v1';

function invalidateAllFinancialCaches() {
  try {
    const keys = [
      DUES_CACHE_KEY,
      'peyala_balancesheet_cache_v1',
      'peyala_reports_sales_cache_v1',
      'peyala_reports_daily_cache_v1',
      'peyala_reports_pnl_cache_v2',
      'peyala_accounts_cache_v1',
      'peyala_dashboard_cache_v1',
    ];
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export default function CustomerDuesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  // ── Main View State ─────────────────────────────────────────────
  const [view, setView] = useState<'customer' | 'bill'>('customer');
  const [customerFilter, setCustomerFilter] = useState<'unpaid' | 'all'>('unpaid');
  const [billFilter, setBillFilter] = useState<'unpaid' | 'cleared' | 'all'>('unpaid');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 40;

  // ── Data State ──────────────────────────────────────────────────
  const [metrics, setMetrics] = useState({
    totalOutstandingDue: 0,
    totalDueCustomers: 0,
    totalDuesCollectedThisMonth: 0,
    totalUnpaidBills: 0,
  });
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  const [billList, setBillList] = useState<DueReportBillItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  // ── Debounce Search Input ───────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Load Bank & Cash Accounts (for Payment Collection) ──────────
  const loadAccounts = async () => {
    try {
      const res = await accountsApi.list();
      setAccounts(res.data || []);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  // ── Fetch Due Report Data ───────────────────────────────────────
  const fetchReport = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      try {
        const activeStatus = view === 'customer' ? customerFilter : billFilter;
        const res = await customersApi.getDueReport({
          view,
          search: debouncedSearch,
          status: activeStatus,
          page,
          limit,
        });

        const data: DueReportResponse = res.data;
        if (data.metrics) {
          setMetrics(data.metrics);
        }
        setTotalCount(data.totalCount || 0);
        setTotalPages(data.totalPages || 1);

        if (view === 'customer') {
          setCustomerList(data.data as Customer[]);
        } else {
          setBillList(data.data as DueReportBillItem[]);
        }
      } catch (err: any) {
        console.error('Failed to fetch due report:', err);
        toast.error(err.response?.data?.message || 'Failed to load customer dues data');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [view, customerFilter, billFilter, debouncedSearch, page]
  );

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // ── Modal State: Collect Payment ────────────────────────────────
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [collectTarget, setCollectTarget] = useState<Customer | null>(null);
  const [collectAmount, setCollectAmount] = useState<number | ''>('');
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [collectAccountId, setCollectAccountId] = useState<string>('');
  const [collectNotes, setCollectNotes] = useState('');
  const [collectSubmitting, setCollectSubmitting] = useState(false);

  const openCollectModal = (customer: Customer) => {
    setCollectTarget(customer);
    setCollectAmount(customer.totalDue > 0 ? customer.totalDue : '');
    setCollectMethod('cash');
    setCollectNotes('');

    // Preselect default Cash account if available
    const defaultCash = accounts.find((a) => a.type === 'cash' && a.isDefault) || accounts.find((a) => a.type === 'cash');
    if (defaultCash) setCollectAccountId(defaultCash._id);
    else if (accounts.length > 0) setCollectAccountId(accounts[0]._id);

    setCollectModalOpen(true);
  };

  const handleCollectMethodChange = (method: 'cash' | 'upi' | 'card') => {
    setCollectMethod(method);
    if (method === 'cash') {
      const cashAcc = accounts.find((a) => a.type === 'cash' && a.isDefault) || accounts.find((a) => a.type === 'cash');
      if (cashAcc) setCollectAccountId(cashAcc._id);
    } else {
      const bankAcc = accounts.find((a) => a.type === 'bank' && a.isDefault) || accounts.find((a) => a.type === 'bank');
      if (bankAcc) setCollectAccountId(bankAcc._id);
    }
  };

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectTarget) return;

    const numAmount = Number(collectAmount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter a valid payment amount greater than zero');
      return;
    }
    if (numAmount > collectTarget.totalDue + 0.05) {
      toast.error(`Amount cannot exceed outstanding balance of ₹${collectTarget.totalDue}`);
      return;
    }

    setCollectSubmitting(true);
    try {
      const res = await customersApi.collectDue(collectTarget._id, {
        amount: numAmount,
        paymentMethod: collectMethod,
        accountId: collectAccountId || undefined,
        notes: collectNotes.trim() || undefined,
      });

      toast.success(res.data.message || `₹${numAmount} collected successfully!`);
      invalidateAllFinancialCaches();
      setCollectModalOpen(false);
      fetchReport(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to collect payment');
    } finally {
      setCollectSubmitting(false);
    }
  };

  // ── Modal State: Customer Ledger ────────────────────────────────
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerBills, setLedgerBills] = useState<any[]>([]);
  const [ledgerPayments, setLedgerPayments] = useState<any[]>([]);
  const [ledgerTab, setLedgerTab] = useState<'bills' | 'payments'>('bills');

  const openLedgerModal = async (customer: Customer) => {
    setLedgerCustomer(customer);
    setLedgerTab('bills');
    setLedgerModalOpen(true);
    setLedgerLoading(true);

    try {
      const res = await customersApi.getById(customer._id);
      setLedgerCustomer(res.data.customer);
      setLedgerBills(res.data.bills || []);
      setLedgerPayments(res.data.payments || []);
    } catch (err: any) {
      toast.error('Failed to load customer ledger');
    } finally {
      setLedgerLoading(false);
    }
  };

  // ── Modal State: Add New Customer ───────────────────────────────
  const [addCustomerModalOpen, setAddCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerNotes, setNewCustomerNotes] = useState('');
  const [addingCustomer, setAddingCustomer] = useState(false);

  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = newCustomerPhone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!newCustomerName.trim()) {
      toast.error('Please enter the customer name');
      return;
    }

    setAddingCustomer(true);
    try {
      await customersApi.create({
        name: newCustomerName.trim(),
        phone: cleanPhone,
        notes: newCustomerNotes.trim() || undefined,
      });

      toast.success(`Khata profile created for ${newCustomerName.trim()}`);
      setAddCustomerModalOpen(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerNotes('');
      invalidateAllFinancialCaches();
      fetchReport(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create customer');
    } finally {
      setAddingCustomer(false);
    }
  };

  // ── Action: Thermal Bill Reprint ────────────────────────────────
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

  const handleReprintBill = async (billId: string) => {
    setPrintingOrderId(billId);
    try {
      const res = await ordersApi.get(billId);
      const fullOrder = res.data;
      const tableNum = (typeof fullOrder.table === 'object' ? (fullOrder.table as any)?.tableNumber : fullOrder.table) || 'N/A';
      const billData = {
        billNumber: fullOrder.billNumber,
        orderNumber: fullOrder.orderNumber,
        tableNumber: tableNum,
        billerName: (fullOrder.createdBy as any)?.name || 'Staff',
        customerName: fullOrder.customerName || (typeof fullOrder.customer === 'object' ? (fullOrder.customer as any)?.name : undefined),
        customerPhone: fullOrder.customerPhone || (typeof fullOrder.customer === 'object' ? (fullOrder.customer as any)?.phone : undefined),
        createdAt: fullOrder.createdAt,
        items: (fullOrder.items || []).map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          taxPercent: i.taxPercent,
          variantName: i.variant?.name,
          addons: i.selectedAddons,
        })),
        subtotal: fullOrder.subtotal,
        taxAmount: fullOrder.taxAmount,
        discount: fullOrder.discount,
        discountType: fullOrder.discountType,
        discountValue: fullOrder.discountValue,
        total: fullOrder.total,
        settledAmount: fullOrder.settledAmount ?? undefined,
        waivedAmount: fullOrder.waivedAmount,
        paymentMethod: fullOrder.paymentMethod || undefined,
        paymentBreakdown: fullOrder.paymentBreakdown,
        isPaid: fullOrder.status === 'paid' || !!fullOrder.paidAt,
      };
      const html = generateBillHtml(billData);
      dispatchSlipPreview({
        type: 'bill',
        title: `Bill #${fullOrder.billNumber || fullOrder.orderNumber} (Reprint)`,
        html,
        orderNumber: fullOrder.billNumber || fullOrder.orderNumber,
        tableNumber: tableNum,
      });
    } catch (err: any) {
      toast.error('Failed to load bill for printing');
    } finally {
      setPrintingOrderId(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 w-full pb-12">
        {/* ── Page Header ────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                  Customer Dues & Khata Ledger
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  Manage regular customer khata credit accounts, track pending dues bill-wise, and collect settlements
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => fetchReport(true)}
              disabled={refreshing}
              className="btn-secondary text-xs sm:text-sm py-2 px-3.5 flex items-center gap-1.5"
              title="Refresh Dues Data"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin text-brand-500')} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAddCustomerModalOpen(true)}
              className="btn-primary text-xs sm:text-sm py-2 px-3.5 flex items-center gap-1.5 shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Khata Customer</span>
            </button>

            <Link
              href="/balancesheet"
              className="btn-secondary text-xs sm:text-sm py-2 px-3 flex items-center gap-1 text-blue-600 dark:text-blue-400"
              title="Go to Balance Sheet"
            >
              <span>Balance Sheet</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* ── 4 Top Metric Cards ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Total Outstanding Due */}
          <div className="card p-5 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 border-red-200 dark:border-red-900/40 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">
                Total Outstanding Due
              </span>
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 dark:text-red-400">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-red-600 dark:text-red-400 mt-2">
              {formatCurrency(metrics.totalOutstandingDue)}
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
              Accounts Receivable across regular customers
            </p>
          </div>

          {/* Card 2: Customers With Dues */}
          <div className="card p-5 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border-amber-200 dark:border-amber-900/40 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Active Khata Dues
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-700 dark:text-amber-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-amber-800 dark:text-amber-300 mt-2">
              {metrics.totalDueCustomers}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
              Customers currently carrying pending balances
            </p>
          </div>

          {/* Card 3: Dues Collected This Month */}
          <div className="card p-5 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-emerald-200 dark:border-emerald-900/40 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Recovered This Month
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-emerald-700 dark:text-emerald-300 mt-2">
              {formatCurrency(metrics.totalDuesCollectedThisMonth)}
            </p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1">
              Collected & cleared into cash counter/bank
            </p>
          </div>

          {/* Card 4: Unpaid Bills */}
          <div className="card p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-900/40 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                Unpaid Due Bills
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-black text-blue-700 dark:text-blue-300 mt-2">
              {metrics.totalUnpaidBills}
            </p>
            <p className="text-xs text-blue-600/80 dark:text-blue-400/80 mt-1">
              Bills waiting for complete credit settlement
            </p>
          </div>
        </div>

        {/* ── Main View Container: Controls & Table ──────────────── */}
        <div className="card shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* View Switcher Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-gray-200/80 dark:bg-gray-700/60 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => {
                  setView('customer');
                  setPage(1);
                }}
                className={cn(
                  'px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2',
                  view === 'customer'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                )}
              >
                <Users className="w-4 h-4" />
                <span>Customer-Wise View</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('bill');
                  setPage(1);
                }}
                className={cn(
                  'px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center gap-2',
                  view === 'bill'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                )}
              >
                <Receipt className="w-4 h-4" />
                <span>Bill-Wise Due Invoices</span>
              </button>
            </div>

            {/* Search & Status Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Filter Chips */}
              {view === 'customer' ? (
                <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerFilter('unpaid');
                      setPage(1);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded font-semibold transition-colors',
                      customerFilter === 'unpaid'
                        ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-bold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    )}
                  >
                    With Dues Only
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerFilter('all');
                      setPage(1);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded font-semibold transition-colors',
                      customerFilter === 'all'
                        ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-bold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    )}
                  >
                    All Customers
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setBillFilter('unpaid');
                      setPage(1);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded font-semibold transition-colors',
                      billFilter === 'unpaid'
                        ? 'bg-red-100 dark:bg-red-900/60 text-red-900 dark:text-red-200 font-bold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    )}
                  >
                    Unpaid
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillFilter('cleared');
                      setPage(1);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded font-semibold transition-colors',
                      billFilter === 'cleared'
                        ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-bold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    )}
                  >
                    Cleared
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillFilter('all');
                      setPage(1);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded font-semibold transition-colors',
                      billFilter === 'all'
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    )}
                  >
                    All
                  </button>
                </div>
              )}

              {/* Fast Search Input */}
              <div className="relative min-w-[240px] sm:min-w-[280px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder={
                    view === 'customer'
                      ? 'Search customer name or phone...'
                      : 'Search bill #, customer, phone...'
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-9 pr-8 text-xs sm:text-sm py-2 w-full"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Table Content ──────────────────────────────────────── */}
          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-brand-500 mb-3" />
              <p className="text-sm font-medium">Loading dues records...</p>
            </div>
          ) : view === 'customer' ? (
            /* ══ Customer-Wise Table ═══════════════════════════════ */
            customerList.length === 0 ? (
              <div className="py-16 text-center text-gray-400 px-4">
                <BookOpen className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <h3 className="text-base font-bold text-gray-700 dark:text-gray-300">
                  No Customer Khata Records Found
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                  {debouncedSearch
                    ? `No customers match "${debouncedSearch}". Try another search term.`
                    : customerFilter === 'unpaid'
                    ? 'All customer dues have been cleared! There are no outstanding balances.'
                    : 'No customer profiles have been created yet.'}
                </p>
                {customerFilter === 'unpaid' && (
                  <button
                    type="button"
                    onClick={() => setCustomerFilter('all')}
                    className="mt-4 btn-secondary text-xs"
                  >
                    View All Customers
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100/70 dark:bg-gray-800/80 text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="py-3 px-4">Customer Details</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4 text-center">Unpaid Bills</th>
                      <th className="py-3 px-4 text-right">Outstanding Due</th>
                      <th className="py-3 px-4 text-center">Total Orders</th>
                      <th className="py-3 px-4">Last Visit</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {customerList.map((customer) => {
                      const hasDue = customer.totalDue > 0;
                      return (
                        <tr
                          key={customer._id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          {/* Customer Name & Initials */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                {getInitials(customer.name)}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white">
                                  {customer.name}
                                </p>
                                {customer.notes && (
                                  <p className="text-[11px] text-gray-400 truncate max-w-[180px]">
                                    {customer.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Phone */}
                          <td className="py-3 px-4 font-mono text-xs text-gray-700 dark:text-gray-300">
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3 text-gray-400" />
                              {customer.phone}
                            </span>
                          </td>

                          {/* Unpaid Bills Count */}
                          <td className="py-3 px-4 text-center">
                            {customer.unpaidBillsCount && customer.unpaidBillsCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                                {customer.unpaidBillsCount} bill{customer.unpaidBillsCount !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                Cleared
                              </span>
                            )}
                          </td>

                          {/* Total Outstanding Due */}
                          <td className="py-3 px-4 text-right">
                            <span
                              className={cn(
                                'text-base font-black',
                                hasDue
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-400 dark:text-gray-500'
                              )}
                            >
                              {formatCurrency(customer.totalDue)}
                            </span>
                          </td>

                          {/* Lifetime Orders */}
                          <td className="py-3 px-4 text-center text-xs text-gray-600 dark:text-gray-400 font-semibold">
                            {customer.totalOrders || 0}
                          </td>

                          {/* Last Visit */}
                          <td className="py-3 px-4 text-xs text-gray-500">
                            {customer.lastVisit ? formatDate(customer.lastVisit) : 'Never'}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {hasDue && (
                                <button
                                  type="button"
                                  onClick={() => openCollectModal(customer)}
                                  className="btn-primary text-xs py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 shadow-sm"
                                  title="Collect Payment"
                                >
                                  <IndianRupee className="w-3.5 h-3.5" />
                                  <span>Collect</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openLedgerModal(customer)}
                                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"
                                title="View Customer Ledger"
                              >
                                <History className="w-3.5 h-3.5" />
                                <span>Ledger</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* ══ Bill-Wise Due Invoices Table ══════════════════════ */
            billList.length === 0 ? (
              <div className="py-16 text-center text-gray-400 px-4">
                <Receipt className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <h3 className="text-base font-bold text-gray-700 dark:text-gray-300">
                  No Due Invoices Found
                </h3>
                <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                  {debouncedSearch
                    ? `No bills match "${debouncedSearch}".`
                    : billFilter === 'unpaid'
                    ? 'All credit bills have been settled! No pending invoices.'
                    : 'No credit bills recorded.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100/70 dark:bg-gray-800/80 text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="py-3 px-4">Bill #</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4 text-center">Table</th>
                      <th className="py-3 px-4 text-right">Bill Total</th>
                      <th className="py-3 px-4 text-right">Due Amount</th>
                      <th className="py-3 px-4 text-right">Remaining Due</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4">Biller</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {billList.map((bill) => {
                      const isFullyCleared = bill.dueSettled || bill.remainingDue <= 0.05;
                      const isPartiallyPaid =
                        !isFullyCleared && (bill.dueSettledAmount || 0) > 0.05;

                      return (
                        <tr
                          key={bill._id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          {/* Bill # */}
                          <td className="py-3 px-4 font-mono font-bold text-gray-900 dark:text-white">
                            #{bill.billNumber || bill.orderNumber}
                          </td>

                          {/* Date & Time */}
                          <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">
                            {formatDate(bill.createdAt)}
                          </td>

                          {/* Customer */}
                          <td className="py-3 px-4">
                            <p className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm">
                              {bill.customerName}
                            </p>
                            <p className="text-[11px] font-mono text-gray-400">
                              {bill.customerPhone}
                            </p>
                          </td>

                          {/* Table */}
                          <td className="py-3 px-4 text-center font-semibold text-xs text-gray-700 dark:text-gray-300">
                            {bill.tableNumber}
                          </td>

                          {/* Total */}
                          <td className="py-3 px-4 text-right font-medium text-gray-700 dark:text-gray-300">
                            {formatCurrency(bill.total)}
                          </td>

                          {/* Due Amount */}
                          <td className="py-3 px-4 text-right font-medium text-amber-700 dark:text-amber-400">
                            {formatCurrency(bill.dueAmount)}
                          </td>

                          {/* Remaining Due */}
                          <td className="py-3 px-4 text-right font-bold">
                            <span
                              className={
                                isFullyCleared
                                  ? 'text-gray-400'
                                  : 'text-red-600 dark:text-red-400'
                              }
                            >
                              {formatCurrency(bill.remainingDue)}
                            </span>
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-4 text-center">
                            {isFullyCleared ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3" />
                                Cleared
                              </span>
                            ) : isPartiallyPaid ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                <Clock className="w-3 h-3" />
                                Partial
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                                <AlertTriangle className="w-3 h-3" />
                                Unpaid
                              </span>
                            )}
                          </td>

                          {/* Biller Staff */}
                          <td className="py-3 px-4 text-xs text-gray-500">
                            {bill.billerName}
                          </td>

                          {/* Action: Reprint Bill */}
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleReprintBill(bill._id)}
                              disabled={printingOrderId === bill._id}
                              className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5"
                              title="Reprint Bill Receipt"
                            >
                              <Printer
                                className={cn(
                                  'w-3.5 h-3.5',
                                  printingOrderId === bill._id && 'animate-spin'
                                )}
                              />
                              <span>Reprint</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Pagination Bar ─────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between text-xs sm:text-sm">
              <span className="text-gray-500">
                Showing page {page} of {totalPages} ({totalCount} total records)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn-secondary py-1 px-2 text-xs flex items-center gap-1 disabled:opacity-40"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── MODAL 1: Collect Payment / Clear Due ─────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Modal
        open={collectModalOpen}
        onClose={() => !collectSubmitting && setCollectModalOpen(false)}
        title="Collect Due Settlement"
        size="md"
      >
        {collectTarget && (
          <form onSubmit={handleCollectSubmit} className="space-y-4">
            {/* Customer Header Box */}
            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-xl border border-amber-200 dark:border-amber-900/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                    {collectTarget.name}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    {collectTarget.phone}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] uppercase font-bold text-amber-800 dark:text-amber-400">
                    Outstanding Due
                  </span>
                  <p className="text-2xl font-black text-red-600 dark:text-red-400">
                    {formatCurrency(collectTarget.totalDue)}
                  </p>
                </div>
              </div>
            </div>

            {/* Amount Field & Quick Chips */}
            <div>
              <label className="label text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Amount to Collect (₹) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">
                  ₹
                </span>
                <input
                  type="number"
                  step="any"
                  min="1"
                  max={collectTarget.totalDue}
                  required
                  value={collectAmount}
                  onChange={(e) =>
                    setCollectAmount(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="input pl-8 text-base sm:text-lg font-bold w-full"
                  placeholder="Enter amount"
                />
              </div>

              {/* Quick settlement chips */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCollectAmount(collectTarget.totalDue)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100"
                >
                  Full Amount ({formatCurrency(collectTarget.totalDue)})
                </button>
                {collectTarget.totalDue > 500 && (
                  <button
                    type="button"
                    onClick={() => setCollectAmount(Math.round(collectTarget.totalDue / 2))}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100"
                  >
                    Half ({formatCurrency(Math.round(collectTarget.totalDue / 2))})
                  </button>
                )}
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="label text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Payment Mode <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCollectMethodChange('cash')}
                  className={cn(
                    'py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex flex-col items-center gap-1.5 transition-all',
                    collectMethod === 'cash'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm ring-1 ring-emerald-500'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  <Wallet className="w-4 h-4" />
                  <span>Cash</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCollectMethodChange('upi')}
                  className={cn(
                    'py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex flex-col items-center gap-1.5 transition-all',
                    collectMethod === 'upi'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 shadow-sm ring-1 ring-purple-500'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>UPI / QR</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCollectMethodChange('card')}
                  className={cn(
                    'py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex flex-col items-center gap-1.5 transition-all',
                    collectMethod === 'card'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 shadow-sm ring-1 ring-blue-500'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Card POS</span>
                </button>
              </div>
            </div>

            {/* Deposit Into Account */}
            <div>
              <label className="label text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Deposit Into Balance Sheet Account <span className="text-red-500">*</span>
              </label>
              <select
                className="input text-xs sm:text-sm py-2 w-full font-medium"
                value={collectAccountId}
                onChange={(e) => setCollectAccountId(e.target.value)}
                required
              >
                {accounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.name} ({acc.type.toUpperCase()}) — Balance: {formatCurrency(acc.currentBalance)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                This account balance will be automatically credited with the collected amount.
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="label text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Settlement Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Month-end clear via GPay, cash given at counter..."
                value={collectNotes}
                onChange={(e) => setCollectNotes(e.target.value)}
                className="input text-xs sm:text-sm py-2 w-full"
              />
            </div>

            {/* Submit Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setCollectModalOpen(false)}
                disabled={collectSubmitting}
                className="btn-secondary text-xs sm:text-sm py-2 px-4"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={collectSubmitting}
                className="btn-primary text-xs sm:text-sm py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
              >
                {collectSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Collecting...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm & Clear Due</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── MODAL 2: Full Customer Ledger & History ──────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Modal
        open={ledgerModalOpen}
        onClose={() => setLedgerModalOpen(false)}
        title="Customer Khata Ledger"
        size="lg"
      >
        {ledgerCustomer && (
          <div className="space-y-4">
            {/* Header Banner */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">
                    {ledgerCustomer.name}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                    Khata Member
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  Mobile: {ledgerCustomer.phone}
                </p>
                {ledgerCustomer.notes && (
                  <p className="text-xs text-gray-400 mt-1 italic">
                    Note: {ledgerCustomer.notes}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-[11px] uppercase font-bold text-gray-500">
                    Lifetime Orders
                  </span>
                  <p className="text-base font-bold text-gray-800 dark:text-gray-200">
                    {ledgerCustomer.totalOrders || 0}
                  </p>
                </div>
                <div className="pl-4 border-l border-gray-200 dark:border-gray-700">
                  <span className="text-[11px] uppercase font-bold text-red-600 dark:text-red-400">
                    Current Balance
                  </span>
                  <p className="text-2xl font-black text-red-600 dark:text-red-400">
                    {formatCurrency(ledgerCustomer.totalDue)}
                  </p>
                </div>
              </div>
            </div>

            {/* Sub-tabs: Invoices vs Payment Receipts */}
            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
              <button
                type="button"
                onClick={() => setLedgerTab('bills')}
                className={cn(
                  'px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  ledgerTab === 'bills'
                    ? 'bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                )}
              >
                <Receipt className="w-4 h-4" />
                <span>Due Bills & Invoices ({ledgerBills.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setLedgerTab('payments')}
                className={cn(
                  'px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center gap-1.5',
                  ledgerTab === 'payments'
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                )}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Payment Receipts ({ledgerPayments.length})</span>
              </button>
            </div>

            {/* Sub-tab Content */}
            {ledgerLoading ? (
              <div className="py-12 text-center text-gray-400">
                <RefreshCw className="w-6 h-6 mx-auto animate-spin text-brand-500 mb-2" />
                <p className="text-xs">Loading ledger records...</p>
              </div>
            ) : ledgerTab === 'bills' ? (
              ledgerBills.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-xs">
                  No credit bills recorded for this customer.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 dark:bg-gray-800 text-[11px] font-bold text-gray-500 uppercase sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Bill #</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Table</th>
                        <th className="py-2.5 px-3 text-right">Bill Total</th>
                        <th className="py-2.5 px-3 text-right">Due Amount</th>
                        <th className="py-2.5 px-3 text-right">Cleared</th>
                        <th className="py-2.5 px-3 text-right">Remaining</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                      {ledgerBills.map((b) => (
                        <tr key={b._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                          <td className="py-2.5 px-3 font-mono font-bold">#{b.billNumber || b.orderNumber}</td>
                          <td className="py-2.5 px-3 text-gray-500">{formatDate(b.createdAt)}</td>
                          <td className="py-2.5 px-3">{b.table?.tableNumber || 'N/A'}</td>
                          <td className="py-2.5 px-3 text-right">{formatCurrency(b.total)}</td>
                          <td className="py-2.5 px-3 text-right text-amber-700 dark:text-amber-400">
                            {formatCurrency(b.dueAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-600">
                            {formatCurrency(b.dueSettledAmount || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-red-600">
                            {formatCurrency(b.remainingDue)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {b.dueSettled ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                Cleared
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                                Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : ledgerPayments.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">
                No past payments recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-800 text-[11px] font-bold text-gray-500 uppercase sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Amount Paid</th>
                      <th className="py-2.5 px-3 text-center">Method</th>
                      <th className="py-2.5 px-3">Received In Account</th>
                      <th className="py-2.5 px-3">Staff</th>
                      <th className="py-2.5 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                    {ledgerPayments.map((p) => (
                      <tr key={p._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">
                          {formatDate(p.date)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            {p.paymentMethod}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">
                          {p.receivedIn?.name || 'Cash Counter'}
                        </td>
                        <td className="py-2.5 px-3 text-gray-500">{p.receivedBy?.name || 'Staff'}</td>
                        <td className="py-2.5 px-3 text-gray-400 italic max-w-[200px] truncate">
                          {p.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── MODAL 3: Add New Khata Customer ──────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Modal
        open={addCustomerModalOpen}
        onClose={() => !addingCustomer && setAddCustomerModalOpen(false)}
        title="Register New Khata Customer"
        size="sm"
      >
        <form onSubmit={handleAddCustomerSubmit} className="space-y-4">
          <div>
            <label className="label text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Customer Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Rahul Sharma"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              className="input text-xs sm:text-sm py-2 w-full"
            />
          </div>

          <div>
            <label className="label text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              10-Digit Mobile Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              maxLength={10}
              placeholder="9876543210"
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="input text-xs sm:text-sm py-2 w-full font-mono"
            />
          </div>

          <div>
            <label className="label text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes / Designation (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Regular breakfast customer, office across street"
              value={newCustomerNotes}
              onChange={(e) => setNewCustomerNotes(e.target.value)}
              className="input text-xs sm:text-sm py-2 w-full"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setAddCustomerModalOpen(false)}
              disabled={addingCustomer}
              className="btn-secondary text-xs sm:text-sm py-2 px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingCustomer}
              className="btn-primary text-xs sm:text-sm py-2 px-4 flex items-center gap-1.5"
            >
              {addingCustomer ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Create Khata</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
