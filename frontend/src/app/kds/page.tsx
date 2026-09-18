'use client';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { ordersApi, Order, KdsPrepNextItem, OrderItem } from '@/lib/pos-api';
import { formatCurrency, cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { playTwoBlinkAlertSound, broadcastKdsReady } from '@/lib/audio-alerts';
import Link from 'next/link';
import {
  ChefHat,
  Flame,
  Clock,
  RefreshCw,
  Volume2,
  VolumeX,
  CheckCircle2,
  CheckSquare,
  Square,
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  Utensils,
  Filter,
  Layers,
  Sparkles,
  Search,
  BellRing,
  X,
} from 'lucide-react';

// Web Audio API dual-frequency chime synthesizer (880Hz -> 1320Hz bell)
const playKitchenChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // Note A5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second chime higher pitch
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.15); // Note E6
    gain2.gain.setValueAtTime(0.35, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.7);
  } catch (err) {
    console.warn('Audio chime could not be played:', err);
  }
};

export default function KitchenDisplayPage() {
  const [activeTab, setActiveTab] = useState<'prep_next' | 'tickets' | 'history'>('prep_next');
  const [orders, setOrders] = useState<Order[]>([]);
  const [prepNext, setPrepNext] = useState<KdsPrepNextItem[]>([]);
  const [fulfilledHistory, setFulfilledHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [prepSort, setPrepSort] = useState<'oldest' | 'quantity'>('oldest');
  const [stationFilter, setStationFilter] = useState<'all' | 'veg' | 'beverage'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Notification popup for "Item is ready"
  const [readyPopup, setReadyPopup] = useState<{
    id: string;
    title?: string;
    name: string;
    variantName?: string;
    tables?: string[];
  } | null>(null);

  useEffect(() => {
    if (!readyPopup) return;
    const timer = setTimeout(() => {
      setReadyPopup(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [readyPopup]);

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Track known order IDs to play chime when a new KOT arrives
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Fetch KDS data from backend
  const loadKdsData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setRefreshing(true);
      const res = await ordersApi.getKdsActive();
      const newOrders = res.data.orders || [];
      const newPrepNext = res.data.prepNext || [];

      // Check if new orders arrived to trigger sound alert
      if (!isInitialLoadRef.current && soundEnabled) {
        const hasNewOrders = newOrders.some((o) => !knownOrderIdsRef.current.has(o._id));
        if (hasNewOrders) {
          playKitchenChime();
          toast.info('New KOT ticket received in kitchen! 🔔');
        }
      }

      // Update known IDs
      const currentIds = new Set(newOrders.map((o) => o._id));
      knownOrderIdsRef.current = currentIds;
      isInitialLoadRef.current = false;

      setOrders(newOrders);
      setPrepNext(newPrepNext);
    } catch (err: any) {
      console.error('Failed to load KDS active feed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [soundEnabled]);

  // Polling interval every 20 seconds for real-time kitchen sync
  useEffect(() => {
    loadKdsData();
    const interval = setInterval(() => {
      loadKdsData(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [loadKdsData]);

  // Handle marking an individual item status in ticket view
  const handleUpdateItemStatus = async (orderId: string, itemId: string, currentStatus: string) => {
    try {
      const nextStatus =
        currentStatus === 'pending'
          ? 'preparing'
          : currentStatus === 'preparing'
          ? 'served'
          : 'pending';

      setActionLoading(`${orderId}-${itemId}`);
      await ordersApi.updateKdsItemStatus(orderId, itemId, nextStatus);
      await loadKdsData(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update item status');
    } finally {
      setActionLoading(null);
    }
  };

  // Bump entire order ticket (mark all items ready/served)
  const handleBumpOrder = async (order: Order) => {
    try {
      setActionLoading(order._id);
      await ordersApi.bumpKdsOrder(order._id);
      setFulfilledHistory((prev) => [order, ...prev.slice(0, 19)]);
      const tableStr = typeof order.table === 'object' ? order.table.tableNumber : 'Order';
      const orderLabel = `Table ${tableStr}`;
      toast.success(`Ticket for ${orderLabel} completed! 🎉`);

      // 2-blink notification popup & sound alert for cashier notice
      setReadyPopup({
        id: String(Date.now()),
        title: 'Ticket Ready',
        name: `Order #${order.orderNumber || order._id.slice(-4)} (${orderLabel})`,
        tables: [String(tableStr)],
      });

      if (soundEnabled) {
        playTwoBlinkAlertSound();
      }

      broadcastKdsReady({
        id: String(Date.now()),
        name: `Order #${order.orderNumber || order._id.slice(-4)} (${orderLabel})`,
        tables: [String(tableStr)],
        tableNumber: String(tableStr),
        timestamp: Date.now(),
      });

      await loadKdsData(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to bump ticket');
    } finally {
      setActionLoading(null);
    }
  };

  // Start preparing all items in ticket
  const handleStartCookingTicket = async (order: Order) => {
    try {
      setActionLoading(`start-${order._id}`);
      const pendingItems = (order.items || []).filter((i) => i.status === 'pending');
      for (const it of pendingItems) {
        if (it._id) {
          await ordersApi.updateKdsItemStatus(order._id, it._id, 'preparing');
        }
      }
      toast.info('Ticket marked as cooking 🍳');
      await loadKdsData(true);
    } catch (err: any) {
      toast.error('Failed to update ticket items');
    } finally {
      setActionLoading(null);
    }
  };

  // Batch bump a dish across all tables (Prep Next action)
  const handleBatchBumpItem = async (prepItem: KdsPrepNextItem) => {
    try {
      setActionLoading(prepItem.key);
      await ordersApi.batchBumpKdsItem(prepItem.menuItemId, prepItem.variantName);

      const variantPart = prepItem.variantName ? ` (${prepItem.variantName})` : '';
      const itemDisplayName = `${prepItem.name}${variantPart}`;

      // Toast notification: "<item name> is ready"
      toast.success(`${itemDisplayName} is ready`);

      // Prominent popup notification banner with 2-blink styling
      setReadyPopup({
        id: String(Date.now()),
        title: 'Batch Ready',
        name: prepItem.name,
        variantName: prepItem.variantName,
        tables: prepItem.tables?.map((t) => t.tableNumber),
      });

      // 2-blink audio alert to catch cashier notice
      if (soundEnabled) {
        playTwoBlinkAlertSound();
      }

      // Broadcast to Cashier POS screens across tabs/monitors
      broadcastKdsReady({
        id: String(Date.now()),
        name: prepItem.name,
        variantName: prepItem.variantName,
        tables: prepItem.tables?.map((t) => t.tableNumber),
        timestamp: Date.now(),
      });

      await loadKdsData(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to batch-bump item');
    } finally {
      setActionLoading(null);
    }
  };

  // Start cooking a batch of items
  const handleStartBatchCooking = async (prepItem: KdsPrepNextItem) => {
    try {
      setActionLoading(`start-${prepItem.key}`);
      for (const t of prepItem.tables) {
        if (t.status === 'pending') {
          await ordersApi.updateKdsItemStatus(t.orderId, t.itemId, 'preparing');
        }
      }
      toast.info(`Started cooking batch of ${prepItem.name} 🍳`);
      await loadKdsData(true);
    } catch (err: any) {
      toast.error('Failed to update batch');
    } finally {
      setActionLoading(null);
    }
  };

  // Recall a ticket from fulfilled history
  const handleRecallOrder = async (order: Order) => {
    try {
      setActionLoading(`recall-${order._id}`);
      // Revert items to preparing
      if (order.items && order.items.length > 0 && order.items[0]._id) {
        await ordersApi.updateKdsItemStatus(order._id, order.items[0]._id, 'preparing');
      }
      setFulfilledHistory((prev) => prev.filter((o) => o._id !== order._id));
      toast.info('Ticket recalled back to active queue ↩');
      await loadKdsData(true);
    } catch (err: any) {
      toast.error('Failed to recall ticket');
    } finally {
      setActionLoading(null);
    }
  };

  // Helper for elapsed minutes
  const getElapsedMinutes = (dateStr: string | Date) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    if (isNaN(diffMs) || diffMs < 0) return 0;
    return Math.floor(diffMs / (1000 * 60));
  };

  // Color urgency helper
  const getUrgencyColor = (minutes: number) => {
    if (minutes < 10) {
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200',
        badge: 'bg-emerald-600 text-white',
        border: 'border-emerald-400 dark:border-emerald-600',
        label: 'Fresh',
      };
    }
    if (minutes < 20) {
      return {
        bg: 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200',
        badge: 'bg-amber-600 text-white',
        border: 'border-amber-400 dark:border-amber-600',
        label: 'Cooking',
      };
    }
    return {
      bg: 'bg-red-100 dark:bg-red-950/80 border-red-400 dark:border-red-800 text-red-950 dark:text-red-100',
      badge: 'bg-red-600 text-white animate-pulse',
      border: 'border-red-500 ring-2 ring-red-400/50',
      label: 'OVERDUE',
    };
  };

  // Filtered and sorted prep next items
  const filteredPrepItems = useMemo(() => {
    let items = [...prepNext];

    if (stationFilter === 'veg') {
      items = items.filter((i) => i.isVeg);
    } else if (stationFilter === 'beverage') {
      items = items.filter((i) => {
        const catName = typeof i.category === 'object' && i.category !== null ? i.category.name : '';
        return /drink|beverage|coffee|tea|shake|juice/i.test(catName || i.name);
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q) || (i.variantName && i.variantName.toLowerCase().includes(q)));
    }

    if (prepSort === 'oldest') {
      items.sort((a, b) => new Date(a.oldestOrderAt).getTime() - new Date(b.oldestOrderAt).getTime());
    } else {
      items.sort((a, b) => b.totalQuantity - a.totalQuantity);
    }

    return items;
  }, [prepNext, stationFilter, searchQuery, prepSort]);

  // Filtered order tickets
  const filteredOrders = useMemo(() => {
    let list = [...orders];

    if (stationFilter === 'veg') {
      list = list.filter((o) => (o.items || []).some((it) => (it.menuItem as any)?.isVeg));
    } else if (stationFilter === 'beverage') {
      list = list.filter((o) =>
        (o.items || []).some((it) => {
          const catName = (it.menuItem as any)?.category?.name || '';
          return /drink|beverage|coffee|tea|shake|juice/i.test(catName || it.name);
        })
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((o) => {
        const tNum = typeof o.table === 'object' ? o.table.tableNumber : '';
        const hasItem = (o.items || []).some((it) => it.name.toLowerCase().includes(q));
        return tNum.toLowerCase().includes(q) || hasItem || String(o.orderNumber || '').includes(q);
      });
    }

    return list;
  }, [orders, stationFilter, searchQuery]);

  // Overall statistics
  const totalPendingDishes = useMemo(() => {
    return prepNext.reduce((sum, i) => sum + i.totalQuantity, 0);
  }, [prepNext]);

  return (
    <AppLayout>
      {/* Prominent Floating "Food Ready / Cashier Notice" Notification Banner */}
      {readyPopup && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] pointer-events-auto max-w-lg w-[92vw] sm:w-auto animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-4 sm:px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-amber-300 ring-4 ring-amber-400/40 animate-[pulse_1.2s_ease-in-out_2]">
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
                  {readyPopup.title || 'Batch Ready'}
                </span>
                {readyPopup.tables && readyPopup.tables.length > 0 && (
                  <span className="text-[11px] font-black text-amber-200 truncate">
                    Tables: {readyPopup.tables.map((t) => `T${t}`).join(', ')}
                  </span>
                )}
              </div>
              <p className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                {readyPopup.name}
                {readyPopup.variantName && (
                  <span className="text-amber-200 font-bold ml-1 text-xs sm:text-sm">
                    ({readyPopup.variantName})
                  </span>
                )}
                {' '}is ready for pickup! 🍽️
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReadyPopup(null)}
              className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 p-1 sm:p-2">
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TOP BAR: KDS BRANDING, CLOCK, CHIME, REFRESH & NAVIGATION */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Left: Branding & Status */}
          <div className="flex items-center gap-3">
            <Link
              href="/tables"
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1.5 text-xs font-bold transition-colors"
              title="Return to Table View"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Tables POS</span>
            </Link>

            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-red-600 text-white shadow-xs">
                <ChefHat className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-black text-base sm:text-lg text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                  PEYALA KDS
                  <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-300">
                    Kitchen Display
                  </span>
                </h1>
                <p className="text-xs text-gray-500 font-medium">
                  {orders.length} Active Ticket{orders.length !== 1 ? 's' : ''} • {totalPendingDishes} Dishes Pending
                </p>
              </div>
            </div>
          </div>

          {/* Right: Digital Clock, Sound Toggle, Polling Badge & Manual Refresh */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Live Clock */}
            <div className="bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 text-xs font-black text-gray-800 dark:text-gray-100">
              <Clock className="w-3.5 h-3.5 text-red-600" />
              <span>{currentTime.toLocaleTimeString()}</span>
            </div>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                if (!soundEnabled) playKitchenChime();
              }}
              className={cn(
                'px-2.5 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer',
                soundEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400'
              )}
              title={soundEnabled ? 'Kitchen Bell Sound Active' : 'Sound Muted'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{soundEnabled ? 'Chime ON' : 'Muted'}</span>
            </button>

            {/* 2-Blink Chime Test Button */}
            <button
              type="button"
              onClick={() => playTwoBlinkAlertSound()}
              className="p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 cursor-pointer"
              title="Test 2-Blink Cashier Alert Sound"
            >
              <BellRing className="w-4 h-4 text-amber-500" />
            </button>

            {/* Live Sync Badge & Refresh Button */}
            <button
              type="button"
              onClick={() => loadKdsData()}
              disabled={refreshing}
              className="bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
              <span>{refreshing ? 'Syncing...' : 'Sync (8s)'}</span>
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW SELECTOR TABS & STATION FILTERS */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-gray-900 p-2.5 rounded-2xl border border-gray-200 dark:border-gray-800">
          {/* Main 3 View Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('prep_next')}
              className={cn(
                'px-3.5 py-1.5 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all cursor-pointer',
                activeTab === 'prep_next'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Prep Next (Items)</span>
              <span className="bg-white/20 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ml-0.5">
                {filteredPrepItems.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tickets')}
              className={cn(
                'px-3.5 py-1.5 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all cursor-pointer',
                activeTab === 'tickets'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>KOT Tickets</span>
              <span className="bg-white/20 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full ml-0.5">
                {filteredOrders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={cn(
                'px-3.5 py-1.5 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all cursor-pointer',
                activeTab === 'history'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Fulfilled ({fulfilledHistory.length})</span>
            </button>
          </div>

          {/* Search & Station Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter dish or table..."
                className="input pl-8 text-xs h-8 w-36 sm:w-44 bg-gray-50 dark:bg-gray-800"
              />
            </div>

            {/* Station Filter */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg text-xs font-bold">
              <button
                type="button"
                onClick={() => setStationFilter('all')}
                className={cn(
                  'px-2 py-1 rounded-md transition-colors cursor-pointer',
                  stationFilter === 'all' ? 'bg-white dark:bg-gray-900 shadow-2xs font-black' : 'text-gray-500'
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStationFilter('veg')}
                className={cn(
                  'px-2 py-1 rounded-md transition-colors text-emerald-600 cursor-pointer',
                  stationFilter === 'veg' ? 'bg-white dark:bg-gray-900 shadow-2xs font-black' : 'text-gray-500'
                )}
              >
                Veg
              </button>
              <button
                type="button"
                onClick={() => setStationFilter('beverage')}
                className={cn(
                  'px-2 py-1 rounded-md transition-colors text-blue-600 cursor-pointer',
                  stationFilter === 'beverage' ? 'bg-white dark:bg-gray-900 shadow-2xs font-black' : 'text-gray-500'
                )}
              >
                Bar/Drinks
              </button>
            </div>

            {/* Prep Next Sort Option */}
            {activeTab === 'prep_next' && (
              <select
                value={prepSort}
                onChange={(e) => setPrepSort(e.target.value as any)}
                className="text-xs font-bold bg-gray-100 dark:bg-gray-800 border-0 rounded-lg px-2 py-1.5 text-gray-700 dark:text-gray-300 cursor-pointer"
              >
                <option value="oldest">Sort: Oldest First (FIFO)</option>
                <option value="quantity">Sort: Highest Quantity</option>
              </select>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 1: PREP NEXT (SMART AGGREGATED ITEM STATION) */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'prep_next' && (
          <div>
            {loading ? (
              <div className="py-24 text-center text-gray-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-red-600" />
                <span className="text-sm font-bold">Loading Kitchen Queue...</span>
              </div>
            ) : filteredPrepItems.length === 0 ? (
              <div className="py-20 text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-xs">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">
                  All Caught Up! No Dishes Pending
                </h3>
                <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                  The kitchen display is clean. Newly dispatched KOTs will automatically appear here with a sound alert.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredPrepItems.map((item) => {
                  const elapsedMins = getElapsedMinutes(item.oldestOrderAt);
                  const urgency = getUrgencyColor(elapsedMins);
                  const isProcessing = actionLoading === item.key || actionLoading === `start-${item.key}`;

                  return (
                    <div
                      key={item.key}
                      className={cn(
                        'rounded-2xl p-3.5 border-2 transition-all flex flex-col justify-between shadow-xs bg-white dark:bg-gray-900 relative overflow-hidden',
                        urgency.border
                      )}
                    >
                      {/* Card Top: Quantity & Item Title */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {/* Huge Quantity Badge */}
                            <span className="text-xl sm:text-2xl font-black px-2.5 py-1 rounded-xl bg-red-600 text-white shadow-xs shrink-0">
                              x{item.totalQuantity}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    'w-2 h-2 rounded-full shrink-0',
                                    item.isVeg ? 'bg-emerald-500' : 'bg-red-500'
                                  )}
                                />
                                <h3 className="font-black text-sm sm:text-base text-gray-900 dark:text-white leading-tight">
                                  {item.name}
                                </h3>
                              </div>
                              {item.variantName && (
                                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                                  Portion: {item.variantName}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Urgency Badge */}
                          <span
                            className={cn(
                              'text-[10px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 shadow-2xs',
                              urgency.badge
                            )}
                          >
                            {elapsedMins}m wait
                          </span>
                        </div>

                        {/* Special Kitchen Notes */}
                        {item.notes.length > 0 && (
                          <div className="mt-2.5 p-2 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 font-bold space-y-0.5">
                            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Special Instructions</span>
                            </div>
                            {item.notes.map((note, idx) => (
                              <p key={idx} className="pl-1">
                                • {note}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Waiting Tables Breakdown */}
                        <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                          <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1">
                            Tables Waiting ({item.tables.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {item.tables.map((t, idx) => (
                              <span
                                key={idx}
                                className={cn(
                                  'text-xs font-bold px-2 py-0.5 rounded-md border flex items-center gap-1',
                                  t.status === 'preparing'
                                    ? 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                                    : 'bg-gray-50 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200'
                                )}
                              >
                                <span>{t.tableNumber}</span>
                                <span className="text-[10px] opacity-75 font-black">x{t.quantity}</span>
                                {t.status === 'preparing' && <Flame className="w-2.5 h-2.5 text-blue-600 animate-pulse" />}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Card Bottom: 1-Tap Batch Actions */}
                      <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                        {item.pendingQuantity > 0 && (
                          <button
                            type="button"
                            onClick={() => handleStartBatchCooking(item)}
                            disabled={isProcessing}
                            className="flex-1 py-2 rounded-xl text-xs font-bold border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                          >
                            <Flame className="w-3.5 h-3.5 text-blue-600" />
                            <span>Start Prep</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleBatchBumpItem(item)}
                          disabled={isProcessing}
                          className="flex-1 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Batch Ready ✓</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 2: KOT TICKETS (INDIVIDUAL ORDER CARDS) */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'tickets' && (
          <div>
            {loading ? (
              <div className="py-24 text-center text-gray-400 flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-red-600" />
                <span className="text-sm font-bold">Loading Kitchen Tickets...</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-20 text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-xs">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">
                  No Active KOT Tickets in Queue
                </h3>
                <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                  All orders have been prepared or fulfilled. New orders placed on mobile or counter will show up instantly.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredOrders.map((order) => {
                  const tableNumber = typeof order.table === 'object' ? order.table.tableNumber : 'Takeaway';
                  const elapsedMins = getElapsedMinutes(order.createdAt);
                  const urgency = getUrgencyColor(elapsedMins);
                  const latestRound = order.kotRounds && order.kotRounds.length > 0
                    ? order.kotRounds[order.kotRounds.length - 1]
                    : null;
                  const roundTag = latestRound?.roundTag || (order.kotRounds && order.kotRounds.length > 1 ? `Round ${order.kotRounds.length}` : 'Round 1');
                  const activeItems = (order.items || []).filter((i) => i.status !== 'cancelled');
                  const allServed = activeItems.length > 0 && activeItems.every((i) => i.status === 'served');
                  const anyPending = activeItems.some((i) => i.status === 'pending');

                  return (
                    <div
                      key={order._id}
                      className={cn(
                        'rounded-2xl p-3.5 border-2 transition-all flex flex-col justify-between shadow-xs bg-white dark:bg-gray-900 relative overflow-hidden',
                        allServed
                          ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                          : urgency.border
                      )}
                    >
                      {/* Ticket Header */}
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                          <div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                              Token #{order.orderNumber || order._id.slice(-4)}
                            </span>
                            <h3 className="font-black text-lg sm:text-xl text-gray-900 dark:text-white leading-tight">
                              Table {tableNumber}
                            </h3>
                          </div>

                          <div className="text-right">
                            <span
                              className={cn(
                                'text-[10px] font-black uppercase px-2 py-0.5 rounded-full inline-block shadow-2xs',
                                urgency.badge
                              )}
                            >
                              {elapsedMins} mins
                            </span>
                            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                              {roundTag}
                            </p>
                          </div>
                        </div>

                        {/* Waiter Name & Order Time */}
                        <div className="flex items-center justify-between text-[11px] font-bold text-gray-400 py-1.5">
                          <span>Waiter: {order.createdBy?.name || 'Staff'}</span>
                          <span>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        {/* Items Checklist */}
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 my-2 max-h-[260px] overflow-y-auto pr-0.5">
                          {activeItems.map((item, idx) => {
                            const isItemDone = item.status === 'served';
                            const isItemCooking = item.status === 'preparing';

                            return (
                              <div
                                key={item._id || idx}
                                onClick={() => item._id && handleUpdateItemStatus(order._id, item._id, item.status)}
                                className={cn(
                                  'py-2 px-1 rounded-lg flex items-start justify-between gap-2 cursor-pointer transition-colors',
                                  isItemDone
                                    ? 'opacity-40 line-through bg-emerald-50/50 dark:bg-emerald-950/20'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  {isItemDone ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                  ) : (
                                    <Square className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                  )}
                                  <div>
                                    <p className="font-extrabold text-sm text-gray-900 dark:text-white leading-snug">
                                      <span className="font-black text-red-600 dark:text-red-400 mr-1">
                                        {item.quantity}x
                                      </span>
                                      {item.name}
                                    </p>
                                    {item.variant?.name && (
                                      <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                                        {item.variant.name}
                                      </p>
                                    )}
                                    {item.selectedAddons && item.selectedAddons.length > 0 && (
                                      <p className="text-xs text-gray-500">
                                        +{item.selectedAddons.map((a) => a.name).join(', ')}
                                      </p>
                                    )}
                                    {item.notes && (
                                      <p className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded mt-0.5">
                                        Note: {item.notes}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <span
                                  className={cn(
                                    'text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0',
                                    isItemDone
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isItemCooking
                                      ? 'bg-blue-100 text-blue-800 animate-pulse'
                                      : 'bg-amber-100 text-amber-800'
                                  )}
                                >
                                  {item.status}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Ticket Footer Actions */}
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                        {anyPending && (
                          <button
                            type="button"
                            onClick={() => handleStartCookingTicket(order)}
                            disabled={actionLoading === `start-${order._id}`}
                            className="flex-1 py-2 rounded-xl text-xs font-bold border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Flame className="w-3.5 h-3.5 text-blue-600" />
                            <span>Start Prep</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleBumpOrder(order)}
                          disabled={actionLoading === order._id}
                          className="flex-1 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Order Ready ✓</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 3: FULFILLED HISTORY (RECENT COMPLETED TICKETS & RECALL) */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 mb-3">
              <div>
                <h3 className="font-black text-base text-gray-900 dark:text-white">
                  Recently Fulfilled Tickets
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  Tickets completed from this KDS screen. If a ticket was bumped by accident, tap &quot;Recall&quot; to restore it.
                </p>
              </div>
            </div>

            {fulfilledHistory.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">
                No tickets have been bumped during this session yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {fulfilledHistory.map((order) => {
                  const tableNumber = typeof order.table === 'object' ? order.table.tableNumber : 'Takeaway';

                  return (
                    <div key={order._id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-gray-900 dark:text-white">
                            Table {tableNumber}
                          </span>
                          <span className="text-xs font-bold text-gray-400">
                            Token #{order.orderNumber || order._id.slice(-4)}
                          </span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.2 rounded bg-emerald-100 text-emerald-800">
                            Fulfilled
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {(order.items || []).filter((i) => i.status !== 'cancelled').map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRecallOrder(order)}
                        disabled={actionLoading === `recall-${order._id}`}
                        className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-bold hover:bg-amber-100 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>Recall</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
