'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import {
  tablesApi,
  ordersApi,
  menuApi,
  addonsApi,
  tableCategoriesApi,
  Table,
  Order,
  MenuItem,
  MenuCategory,
  Addon,
  MenuItemVariant,
  OrderInputItem,
  TableCategory,
} from '@/lib/pos-api';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { playTwoBlinkAlertSound, listenToKdsReady, KdsReadyEvent } from '@/lib/audio-alerts';
import {
  BellRing,
  Plus,
  Users,
  Utensils,
  Receipt,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Trash2,
  ChevronRight,
  AlertCircle,
  CreditCard,
  Wallet,
  Smartphone,
  Building2,
  PlusCircle,
  MinusCircle,
  ChefHat,
  RefreshCw,
  Printer,
  ShieldAlert,
  Sparkles,
  Check,
  Layers,
  Pencil,
  Eye,
  ArrowRightLeft,
  ArrowLeft,
  CheckSquare,
  Square,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Store,
  Bike,
  Percent,
  Banknote,
  UserCheck,
} from 'lucide-react';
import { customersApi, Customer } from '@/lib/api';
import {
  printKOT,
  printCustomerBill,
  getPrintMode,
  setPrintMode,
  PrintMode,
  BillItem,
} from '@/lib/thermal-print';
import DiningTableIcon from '@/components/ui/DiningTableIcon';

export interface CartItemConfig {
  menuItemId: string;
  quantity: number;
  notes: string;
  variant?: { name: string; price: number };
  selectedAddons?: Array<{ addonId: string; name: string; price: number }>;
  unitPrice: number;
}

export type TableSection = string;

function inferTableSection(tableNumber: string): string {
  const lower = (tableNumber || '').toLowerCase().trim();
  if (
    lower.startsWith('in ') ||
    lower.startsWith('in-') ||
    lower.startsWith('in1') ||
    lower.startsWith('in2') ||
    lower.startsWith('in3') ||
    lower.startsWith('in4') ||
    lower.startsWith('in5') ||
    lower.startsWith('in6') ||
    lower.startsWith('in7') ||
    lower.startsWith('in8') ||
    lower.startsWith('in9') ||
    lower.startsWith('in0') ||
    lower === 'in' ||
    lower.includes('indoor') ||
    lower.startsWith('i-') ||
    lower.startsWith('din')
  ) {
    return 'Indoor';
  }
  if (
    lower.startsWith('out') ||
    lower.includes('outdoor') ||
    lower.startsWith('o-') ||
    lower.startsWith('patio') ||
    lower.startsWith('sudhanil') ||
    lower.startsWith('ratnadeep') ||
    lower.startsWith('extra') ||
    lower.startsWith('dhitun')
  ) {
    return 'Outdoor';
  }
  if (
    lower.startsWith('pick') ||
    lower.startsWith('takeaway') ||
    lower.startsWith('delivery') ||
    lower.startsWith('pu')
  ) {
    return 'Pick Up';
  }
  return 'Other';
}

// Group table into Indoor, Outdoor, Pick Up, Other or custom categories
function getTableSection(table: Table | string): string {
  if (typeof table === 'object' && table !== null) {
    if (table.category && table.category.trim()) {
      return table.category.trim();
    }
    return inferTableSection(table.tableNumber);
  }
  return inferTableSection(String(table || ''));
}

