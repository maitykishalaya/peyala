'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth';
import {
  tablesApi,
  ordersApi,
  menuApi,
  addonsApi,
  Table,
  Order,
  MenuItem,
  MenuCategory,
  Addon,
  MenuItemVariant,
} from '@/lib/pos-api';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  LayoutGrid,
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
  ShoppingBag,
  Store,
  Bike,
  Percent,
} from 'lucide-react';
import {
  printKOT,
  printCustomerBill,
  getPrintMode,
  setPrintMode,
  PrintMode,
  BillItem,
} from '@/lib/thermal-print';

export interface CartItemConfig {
  menuItemId: string;
  quantity: number;
  notes: string;
  variant?: { name: string; price: number };
  selectedAddons?: Array<{ addonId: string; name: string; price: number }>;
  unitPrice: number;
}

export type TableSection = 'Indoor' | 'Outdoor' | 'Pick Up' | 'Other';

// Group table into Indoor, Outdoor, Pick Up, Other sections (matching Petpooja layout)
function getTableSection(tableNumber: string): TableSection {
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

export default function TablesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManageOrders = user?.role === 'admin' || user?.role === 'manager';

  // ── Primary View Mode: 'table_view' (Floor Plan) or 'pos_order' (3-Column Screen) ──
  const [activeView, setActiveView] = useState<'table_view' | 'pos_order'>('table_view');

  const [tables, setTables] = useState<Table[]>([]);
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'other' | 'part'>('cash');
  const [isPaidChecked, setIsPaidChecked] = useState<boolean>(false);
  const [partCash, setPartCash] = useState<string>('');
  const [partUpi, setPartUpi] = useState<string>('');
  const [partCard, setPartCard] = useState<string>('');
  const [partOther, setPartOther] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);
  const [printMode, setPrintModeState] = useState<PrintMode>('test');

  // Print Station state
  const [isPrintStation, setIsPrintStation] = useState<boolean>(false);
  const [lastPrintedKOT, setLastPrintedKOT] = useState<string | null>(null);
  const [lastPrintedBill, setLastPrintedBill] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const inFlightKotsRef = useRef<Set<string>>(new Set());
  const inFlightBillsRef = useRef<Set<string>>(new Set());

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

  // Bill / KOT Quick Lookup Dialog
  const [lookupQuery, setLookupQuery] = useState('');
  const [showLookupModal, setShowLookupModal] = useState<'bill' | 'kot' | null>(null);

  // Live timer tick for KOT elapsed minutes
  const [, setKotTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setKotTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const getKotElapsedMinutes = (order: any) => {
    if (!order) return null;
    const latestRound = order.kotRounds && order.kotRounds.length > 0
      ? order.kotRounds[order.kotRounds.length - 1]
      : null;
    const kotTime = latestRound?.createdAt || order.createdAt;
    if (!kotTime) return null;
    const diffMs = Date.now() - new Date(kotTime).getTime();
    if (isNaN(diffMs) || diffMs < 0) return 0;
    return Math.floor(diffMs / (1000 * 60));
  };

  // Load all tables, menu, and addons
  const loadData = async () => {
    try {
      setLoading(true);
      const [tableRes, itemRes, catRes, addonRes] = await Promise.all([
        tablesApi.list(),
        menuApi.listItems({ availableOnly: true }),
        menuApi.listCategories(),
        addonsApi.list(),
      ]);
      setTables(tableRes.data);
      setMenuItems(itemRes.data);
      setCategories(catRes.data);
      setAddons(addonRes.data);
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
          const billKey = `${bJob.orderId}-${bJob.isPaid ? 'paid' : 'billed'}`;
          if (inFlightBillsRef.current.has(billKey)) continue;

          inFlightBillsRef.current.add(billKey);

          printCustomerBill({
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

          await ordersApi.markBillPrinted(bJob.orderId);
          setLastPrintedBill(`Table ${bJob.tableNumber} (${bJob.isPaid ? 'Receipt' : 'Bill'})`);
          await new Promise((resolve) => setTimeout(resolve, 400));
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

  // Statistics for Table View
  const stats = useMemo(() => {
    const total = tables.length;
    const available = tables.filter((t) => t.status === 'available').length;
    const occupied = tables.filter((t) => t.status === 'occupied').length;
    const reserved = tables.filter((t) => t.status === 'reserved').length;
    const billed = tables.filter((t) => t.activeOrder && (t.activeOrder as any).status === 'billed').length;
    return { total, available, occupied, reserved, billed };
  }, [tables]);

  // Grouped tables by section
  const sectionGroupedTables = useMemo(() => {
    const filtered = tables.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (tableSearch.trim()) {
        return t.tableNumber.toLowerCase().includes(tableSearch.toLowerCase());
      }
      return true;
    });

    const groups: Record<TableSection, Table[]> = {
      Indoor: [],
      Outdoor: [],
      'Pick Up': [],
      Other: [],
    };

    filtered.forEach((table) => {
      const sec = getTableSection(table.tableNumber);
      groups[sec].push(table);
    });

    return groups;
  }, [tables, statusFilter, tableSearch]);

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

  // 3. Click Eye (View Items) Icon -> Opens full order details & settlement modal
  const handleViewOrderDetails = async (table: Table, e: React.MouseEvent) => {
    e.stopPropagation();
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
        toast.success(`Printing customer bill for Table ${table.tableNumber}`);
      } else {
        await ordersApi.queueBillPrint(ord._id);
        const printMsg = `Customer bill for Table ${table.tableNumber} sent to Counter Printer 🖨️`;
        toast.info(printMsg);
        setNoticeMessage(printMsg);
        setTimeout(() => setNoticeMessage(null), 4000);
      }
    } catch (err) {
      console.error('Failed to print bill from table card:', err);
      toast.error('Could not retrieve order for printing');
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
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    return { itemCount, subtotal, taxAmount, total };
  }, [cart, menuItems]);

  // ── Dispatch KOT / Save Actions ──
  // User Rule: "once the kot is sent it should return to table view"
  const handleSendKOT = async (shouldPrint: boolean) => {
    if (!canManageOrders) {
      toast.error('Order dispatching is restricted to Managers and Administrators.');
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
        const res = await ordersApi.addItems(activeOrder._id, payloadItems);
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
        }

        const msg = `Round ${roundNum} KOT sent for Table ${targetTable?.tableNumber || ''} 👨‍🍳`;
        toast.success(msg);
        setNoticeMessage(msg);
        setTimeout(() => setNoticeMessage(null), 4000);
      } else {
        // CASE: Initial Order (Round 1)
        const res = await ordersApi.create({
          tableId: targetTable?._id || tables[0]?._id,
          items: payloadItems,
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
        }

        const msg = `KOT sent for Table ${targetTable?.tableNumber || ''} 👨‍🍳`;
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
      toast.error('Action restricted to Managers and Administrators.');
      return;
    }

    // If there are unsent items in the cart, first dispatch them
    if (cartSummary.itemCount > 0) {
      await handleSendKOT(false);
      return;
    }

    // If table is occupied and has active order, finalize bill and print
    if (activeOrder) {
      try {
        setActionLoading(true);
        setSubmittingAction(shouldPrintBill ? 'save_print' : 'save');
        let finalOrder = activeOrder;
        if (activeOrder.status !== 'billed' && activeOrder.status !== 'paid') {
          const res = await ordersApi.bill(activeOrder._id);
          finalOrder = res.data;
        }

        if (shouldPrintBill) {
          if (isPrintStation || printMode === 'test') {
            handlePrintCustomerBill(finalOrder);
          } else {
            await ordersApi.queueBillPrint(finalOrder._id);
            setNoticeMessage(`Bill for Table ${selectedTable?.tableNumber || ''} sent to Counter Printer 🖨️`);
            setTimeout(() => setNoticeMessage(null), 4000);
          }
        }

        toast.success(`Bill finalized for Table ${selectedTable?.tableNumber || ''} (${formatCurrency(finalOrder.total)})`);
        await loadData();
        setActiveView('table_view');
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to finalize bill');
      } finally {
        setActionLoading(false);
        setSubmittingAction(null);
      }
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
      orderNumber: targetOrder.orderNumber,
      tokenNo: targetOrder.orderNumber ? String(targetOrder.orderNumber).slice(-2) : targetOrder._id.slice(-2),
      tableNumber: selectedTable?.tableNumber || 'Takeaway',
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

  // Collect Payment / Settlement
  const numPartCash = Math.max(0, parseFloat(partCash) || 0);
  const numPartUpi = Math.max(0, parseFloat(partUpi) || 0);
  const numPartCard = Math.max(0, parseFloat(partCard) || 0);
  const numPartOther = Math.max(0, parseFloat(partOther) || 0);
  const totalPartAllocated = Math.round((numPartCash + numPartUpi + numPartCard + numPartOther) * 100) / 100;
  const partDifference = activeOrder ? Math.round((activeOrder.total - totalPartAllocated) * 100) / 100 : 0;
  const partRemaining = Math.max(0, partDifference);

  const handleCollectPayment = async () => {
    if (!activeOrder) return;

    if (paymentMethod === 'part') {
      if (totalPartAllocated <= 0) {
        toast.error('Please enter at least one part payment amount (Cash, UPI, Card, or Other).');
        return;
      }

      const waived = partRemaining;
      const partsSummary = [
        numPartCash > 0 ? `Cash: ${formatCurrency(numPartCash)}` : null,
        numPartUpi > 0 ? `UPI: ${formatCurrency(numPartUpi)}` : null,
        numPartCard > 0 ? `Card: ${formatCurrency(numPartCard)}` : null,
        numPartOther > 0 ? `Other: ${formatCurrency(numPartOther)}` : null,
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
          other: numPartOther,
        };
        const res = await ordersApi.pay(activeOrder._id, 'part', totalPartAllocated, breakdownPayload);
        if (isPrintStation || printMode === 'test') {
          handlePrintCustomerBill(res.data, true);
        } else {
          await ordersApi.queueBillPrint(res.data._id);
          setNoticeMessage(`Part payment recorded! Receipt for Table ${selectedTable?.tableNumber} sent to Counter Printer 🖨️`);
          setTimeout(() => setNoticeMessage(null), 4000);
        }
        toast.success(`Part payment recorded successfully! Table ${selectedTable?.tableNumber} is now available.`);

        if (typeof window !== 'undefined') {
          localStorage.removeItem('peyala_sales_list_cache_v1');
          localStorage.removeItem('peyala_dashboard_cache_v1');
          localStorage.removeItem('peyala_accounts_cache_v1');
          window.dispatchEvent(new CustomEvent('peyala_sales_updated'));
        }

        setShowOrderDetailsModal(false);
        setActiveOrder(null);
        setSelectedTable(null);
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
    const confirmMsg = waived > 0
      ? `Collect ${formatCurrency(enteredSettlement)} via ${paymentMethod.toUpperCase()} (Waived: ${formatCurrency(waived)}) and free Table ${selectedTable?.tableNumber}?`
      : `Collect ${formatCurrency(enteredSettlement)} via ${paymentMethod.toUpperCase()} and free Table ${selectedTable?.tableNumber}?`;

    if (!confirm(confirmMsg)) return;

    try {
      setActionLoading(true);
      const res = await ordersApi.pay(activeOrder._id, paymentMethod, enteredSettlement);
      if (isPrintStation || printMode === 'test') {
        handlePrintCustomerBill(res.data, true);
      } else {
        await ordersApi.queueBillPrint(res.data._id);
        setNoticeMessage(`Payment recorded! Receipt for Table ${selectedTable?.tableNumber} sent to Counter Printer 🖨️`);
        setTimeout(() => setNoticeMessage(null), 4000);
      }
      toast.success(`Payment recorded successfully! Table ${selectedTable?.tableNumber} is now available.`);

      if (typeof window !== 'undefined') {
        localStorage.removeItem('peyala_sales_list_cache_v1');
        localStorage.removeItem('peyala_dashboard_cache_v1');
        localStorage.removeItem('peyala_accounts_cache_v1');
        window.dispatchEvent(new CustomEvent('peyala_sales_updated'));
      }

      setShowOrderDetailsModal(false);
      setActiveOrder(null);
      setSelectedTable(null);
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
                  <LayoutGrid className="w-5 h-5 text-red-600" />
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

              {/* Status Legend Badges with clearly distinct colors per user instruction! */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
                {/* Blank Table: grey dashed border */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border-2 border-dashed border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300">
                  <span className="w-2 h-2 rounded-full border border-gray-500 bg-transparent" />
                  <span>Blank Table</span>
                </div>

                {/* Running Table: soft blue */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-blue-400 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Running Table</span>
                </div>

                {/* Printed Table: soft green */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Printed Table</span>
                </div>

                {/* Paid Table: soft orange */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-orange-400 bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span>Paid Table</span>
                </div>

                {/* Running KOT Table: soft yellow */}
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-400 bg-amber-100/90 dark:bg-amber-950/60 text-amber-950 dark:text-amber-100">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Running KOT Table</span>
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
                {(['all', 'Indoor', 'Outdoor', 'Pick Up', 'Other'] as const).map((sec) => {
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
                <LayoutGrid className="w-10 h-10 mx-auto text-gray-300 mb-3" />
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
                {(['Indoor', 'Outdoor', 'Pick Up', 'Other'] as const).map((sectionName) => {
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2.5">
                        {secTables.map((table) => {
                          const isOccupied = table.status === 'occupied';
                          const isAvailable = table.status === 'available';
                          const isReserved = table.status === 'reserved';
                          const order = table.activeOrder;
                          const isBilled = order && order.status === 'billed';
                          const isPaid = order && order.status === 'paid';
                          const kotMins = isOccupied && order ? getKotElapsedMinutes(order) : null;

                          // Distinct status styles per user instruction:
                          // Blank Table: grey dashed border
                          // Running Table: blue
                          // Running KOT Table: yellow (#fff9c4)
                          // Printed Table (Billed): green
                          // Paid Table: orange
                          const isRunningKOT = isOccupied && !isBilled && !isPaid && (order?.kotRounds?.length || 0) > 0;
                          const isRunningBlue = isOccupied && !isRunningKOT && !isBilled && !isPaid;

                          return (
                            <div
                              key={table._id}
                              onClick={() => {
                                if (isAvailable) {
                                  handleBlankTableClick(table);
                                } else if (isOccupied) {
                                  // User instruction: apart for print bill & eye icon, clicking body takes orders for round 2!
                                  handleOccupiedTableBodyClick(table);
                                }
                              }}
                              className={cn(
                                'rounded-xl p-2.5 sm:p-3 transition-all duration-150 cursor-pointer relative overflow-hidden flex flex-col justify-between group min-h-[110px] sm:min-h-[118px] select-none',
                                // Blank Table
                                isAvailable &&
                                  'border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 hover:border-red-400 hover:shadow-md',
                                // Running KOT Table (Yellow)
                                isRunningKOT &&
                                  'border-2 border-amber-400 bg-amber-100/90 dark:bg-amber-950/60 text-amber-950 dark:text-amber-100 shadow-xs hover:border-amber-500 hover:shadow-md',
                                // Running Table (Blue)
                                isRunningBlue &&
                                  'border-2 border-blue-400 bg-blue-50/90 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 shadow-xs hover:border-blue-500 hover:shadow-md',
                                // Printed Table (Green)
                                isBilled &&
                                  'border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 shadow-xs hover:border-emerald-500 hover:shadow-md',
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
                                          : 'bg-blue-200/90 text-blue-950 border border-blue-300'
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
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-amber-300/80 text-amber-950 px-1.5 py-0.2 rounded">
                                        KOT Active
                                      </span>
                                    )}
                                    {isRunningBlue && (
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-blue-200 text-blue-900 px-1.5 py-0.2 rounded">
                                        Running
                                      </span>
                                    )}
                                    {isBilled && (
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded">
                                        Printed
                                      </span>
                                    )}
                                    {isPaid && (
                                      <span className="text-[9px] font-black uppercase tracking-wider bg-orange-200 text-orange-900 px-1.5 py-0.2 rounded">
                                        Paid
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Table Name & Capacity */}
                                <div className="mt-1.5 text-center sm:text-left">
                                  <h3 className="font-black text-sm sm:text-base tracking-tight leading-tight">
                                    {table.tableNumber}
                                  </h3>
                                </div>
                              </div>

                              {/* Middle / Bottom Info */}
                              <div className="mt-2 pt-1.5 border-t border-black/10 dark:border-white/10 flex items-center justify-between">
                                {isOccupied && order ? (
                                  <span className="text-xs sm:text-sm font-black text-gray-950 dark:text-white">
                                    {formatCurrency(order.total)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-400 font-semibold">
                                    Tap to order
                                  </span>
                                )}

                                {/* Bottom Quick Action Icons:
                                    Apart for the print bill and view items (eye) icon,
                                    clicking the card body takes orders for round 2! */}
                                <div className="flex items-center gap-1">
                                  {isOccupied && (
                                    <>
                                      {/* Quick Print Bill Icon */}
                                      <button
                                        type="button"
                                        onClick={(e) => handleQuickPrintFromTable(table, e)}
                                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200"
                                        title="Print Customer Bill / KOT"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                      </button>

                                      {/* Move KOT / Transfer Table Icon */}
                                      <button
                                        type="button"
                                        onClick={(e) => handleOpenMoveModal(table, e)}
                                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200"
                                        title="Move KOT / Transfer Table"
                                      >
                                        <ArrowRightLeft className="w-3.5 h-3.5" />
                                      </button>

                                      {/* View Items (Eye) Icon */}
                                      <button
                                        type="button"
                                        onClick={(e) => handleViewOrderDetails(table, e)}
                                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200"
                                        title="View Ordered Items & Settle Bill"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
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
                                      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded"
                                      title="Edit Table"
                                    >
                                      <Pencil className="w-3 h-3" />
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
              </div>
            </div>

            {/* 3-Column Layout: Left Category Rail (Col 1) | Middle Menu Grid (Col 2) | Right Order Cart (Col 3) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-[calc(100vh-210px)]">
              {/* ── COLUMN 1: Category Rail (2 cols on lg) ── */}
              <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-row lg:flex-col overflow-x-auto lg:overflow-y-auto max-h-[140px] lg:max-h-[calc(100vh-220px)] divide-y divide-gray-100 dark:divide-gray-800 divide-x lg:divide-x-0">
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
              <div className="lg:col-span-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs p-3 flex flex-col justify-between space-y-3">
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
              <div className="lg:col-span-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs p-3.5 flex flex-col justify-start gap-3">
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
                        { id: 'upi', label: 'Due / UPI' },
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
                    <span className="font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                      Status: {activeOrder.status}
                    </span>
                    <span className="text-gray-500">
                      Token #{activeOrder.orderNumber || activeOrder._id.slice(-4)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (isPrintStation || printMode === 'test') {
                          handlePrintCustomerBill();
                        } else {
                          try {
                            await ordersApi.queueBillPrint(activeOrder._id);
                            setNoticeMessage(`Customer bill for Table ${selectedTable.tableNumber} sent to Counter Printer 🖨️`);
                            setTimeout(() => setNoticeMessage(null), 4000);
                          } catch (err) {
                            handlePrintCustomerBill();
                          }
                        }
                      }}
                      className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      {isPrintStation ? 'Print Bill' : 'Send Bill to Printer'}
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
                    <div className="flex justify-between text-sm font-black text-gray-900 dark:text-white pt-1 border-t">
                      <span>Total:</span>
                      <span className="text-red-600">{formatCurrency(activeOrder.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Settlement & Payment Collection */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {[
                        { id: 'cash', label: 'Cash' },
                        { id: 'upi', label: 'UPI' },
                        { id: 'card', label: 'Card' },
                        { id: 'other', label: 'Other' },
                        { id: 'part', label: 'Part Payment' },
                      ].map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setPaymentMethod(id as any)}
                          className={cn(
                            'px-2.5 py-1 text-xs font-bold rounded-md border transition-colors',
                            paymentMethod === id
                              ? 'bg-red-600 text-white border-red-700'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={handleCollectPayment}
                      disabled={actionLoading || (paymentMethod === 'part' && totalPartAllocated <= 0)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-5 rounded-lg shadow-sm"
                    >
                      {actionLoading
                        ? 'Settling...'
                        : paymentMethod === 'part'
                        ? `Collect Part: ${formatCurrency(totalPartAllocated)}`
                        : `Collect Payment: ${formatCurrency(activeOrder.total)}`}
                    </button>
                  </div>

                  {/* Part Payment Split breakdown */}
                  {paymentMethod === 'part' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-gray-500">Cash</span>
                        <input
                          type="number"
                          min="0"
                          value={partCash}
                          onChange={(e) => setPartCash(e.target.value)}
                          placeholder="0.00"
                          className="input h-8 text-xs py-0"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-500">UPI</span>
                        <input
                          type="number"
                          min="0"
                          value={partUpi}
                          onChange={(e) => setPartUpi(e.target.value)}
                          placeholder="0.00"
                          className="input h-8 text-xs py-0"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-500">Card</span>
                        <input
                          type="number"
                          min="0"
                          value={partCard}
                          onChange={(e) => setPartCard(e.target.value)}
                          placeholder="0.00"
                          className="input h-8 text-xs py-0"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-500">Other</span>
                        <input
                          type="number"
                          min="0"
                          value={partOther}
                          onChange={(e) => setPartOther(e.target.value)}
                          placeholder="0.00"
                          className="input h-8 text-xs py-0"
                        />
                      </div>
                    </div>
                  )}

                  {/* Cancel Order */}
                  {activeOrder.status !== 'paid' && canManageOrders && (
                    <div className="pt-2 flex justify-between items-center">
                      <button
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
              {(['Indoor', 'Outdoor', 'Pick Up', 'Other'] as const).map((sectionName) => {
                const sectionTables = tables.filter((t) => {
                  if (t._id === moveModal.sourceTable?._id) return false;
                  return getTableSection(t.tableNumber) === sectionName;
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
                {(['Indoor', 'Outdoor', 'Pick Up', 'Other'] as const).map((sectionName) => {
                  const sectionTables = tables.filter((t) => {
                    if (t._id === moveModal.sourceTable?._id) return false;
                    return getTableSection(t.tableNumber) === sectionName;
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
                {(['Indoor', 'Outdoor', 'Pick Up', 'Other'] as const).map((sectionName) => {
                  const sectionTables = tables.filter((t) => {
                    if (t._id === moveModal.sourceTable?._id) return false;
                    return getTableSection(t.tableNumber) === sectionName;
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