export default function TablesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManageOrders = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';

  // ── Primary View Mode: 'table_view' (Floor Plan) or 'pos_order' (3-Column Screen) ──
  const [activeView, setActiveView] = useState<'table_view' | 'pos_order'>('table_view');

  const [tables, setTables] = useState<Table[]>([]);
  const [tableCategories, setTableCategories] = useState<TableCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);

  // Table View status filter & section filter
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'reserved'>('all');
  const [sectionFilter, setSectionFilter] = useState<'all' | TableSection>('all');
  const [tableSearch, setTableSearch] = useState('');

  // Selected Table & Active Order
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [isRound2Mode, setIsRound2Mode] = useState<boolean>(false);
  const [orderModalLoading, setOrderModalLoading] = useState(false);

  // Detailed Order & Settlement Modal (opened via Eye icon)
  const [showOrderDetailsModal, setShowOrderDetailsModal] = useState(false);

  // Move KOT / Items Modal state (Matching Petpooja Screenshots)
  const [moveModal, setMoveModal] = useState<{
    open: boolean;
    sourceTable: Table | null;
    activeOrder: Order | null;
  }>({
    open: false,
    sourceTable: null,
    activeOrder: null,
  });
  const [moveTab, setMoveTab] = useState<'table' | 'kot' | 'item'>('table');
  const [selectedTargetTableId, setSelectedTargetTableId] = useState<string>('');
  const [selectedKotRounds, setSelectedKotRounds] = useState<number[]>([]);
  const [itemTransferQuantities, setItemTransferQuantities] = useState<Record<string, number>>({});
  const [moveLoading, setMoveLoading] = useState<boolean>(false);

  // POS Order Screen Cart state (for Round 1 or Round 2+)
  const [cart, setCart] = useState<Record<string, CartItemConfig>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [menuSearch, setMenuSearch] = useState('');
  const [serviceType, setServiceType] = useState<'dine_in' | 'delivery' | 'pickup'>('dine_in');
  const [guestCount, setGuestCount] = useState<number>(1);
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Item Customization Modal state (Addons & Variants matching Image 4)
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [customizingNotes, setCustomizingNotes] = useState('');
  const [customizingQty, setCustomizingQty] = useState(1);
  const [addonSearch, setAddonSearch] = useState('');

  // Billing, Discount & Payment state
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [settlementInput, setSettlementInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'due' | 'part'>('cash');
  const [isPaidChecked, setIsPaidChecked] = useState<boolean>(false);
  const [partCash, setPartCash] = useState<string>('');
  const [partUpi, setPartUpi] = useState<string>('');
  const [partCard, setPartCard] = useState<string>('');
  const [partDue, setPartDue] = useState<string>('');
  const [partOther, setPartOther] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [printMode, setPrintModeState] = useState<PrintMode>('test');

  // Customer Due / Khata state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedDueCustomer, setSelectedDueCustomer] = useState<Customer | null>(null);
  const [dueCustomerName, setDueCustomerName] = useState('');
  const [dueCustomerPhone, setDueCustomerPhone] = useState('');

  // Print Station state
  const [isPrintStation, setIsPrintStation] = useState<boolean>(false);
  const [lastPrintedKOT, setLastPrintedKOT] = useState<string | null>(null);
  const [lastPrintedBill, setLastPrintedBill] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const inFlightKotsRef = useRef<Set<string>>(new Set());
  const inFlightBillsRef = useRef<Set<string>>(new Set());

  // KDS Ready Notification for Cashier Notice
  const [kdsReadyAlert, setKdsReadyAlert] = useState<KdsReadyEvent | null>(null);
  const prevServedOrderIdsRef = useRef<Set<string>>(new Set());
  const isFirstTableLoadRef = useRef<boolean>(true);

  // Table Management Modal (create/edit)
  const [tableModal, setTableModal] = useState<'create' | 'edit' | null>(null);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [tableForm, setTableForm] = useState<{
    tableNumber: string;
    capacity: number;
    status: 'available' | 'occupied' | 'reserved';
  }>({ tableNumber: '', capacity: 4, status: 'available' });
  const [tableSaving, setTableSaving] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<'save' | 'save_print' | 'kot' | 'kot_print' | null>(null);

  // Mobile POS Cart & Order Taking UX
  const [mobileCartDrawerOpen, setMobileCartDrawerOpen] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<'menu' | 'cart'>('menu');
  const [cartFeedback, setCartFeedback] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerCartFeedback = (itemName: string) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setCartFeedback({ message: `Added ${itemName} to Cart`, visible: true });
    feedbackTimeoutRef.current = setTimeout(() => {
      setCartFeedback((prev) => ({ ...prev, visible: false }));
    }, 2200);
  };

  // Bill / KOT Quick Lookup Dialog
  const [lookupQuery, setLookupQuery] = useState('');
  const [showLookupModal, setShowLookupModal] = useState<'bill' | 'kot' | null>(null);

  // Live timer tick for KOT elapsed minutes
  const [, setKotTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setKotTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fast customer search debounce for Khata / Due settlement
  useEffect(() => {
    if (!customerSearchQuery || customerSearchQuery.trim().length < 2) {
      setCustomerSearchResults([]);
      setCustomerSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const res = await customersApi.search(customerSearchQuery.trim());
        setCustomerSearchResults(res.data || []);
      } catch {
        setCustomerSearchResults([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [customerSearchQuery]);

  const getKotElapsedMinutes = (order: any) => {
    if (!order) return null;
    const latestRound = order.kotRounds && order.kotRounds.length > 0
      ? order.kotRounds[order.kotRounds.length - 1]
      : null;
    const kotTime = order.effectiveActiveTime || latestRound?.createdAt || order.createdAt;
    if (!kotTime) return null;
    const diffMs = Date.now() - new Date(kotTime).getTime();
    if (isNaN(diffMs) || diffMs < 0) return 0;
    return Math.floor(diffMs / (1000 * 60));
  };

  // Load all tables, menu, and addons
  const loadData = async () => {
    try {
      setLoading(true);
      const [tableRes, itemRes, catRes, addonRes, tableCatRes] = await Promise.all([
        tablesApi.list(),
        menuApi.listItems({ availableOnly: true }),
        menuApi.listCategories(),
        addonsApi.list(),
        tableCategoriesApi.list().catch(() => ({ data: [] })),
      ]);
      setTables(tableRes.data);
      setMenuItems(itemRes.data);
      setCategories(catRes.data);
      setAddons(addonRes.data);
      setTableCategories(tableCatRes.data || []);

      // Check for orders that were marked served by KDS to notify the cashier
      const newlyServedTables = (tableRes.data || []).filter((t) => {
        const ord = t.activeOrder as any;
        if (!ord || !ord._id) return false;
        return ord.status === 'served' && !prevServedOrderIdsRef.current.has(ord._id);
      });

      if (!isFirstTableLoadRef.current && newlyServedTables.length > 0) {
        for (const t of newlyServedTables) {
          setKdsReadyAlert({
            id: (t.activeOrder as any)._id,
            name: `Table ${t.tableNumber}`,
            tables: [String(t.tableNumber)],
            timestamp: Date.now(),
          });
          playTwoBlinkAlertSound();
          toast.success(`Food ready for Table ${t.tableNumber}! 🍽️`);
        }
      }

      const nextServedSet = new Set<string>();
      (tableRes.data || []).forEach((t) => {
        const ord = t.activeOrder as any;
        if (ord && ord._id && ord.status === 'served') {
          nextServedSet.add(ord._id);
        }
      });
      prevServedOrderIdsRef.current = nextServedSet;
      isFirstTableLoadRef.current = false;
    } catch (err: any) {
      console.error('Failed to load POS data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-dismiss KDS Ready alert
  useEffect(() => {
    if (!kdsReadyAlert) return;
    const timer = setTimeout(() => setKdsReadyAlert(null), 5500);
    return () => clearTimeout(timer);
  }, [kdsReadyAlert]);

  // Real-time listener for KDS ready broadcasts to alert the Cashier with 2-blink sound
  useEffect(() => {
    const unsubscribe = listenToKdsReady((event) => {
      setKdsReadyAlert(event);
      playTwoBlinkAlertSound();
      const vStr = event.variantName ? ` (${event.variantName})` : '';
      toast.success(`${event.name}${vStr} is ready for pickup! 🍽️`);
    });
    return () => unsubscribe();
  }, []);

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
      if (confirm('Switch to Production Mode?\n\nKOTs and Bills will be sent directly to your thermal printer silently.')) {
        setPrintMode('production');
        setPrintModeState('production');
      }
    } else {
      setPrintMode('test');
      setPrintModeState('test');
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('printStation') === 'true' || urlParams.get('kiosk') === 'true') {
        localStorage.setItem('peyala_is_print_station', 'true');
        setIsPrintStation(true);
        setPrintMode('production');
        setPrintModeState('production');
      } else {
        const savedStation = localStorage.getItem('peyala_is_print_station');
        setIsPrintStation(savedStation === 'true');
      }
    }
  }, []);

  const togglePrintStation = () => {
    const nextVal = !isPrintStation;
    setIsPrintStation(nextVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('peyala_is_print_station', nextVal ? 'true' : 'false');
    }
  };

  // Background KOT & Customer Bill Print Station Listener
  // When active (on counter laptop with printer attached), polls unprinted KOTs and Bills placed from mobiles
  useEffect(() => {
    if (!isPrintStation) return;

    let isPolling = false;

    const checkPendingPrintJobs = async () => {
      if (isPolling) return;
      isPolling = true;

      try {
        // 1. Check and Auto-Print Pending KOTs
        const kotRes = await ordersApi.getPendingKots();
        const pendingKots = kotRes.data || [];

        for (const job of pendingKots) {
          const jobKey = `${job.orderId}-${job.roundId}`;
          if (inFlightKotsRef.current.has(jobKey)) continue;

          inFlightKotsRef.current.add(jobKey);

          printKOT({
            tableNumber: job.tableNumber,
            kotNumber: job.kotNumber,
            orderNumber: job.orderNumber,
            roundTag: job.roundTag,
            billerName: job.billerName,
            createdAt: job.createdAt,
            items: job.items,
          }, 'production');

          await ordersApi.markKotPrinted(job.orderId, job.roundId);
          setLastPrintedKOT(`Table ${job.tableNumber} (${job.roundTag})`);
          await new Promise((resolve) => setTimeout(resolve, 400));
        }

        // 2. Check and Auto-Print Pending Finalized / Settled Customer Bills
        const billRes = await ordersApi.getPendingBills();
        const pendingBills = billRes.data || [];

        for (const bJob of pendingBills) {
          const billKey = `${bJob.orderId}-seq-${bJob.billPrintSeq || 1}`;
          if (inFlightBillsRef.current.has(billKey)) continue;

          inFlightBillsRef.current.add(billKey);

          try {
            printCustomerBill({
              billNumber: bJob.billNumber,
              orderNumber: bJob.orderNumber,
              tokenNo: bJob.tokenNo,
              tableNumber: bJob.tableNumber,
              billerName: bJob.billerName,
              createdAt: bJob.createdAt,
              items: bJob.items,
              subtotal: bJob.subtotal,
              taxAmount: bJob.taxAmount,
              discount: bJob.discount,
              discountType: bJob.discountType,
              discountValue: bJob.discountValue,
              total: bJob.total,
              settledAmount: bJob.settledAmount,
              waivedAmount: bJob.waivedAmount,
              paymentMethod: bJob.paymentMethod,
              paymentBreakdown: bJob.paymentBreakdown,
              isPaid: bJob.isPaid,
            }, 'production');

            await ordersApi.markBillPrinted(bJob.orderId, bJob.billPrintSeq);
            setLastPrintedBill(`Table ${bJob.tableNumber} (${bJob.isPaid ? 'Receipt' : 'Bill'})`);
            await loadData();
          } catch (printErr) {
            console.error('Failed to print bill job:', printErr);
            inFlightBillsRef.current.delete(billKey);
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (inFlightBillsRef.current.size > 200) {
          const arr = Array.from(inFlightBillsRef.current);
          inFlightBillsRef.current = new Set(arr.slice(arr.length - 100));
        }
      } catch (err) {
        console.error('Error polling pending print jobs for Print Station:', err);
      } finally {
        isPolling = false;
      }
    };

    checkPendingPrintJobs();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      checkPendingPrintJobs();
    }, 4000);

    return () => clearInterval(interval);
  }, [isPrintStation]);

  // Periodic background refresh for tables status (syncs green bill status & real-time changes)
  useEffect(() => {
    const tablePoller = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        activeView === 'table_view' &&
        !showOrderDetailsModal &&
        !moveModal.open &&
        !orderModalLoading
      ) {
        loadData();
      }
    }, 60000);
    return () => clearInterval(tablePoller);
  }, [activeView, showOrderDetailsModal, moveModal.open, orderModalLoading]);

  // Statistics for Table View
  const stats = useMemo(() => {
    const total = tables.length;
    const available = tables.filter((t) => t.status === 'available').length;
    const occupied = tables.filter((t) => t.status === 'occupied').length;
    const reserved = tables.filter((t) => t.status === 'reserved').length;
    const billed = tables.filter((t) => {
      const ord = t.activeOrder as any;
      return t.status === 'occupied' && ord && ord.status !== 'paid' && (ord.status === 'billed' || Boolean(ord.billPrinted));
    }).length;
    return { total, available, occupied, reserved, billed };
  }, [tables]);

  // Dynamic list of active sections sorted according to TableCategory configuration
  const activeSections = useMemo(() => {
    const defaultOrder = ['Indoor', 'Outdoor', 'Pick Up', 'Other'];
    const set = new Set<string>();
    tableCategories.forEach((c) => set.add(c.name));
    tables.forEach((t) => set.add(getTableSection(t)));
    defaultOrder.forEach((sec) => set.add(sec));

    const orderMap = new Map<string, number>();
    tableCategories.forEach((c, idx) => {
      const val = typeof c.order === 'number' && c.order > 0 ? c.order : (idx + 1);
      orderMap.set(c.name, val);
    });

    return Array.from(set).sort((a, b) => {
      const orderA = orderMap.has(a) ? orderMap.get(a)! : 999;
      const orderB = orderMap.has(b) ? orderMap.get(b)! : 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });
  }, [tables, tableCategories]);

  // Grouped tables by section
  const sectionGroupedTables = useMemo(() => {
    const filtered = tables.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (tableSearch.trim()) {
        return t.tableNumber.toLowerCase().includes(tableSearch.toLowerCase());
      }
      return true;
    });

    const groups: Record<string, Table[]> = {};
    activeSections.forEach((sec) => {
      groups[sec] = [];
    });

    filtered.forEach((table) => {
      const sec = getTableSection(table);
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(table);
    });

    return groups;
  }, [tables, statusFilter, tableSearch, activeSections]);

  // Helper to compute composite cart key for variants/addons
  const getCartKey = (itemId: string, variantName?: string, addonsList?: Array<{ name: string }>) => {
    const parts = [itemId];
    if (variantName) parts.push(variantName.trim());
    if (addonsList && addonsList.length > 0) {
      const sortedNames = [...addonsList].map((a) => a.name).sort();
      parts.push(sortedNames.join('+'));
    }
    return parts.join('__');
  };

  // Helper to get applicable addons for a MenuItem
  const getItemApplicableAddons = (item: MenuItem): Addon[] => {
    const itemAddons = (item.addons || [])
      .map((a) => (typeof a === 'object' ? a : addons.find((ad) => ad._id === a)))
      .filter(Boolean) as Addon[];

    const cat = typeof item.category === 'object' && item.category !== null
      ? item.category
      : categories.find((c) => c._id === item.category);

    const catAddons = (cat?.defaultAddons || [])
      .map((a) => (typeof a === 'object' ? a : addons.find((ad) => ad._id === a)))
      .filter(Boolean) as Addon[];

    const map = new Map<string, Addon>();
    [...catAddons, ...itemAddons].forEach((a) => {
      if (a && a._id && a.isActive !== false) {
        map.set(a._id, a);
      }
    });

    return Array.from(map.values());
  };

  // ── Table Card Click Handlers ──
  // 1. Click Blank Table -> Open POS Order Screen for Round 1
  const handleBlankTableClick = (table: Table) => {
    setSelectedTable(table);
    setActiveOrder(null);
    setIsRound2Mode(false);
    setCart({});
    setServiceType('dine_in');
    setGuestCount(table.capacity || 1);
    setOrderNotes('');
    setActiveView('pos_order');
  };

  // 2. Click Occupied Table Body -> Takes orders for Round 2 directly per user requirement!
  const handleOccupiedTableBodyClick = async (table: Table) => {
    setSelectedTable(table);
    setIsRound2Mode(true);
    setCart({});
    setServiceType('dine_in');
    setGuestCount(table.capacity || 1);
    setOrderNotes('');

    try {
      setOrderModalLoading(true);
      const res = await ordersApi.getActiveForTable(table._id);
      setActiveOrder(res.data);
      if (res.data) {
        setDiscountType((res.data?.discountType as 'flat' | 'percentage') || 'flat');
        setDiscountInput(res.data?.discountValue !== undefined ? res.data.discountValue : (res.data?.discount || 0));
        setSettlementInput(res.data?.settledAmount !== null && res.data?.settledAmount !== undefined ? String(res.data.settledAmount) : String(res.data?.total || 0));
      }
      setActiveView('pos_order');
    } catch (err) {
      console.error('Error fetching active order for table:', err);
    } finally {
      setOrderModalLoading(false);
    }
  };

  // 3. Click Eye (View Items) Icon or Green Table Body -> Opens full order details & settlement modal
  const handleViewOrderDetails = async (table: Table, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedTable(table);
    setShowOrderDetailsModal(true);
    try {
      setOrderModalLoading(true);
      const res = await ordersApi.getActiveForTable(table._id);
      setActiveOrder(res.data);
      if (res.data) {
        setDiscountType((res.data?.discountType as 'flat' | 'percentage') || 'flat');
        setDiscountInput(res.data?.discountValue !== undefined ? res.data.discountValue : (res.data?.discount || 0));
        setSettlementInput(res.data?.settledAmount !== null && res.data?.settledAmount !== undefined ? String(res.data.settledAmount) : String(res.data?.total || 0));
        setPartCash(res.data?.paymentBreakdown?.cash ? String(res.data.paymentBreakdown.cash) : '');
        setPartUpi(res.data?.paymentBreakdown?.upi ? String(res.data.paymentBreakdown.upi) : '');
        setPartCard(res.data?.paymentBreakdown?.card ? String(res.data.paymentBreakdown.card) : '');
        setPartOther(res.data?.paymentBreakdown?.other ? String(res.data.paymentBreakdown.other) : '');
      }
    } catch (err) {
      console.error('Error loading order details:', err);
    } finally {
      setOrderModalLoading(false);
    }
  };

  // 3b. Click Move KOT / Table Transfer Icon -> Opens Move Modal (Matching Petpooja Screenshots)
  const handleOpenMoveModal = async (table: Table, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedTable(table);
    let ord = table.activeOrder as Order | null;
    if (!ord || !ord.items) {
      try {
        const res = await ordersApi.getActiveForTable(table._id);
        ord = res.data;
      } catch (err) {
        console.error('Error loading active order for move:', err);
      }
    }
    if (!ord) {
      toast.warning(`Table ${table.tableNumber} does not have an active order to move.`);
      return;
    }

    setMoveModal({
      open: true,
      sourceTable: table,
      activeOrder: ord,
    });
    setMoveTab('table');
    setSelectedTargetTableId('');

    // Default select all KOT round numbers
    const roundNums = (ord.kotRounds || []).map((r) => r.roundNumber);
    setSelectedKotRounds(roundNums);

    // Default select all active items with full quantities
    const initQtyMap: Record<string, number> = {};
    (ord.items || []).forEach((it) => {
      if (it._id && it.status !== 'cancelled') {
        initQtyMap[it._id] = it.quantity;
      }
    });
    setItemTransferQuantities(initQtyMap);
  };

  // Execute Move KOT / Items / Table Transfer
  const handleExecuteMove = async () => {
    if (!moveModal.sourceTable || !moveModal.activeOrder) return;
    if (!selectedTargetTableId) {
      toast.error('Please select a destination table');
      return;
    }

    const targetTb = tables.find((t) => t._id === selectedTargetTableId);
    if (!targetTb) {
      toast.error('Destination table not found');
      return;
    }

    setMoveLoading(true);
    try {
      const payload: any = {
        targetTableId: selectedTargetTableId,
        transferType: moveTab,
      };

      if (moveTab === 'kot') {
        if (selectedKotRounds.length === 0) {
          toast.error('Please select at least one KOT round to move');
          setMoveLoading(false);
          return;
        }
        payload.kotRoundNumbers = selectedKotRounds;
      } else if (moveTab === 'item') {
        const itemTransfers = Object.entries(itemTransferQuantities)
          .filter(([_, qty]) => qty > 0)
          .map(([itemId, quantity]) => ({ itemId, quantity }));

        if (itemTransfers.length === 0) {
          toast.error('Please select at least one item quantity to move');
          setMoveLoading(false);
          return;
        }
        payload.itemTransfers = itemTransfers;
      }

      const res = await ordersApi.transfer(moveModal.activeOrder._id, payload);
      const successMsg = res.data?.message || `Moved to Table ${targetTb.tableNumber} successfully!`;
      toast.success(successMsg);
      setNoticeMessage(successMsg);
      setTimeout(() => setNoticeMessage(null), 5000);
      setMoveModal({ open: false, sourceTable: null, activeOrder: null });
      const tblRes = await tablesApi.list();
      setTables(tblRes.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to move KOT/Table');
    } finally {
      setMoveLoading(false);
    }
  };

  // 4. Click Printer Icon on Table Card -> Direct Print Bill or KOT
  const handleQuickPrintFromTable = async (table: Table, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await ordersApi.getActiveForTable(table._id);
      const ord = res.data;
      if (!ord) {
        toast.warning('No active order found for this table');
        return;
      }
      if (isPrintStation || printMode === 'test') {
        handlePrintCustomerBill(ord);
        try {
          await ordersApi.markBillPrinted(ord._id);
        } catch (e) {}
        toast.success(`Printing customer bill for Table ${table.tableNumber}`);
      } else {
        await ordersApi.queueBillPrint(ord._id);
        const printMsg = `Customer bill for Table ${table.tableNumber} sent to Counter Printer 🖨️`;
        toast.success(printMsg);
        setNoticeMessage(printMsg);
        setTimeout(() => setNoticeMessage(null), 4000);
      }
      await loadData();
    } catch (err: any) {
      console.error('Failed to print bill from table card:', err);
      toast.error(err.response?.data?.message || 'Could not retrieve order for printing');
    }
  };

  // 5. "+ New Order" button on Top Bar -> Opens POS Order Screen
  const handleStartNewOrder = () => {
    setSelectedTable(null);
    setActiveOrder(null);
    setIsRound2Mode(false);
    setCart({});
    setServiceType('dine_in');
    setGuestCount(1);
    setOrderNotes('');
    setActiveView('pos_order');
  };

  // Handle clicking an item from the menu grid
  const handleItemClick = (item: MenuItem) => {
    const applicableAddons = getItemApplicableAddons(item);
    const hasMultipleVariants = Boolean(item.hasVariants && item.variants && item.variants.length > 0);

    if (hasMultipleVariants || applicableAddons.length > 0) {
      setCustomizingItem(item);
      setSelectedVariant(hasMultipleVariants && item.variants ? item.variants[0] : null);
      setSelectedAddonIds([]);
      setCustomizingNotes('');
      setCustomizingQty(1);
      setAddonSearch('');
      return;
    }

    // 1-tap direct addition
    updateDirectCartQty(item, 1);
  };

  // Direct 1-tap cart +/-
  const updateDirectCartQty = (item: MenuItem, delta: number) => {
    const key = item._id;
    if (delta > 0) {
      triggerCartFeedback(item.name);
    }
    setCart((prev) => {
      const current = prev[key];
      const newQty = (current ? current.quantity : 0) + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return {
        ...prev,
        [key]: {
          menuItemId: item._id,
          quantity: newQty,
          notes: current?.notes || '',
          unitPrice: item.price,
        },
      };
    });
  };

  // Stepper in Cart Panel
  const updateCartEntryQty = (cartKey: string, delta: number) => {
    setCart((prev) => {
      const current = prev[cartKey];
      if (!current) return prev;
      const newQty = current.quantity + delta;
      if (newQty <= 0) {
        const next = { ...prev };
        delete next[cartKey];
        return next;
      }
      return {
        ...prev,
        [cartKey]: { ...current, quantity: newQty },
      };
    });
  };

  // Remove Item from Cart
  const removeCartEntry = (cartKey: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[cartKey];
      return next;
    });
  };

  // Update Cart Entry Notes
  const updateCartEntryNotes = (cartKey: string, notes: string) => {
    setCart((prev) => {
      const current = prev[cartKey];
      if (!current) return prev;
      return {
        ...prev,
        [cartKey]: { ...current, notes },
      };
    });
  };

  // Confirm Customization from Add-on Modal (Image 4)
  const handleConfirmCustomization = () => {
    if (!customizingItem) return;

    const applicableAddons = getItemApplicableAddons(customizingItem);
    const chosenAddons = applicableAddons
      .filter((a) => selectedAddonIds.includes(a._id))
      .map((a) => ({ addonId: a._id, name: a.name, price: a.price }));

    const basePrice = selectedVariant ? selectedVariant.price : customizingItem.price;
    const addonsTotal = chosenAddons.reduce((sum, a) => sum + a.price, 0);
    const unitPrice = basePrice + addonsTotal;

    const cartKey = getCartKey(customizingItem._id, selectedVariant?.name, chosenAddons);

    setCart((prev) => {
      const current = prev[cartKey];
      const existingQty = current ? current.quantity : 0;
      return {
        ...prev,
        [cartKey]: {
          menuItemId: customizingItem._id,
          quantity: existingQty + customizingQty,
          notes: customizingNotes.trim() || current?.notes || '',
          variant: selectedVariant ? { name: selectedVariant.name, price: selectedVariant.price } : undefined,
          selectedAddons: chosenAddons.length > 0 ? chosenAddons : undefined,
          unitPrice,
        },
      };
    });

    triggerCartFeedback(customizingItem.name);
    setCustomizingItem(null);
  };

  // Cart Summary calculations
  const cartSummary = useMemo(() => {
    const items = Object.values(cart);
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((entry) => {
      const item = menuItems.find((i) => i._id === entry.menuItemId);
      const taxRate = item?.taxPercent || 0;
      const lineSubtotal = entry.unitPrice * entry.quantity;
      subtotal += lineSubtotal;
      taxAmount += (lineSubtotal * taxRate) / 100;
    });

    subtotal = Math.round(subtotal * 100) / 100;
    taxAmount = Math.round(taxAmount * 100) / 100;
    const total = Math.round(subtotal + taxAmount);

    return { itemCount, subtotal, taxAmount, total };
  }, [cart, menuItems]);

  // ── Dispatch KOT / Save Actions ──
  // User Rule: "once the kot is sent it should return to table view"
  const handleSendKOT = async (shouldPrint: boolean) => {
    if (!canManageOrders) {
      toast.error('Order dispatching is restricted to authorized staff.');
      return;
    }

    if (cartSummary.itemCount === 0) {
      toast.error('Please add at least one item to send KOT.');
      return;
    }

    // Require selecting a table if Dine In
    let targetTable = selectedTable;
    if (!targetTable && serviceType === 'dine_in') {
      const availTables = tables.filter((t) => t.status === 'available');
      if (availTables.length === 0) {
        toast.error('No available tables found! Please select or add a table first.');
        return;
      }
      const chosen = availTables[0];
      targetTable = chosen;
      setSelectedTable(chosen);
    }

    const payloadItems = Object.values(cart).map((entry) => ({
      menuItemId: entry.menuItemId,
      quantity: entry.quantity,
      notes: entry.notes || undefined,
      variant: entry.variant,
      selectedAddons: entry.selectedAddons,
    }));

    try {
      setActionLoading(true);
      setSubmittingAction(shouldPrint ? 'kot_print' : 'kot');

      if (isRound2Mode && activeOrder) {
        // CASE: Add round to existing table order
        const roundNum = (activeOrder.kotRounds?.length || 1) + 1;
        const res = await ordersApi.addItems(activeOrder._id, payloadItems, { shouldPrint });
        const updatedOrder = res.data;

        if (shouldPrint) {
          const printableItems = Object.values(cart).map((c) => {
            const mi = menuItems.find((m) => m._id === c.menuItemId);
            return {
              name: mi?.name || 'Item',
              quantity: c.quantity,
              notes: c.notes,
              variantName: c.variant?.name,
              addons: c.selectedAddons?.map((a) => a.name),
            };
          });

          const kotNumberStr = `KOT-${updatedOrder.orderNumber || updatedOrder._id.slice(-4)}-R${roundNum}`;
          const tokenNoStr = updatedOrder.orderNumber
            ? String(updatedOrder.orderNumber).slice(-2)
            : updatedOrder._id.slice(-2);

          printKOT({
            tableNumber: targetTable?.tableNumber || 'Takeaway',
            kotNumber: kotNumberStr,
            orderNumber: updatedOrder.orderNumber,
            tokenNo: tokenNoStr,
            billerName: user?.name || 'Staff',
            roundTag: `[ROUND ${roundNum} - ADD-ON]`,
            createdAt: new Date(),
            items: printableItems,
          });

          const newRound = updatedOrder.kotRounds?.[updatedOrder.kotRounds.length - 1];
          if (newRound?._id) {
            inFlightKotsRef.current.add(`${updatedOrder._id}-${newRound._id}`);
            if (isPrintStation) {
              ordersApi.markKotPrinted(updatedOrder._id, newRound._id).catch(() => {});
            }
          }
        }

        const msg = shouldPrint
          ? `Round ${roundNum} KOT sent & printed for Table ${targetTable?.tableNumber || ''} 🖨️`
          : `Round ${roundNum} KOT sent for Table ${targetTable?.tableNumber || ''} 👨‍🍳`;
        toast.success(msg);
        setNoticeMessage(msg);
        setTimeout(() => setNoticeMessage(null), 4000);
      } else {
        // CASE: Initial Order (Round 1)
        const res = await ordersApi.create({
          tableId: targetTable?._id || tables[0]?._id,
          items: payloadItems,
          shouldPrint,
        });
        const createdOrder = res.data;

        if (shouldPrint) {
          const printableItems = Object.values(cart).map((c) => {
            const mi = menuItems.find((m) => m._id === c.menuItemId);
            return {
              name: mi?.name || 'Item',
              quantity: c.quantity,
              notes: c.notes,
              variantName: c.variant?.name,
              addons: c.selectedAddons?.map((a) => a.name),
            };
          });

          const kotNumberStr = `KOT-${createdOrder.orderNumber || createdOrder._id.slice(-4)}-R1`;
          const tokenNoStr = createdOrder.orderNumber
            ? String(createdOrder.orderNumber).slice(-2)
            : createdOrder._id.slice(-2);

          printKOT({
            tableNumber: targetTable?.tableNumber || 'Takeaway',
            kotNumber: kotNumberStr,
            orderNumber: createdOrder.orderNumber,
            tokenNo: tokenNoStr,
            billerName: user?.name || 'Staff',
            roundTag: '[INITIAL ORDER]',
            createdAt: new Date(),
            items: printableItems,
          });

          const firstRound = createdOrder.kotRounds?.[0];
          if (firstRound?._id) {
            inFlightKotsRef.current.add(`${createdOrder._id}-${firstRound._id}`);
            if (isPrintStation) {
              ordersApi.markKotPrinted(createdOrder._id, firstRound._id).catch(() => {});
            }
          }
        }

        const msg = shouldPrint
          ? `KOT sent & printed for Table ${targetTable?.tableNumber || ''} 🖨️`
          : `KOT sent for Table ${targetTable?.tableNumber || ''} 👨‍🍳`;
        toast.success(msg);
        setNoticeMessage(msg);
        setTimeout(() => setNoticeMessage(null), 4000);
      }

      // Clear cart & return to Table View per user requirement!
      setCart({});
      setSelectedTable(null);
      setActiveOrder(null);
      setIsRound2Mode(false);
      await loadData();
      setActiveView('table_view');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to dispatch KOT');
    } finally {
      setActionLoading(false);
      setSubmittingAction(null);
    }
  };

  // Save / Save & Print (for billing)
  const handleSaveOrder = async (shouldPrintBill: boolean) => {
    if (!canManageOrders) {
      toast.error('Action restricted to authorized staff.');
      return;
    }

    try {
      setActionLoading(true);
      setSubmittingAction(shouldPrintBill ? 'save_print' : 'save');

      let targetOrder = activeOrder;

      // If there are unsent items in the cart, first dispatch/save them to the order
      if (cartSummary.itemCount > 0) {
        const payloadItems: OrderInputItem[] = Object.values(cart).map((c) => ({
          menuItemId: c.menuItemId,
          quantity: c.quantity,
          notes: c.notes,
          variant: c.variant ? { name: c.variant.name, price: c.variant.price } : undefined,
          selectedAddons: c.selectedAddons?.map((a) => ({
            addonId: a.addonId,
            name: a.name,
            price: a.price,
          })),
        }));

        if (targetOrder) {
          const addRes = await ordersApi.addItems(targetOrder._id, payloadItems, { shouldPrint: false });
          targetOrder = addRes.data;
        } else {
          const createRes = await ordersApi.create({
            tableId: selectedTable?._id || tables[0]?._id,
            items: payloadItems,
            shouldPrint: false,
          });
          targetOrder = createRes.data;
        }
        setCart({});
      }

      if (!targetOrder) {
        toast.error('No items or active order to save');
        return;
      }

      // Finalize bill if not already billed or paid
      let finalOrder = targetOrder;
      if (targetOrder.status !== 'billed' && targetOrder.status !== 'paid') {
        const res = await ordersApi.bill(targetOrder._id);
        finalOrder = res.data;
      }

      const tableLabel = selectedTable?.tableNumber || (finalOrder.table as any)?.tableNumber || '';

      if (shouldPrintBill) {
        if (isPrintStation || printMode === 'test') {
          handlePrintCustomerBill(finalOrder);
          toast.success(`Printing customer bill for Table ${tableLabel}`);
        } else {
          await ordersApi.queueBillPrint(finalOrder._id);
          const printMsg = `Customer bill for Table ${tableLabel} sent to Counter Printer 🖨️`;
          toast.success(printMsg);
          setNoticeMessage(printMsg);
          setTimeout(() => setNoticeMessage(null), 4000);
        }
      } else {
        toast.success(`Bill finalized for Table ${tableLabel} (${formatCurrency(finalOrder.total)})`);
      }

      setSelectedTable(null);
      setActiveOrder(null);
      setIsRound2Mode(false);
      await loadData();
      setActiveView('table_view');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to finalize bill');
    } finally {
      setActionLoading(false);
      setSubmittingAction(null);
    }
  };

  // Thermal Customer Bill Printing
  const handlePrintCustomerBill = (orderToPrint?: Order, isPaidStatus: boolean = false) => {
    const targetOrder = orderToPrint || activeOrder;
    if (!targetOrder) return;

    // Convert items into thermal printable format
    const printableBillItems: BillItem[] = (targetOrder.items || [])
      .filter((it) => it.status !== 'cancelled')
      .map((it) => ({
        name: it.name || 'Item',
        quantity: it.quantity || 1,
        price: it.price || 0,
        taxPercent: it.taxPercent,
        variantName: it.variant?.name,
        addons: it.selectedAddons?.map((a) => ({ name: a.name, price: a.price || 0 })),
      }));

    const billerDisplayName = user?.name || 'Staff';
    const isPaid = isPaidStatus || targetOrder.status === 'paid';

    printCustomerBill({
      billNumber: targetOrder.billNumber,
      orderNumber: targetOrder.orderNumber,
      tokenNo: targetOrder.orderNumber ? String(targetOrder.orderNumber).slice(-2) : targetOrder._id.slice(-2),
      tableNumber: selectedTable?.tableNumber || (targetOrder.table as any)?.tableNumber || 'Takeaway',
      billerName: billerDisplayName,
      createdAt: new Date(targetOrder.createdAt || Date.now()),
      items: printableBillItems,
      subtotal: targetOrder.subtotal,
      taxAmount: targetOrder.taxAmount,
      discount: targetOrder.discount,
      discountType: targetOrder.discountType,
      discountValue: targetOrder.discountValue,
      total: targetOrder.total,
      settledAmount: targetOrder.settledAmount ?? undefined,
      waivedAmount: targetOrder.waivedAmount,
      paymentMethod: targetOrder.paymentMethod || undefined,
      paymentBreakdown: targetOrder.paymentBreakdown,
      isPaid,
    });
  };

  // Cancel Item inside Order
  const handleCancelItem = async (itemId: string, itemName: string) => {
    if (!activeOrder) return;
    if (!confirm(`Cancel "${itemName}" from this order?`)) return;
    try {
      setActionLoading(true);
      const res = await ordersApi.cancelItem(activeOrder._id, itemId);
      setActiveOrder(res.data);
      toast.success(`"${itemName}" cancelled from order`);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to cancel item');
    } finally {
      setActionLoading(false);
    }
  };

  // Apply Discount
  const handleApplyDiscount = async () => {
    if (!activeOrder) return;
    try {
      setActionLoading(true);
      const res = await ordersApi.applyDiscount(activeOrder._id, {
        discountType,
        discountValue: discountInput,
      });
      setActiveOrder(res.data);
      setSettlementInput(String(res.data.total));
      toast.success(`Discount applied! New total: ${formatCurrency(res.data.total)}`);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply discount');
    } finally {
      setActionLoading(false);
    }
  };

  // Mark Food Served handler
  const handleMarkOrderServed = async (orderId?: string, tableNum?: string) => {
    const targetOrderId = orderId || activeOrder?._id;
    const targetTableNum = tableNum || selectedTable?.tableNumber;
    if (!targetOrderId) return;
    try {
      setActionLoading(true);
      const res = await ordersApi.markServed(targetOrderId);
      if (activeOrder && activeOrder._id === targetOrderId) {
        setActiveOrder(res.data);
      }
      toast.success(`Food marked as served for Table ${targetTableNum || ''}! 🍽️`);
      await loadData();
    } catch (err: any) {
      console.error('Failed to mark food served:', err);
      toast.error(err.response?.data?.message || 'Failed to mark food served');
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickMarkServed = async (table: Table, e: React.MouseEvent) => {
    e.stopPropagation();
    const ord = table.activeOrder as Order | null;
    if (!ord?._id) return;
    await handleMarkOrderServed(ord._id, table.tableNumber);
  };

  // Collect Payment / Settlement
  const numPartCash = Math.max(0, parseFloat(partCash) || 0);
  const numPartUpi = Math.max(0, parseFloat(partUpi) || 0);
  const numPartCard = Math.max(0, parseFloat(partCard) || 0);
  const numPartDue = Math.max(0, parseFloat(partDue) || 0);
  const totalPartAllocated = Math.round((numPartCash + numPartUpi + numPartCard + numPartDue) * 100) / 100;
  const partDifference = activeOrder ? Math.round((activeOrder.total - totalPartAllocated) * 100) / 100 : 0;
  const partRemaining = Math.max(0, partDifference);

  const handleCollectPayment = async () => {
    if (!activeOrder) return;
    if (!canManageOrders) {
      toast.error('Payment settlement is disabled in viewer demo mode.');
      return;
    }

    // Validation for Customer Khata if Due is selected or included in part payment
    let customerInfoPayload: { name: string; phone: string; notes?: string } | undefined = undefined;
    if (paymentMethod === 'due' || (paymentMethod === 'part' && numPartDue > 0)) {
      const finalName = (dueCustomerName || selectedDueCustomer?.name || '').trim();
      const finalPhone = (dueCustomerPhone || selectedDueCustomer?.phone || '').trim();
      if (!finalName) {
        toast.error('Customer name is required for Due / Khata settlement.');
        return;
      }
      if (!finalPhone || finalPhone.replace(/\D/g, '').length < 10) {
        toast.error('Please enter a valid 10-digit mobile number for Due / Khata settlement.');
        return;
      }
      customerInfoPayload = { name: finalName, phone: finalPhone };
    }

    if (paymentMethod === 'part') {
      if (totalPartAllocated <= 0) {
        toast.error('Please enter at least one part payment amount (Cash, UPI, Card, or Due).');
        return;
      }

      const waived = partRemaining;
      const partsSummary = [
        numPartCash > 0 ? `Cash: ${formatCurrency(numPartCash)}` : null,
        numPartUpi > 0 ? `UPI: ${formatCurrency(numPartUpi)}` : null,
        numPartCard > 0 ? `Card: ${formatCurrency(numPartCard)}` : null,
        numPartDue > 0 ? `Due: ${formatCurrency(numPartDue)}` : null,
      ].filter(Boolean).join(', ');

      const confirmMsg = waived > 0
        ? `Collect ${formatCurrency(totalPartAllocated)} via PART PAYMENT (${partsSummary})\nWaived / Discrepancy: ${formatCurrency(waived)}\nFree Table ${selectedTable?.tableNumber}?`
        : `Collect ${formatCurrency(totalPartAllocated)} via PART PAYMENT (${partsSummary})\nFree Table ${selectedTable?.tableNumber}?`;

      if (!confirm(confirmMsg)) return;

      try {
        setActionLoading(true);
        const breakdownPayload = {
          cash: numPartCash,
          upi: numPartUpi,
          card: numPartCard,
          due: numPartDue,
          other: 0,
        };
        await ordersApi.pay(activeOrder._id, 'part', totalPartAllocated, breakdownPayload, customerInfoPayload);
        toast.success(`Part payment recorded successfully! Table ${selectedTable?.tableNumber} is now available.`);

        if (typeof window !== 'undefined') {
          localStorage.removeItem('peyala_sales_list_cache_v1');
          localStorage.removeItem('peyala_dashboard_cache_v1');
          localStorage.removeItem('peyala_accounts_cache_v1');
          localStorage.removeItem('peyala_balancesheet_cache_v1');
          localStorage.removeItem('peyala_dues_cache_v1');
          window.dispatchEvent(new CustomEvent('peyala_sales_updated'));
        }

        setShowOrderDetailsModal(false);
        setActiveOrder(null);
        setSelectedTable(null);
        setSelectedDueCustomer(null);
        setDueCustomerName('');
        setDueCustomerPhone('');
        setCustomerSearchQuery('');
        setPartDue('');
        await loadData();
        setActiveView('table_view');
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to collect part payment');
      } finally {
        setActionLoading(false);
      }
      return;
    }

    const enteredSettlement = settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total;
    if (isNaN(enteredSettlement) || enteredSettlement < 0) {
      toast.error('Please enter a valid non-negative settlement amount');
      return;
    }

    const waived = Math.max(0, Math.round((activeOrder.total - enteredSettlement) * 100) / 100);
    const changeDue = Math.max(0, Math.round((enteredSettlement - activeOrder.total) * 100) / 100);
    const confirmMsg = paymentMethod === 'due'
      ? `Settle ${formatCurrency(enteredSettlement)} as DUE / KHATA for ${customerInfoPayload?.name} (${customerInfoPayload?.phone}) and free Table ${selectedTable?.tableNumber}?`
      : changeDue > 0
      ? `Collect ${formatCurrency(Math.min(enteredSettlement, activeOrder.total))} via ${paymentMethod.toUpperCase()} (Tendered: ${formatCurrency(enteredSettlement)}, Return Change: ${formatCurrency(changeDue)}) and free Table ${selectedTable?.tableNumber}?`
      : waived > 0
      ? `Collect ${formatCurrency(enteredSettlement)} via ${paymentMethod.toUpperCase()} (Waived Shortage: ${formatCurrency(waived)}) and free Table ${selectedTable?.tableNumber}?`
      : `Collect ${formatCurrency(enteredSettlement)} via ${paymentMethod.toUpperCase()} and free Table ${selectedTable?.tableNumber}?`;

    if (!confirm(confirmMsg)) return;

    try {
      setActionLoading(true);
      await ordersApi.pay(activeOrder._id, paymentMethod, enteredSettlement, undefined, customerInfoPayload);
      toast.success(
        paymentMethod === 'due'
          ? `Order marked as DUE / KHATA for ${customerInfoPayload?.name}! Table ${selectedTable?.tableNumber} is now available.`
          : `Payment recorded successfully! Table ${selectedTable?.tableNumber} is now available.`
      );

      if (typeof window !== 'undefined') {
        localStorage.removeItem('peyala_sales_list_cache_v1');
        localStorage.removeItem('peyala_dashboard_cache_v1');
        localStorage.removeItem('peyala_accounts_cache_v1');
        localStorage.removeItem('peyala_balancesheet_cache_v1');
        localStorage.removeItem('peyala_dues_cache_v1');
        window.dispatchEvent(new CustomEvent('peyala_sales_updated'));
      }

      setShowOrderDetailsModal(false);
      setActiveOrder(null);
      setSelectedTable(null);
      setSelectedDueCustomer(null);
      setDueCustomerName('');
      setDueCustomerPhone('');
      setCustomerSearchQuery('');
      setPartDue('');
      await loadData();
      setActiveView('table_view');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to collect payment');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel entire order
  const handleCancelOrder = async () => {
    if (!activeOrder) return;
    if (!confirm(`Cancel entire order for Table ${selectedTable?.tableNumber}? This will free the table.`)) return;
    try {
      setActionLoading(true);
      await ordersApi.cancel(activeOrder._id);
      toast.success(`Order for Table ${selectedTable?.tableNumber} cancelled`);
      setShowOrderDetailsModal(false);
      setActiveOrder(null);
      setSelectedTable(null);
      await loadData();
      setActiveView('table_view');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to cancel order');
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
    if (!tableForm.tableNumber.trim()) {
      toast.error('Table number is required');
      return;
    }
    setTableSaving(true);
    try {
      if (tableModal === 'edit' && editingTable) {
        await tablesApi.update(editingTable._id, tableForm);
        toast.success(`Table ${tableForm.tableNumber} updated successfully`);
      } else {
        await tablesApi.create(tableForm);
        toast.success(`Table ${tableForm.tableNumber} created successfully`);
      }
      setTableModal(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save table');
    } finally {
      setTableSaving(false);
    }
  };

  const deleteTable = async (table: Table) => {
    if (table.status === 'occupied') {
      toast.error('Cannot delete an occupied table');
      return;
    }
    if (!confirm(`Delete Table ${table.tableNumber}?`)) return;
    try {
      await tablesApi.delete(table._id);
      toast.success(`Table ${table.tableNumber} deleted`);
      await loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete table');
    }
  };

  return (
    <AppLayout>
      {/* High-Visibility Floating "KDS Food Ready / Cashier Notice" Notification Banner */}
      {kdsReadyAlert && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto max-w-lg w-[92vw] sm:w-auto animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-4 sm:px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-amber-300 ring-4 ring-amber-400/30 animate-[pulse_1.2s_ease-in-out_2]">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-amber-300 animate-bounce" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-950 bg-amber-300 px-2 py-0.5 rounded shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-600 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-700"></span>
                  </span>
                  Kitchen Ready
                </span>
                {kdsReadyAlert.tables && kdsReadyAlert.tables.length > 0 && (
                  <span className="text-[11px] font-black text-amber-200 truncate">
                    Tables: {kdsReadyAlert.tables.map((t) => `T${t}`).join(', ')}
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                {kdsReadyAlert.name}
                {kdsReadyAlert.variantName && (
                  <span className="text-amber-200 font-bold ml-1 text-xs sm:text-sm">
                    ({kdsReadyAlert.variantName})
                  </span>
                )}
                {' '}is ready for pickup! 🍽️
              </p>
            </div>
            <button
              type="button"
              onClick={() => setKdsReadyAlert(null)}
              className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 pb-8">
        {/* Toast / Notification Banner */}
        {noticeMessage && (
          <div className="flex items-center justify-between p-3 bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-400 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-900 dark:text-emerald-200 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{noticeMessage}</span>
            </div>
            <button onClick={() => setNoticeMessage(null)} className="text-emerald-700 hover:text-emerald-900">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Print Station Live Hub Banner */}
        {isPrintStation && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-950 dark:text-emerald-200 shadow-2xs">
            <div className="flex items-center gap-2 font-medium">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
              </span>
              <span className="font-black text-emerald-900 dark:text-emerald-300">Counter Print Station Active:</span>
              <span>Catching mobile orders &amp; auto-printing KOTs and finalized customer bills.</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {lastPrintedKOT && (
                <span className="text-[10px] font-bold bg-emerald-200/90 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                  Last KOT: {lastPrintedKOT}
                </span>
              )}
              {lastPrintedBill && (
                <span className="text-[10px] font-bold bg-blue-200/90 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200 px-2 py-0.5 rounded border border-blue-300 dark:border-blue-700">
                  Last Bill: {lastPrintedBill}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW A: TABLE VIEW / FLOOR PLAN (Matches Image 2)              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeView === 'table_view' && (
          <div className="space-y-4">
            {/* Top Bar matching Image 2 */}
            <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <DiningTableIcon className="w-5 h-5 text-red-600" />
                  <h1 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">
                    Table View
                  </h1>
                </div>

                <button
                  onClick={handleStartNewOrder}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Contactless / New Order
                </button>

                {/* Move KOT / Items Toggle Button */}
                <button
                  onClick={() => toast.info('To move a KOT, click the Move icon (⇄) directly on any occupied table card.')}
                  className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
                >
                  Move KOT / Items
                </button>
              </div>

              {/* Status Legend Badges: 5-Stage Restaurant POS Lifecycle */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
                {/* 1. Blank Table: grey dashed border */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border-2 border-dashed border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300">
                  <span className="w-2 h-2 rounded-full border border-gray-500 bg-transparent" />
                  <span>Blank Table</span>
                </div>

                {/* 2. Running KOT Table: soft yellow */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-400 bg-amber-100/90 dark:bg-amber-950/60 text-amber-950 dark:text-amber-100">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Running KOT (Yellow)</span>
                </div>

                {/* 3. Food Served Table: soft blue */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-blue-400 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Food Served (Blue)</span>
                </div>

                {/* 4. Bill Given Table: soft green */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Bill Given (Green)</span>
                </div>

                {/* 5. Paid Table: soft orange */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-orange-400 bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span>Paid Table</span>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Print Mode button */}
                <button
                  onClick={togglePrintMode}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                    printMode === 'test'
                      ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  )}
                  title="Toggle between Test Preview & Production Thermal Auto-Print"
                >
                  {printMode === 'test' ? '🧪 Test Print' : '🚀 Auto-Print'}
                </button>

                {/* Print Station button */}
                <button
                  onClick={togglePrintStation}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1',
                    isPrintStation
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 hover:border-gray-400'
                  )}
                  title="Remote KOT auto-print receiver for Windows Counter Laptop"
                >
                  <Printer className={cn('w-3.5 h-3.5', isPrintStation && 'animate-pulse text-white')} />
                  <span>{isPrintStation ? 'Station ON' : 'Station OFF'}</span>
                </button>

                <button
                  onClick={loadData}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Refresh Tables"
                >
                  <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                </button>

                {isAdmin && (
                  <button
                    onClick={openCreateTable}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Add Table
                  </button>
                )}

                {/* Delivery & Pick Up buttons matching Image 2 */}
                <button
                  onClick={() => {
                    setServiceType('delivery');
                    handleStartNewOrder();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition-colors"
                >
                  <Bike className="w-3.5 h-3.5" />
                  Delivery
                </button>

                <button
                  onClick={() => {
                    setServiceType('pickup');
                    handleStartNewOrder();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition-colors"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Pick Up
                </button>
              </div>
            </div>

            {/* Filter Section Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {(['all', ...activeSections]).map((sec) => {
                  if (sec !== 'all' && (!sectionGroupedTables[sec] || sectionGroupedTables[sec].length === 0)) {
                    return null;
                  }
                  return (
                    <button
                      key={sec}
                      onClick={() => setSectionFilter(sec)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap',
                        sectionFilter === sec
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'
                      )}
                    >
                      {sec === 'all' ? 'All Sections' : sec}
                      {sec !== 'all' && (
                        <span className="ml-1 opacity-80 text-[10px]">
                          ({sectionGroupedTables[sec].length})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Search table number / name..."
                  className="input pl-8 py-1 text-xs h-8 bg-white dark:bg-gray-900"
                />
              </div>
            </div>

            {/* Grouped Floor Sections: Indoor, Outdoor, Pick Up, Other (Matching Image 2) */}
            {loading ? (
              <div className="py-20 flex justify-center">
                <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tables.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                <DiningTableIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm">No tables configured</h3>
                <p className="text-xs text-gray-500 mt-1">Add tables to start seating guests and recording orders.</p>
                {isAdmin && (
                  <button onClick={openCreateTable} className="btn-primary mt-3 text-xs">
                    + Add First Table
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {activeSections.map((sectionName) => {
                  if (sectionFilter !== 'all' && sectionFilter !== sectionName) return null;
                  const secTables = sectionGroupedTables[sectionName];
                  if (!secTables || secTables.length === 0) return null;

                  return (
                    <div key={sectionName} className="space-y-2.5">
                      {/* Section Heading */}
                      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
                          {sectionName}
                        </span>
                        <span className="text-[11px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.2 rounded-full">
                          {secTables.length} tables
                        </span>
                      </div>

                      {/* Tables Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5 sm:gap-4">
                        {secTables.map((table) => {
                          const isOccupied = table.status === 'occupied';
                          const isAvailable = table.status === 'available';
                          const isReserved = table.status === 'reserved';
                          const order = table.activeOrder;
                          const isPaid = order && order.status === 'paid';
                          const isBilled = isOccupied && order && !isPaid && (order.status === 'billed' || Boolean(order.billPrinted));
                          const kotMins = isOccupied && order ? getKotElapsedMinutes(order) : null;

                          // 5-Stage Table Flow:
                          // 1. Available -> Blank Table (Grey dashed)
                          // 2. KOT sent -> Running KOT Table (Yellow: Kitchen Cooking)
                          // 3. Food Served -> Running Table (Blue: Food Served / Dining)
                          // 4. Bill Printed -> Printed Table (Green: Bill Given to Customer)
                          // 5. Paid -> Paid Table (Orange) -> Table Freed (Blank)
                          const isFoodServed = isOccupied && order && !isPaid && !isBilled && order.status === 'served';
                          const isRunningKOT = isOccupied && order && !isPaid && !isBilled && !isFoodServed;
                          const isRunningBlue = isFoodServed;

                          return (
                            <div
                              key={table._id}
                              onClick={() => {
                                if (isAvailable) {
                                  handleBlankTableClick(table);
                                } else if (isBilled) {
                                  // Bill given to customer -> directly open payment collection & settlement!
                                  handleViewOrderDetails(table);
                                } else if (isOccupied) {
                                  // Running table (Yellow or Blue): clicking body takes orders for round 2!
                                  handleOccupiedTableBodyClick(table);
                                }
                              }}
                              className={cn(
                                'rounded-2xl p-3.5 sm:p-4 transition-all duration-150 cursor-pointer relative flex flex-col justify-between group min-h-[145px] sm:min-h-[155px] select-none shadow-xs hover:shadow-md',
                                // Blank Table
                                isAvailable &&
                                  'border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 hover:border-red-400 hover:shadow-md',
                                // Running KOT Table (Yellow: Cooking in Kitchen)
                                isRunningKOT &&
                                  'border-2 border-amber-400 bg-amber-100/90 dark:bg-amber-950/60 text-amber-950 dark:text-amber-100 shadow-xs hover:border-amber-500 hover:shadow-md',
                                // Running Table (Blue: Food Served / Dining)
                                isRunningBlue &&
                                  'border-2 border-blue-400 bg-blue-50/90 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 shadow-xs hover:border-blue-500 hover:shadow-md',
                                // Printed Table (Green: Bill Given to Customer)
                                isBilled &&
                                  'border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100 shadow-sm hover:border-emerald-600 hover:shadow-md ring-1 ring-emerald-400/40',
                                // Paid Table (Orange)
                                isPaid &&
                                  'border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/40 text-orange-950 dark:text-orange-100 shadow-xs hover:border-orange-500 hover:shadow-md',
                                // Reserved Table
                                isReserved &&
                                  'border-2 border-purple-300 bg-purple-50 dark:bg-purple-950/30 text-purple-950 dark:text-purple-100 shadow-xs'
                              )}
                            >
                              {/* Top Row: Elapsed Time Badge & Status Pill */}
                              <div>
                                <div className="flex items-center justify-between gap-1">
                                  {isOccupied && kotMins !== null ? (
                                    <span
                                      className={cn(
                                        'inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded shadow-2xs',
                                        isRunningKOT
                                          ? 'bg-amber-200/90 text-amber-950 border border-amber-300'
                                          : isBilled
                                          ? 'bg-emerald-200/90 text-emerald-950 border border-emerald-300'
                                          : isRunningBlue
                                          ? 'bg-blue-200/90 text-blue-950 border border-blue-300'
                                          : 'bg-gray-200/90 text-gray-950 border border-gray-300'
                                      )}
                                      title={`Time since latest KOT: ${kotMins} min`}
                                    >
                                      <Clock className="w-2.5 h-2.5" />
                                      <span>{kotMins <= 0 ? '< 1 Min' : `${kotMins} Min`}</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 font-medium">Ready</span>
                                  )}

                                  {/* Table Status Badge */}
                                  <div>
                                    {isAvailable && (
                                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                        Blank
                                      </span>
                                    )}
                                    {isRunningKOT && (
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-amber-300/80 text-amber-950 px-1.5 py-0.5 rounded border border-amber-400 flex items-center gap-1 shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                                        KOT Active
                                      </span>
                                    )}
                                    {isRunningBlue && (
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded border border-blue-300 flex items-center gap-1 shadow-2xs">
                                        <Utensils className="w-2.5 h-2.5 text-blue-700" />
                                        Food Served
                                      </span>
                                    )}
                                    {isBilled && (
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-950 px-1.5 py-0.5 rounded border border-emerald-400 flex items-center gap-1 shadow-2xs">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                        Bill Given
                                      </span>
                                    )}
                                    {isPaid && (
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-orange-200 text-orange-900 px-1.5 py-0.2 rounded">
                                        Paid
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Table Name, Capacity & Direct "View KOT" Button */}
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <h3 className="font-black text-base sm:text-lg tracking-tight leading-tight truncate">
                                      {table.tableNumber}
                                    </h3>
                                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold">
                                      {table.capacity || 4} Seats
                                    </span>
                                  </div>

                                  {/* Dedicated Eye / View KOT button for running tables */}
                                  {isOccupied && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleViewOrderDetails(table, e)}
                                      className="px-2.5 py-1.5 rounded-xl bg-gray-900/10 dark:bg-white/15 hover:bg-gray-900/20 dark:hover:bg-white/25 text-gray-900 dark:text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs border border-black/10 dark:border-white/15 transition-all active:scale-95 cursor-pointer shrink-0"
                                      title="View Whole KOT & Order Details"
                                    >
                                      <Eye className="w-4 h-4 text-gray-900 dark:text-white stroke-[2.5]" />
                                      <span>View KOT</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Middle / Bottom Info */}
                              <div className="mt-2.5 pt-2 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-2 flex-wrap">
                                {isOccupied && order ? (
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-sm sm:text-base font-black text-gray-950 dark:text-white leading-tight">
                                      {formatCurrency(order.total)}
                                    </span>
                                    {order.items && (
                                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                                        {order.items.filter((i) => i.status !== 'cancelled').length} items
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400 font-semibold">
                                    Tap to order
                                  </span>
                                )}

                                {/* Bottom Quick Action Icons */}
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  {/* If Billed: Green [ 💵 Settle ] button */}
                                  {isBilled && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleViewOrderDetails(table, e)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                      title="Enter Payment Amount & Settle Table"
                                    >
                                      <Wallet className="w-3.5 h-3.5" />
                                      <span>Settle</span>
                                    </button>
                                  )}

                                  {/* If Food Served (Blue): Quick [ 🖨️ Bill ] button */}
                                  {isRunningBlue && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleQuickPrintFromTable(table, e)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                      title="Generate & Print Customer Bill (Turns Table Green)"
                                    >
                                      <Receipt className="w-3.5 h-3.5" />
                                      <span>Bill</span>
                                    </button>
                                  )}

                                  {/* If KOT Active (Yellow): Optional [ 🍽️ Served ] AND Direct [ 🖨️ Bill ] buttons */}
                                  {isRunningKOT && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => handleQuickMarkServed(table, e)}
                                        className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                        title="Optional: Mark Food as Served to Customer"
                                      >
                                        <Utensils className="w-3.5 h-3.5" />
                                        <span>Served</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => handleQuickPrintFromTable(table, e)}
                                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                                        title="Generate & Print Customer Bill directly (Skip Food Served)"
                                      >
                                        <Receipt className="w-3.5 h-3.5" />
                                        <span>Bill</span>
                                      </button>
                                    </>
                                  )}

                                  {isOccupied && (
                                    <>
                                      {/* Quick Reprint Bill Icon (Only when bill is already printed/given) */}
                                      {isBilled && (
                                        <button
                                          type="button"
                                          onClick={(e) => handleQuickPrintFromTable(table, e)}
                                          className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200 cursor-pointer"
                                          title="Reprint Customer Bill"
                                        >
                                          <Printer className="w-4 h-4" />
                                        </button>
                                      )}

                                      {/* Move KOT / Transfer Table Icon */}
                                      <button
                                        type="button"
                                        onClick={(e) => handleOpenMoveModal(table, e)}
                                        className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200 cursor-pointer"
                                        title="Move KOT / Transfer Table"
                                      >
                                        <ArrowRightLeft className="w-4 h-4" />
                                      </button>

                                      {/* View Items (Eye) Icon */}
                                      <button
                                        type="button"
                                        onClick={(e) => handleViewOrderDetails(table, e)}
                                        className="p-1.5 rounded-lg bg-black/10 dark:bg-white/15 hover:bg-black/20 dark:hover:bg-white/25 text-gray-800 dark:text-gray-100 transition-colors cursor-pointer flex items-center gap-1"
                                        title="View Ordered Items & Settle Bill"
                                      >
                                        <Eye className="w-4 h-4 stroke-[2.5]" />
                                      </button>
                                    </>
                                  )}

                                  {isAdmin && !isOccupied && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditTable(table);
                                      }}
                                      className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg cursor-pointer"
                                      title="Edit Table"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW B: 3-COLUMN POS ORDER TAKING SCREEN (Matches Images 1 & 3) */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeView === 'pos_order' && (
          <div className="space-y-3">
            {/* Top Navigation Bar */}
            <div className="bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveView('table_view')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 font-bold text-xs hover:bg-red-100 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Table View
                </button>

                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm sm:text-base text-gray-900 dark:text-white tracking-tight">
                    PEYALA POS
                  </span>
                  {selectedTable && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200 border border-orange-300 dark:border-orange-800">
                      {selectedTable.tableNumber} {isRound2Mode ? '(Round 2+)' : ''}
                    </span>
                  )}
                </div>

                <button
                  onClick={handleStartNewOrder}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Order
                </button>
              </div>

              {/* Quick Search & Status Indicators */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowLookupModal('bill')}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1"
                >
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <span>Bill No.</span>
                </button>

                <button
                  onClick={() => setShowLookupModal('kot')}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1"
                >
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                  <span>KOT No.</span>
                </button>

                <button
                  onClick={togglePrintMode}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-lg border',
                    printMode === 'test'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  )}
                >
                  {printMode === 'test' ? '🧪 Test' : '🚀 Auto-Print'}
                </button>

                {isPrintStation && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-1 rounded-lg">
                    Hub Active
                  </span>
                )}

                {/* Direct link to Kitchen Display System */}
                <Link
                  href="/kds"
                  target="_blank"
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 flex items-center gap-1 transition-colors"
                  title="Open Kitchen Display System (KDS)"
                >
                  <ChefHat className="w-3.5 h-3.5 text-amber-600" />
                  <span>KDS</span>
                </Link>
              </div>
            </div>

            {/* Mobile View Switcher: Menu Grid vs Review Cart */}
            <div className="flex lg:hidden items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs">
              <button
                type="button"
                onClick={() => setMobileActiveTab('menu')}
                className={cn(
                  'flex-1 py-2 text-xs font-black rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                  mobileActiveTab === 'menu'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                )}
              >
                <Utensils className="w-3.5 h-3.5 text-red-600" />
                <span>Menu Items ({menuItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileActiveTab('cart')}
                className={cn(
                  'flex-1 py-2 text-xs font-black rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer relative',
                  mobileActiveTab === 'cart'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-xs'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                )}
              >
                <ShoppingBag className="w-3.5 h-3.5 text-red-600" />
                <span>Review Cart</span>
                {cartSummary.itemCount > 0 && (
                  <span className="bg-red-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ml-1 leading-none shadow-xs">
                    {cartSummary.itemCount}
                  </span>
                )}
              </button>
            </div>

            {/* 3-Column Layout: Left Category Rail (Col 1) | Middle Menu Grid (Col 2) | Right Order Cart (Col 3) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[calc(100vh-210px)]">
              {/* ── COLUMN 1: Category Rail (2 cols on lg) ── */}
              <div className={cn(
                "lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-row lg:flex-col overflow-x-auto lg:overflow-y-auto max-h-[140px] lg:max-h-[calc(100vh-220px)] divide-y divide-gray-100 dark:divide-gray-800 divide-x lg:divide-x-0",
                mobileActiveTab === 'cart' ? 'hidden lg:flex' : 'flex'
              )}>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={cn(
                    'p-2.5 text-left text-xs font-bold transition-all whitespace-nowrap flex items-center justify-between shrink-0',
                    selectedCategory === 'all'
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-l-4 border-l-red-600'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  )}
                >
                  <span>All Items</span>
                  <span className="text-[10px] opacity-70">({menuItems.length})</span>
                </button>

                {categories.map((cat) => {
                  const isActive = selectedCategory === cat._id;
                  const count = menuItems.filter((i) => {
                    const cId = typeof i.category === 'object' && i.category !== null ? i.category._id : i.category;
                    return cId === cat._id;
                  }).length;

                  return (
                    <button
                      key={cat._id}
                      type="button"
                      onClick={() => setSelectedCategory(cat._id)}
                      className={cn(
                        'p-2.5 text-left text-xs font-bold transition-all whitespace-nowrap flex items-center justify-between shrink-0',
                        isActive
                          ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-l-4 border-l-red-600'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      )}
                    >
                      <span className="truncate pr-1">{cat.name}</span>
                      <span className="text-[10px] opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* ── COLUMN 2: Item Grid & Search (6 cols on lg) ── */}
              <div className={cn(
                "lg:col-span-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs p-3 flex flex-col justify-between space-y-3",
                mobileActiveTab === 'cart' ? 'hidden lg:flex' : 'flex',
                cartSummary.itemCount > 0 ? 'pb-24 lg:pb-3' : ''
              )}>
                {/* Search Bar matching Image 1 & 3 */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="Search item..."
                    className="input pl-9 text-sm h-10 bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700"
                  />
                  {menuSearch && (
                    <button
                      onClick={() => setMenuSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Items Grid with Veg / Non-Veg Colored Left Border */}
                <div className="flex-1 overflow-y-auto max-h-[calc(100vh-300px)] pr-1">
                  {menuItems.filter((item) => {
                    if (selectedCategory !== 'all') {
                      const cId = typeof item.category === 'object' && item.category !== null ? item.category._id : item.category;
                      if (cId !== selectedCategory) return false;
                    }
                    if (menuSearch.trim()) {
                      return item.name.toLowerCase().includes(menuSearch.toLowerCase());
                    }
                    return true;
                  }).length === 0 ? (
                    <div className="py-16 text-center text-gray-400 text-sm">
                      No menu items match your search.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {menuItems
                        .filter((item) => {
                          if (selectedCategory !== 'all') {
                            const cId = typeof item.category === 'object' && item.category !== null ? item.category._id : item.category;
                            if (cId !== selectedCategory) return false;
                          }
                          if (menuSearch.trim()) {
                            return item.name.toLowerCase().includes(menuSearch.toLowerCase());
                          }
                          return true;
                        })
                        .map((item) => {
                          const applicableAddons = getItemApplicableAddons(item);
                          const hasVariants = Boolean(item.hasVariants && item.variants && item.variants.length > 0);
                          const isCustomizable = hasVariants || applicableAddons.length > 0;

                          // Check if this item is currently in the active cart
                          const cartEntries = Object.values(cart).filter((c) => c.menuItemId === item._id);
                          const totalInCart = cartEntries.reduce((sum, c) => sum + c.quantity, 0);
                          const isInCart = totalInCart > 0;

                          return (
                            <div
                              key={item._id}
                              onClick={() => handleItemClick(item)}
                              className={cn(
                                'p-3 rounded-xl border text-left transition-all cursor-pointer relative bg-white dark:bg-gray-800/80 shadow-2xs hover:shadow-sm flex flex-col justify-between min-h-[92px]',
                                // Veg / Non-Veg Left Border Stripe (matching Petpooja Image 1 & 3)
                                item.isVeg
                                  ? 'border-l-4 border-l-emerald-600'
                                  : 'border-l-4 border-l-red-600',
                                // Active item outline when in cart (matches Image 3)
                                isInCart
                                  ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20 dark:bg-blue-950/20'
                                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                              )}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug">
                                    {item.name}
                                  </p>
                                  {isInCart && (
                                    <span className="text-xs font-black bg-blue-600 text-white px-2 py-0.5 rounded-full shrink-0">
                                      {totalInCart}
                                    </span>
                                  )}
                                </div>

                                {isCustomizable && (
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    {hasVariants && (
                                      <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded">
                                        Portions
                                      </span>
                                    )}
                                    {applicableAddons.length > 0 && (
                                      <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded">
                                        Addons
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                <span className="text-sm font-black text-gray-900 dark:text-white">
                                  {formatCurrency(item.price)}
                                </span>
                                <span className="text-xs font-medium text-gray-400">
                                  {isCustomizable ? '+ Custom' : '+ 1 Tap'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── COLUMN 3: Live Order / Cart Panel (4 cols on lg) (Matches Image 1 & 3) ── */}
              <div className={cn(
                "bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs p-3.5 flex flex-col justify-start gap-3",
                mobileActiveTab === 'cart' ? 'flex col-span-1' : 'hidden lg:flex lg:col-span-4'
              )}>
                {/* Service Type Tabs: Dine In | Delivery | Pick Up */}
                <div className="grid grid-cols-3 gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                  {(
                    [
                      { id: 'dine_in', label: 'Dine In', icon: Utensils },
                      { id: 'delivery', label: 'Delivery', icon: Bike },
                      { id: 'pickup', label: 'Pick Up', icon: ShoppingBag },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setServiceType(id)}
                      className={cn(
                        'py-1.5 text-xs sm:text-sm font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors',
                        serviceType === id
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>

                {/* Table Info & Guest Controls */}
                <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700 dark:text-gray-300">Table:</span>
                    {selectedTable ? (
                      <span className="font-black text-sm px-2.5 py-1 rounded bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200 border border-orange-300 dark:border-orange-800">
                        {selectedTable.tableNumber}
                      </span>
                    ) : (
                      <select
                        value=""
                        onChange={(e) => {
                          const t = tables.find((tb) => tb._id === e.target.value);
                          if (t) setSelectedTable(t);
                        }}
                        className="text-sm font-bold bg-white dark:bg-gray-900 border rounded px-2 py-1"
                      >
                        <option value="">Select Table...</option>
                        {tables.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.tableNumber} ({t.status})
                          </option>
                        ))}
                      </select>
                    )}

                    {isRound2Mode && (
                      <span className="text-xs font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-2 py-0.5 rounded border border-amber-300">
                        Round {activeOrder?.kotRounds?.length ? activeOrder.kotRounds.length + 1 : 2}
                      </span>
                    )}
                  </div>

                  {/* Guest count */}
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-gray-500" />
                    <button
                      type="button"
                      onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                      className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 p-0.5"
                    >
                      <MinusCircle className="w-4 h-4" />
                    </button>
                    <span className="font-black text-sm min-w-[1.25rem] text-center">{guestCount}</span>
                    <button
                      type="button"
                      onClick={() => setGuestCount((g) => g + 1)}
                      className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 p-0.5"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Items Table Header: ITEMS | CHECK ITEMS | QTY. | PRICE */}
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden flex-1 flex flex-col justify-start min-h-[220px]">
                  <div className="bg-gray-50 dark:bg-gray-800/80 px-3 py-2 border-b border-gray-200 dark:border-gray-800 grid grid-cols-12 text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider shrink-0">
                    <span className="col-span-6">ITEMS</span>
                    <span className="col-span-2 text-center">CHECK</span>
                    <span className="col-span-2 text-center">QTY.</span>
                    <span className="col-span-2 text-right">PRICE</span>
                  </div>

                  {/* Cart Items List with indented addons (Matches Image 1 & 3) */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-y-auto max-h-[360px] pr-0.5 flex-1 flex flex-col justify-start items-stretch">
                    {/* If occupied in Round 2, show previous rounds collapsible */}
                    {isRound2Mode && activeOrder && (
                      <div className="p-2.5 bg-amber-50/50 dark:bg-amber-950/20 text-xs border-b border-amber-200/60 dark:border-amber-900/40 shrink-0">
                        <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-200">
                          <span>Previous Rounds: {activeOrder.items?.filter((i) => i.status !== 'cancelled').length} item(s)</span>
                          <span>{formatCurrency(activeOrder.total)}</span>
                        </div>
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                          Add new items below for Round {activeOrder.kotRounds?.length ? activeOrder.kotRounds.length + 1 : 2}
                        </p>
                      </div>
                    )}

                    {Object.keys(cart).length === 0 ? (
                      <div className="py-10 text-center text-gray-400 text-sm font-medium">
                        No items selected yet. Tap menu items on the left to add.
                      </div>
                    ) : (
                      Object.entries(cart).map(([cartKey, d]) => {
                        const item = menuItems.find((i) => i._id === d.menuItemId);
                        if (!item) return null;
                        const lineTotal = d.unitPrice * d.quantity;

                        return (
                          <div key={cartKey} className="p-2.5 text-sm space-y-1 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors shrink-0">
                            <div className="grid grid-cols-12 items-start gap-1">
                              {/* Col: Delete + Name + Indented Addons */}
                              <div className="col-span-6 flex items-start gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => removeCartEntry(cartKey)}
                                  className="text-red-500 hover:text-red-700 mt-0.5 p-0.5"
                                  title="Delete Item"
                                >
                                  <X className="w-4 h-4 stroke-[2.5]" />
                                </button>
                                <div>
                                  <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white leading-tight">
                                    {item.name}
                                  </p>
                                  {d.variant?.name && (
                                    <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                                      Portion: {d.variant.name}
                                    </p>
                                  )}
                                  {d.selectedAddons && d.selectedAddons.length > 0 && (
                                    <p className="text-xs text-gray-600 dark:text-gray-300 font-medium pl-2 mt-0.5">
                                      {d.selectedAddons.map((a) => `${a.name}`).join(', ')}
                                    </p>
                                  )}
                                  {d.notes && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 pl-2 font-medium mt-0.5">
                                      Note: {d.notes}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Col: Check Items */}
                              <div className="col-span-2 flex justify-center items-center pt-0.5">
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              </div>

                              {/* Col: Qty Stepper [-] 1 [+] */}
                              <div className="col-span-2 flex items-center justify-center gap-1.5 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => updateCartEntryQty(cartKey, -1)}
                                  className="text-gray-500 hover:text-red-600 p-0.5"
                                >
                                  <MinusCircle className="w-4 h-4" />
                                </button>
                                <span className="font-extrabold text-sm sm:text-base min-w-[1.25rem] text-center">{d.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateCartEntryQty(cartKey, 1)}
                                  className="text-gray-500 hover:text-emerald-600 p-0.5"
                                >
                                  <PlusCircle className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Col: Price */}
                              <div className="col-span-2 text-right font-extrabold text-sm sm:text-base text-gray-900 dark:text-white pt-0.5">
                                {formatCurrency(lineTotal)}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="space-y-1.5 pt-2.5 border-t border-gray-200 dark:border-gray-800 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-300 font-medium">
                    <span>Subtotal:</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200">
                      {formatCurrency(
                        (isRound2Mode && activeOrder ? activeOrder.subtotal : 0) + cartSummary.subtotal
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-300 font-medium">
                    <span>Tax / GST:</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200">
                      {formatCurrency(
                        (isRound2Mode && activeOrder ? activeOrder.taxAmount : 0) + cartSummary.taxAmount
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-base font-bold text-gray-900 dark:text-white pt-1.5 border-t border-gray-200 dark:border-gray-800">
                    <span>Grand Total:</span>
                    <span className="text-red-600 dark:text-red-400 text-lg sm:text-xl font-black">
                      {formatCurrency(
                        (isRound2Mode && activeOrder ? activeOrder.total : 0) + cartSummary.total
                      )}
                    </span>
                  </div>
                </div>

                {/* Payment Chips & It's Paid Checkbox (Matching Image 1 & 3) */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      {[
                        { id: 'cash', label: 'Cash' },
                        { id: 'card', label: 'Card' },
                        { id: 'upi', label: 'UPI' },
                        { id: 'due', label: 'Due' },
                        { id: 'part', label: 'Part' },
                      ].map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setPaymentMethod(id as any)}
                          className={cn(
                            'px-2.5 py-1.5 text-xs font-bold rounded-md border transition-colors',
                            paymentMethod === id
                              ? 'bg-red-600 text-white border-red-700 shadow-2xs'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                          )}
                        >
                          {label} {paymentMethod === id ? '✓' : ''}
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPaidChecked}
                        onChange={(e) => setIsPaidChecked(e.target.checked)}
                        className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                      />
                      <span>It&apos;s Paid</span>
                    </label>
                  </div>

                  {/* Petpooja Action Buttons row:
                      [ Save ] (Red)
                      [ Save & Print ] (Red)
                      [ KOT ] (Charcoal dark gray)
                      [ KOT & Print ] (Charcoal dark gray)
                      Notice: Save & EBill removed per user instructions!
                      Rule: "once the kot is sent it should return to table view" */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {/* [ Save ] */}
                    <button
                      type="button"
                      onClick={() => handleSaveOrder(false)}
                      disabled={actionLoading}
                      className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50 text-center flex items-center justify-center gap-1.5"
                    >
                      {submittingAction === 'save' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {submittingAction === 'save' ? 'Saving...' : 'Save'}
                    </button>

                    {/* [ Save & Print ] */}
                    <button
                      type="button"
                      onClick={() => handleSaveOrder(true)}
                      disabled={actionLoading}
                      className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50 text-center flex items-center justify-center gap-1.5"
                    >
                      {submittingAction === 'save_print' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {submittingAction === 'save_print' ? 'Saving & Printing...' : 'Save & Print'}
                    </button>

                    {/* [ KOT ] (Dark Gray) - Automatically returns to Table View */}
                    <button
                      type="button"
                      onClick={() => handleSendKOT(false)}
                      disabled={actionLoading || cartSummary.itemCount === 0}
                      className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50 text-center flex items-center justify-center gap-1.5"
                    >
                      {submittingAction === 'kot' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {submittingAction === 'kot' ? 'Sending KOT...' : 'KOT'}
                    </button>

                    {/* [ KOT & Print ] (Dark Gray) - Automatically returns to Table View */}
                    <button
                      type="button"
                      onClick={() => handleSendKOT(true)}
                      disabled={actionLoading || cartSummary.itemCount === 0}
                      className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-50 text-center flex items-center justify-center gap-1.5"
                    >
                      {submittingAction === 'kot_print' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {submittingAction === 'kot_print' ? 'Sending & Printing...' : 'KOT & Print'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Floating Bottom Bar on Mobile when browsing Menu */}
            {mobileActiveTab === 'menu' && cartSummary.itemCount > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden p-2.5 sm:p-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 shadow-2xl flex items-center justify-between gap-2">
                <div
                  onClick={() => setMobileCartDrawerOpen(true)}
                  className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
                >
                  <div className="relative bg-red-50 dark:bg-red-950/60 text-red-600 p-2 rounded-xl border border-red-200 dark:border-red-900 shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                    <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                      {cartSummary.itemCount}
                    </span>
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-gray-900 dark:text-white">
                        {cartSummary.itemCount} {cartSummary.itemCount === 1 ? 'item' : 'items'}
                      </span>
                      {selectedTable && (
                        <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200 border border-orange-300">
                          {selectedTable.tableNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-black text-red-600 dark:text-red-400">
                      {formatCurrency(
                        (isRound2Mode && activeOrder ? activeOrder.total : 0) + cartSummary.total
                      )}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileCartDrawerOpen(true)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-black px-3.5 py-2.5 rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer shrink-0 transition-transform active:scale-95"
                >
                  <span>Review & KOT</span>
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Instant Floating Feedback Pill when adding items */}
            {cartFeedback.visible && (
              <div className="fixed bottom-18 sm:bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900/90 text-white dark:bg-white/95 dark:text-gray-900 px-4 py-2 rounded-full text-xs font-bold shadow-2xl flex items-center gap-2 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150 backdrop-blur-xs">
                <CheckCircle className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
                <span>{cartFeedback.message}</span>
              </div>
            )}

            {/* Mobile Cart Drawer / Slide-Up Bottom Sheet */}
            {mobileCartDrawerOpen && (
              <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150">
                <div
                  className="flex-1"
                  onClick={() => setMobileCartDrawerOpen(false)}
                />
                <div className="bg-white dark:bg-gray-900 rounded-t-2xl border-t border-gray-200 dark:border-gray-800 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200">
                  {/* Drawer Header */}
                  <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800/80 shrink-0">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-red-600" />
                      <h3 className="font-black text-sm text-gray-900 dark:text-white">
                        Review Cart ({cartSummary.itemCount} items)
                      </h3>
                      {selectedTable && (
                        <span className="text-xs font-black px-2 py-0.5 rounded bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200 border border-orange-300">
                          {selectedTable.tableNumber}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileCartDrawerOpen(false)}
                      className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Drawer Scrollable Content */}
                  <div className="overflow-y-auto p-3 space-y-3 flex-1">
                    {/* Cart Items List */}
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden flex flex-col justify-start">
                      <div className="bg-gray-50 dark:bg-gray-800/80 px-3 py-2 border-b border-gray-200 dark:border-gray-800 grid grid-cols-12 text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider shrink-0">
                        <span className="col-span-6">ITEMS</span>
                        <span className="col-span-2 text-center">CHECK</span>
                        <span className="col-span-2 text-center">QTY.</span>
                        <span className="col-span-2 text-right">PRICE</span>
                      </div>

                      <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[280px] overflow-y-auto pr-0.5">
                        {isRound2Mode && activeOrder && (
                          <div className="p-2 bg-amber-50/50 dark:bg-amber-950/20 text-xs border-b border-amber-200/60 shrink-0">
                            <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-200">
                              <span>Previous Rounds: {activeOrder.items?.filter((i) => i.status !== 'cancelled').length} items</span>
                              <span>{formatCurrency(activeOrder.total)}</span>
                            </div>
                          </div>
                        )}

                        {Object.keys(cart).length === 0 ? (
                          <div className="py-8 text-center text-gray-400 text-sm font-medium">
                            No items selected yet. Tap menu items to add.
                          </div>
                        ) : (
                          Object.entries(cart).map(([cartKey, d]) => {
                            const item = menuItems.find((i) => i._id === d.menuItemId);
                            if (!item) return null;
                            const lineTotal = d.unitPrice * d.quantity;

                            return (
                              <div key={cartKey} className="p-2.5 text-sm space-y-1 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors shrink-0">
                                <div className="grid grid-cols-12 items-start gap-1">
                                  <div className="col-span-6 flex items-start gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => removeCartEntry(cartKey)}
                                      className="text-red-500 hover:text-red-700 mt-0.5 p-0.5 cursor-pointer"
                                      title="Delete Item"
                                    >
                                      <X className="w-4 h-4 stroke-[2.5]" />
                                    </button>
                                    <div>
                                      <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                                        {item.name}
                                      </p>
                                      {d.variant?.name && (
                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                                          Portion: {d.variant.name}
                                        </p>
                                      )}
                                      {d.selectedAddons && d.selectedAddons.length > 0 && (
                                        <p className="text-xs text-gray-600 dark:text-gray-300 font-medium pl-2 mt-0.5">
                                          {d.selectedAddons.map((a) => `${a.name}`).join(', ')}
                                        </p>
                                      )}
                                      {d.notes && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 pl-2 font-medium mt-0.5">
                                          Note: {d.notes}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="col-span-2 flex justify-center items-center pt-0.5">
                                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                                  </div>

                                  <div className="col-span-2 flex items-center justify-center gap-1 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => updateCartEntryQty(cartKey, -1)}
                                      className="text-gray-500 hover:text-red-600 p-0.5 cursor-pointer"
                                    >
                                      <MinusCircle className="w-4 h-4" />
                                    </button>
                                    <span className="font-extrabold text-sm min-w-[1.25rem] text-center">{d.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => updateCartEntryQty(cartKey, 1)}
                                      className="text-gray-500 hover:text-emerald-600 p-0.5 cursor-pointer"
                                    >
                                      <PlusCircle className="w-4 h-4" />
                                    </button>
                                  </div>

                                  <div className="col-span-2 text-right font-extrabold text-sm text-gray-900 dark:text-white pt-0.5">
                                    {formatCurrency(lineTotal)}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-800 text-sm">
                      <div className="flex justify-between text-gray-600 dark:text-gray-300 font-medium">
                        <span>Subtotal:</span>
                        <span className="font-bold text-gray-800 dark:text-gray-200">
                          {formatCurrency(
                            (isRound2Mode && activeOrder ? activeOrder.subtotal : 0) + cartSummary.subtotal
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600 dark:text-gray-300 font-medium">
                        <span>Tax / GST:</span>
                        <span className="font-bold text-gray-800 dark:text-gray-200">
                          {formatCurrency(
                            (isRound2Mode && activeOrder ? activeOrder.taxAmount : 0) + cartSummary.taxAmount
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-base font-bold text-gray-900 dark:text-white pt-1 border-t border-gray-200 dark:border-gray-800">
                        <span>Grand Total:</span>
                        <span className="text-red-600 dark:text-red-400 text-lg font-black">
                          {formatCurrency(
                            (isRound2Mode && activeOrder ? activeOrder.total : 0) + cartSummary.total
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Drawer Actions */}
                    <div className="grid grid-cols-2 gap-2 pt-1 pb-2">
                      <button
                        type="button"
                        onClick={() => handleSendKOT(false)}
                        disabled={actionLoading || cartSummary.itemCount === 0}
                        className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold py-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {submittingAction === 'kot' && <RefreshCw className="w-4 h-4 animate-spin" />}
                        <span>KOT</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendKOT(true)}
                        disabled={actionLoading || cartSummary.itemCount === 0}
                        className="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {submittingAction === 'kot_print' && <RefreshCw className="w-4 h-4 animate-spin" />}
                        <span>KOT & Print</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* VIEW C: ADD-ON & VARIANT CUSTOMIZATION MODAL (Matches Image 4) */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={!!customizingItem}
        onClose={() => setCustomizingItem(null)}
        title={customizingItem ? `${customizingItem.name} | ${formatCurrency(customizingItem.price)}` : ''}
        size="md"
      >
        {customizingItem && (() => {
          const applicableAddons = getItemApplicableAddons(customizingItem);
          const hasVariants = Boolean(customizingItem.hasVariants && customizingItem.variants && customizingItem.variants.length > 0);
          const basePrice = selectedVariant ? selectedVariant.price : customizingItem.price;
          const chosenAddons = applicableAddons.filter((a) => selectedAddonIds.includes(a._id));
          const addonsPrice = chosenAddons.reduce((sum, a) => sum + a.price, 0);
          const unitPrice = basePrice + addonsPrice;
          const lineTotal = unitPrice * customizingQty;

          // Filter addons based on search input
          const filteredAddons = applicableAddons.filter((a) => {
            if (!addonSearch.trim()) return true;
            return a.name.toLowerCase().includes(addonSearch.toLowerCase());
          });

          return (
            <div className="space-y-4">
              {/* Search addon item input matching Image 4 */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={addonSearch}
                  onChange={(e) => setAddonSearch(e.target.value)}
                  placeholder="Search addon item..."
                  className="input pl-8 py-1 text-xs h-8 bg-gray-50 dark:bg-gray-800/60"
                />
              </div>

              {/* Portions / Variants Section (if applicable) */}
              {hasVariants && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Portion / Variant (Required)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {customizingItem.variants!.map((variant, idx) => {
                      const isSelected = selectedVariant?.name === variant.name;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedVariant(variant)}
                          className={cn(
                            'flex items-center justify-between p-2.5 rounded-lg border text-left transition-all',
                            isSelected
                              ? 'border-red-600 bg-red-50/50 dark:bg-red-950/30 text-red-900 dark:text-red-200'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300'
                          )}
                        >
                          <span className="text-xs font-bold">{variant.name}</span>
                          <span className="text-xs font-black text-gray-900 dark:text-white">
                            {formatCurrency(variant.price)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Addons Grid with Veg / Non-Veg Left Stripes (Image 4) */}
              {applicableAddons.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                        Add-ons / Extras
                      </span>
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                        Min: 0, Max: 5
                      </span>
                    </div>
                    {selectedAddonIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedAddonIds([])}
                        className="text-[11px] text-gray-400 hover:text-red-500"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                    {filteredAddons.map((addon) => {
                      const isSelected = selectedAddonIds.includes(addon._id);
                      return (
                        <button
                          key={addon._id}
                          type="button"
                          onClick={() => {
                            setSelectedAddonIds((prev) =>
                              isSelected ? prev.filter((id) => id !== addon._id) : [...prev, addon._id]
                            );
                          }}
                          className={cn(
                            'p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between min-h-[64px]',
                            // Veg / Non-veg left border stripe
                            addon.isVeg
                              ? 'border-l-4 border-l-emerald-600'
                              : 'border-l-4 border-l-red-600',
                            isSelected
                              ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20 dark:bg-blue-950/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-bold text-gray-900 dark:text-white leading-tight">
                              {addon.name}
                            </span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3] shrink-0" />
                            )}
                          </div>
                          <span className="text-xs font-black text-gray-700 dark:text-gray-300 mt-1">
                            +{formatCurrency(addon.price)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Kitchen Instruction */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 block mb-1">
                  Kitchen Instruction / Special Request
                </label>
                <input
                  type="text"
                  value={customizingNotes}
                  onChange={(e) => setCustomizingNotes(e.target.value)}
                  placeholder="e.g. Extra crispy, no onion..."
                  className="input text-xs py-1.5 w-full"
                />
              </div>

              {/* Quantity Stepper & Price Summary */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500">Qty:</span>
                  <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-white dark:bg-gray-900">
                    <button
                      type="button"
                      onClick={() => setCustomizingQty((q) => Math.max(1, q - 1))}
                      disabled={customizingQty <= 1}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 rounded"
                    >
                      <MinusCircle className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                    <span className="w-7 text-center text-xs font-bold">{customizingQty}</span>
                    <button
                      type="button"
                      onClick={() => setCustomizingQty((q) => q + 1)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-base font-black text-red-600">
                    {formatCurrency(lineTotal)}
                  </span>
                </div>
              </div>

              {/* Modal Actions matching Image 4: [Cancel] & [Save] (Red) */}
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCustomizingItem(null)}
                  className="btn-secondary flex-1 text-xs py-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCustomization}
                  disabled={hasVariants && !selectedVariant}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2 px-6 rounded-lg shadow-sm flex-2 text-center"
                >
                  Save • {formatCurrency(lineTotal)}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ───────────────────────────────────────────────────────── */}
      {/* ORDER DETAILS & SETTLEMENT MODAL (Opened via Eye Icon)    */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={showOrderDetailsModal}
        onClose={() => setShowOrderDetailsModal(false)}
        title={selectedTable ? `Table ${selectedTable.tableNumber} — Order Details & Settlement` : 'Order Details'}
        size="lg"
      >
        {selectedTable && (
          <div>
            {orderModalLoading ? (
              <div className="py-20 flex justify-center">
                <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !activeOrder ? (
              <div className="py-12 text-center text-gray-400 text-xs">
                No active order found for this table.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Order Meta Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-lg border text-xs">
                  <div className="flex items-center gap-2">
                    {activeOrder.status === 'billed' || Boolean(activeOrder.billPrinted) ? (
                      <span className="font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-400 flex items-center gap-1.5 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        Bill Given (Payment Pending)
                      </span>
                    ) : activeOrder.status === 'served' ? (
                      <span className="font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-400 flex items-center gap-1.5 shadow-2xs">
                        <Utensils className="w-3.5 h-3.5 text-blue-600" />
                        Food Served (Dining)
                      </span>
                    ) : (
                      <span className="font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-400 flex items-center gap-1.5 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                        KOT Active (Cooking)
                      </span>
                    )}
                    <span className="text-gray-500">
                      Token #{activeOrder.orderNumber || activeOrder._id.slice(-4)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeOrder.status !== 'served' && activeOrder.status !== 'billed' && activeOrder.status !== 'paid' && (
                      <button
                        onClick={() => handleMarkOrderServed()}
                        disabled={actionLoading}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                        title="Mark all food as served to customer"
                      >
                        <Utensils className="w-3.5 h-3.5" />
                        Food Served
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (isPrintStation || printMode === 'test') {
                          handlePrintCustomerBill();
                          try {
                            await ordersApi.markBillPrinted(activeOrder._id);
                          } catch (e) {}
                          toast.success(`Printing customer bill for Table ${selectedTable?.tableNumber || ''}`);
                          await loadData();
                        } else {
                          try {
                            await ordersApi.queueBillPrint(activeOrder._id);
                            const printMsg = `Customer bill for Table ${selectedTable?.tableNumber || ''} sent to Counter Printer 🖨️`;
                            toast.success(printMsg);
                            setNoticeMessage(printMsg);
                            setTimeout(() => setNoticeMessage(null), 4000);
                            await loadData();
                          } catch (err: any) {
                            toast.error(err.response?.data?.message || 'Failed to send bill to printer');
                          }
                        }
                      }}
                      className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      {isPrintStation
                        ? (Boolean(activeOrder.billPrinted || activeOrder.status === 'billed') ? 'Reprint Bill' : 'Print Bill')
                        : (Boolean(activeOrder.billPrinted || activeOrder.status === 'billed') ? 'Reprint via Printer' : 'Send Bill to Printer')}
                    </button>
                    <button
                      onClick={() => {
                        setShowOrderDetailsModal(false);
                        handleOpenMoveModal(selectedTable);
                      }}
                      className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 font-semibold"
                      title="Move KOT / Transfer Table"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      Move Table
                    </button>
                    <button
                      onClick={() => {
                        setShowOrderDetailsModal(false);
                        handleOccupiedTableBodyClick(selectedTable);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1 px-3 rounded-lg flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      + Add Round (KOT)
                    </button>
                  </div>
                </div>

                {/* Ordered Items Table */}
                <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800/60 border-b">
                      <tr>
                        <th className="table-th">Item</th>
                        <th className="table-th">Qty</th>
                        <th className="table-th">Price</th>
                        <th className="table-th">Line Total</th>
                        <th className="table-th">Status</th>
                        <th className="table-th text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {activeOrder.items?.map((item: any) => {
                        const isCancelled = item.status === 'cancelled';
                        const lineTotal = item.price * item.quantity;
                        return (
                          <tr key={item._id} className={cn(isCancelled && 'opacity-40 line-through')}>
                            <td className="table-td font-medium">
                              {item.name}
                              {item.notes && <p className="text-[10px] text-amber-600">Note: {item.notes}</p>}
                            </td>
                            <td className="table-td font-bold">{item.quantity}</td>
                            <td className="table-td text-gray-500">{formatCurrency(item.price)}</td>
                            <td className="table-td font-black">{formatCurrency(lineTotal)}</td>
                            <td className="table-td">
                              <span className="text-[10px] uppercase font-bold">{item.status}</span>
                            </td>
                            <td className="table-td text-right">
                              {!isCancelled && activeOrder.status !== 'paid' && canManageOrders && (
                                <button
                                  onClick={() => handleCancelItem(item._id, item.name)}
                                  className="text-gray-400 hover:text-red-500 p-1"
                                  title="Cancel Item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary & Discount Box */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-800/30 p-3 rounded-lg border text-xs">
                  <div>
                    <label className="label text-xs font-semibold">Apply Discount</label>
                    <div className="flex gap-2 mt-1">
                      <select
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as any)}
                        className="input text-xs w-28 h-8 py-0"
                      >
                        <option value="flat">Flat (₹)</option>
                        <option value="percentage">Percent (%)</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={discountInput}
                        onChange={(e) => setDiscountInput(Math.max(0, +e.target.value))}
                        placeholder="0.00"
                        className="input text-xs flex-1 h-8 py-0"
                      />
                      <button onClick={handleApplyDiscount} className="btn-secondary text-xs px-2.5 h-8">
                        Apply
                      </button>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="flex justify-between text-gray-500">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(activeOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Tax / GST:</span>
                      <span>{formatCurrency(activeOrder.taxAmount)}</span>
                    </div>
                    {activeOrder.discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-semibold">
                        <span>Discount:</span>
                        <span>−{formatCurrency(activeOrder.discount)}</span>
                      </div>
                    )}
                    {(() => {
                      const net = activeOrder.subtotal + activeOrder.taxAmount - (activeOrder.discount || 0);
                      const roundOff = Math.round((activeOrder.total - net) * 100) / 100;
                      if (Math.abs(roundOff) >= 0.01) {
                        return (
                          <div className="flex justify-between text-gray-500 text-xs">
                            <span>Round Off:</span>
                            <span>{roundOff > 0 ? `+${formatCurrency(roundOff)}` : `−${formatCurrency(Math.abs(roundOff))}`}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div className="flex justify-between text-sm font-black text-gray-900 dark:text-white pt-1 border-t">
                      <span>Total:</span>
                      <span className="text-red-600">{formatCurrency(activeOrder.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Settlement & Payment Collection */}
                <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-black shrink-0">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                          Payment Collection &amp; Settlement
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Table {selectedTable?.tableNumber} • Bill Total: <strong className="text-gray-900 dark:text-white">{formatCurrency(activeOrder.total)}</strong>
                        </p>
                      </div>
                    </div>
                    {(activeOrder.status === 'billed' || Boolean(activeOrder.billPrinted)) && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-400 shadow-2xs">
                        <Check className="w-3 h-3 text-emerald-600" />
                        Bill Given to Customer
                      </span>
                    )}
                  </div>

                  {/* 1. Payment Mode Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      1. Select Payment Mode
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                      {[
                        { id: 'cash', label: 'Cash', icon: Banknote },
                        { id: 'upi', label: 'UPI', icon: Smartphone },
                        { id: 'card', label: 'Card', icon: CreditCard },
                        { id: 'due', label: 'Due / Khata', icon: UserCheck },
                        { id: 'part', label: 'Part Payment', icon: Layers },
                      ].map(({ id, label, icon: Icon }) => {
                        const isSelected = paymentMethod === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setPaymentMethod(id as any)}
                            className={cn(
                              'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg font-bold text-xs border transition-all duration-150 cursor-pointer',
                              isSelected
                                ? id === 'due'
                                  ? 'bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-500/30'
                                  : 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-500/30'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            )}
                          >
                            <Icon className={cn('w-3.5 h-3.5', isSelected ? 'text-white' : 'text-gray-500')} />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Amount Input & Calculation */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      2. {paymentMethod === 'part' ? 'Enter Split Amounts (₹)' : paymentMethod === 'due' ? 'Customer Khata Details' : 'Payment Amount Received (₹)'}
                    </label>

                    {paymentMethod === 'due' ? (
                      <div className="space-y-3 p-3.5 bg-white dark:bg-gray-800/90 rounded-xl border-2 border-amber-400 dark:border-amber-600/70 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                            <UserCheck className="w-4 h-4 text-amber-600" />
                            Regular Customer Khata
                          </span>
                          <span className="text-[11px] font-black px-2.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300">
                            Bill Total: {formatCurrency(activeOrder.total)}
                          </span>
                        </div>

                        {selectedDueCustomer ? (
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                                  <span>{selectedDueCustomer.name}</span>
                                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({selectedDueCustomer.phone})</span>
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  Regular Customer • {selectedDueCustomer.totalOrders} past visits
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDueCustomer(null);
                                  setDueCustomerName('');
                                  setDueCustomerPhone('');
                                  setCustomerSearchQuery('');
                                }}
                                className="text-xs text-brand-600 hover:underline font-bold"
                              >
                                Change Customer
                              </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-800/60 text-center">
                              <div className="p-1.5 rounded bg-white dark:bg-gray-900 border border-amber-100 dark:border-gray-700">
                                <div className="text-[10px] text-gray-500 font-bold uppercase">Previous Due</div>
                                <div className="text-xs font-black text-amber-700 dark:text-amber-400">{formatCurrency(selectedDueCustomer.totalDue)}</div>
                              </div>
                              <div className="p-1.5 rounded bg-white dark:bg-gray-900 border border-amber-100 dark:border-gray-700">
                                <div className="text-[10px] text-gray-500 font-bold uppercase">This Bill</div>
                                <div className="text-xs font-black text-red-600 dark:text-red-400">+{formatCurrency(activeOrder.total)}</div>
                              </div>
                              <div className="p-1.5 rounded bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700">
                                <div className="text-[10px] text-amber-900 dark:text-amber-200 font-black uppercase">New Total Due</div>
                                <div className="text-xs font-black text-amber-900 dark:text-white">{formatCurrency(selectedDueCustomer.totalDue + activeOrder.total)}</div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {/* Autocomplete Search input */}
                            <div className="relative">
                              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                type="text"
                                value={customerSearchQuery}
                                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                placeholder="Search regular customer by name or phone digits..."
                                className="input pl-9 pr-8 text-xs font-semibold h-9 w-full"
                              />
                              {customerSearching && (
                                <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                              )}
                              {customerSearchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                                  {customerSearchResults.map((cust) => (
                                    <button
                                      key={cust._id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedDueCustomer(cust);
                                        setDueCustomerName(cust.name);
                                        setDueCustomerPhone(cust.phone);
                                        setCustomerSearchQuery('');
                                        setCustomerSearchResults([]);
                                      }}
                                      className="w-full text-left p-2.5 hover:bg-amber-50 dark:hover:bg-gray-800 flex items-center justify-between text-xs cursor-pointer transition-colors"
                                    >
                                      <div>
                                        <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                          <span>{cust.name}</span>
                                          <span className="text-gray-500 text-[11px]">({cust.phone})</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400">Past Orders: {cust.totalOrders}</div>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-[10px] text-gray-400 block uppercase">Current Due</span>
                                        <span className="font-black text-amber-700 dark:text-amber-400">{formatCurrency(cust.totalDue)}</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">
                              — or enter customer details manually —
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase">
                                  Customer Name *
                                </label>
                                <input
                                  type="text"
                                  value={dueCustomerName}
                                  onChange={(e) => setDueCustomerName(e.target.value)}
                                  placeholder="e.g. Rahul Sharma"
                                  className="input h-8 text-xs font-bold w-full"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase">
                                  Mobile Number (10 Digits) *
                                </label>
                                <input
                                  type="tel"
                                  maxLength={10}
                                  value={dueCustomerPhone}
                                  onChange={(e) => setDueCustomerPhone(e.target.value.replace(/\D/g, ''))}
                                  placeholder="e.g. 9874561230"
                                  className="input h-8 text-xs font-bold w-full"
                                />
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-500">
                              ℹ️ Customer will be saved in Khata. Dues accumulate across visits and can be cleared anytime at month-end.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : paymentMethod !== 'part' ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-bold text-sm">
                            ₹
                          </span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={settlementInput}
                            onChange={(e) => setSettlementInput(e.target.value)}
                            placeholder={String(activeOrder.total)}
                            className="input w-full pl-8 pr-3 py-2 text-base font-black h-10"
                          />
                        </div>

                        {/* Quick amount chips */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Quick:</span>
                          <button
                            type="button"
                            onClick={() => setSettlementInput(String(activeOrder.total))}
                            className={cn(
                              'text-[11px] font-bold px-2.5 py-0.5 rounded border transition-colors cursor-pointer',
                              settlementInput === String(activeOrder.total) || settlementInput === ''
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-black shadow-2xs'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 hover:bg-gray-100'
                            )}
                          >
                            Exact: {formatCurrency(activeOrder.total)}
                          </button>
                          {paymentMethod === 'cash' &&
                            [100, 200, 500, 1000, 2000]
                              .filter((d) => d > activeOrder.total)
                              .slice(0, 3)
                              .map((denom) => (
                                <button
                                  key={denom}
                                  type="button"
                                  onClick={() => setSettlementInput(String(denom))}
                                  className={cn(
                                    'text-[11px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer',
                                    settlementInput === String(denom)
                                      ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-black shadow-2xs'
                                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 hover:bg-gray-100'
                                  )}
                                >
                                  ₹{denom} Note
                                </button>
                              ))}
                        </div>

                        {/* Live calculation banner */}
                        {(() => {
                          const enteredAmt = settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total;
                          if (isNaN(enteredAmt) || enteredAmt < 0) return null;
                          const diff = Math.round((enteredAmt - activeOrder.total) * 100) / 100;
                          if (diff > 0) {
                            return (
                              <div className="p-2.5 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 flex items-center justify-between text-xs">
                                <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                                  <Banknote className="w-4 h-4 text-emerald-600" />
                                  Cash Tendered: {formatCurrency(enteredAmt)}
                                </span>
                                <span className="font-black text-emerald-800 dark:text-emerald-200 bg-white dark:bg-gray-900 px-2.5 py-0.5 rounded border border-emerald-300 shadow-2xs">
                                  Return Change: {formatCurrency(diff)}
                                </span>
                              </div>
                            );
                          }
                          if (diff < 0) {
                            return (
                              <div className="p-2.5 rounded-lg bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 flex items-center justify-between text-xs">
                                <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                                  <AlertCircle className="w-4 h-4 text-amber-600" />
                                  Receiving Partial: {formatCurrency(enteredAmt)}
                                </span>
                                <span className="font-black text-amber-900 dark:text-amber-200 bg-white dark:bg-gray-900 px-2.5 py-0.5 rounded border border-amber-300 shadow-2xs">
                                  Waived Shortage: {formatCurrency(Math.abs(diff))}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              Exact payment ({formatCurrency(activeOrder.total)})
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      /* Part Payment Split breakdown */
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Cash (₹)</span>
                            <input
                              type="number"
                              min="0"
                              value={partCash}
                              onChange={(e) => setPartCash(e.target.value)}
                              placeholder="0.00"
                              className="input h-9 text-xs font-bold py-0"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">UPI (₹)</span>
                            <input
                              type="number"
                              min="0"
                              value={partUpi}
                              onChange={(e) => setPartUpi(e.target.value)}
                              placeholder="0.00"
                              className="input h-9 text-xs font-bold py-0"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Card (₹)</span>
                            <input
                              type="number"
                              min="0"
                              value={partCard}
                              onChange={(e) => setPartCard(e.target.value)}
                              placeholder="0.00"
                              className="input h-9 text-xs font-bold py-0"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Due / Khata (₹)</span>
                            <input
                              type="number"
                              min="0"
                              value={partDue}
                              onChange={(e) => setPartDue(e.target.value)}
                              placeholder="0.00"
                              className="input h-9 text-xs font-bold py-0 border-amber-300 dark:border-amber-700"
                            />
                          </div>
                        </div>

                        {/* Customer Khata prompt inside Part Payment if Due > 0 */}
                        {numPartDue > 0 && (
                          <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-700 space-y-2">
                            <div className="text-[11px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                              Customer for Due Portion ({formatCurrency(numPartDue)})
                            </div>

                            {selectedDueCustomer ? (
                              <div className="flex items-center justify-between text-xs bg-white dark:bg-gray-900 p-2 rounded-lg border border-amber-200">
                                <div>
                                  <span className="font-bold">{selectedDueCustomer.name}</span>
                                  <span className="text-gray-500 text-[11px] ml-1">({selectedDueCustomer.phone})</span>
                                  <span className="text-amber-600 text-[11px] block">Current Due: {formatCurrency(selectedDueCustomer.totalDue)}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedDueCustomer(null)}
                                  className="text-xs text-brand-600 font-bold hover:underline"
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={dueCustomerName}
                                  onChange={(e) => setDueCustomerName(e.target.value)}
                                  placeholder="Customer Name *"
                                  className="input h-8 text-xs font-bold"
                                />
                                <input
                                  type="tel"
                                  maxLength={10}
                                  value={dueCustomerPhone}
                                  onChange={(e) => setDueCustomerPhone(e.target.value.replace(/\D/g, ''))}
                                  placeholder="10-digit Mobile No *"
                                  className="input h-8 text-xs font-bold"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-white dark:bg-gray-800 border">
                          <span className="font-bold text-gray-700 dark:text-gray-300">
                            Total Split: {formatCurrency(totalPartAllocated)} / {formatCurrency(activeOrder.total)}
                          </span>
                          {partRemaining > 0 ? (
                            <span className="text-amber-600 font-bold">Waived Shortage: {formatCurrency(partRemaining)}</span>
                          ) : totalPartAllocated > activeOrder.total ? (
                            <span className="text-emerald-600 font-bold">Excess: {formatCurrency(Math.round((totalPartAllocated - activeOrder.total) * 100) / 100)}</span>
                          ) : (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Perfectly Balanced
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Settle Table Action Button */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleCollectPayment}
                      disabled={
                        !canManageOrders ||
                        actionLoading ||
                        ((paymentMethod === 'due' || (paymentMethod === 'part' && numPartDue > 0)) && (
                          (!dueCustomerName.trim() && !selectedDueCustomer?.name) ||
                          (!dueCustomerPhone.trim() && !selectedDueCustomer?.phone) ||
                          (dueCustomerPhone.trim() || selectedDueCustomer?.phone || '').replace(/\D/g, '').length < 10
                        )) ||
                        (paymentMethod === 'part' && totalPartAllocated <= 0) ||
                        (paymentMethod !== 'part' && paymentMethod !== 'due' && (
                          isNaN(settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total) ||
                          (settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total) < 0
                        ))
                      }
                      className={cn(
                        'w-full py-2.5 px-4 rounded-xl font-black text-sm text-white shadow-md flex items-center justify-center gap-2 transition-all',
                        !canManageOrders ||
                        actionLoading ||
                        ((paymentMethod === 'due' || (paymentMethod === 'part' && numPartDue > 0)) && (
                          (!dueCustomerName.trim() && !selectedDueCustomer?.name) ||
                          (!dueCustomerPhone.trim() && !selectedDueCustomer?.phone) ||
                          (dueCustomerPhone.trim() || selectedDueCustomer?.phone || '').replace(/\D/g, '').length < 10
                        )) ||
                        (paymentMethod === 'part' && totalPartAllocated <= 0) ||
                        (paymentMethod !== 'part' && paymentMethod !== 'due' && (
                          isNaN(settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total) ||
                          (settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total) < 0
                        ))
                          ? 'bg-gray-400 cursor-not-allowed opacity-80'
                          : paymentMethod === 'due'
                          ? 'bg-amber-600 hover:bg-amber-700 active:scale-[0.99] cursor-pointer'
                          : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] cursor-pointer'
                      )}
                    >
                      {!canManageOrders ? (
                        <>
                          <CheckCircle className="w-4 h-4 opacity-50" />
                          <span>Settlement Disabled (Demo Mode)</span>
                        </>
                      ) : actionLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Recording Settlement...</span>
                        </>
                      ) : paymentMethod === 'due' ? (
                        <>
                          <UserCheck className="w-4 h-4" />
                          <span>Settle Table as DUE / KHATA ({formatCurrency(activeOrder.total)})</span>
                        </>
                      ) : paymentMethod === 'part' ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Settle Table &amp; Free ({formatCurrency(totalPartAllocated)} Part Payment)</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>
                            Settle Table &amp; Free ({formatCurrency(
                              settlementInput.trim() !== '' && !isNaN(Number(settlementInput))
                                ? Math.min(Number(settlementInput), activeOrder.total)
                                : activeOrder.total
                            )} via {paymentMethod.toUpperCase()}
                            {(() => {
                              const enteredAmt = settlementInput.trim() !== '' ? Number(settlementInput) : activeOrder.total;
                              if (!isNaN(enteredAmt) && enteredAmt > activeOrder.total) {
                                return ` • Return ${formatCurrency(Math.round((enteredAmt - activeOrder.total) * 100) / 100)}`;
                              }
                              return '';
                            })()}
                            )
                          </span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Cancel Entire Order Option */}
                  {activeOrder.status !== 'paid' && canManageOrders && (
                    <div className="pt-1 flex justify-between items-center border-t border-gray-200 dark:border-gray-800">
                      <button
                        type="button"
                        onClick={handleCancelOrder}
                        className="text-xs text-red-600 hover:underline font-semibold"
                      >
                        Cancel Entire Order &amp; Free Table
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ───────────────────────────────────────────────────────── */}
      {/* TABLE CRUD MODAL (Create / Edit Table for Admin)          */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={tableModal === 'create' || tableModal === 'edit'}
        onClose={() => setTableModal(null)}
        title={tableModal === 'create' ? 'Add Dining Table' : 'Edit Dining Table'}
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="label">Table Number / Name *</label>
            <input
              type="text"
              className="input"
              value={tableForm.tableNumber}
              onChange={(e) => setTableForm({ ...tableForm, tableNumber: e.target.value })}
              placeholder="e.g. In 1, Out 4, Pickup 1, Patio 2"
            />
          </div>

          <div>
            <label className="label">Initial Status</label>
            <select
              className="input"
              value={tableForm.status}
              onChange={(e) => setTableForm({ ...tableForm, status: e.target.value as 'available' | 'reserved' })}
            >
              <option value="available">Available (Blank Table)</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={saveTable}
              disabled={tableSaving}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg flex-1 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {tableSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {tableSaving
                ? (tableModal === 'create' ? 'Creating Table...' : 'Updating Table...')
                : (tableModal === 'create' ? 'Create Table' : 'Update Table')}
            </button>
            <button onClick={() => setTableModal(null)} disabled={tableSaving} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ───────────────────────────────────────────────────────── */}
      {/* QUICK BILL / KOT LOOKUP MODAL                             */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={showLookupModal !== null}
        onClose={() => setShowLookupModal(null)}
        title={showLookupModal === 'bill' ? 'Quick Bill Lookup' : 'Quick KOT Lookup'}
        size="sm"
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="label">Enter {showLookupModal === 'bill' ? 'Bill Number' : 'KOT Number'}</label>
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="e.g. 1042"
              className="input"
            />
          </div>
          <button
            onClick={() => {
              if (!lookupQuery.trim()) {
                toast.error('Please enter a number to search');
                return;
              }
              toast.info(`Searching for ${showLookupModal?.toUpperCase()} #${lookupQuery}...`);
              setShowLookupModal(null);
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg w-full"
          >
            Find Order
          </button>
        </div>
      </Modal>

      {/* ───────────────────────────────────────────────────────── */}
      {/* MOVE KOT / ITEMS MODAL (Matching Petpooja Screenshots)    */}
      {/* ───────────────────────────────────────────────────────── */}
      <Modal
        open={moveModal.open}
        onClose={() => setMoveModal({ open: false, sourceTable: null, activeOrder: null })}
        title={`Move KOT/Items - ${moveModal.sourceTable?.tableNumber || ''}`}
        size="xl"
      >
        <div className="space-y-4 text-xs">
          {/* Top Tabs Bar: Table Wise | KOT Wise | Item Wise (Matching Image 1 & 2) */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 -mt-2 -mx-3.5 sm:-mx-6 px-3.5 sm:px-6">
            {[
              { id: 'table', label: 'Table Wise' },
              { id: 'kot', label: 'KOT Wise' },
              { id: 'item', label: 'Item Wise' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMoveTab(id as any)}
                className={cn(
                  'px-6 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-colors',
                  moveTab === id
                    ? 'bg-red-50 dark:bg-red-950/40 text-red-600 border-red-600'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 1. TABLE WISE TAB */}
          {moveTab === 'table' && (
            <div className="space-y-4 pt-1 max-h-[55vh] overflow-y-auto pr-1">
              {activeSections.map((sectionName) => {
                const sectionTables = tables.filter((t) => {
                  if (t._id === moveModal.sourceTable?._id) return false;
                  return getTableSection(t) === sectionName;
                });
                if (sectionTables.length === 0) return null;

                return (
                  <div key={sectionName} className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300">
                      {sectionName}
                    </h4>
                    <div className="flex flex-wrap gap-2.5">
                      {sectionTables.map((t) => {
                        const isSelected = selectedTargetTableId === t._id;
                        const isOccupied = t.status === 'occupied' || !!t.activeOrder;
                        return (
                          <button
                            key={t._id}
                            type="button"
                            onClick={() => setSelectedTargetTableId(t._id)}
                            className={cn(
                              'px-3.5 py-2 rounded text-xs font-semibold transition-all select-none',
                              isSelected
                                ? 'border-2 border-dashed border-red-600 text-red-600 font-bold bg-red-50/60 dark:bg-red-950/40 shadow-xs'
                                : 'border border-dashed border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            )}
                          >
                            {t.tableNumber}
                            {isOccupied && (
                              <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                                (Merge)
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. KOT WISE TAB */}
          {moveTab === 'kot' && (
            <div className="space-y-4 pt-1 max-h-[55vh] overflow-y-auto pr-1">
              <div>
                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Select KOT Round(s) to Move
                </h4>
                {(!moveModal.activeOrder?.kotRounds || moveModal.activeOrder.kotRounds.length === 0) ? (
                  <div className="p-3 text-center text-gray-400 text-xs border rounded-lg">
                    No KOT rounds recorded for this order yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {moveModal.activeOrder.kotRounds.map((round) => {
                      const isChecked = selectedKotRounds.includes(round.roundNumber);
                      return (
                        <label
                          key={round.roundNumber}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors text-xs',
                            isChecked
                              ? 'border-red-500 bg-red-50/40 dark:bg-red-950/20'
                              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedKotRounds([...selectedKotRounds, round.roundNumber]);
                              } else {
                                setSelectedKotRounds(selectedKotRounds.filter((rn) => rn !== round.roundNumber));
                              }
                            }}
                            className="mt-0.5 rounded text-red-600 focus:ring-red-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-gray-900 dark:text-white">
                                Round #{round.roundNumber} {round.roundTag}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {round.createdAt ? new Date(round.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                              {round.items?.map((it, idx) => (
                                <span key={idx} className="bg-white dark:bg-gray-800 border px-1.5 py-0.5 rounded">
                                  {it.quantity}x {it.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Select Destination Table
                </h4>
                {activeSections.map((sectionName) => {
                  const sectionTables = tables.filter((t) => {
                    if (t._id === moveModal.sourceTable?._id) return false;
                    return getTableSection(t) === sectionName;
                  });
                  if (sectionTables.length === 0) return null;

                  return (
                    <div key={sectionName} className="space-y-1.5 mb-3">
                      <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">
                        {sectionName}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {sectionTables.map((t) => {
                          const isSelected = selectedTargetTableId === t._id;
                          const isOccupied = t.status === 'occupied' || !!t.activeOrder;
                          return (
                            <button
                              key={t._id}
                              type="button"
                              onClick={() => setSelectedTargetTableId(t._id)}
                              className={cn(
                                'px-3 py-1.5 rounded text-xs font-semibold transition-all select-none',
                                isSelected
                                  ? 'border-2 border-dashed border-red-600 text-red-600 font-bold bg-red-50/60 dark:bg-red-950/40 shadow-xs'
                                  : 'border border-dashed border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              )}
                            >
                              {t.tableNumber}
                              {isOccupied && (
                                <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                                  (Merge)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. ITEM WISE TAB */}
          {moveTab === 'item' && (
            <div className="space-y-4 pt-1 max-h-[55vh] overflow-y-auto pr-1">
              <div>
                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Select Items &amp; Quantities to Move
                </h4>
                <div className="space-y-2">
                  {(moveModal.activeOrder?.items || [])
                    .filter((it) => it.status !== 'cancelled')
                    .map((item) => {
                      const currentTransferQty = itemTransferQuantities[item._id || ''] || 0;
                      return (
                        <div
                          key={item._id}
                          className={cn(
                            'flex items-center justify-between p-2.5 rounded-lg border text-xs',
                            currentTransferQty > 0
                              ? 'border-red-400 bg-red-50/40 dark:bg-red-950/20'
                              : 'border-gray-200 dark:border-gray-700'
                          )}
                        >
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white">
                              {item.name}
                              {item.variant?.name && <span className="ml-1 text-[11px] text-gray-500">({item.variant.name})</span>}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              Original Qty: {item.quantity} · Price: {formatCurrency(item.price)}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">Move:</span>
                            <div className="flex items-center border rounded-md bg-white dark:bg-gray-800">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!item._id) return;
                                  setItemTransferQuantities({
                                    ...itemTransferQuantities,
                                    [item._id]: Math.max(0, currentTransferQty - 1),
                                  });
                                }}
                                className="p-1 text-gray-500 hover:text-black dark:hover:text-white"
                              >
                                <MinusCircle className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center font-bold text-xs">{currentTransferQty}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!item._id) return;
                                  setItemTransferQuantities({
                                    ...itemTransferQuantities,
                                    [item._id]: Math.min(item.quantity, currentTransferQty + 1),
                                  });
                                }}
                                className="p-1 text-gray-500 hover:text-black dark:hover:text-white"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                  Select Destination Table
                </h4>
                {activeSections.map((sectionName) => {
                  const sectionTables = tables.filter((t) => {
                    if (t._id === moveModal.sourceTable?._id) return false;
                    return getTableSection(t) === sectionName;
                  });
                  if (sectionTables.length === 0) return null;

                  return (
                    <div key={sectionName} className="space-y-1.5 mb-3">
                      <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400">
                        {sectionName}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {sectionTables.map((t) => {
                          const isSelected = selectedTargetTableId === t._id;
                          const isOccupied = t.status === 'occupied' || !!t.activeOrder;
                          return (
                            <button
                              key={t._id}
                              type="button"
                              onClick={() => setSelectedTargetTableId(t._id)}
                              className={cn(
                                'px-3 py-1.5 rounded text-xs font-semibold transition-all select-none',
                                isSelected
                                  ? 'border-2 border-dashed border-red-600 text-red-600 font-bold bg-red-50/60 dark:bg-red-950/40 shadow-xs'
                                  : 'border border-dashed border-gray-400 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                              )}
                            >
                              {t.tableNumber}
                              {isOccupied && (
                                <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                                  (Merge)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Footer Bar: Table No. Input + Cancel & Move Buttons (Matching Image 2) */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Table No.</span>
              <input
                type="text"
                value={tables.find((t) => t._id === selectedTargetTableId)?.tableNumber || ''}
                onChange={(e) => {
                  const typed = e.target.value;
                  const match = tables.find(
                    (t) => t.tableNumber.toLowerCase() === typed.toLowerCase().trim()
                  );
                  if (match && match._id !== moveModal.sourceTable?._id) {
                    setSelectedTargetTableId(match._id);
                  }
                }}
                placeholder="Select a table"
                className="input h-8 w-32 sm:w-40 text-xs font-bold bg-white dark:bg-gray-800"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMoveModal({ open: false, sourceTable: null, activeOrder: null })}
                className="px-5 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedTargetTableId || moveLoading}
                onClick={handleExecuteMove}
                className="px-6 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm disabled:opacity-50 transition-colors"
              >
                {moveLoading ? 'Moving...' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
