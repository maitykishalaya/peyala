// ─────────────────────────────────────────────────────────────────
// Peyala Offline Store-and-Forward Sync Manager
// Queues local changes during network drops or database connection errors,
// maintains full POS operations offline, and pushes queued changes to the
// cloud database automatically as soon as connectivity is restored.
// ─────────────────────────────────────────────────────────────────

import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { toast } from './toast';

export interface QueuedRequest {
  id: string;
  timestamp: number;
  method: 'post' | 'put' | 'patch' | 'delete';
  url: string;
  data?: any;
  params?: any;
  headers?: Record<string, string>;
  tempId?: string;
  entityType: 'order' | 'payment' | 'table' | 'sales' | 'customer' | 'general';
  description?: string;
}

const OFFLINE_QUEUE_KEY = 'peyala_offline_sync_queue_v1';
const TEMP_ID_MAP_KEY = 'peyala_temp_id_map_v1';

// Direct axios instance that bypasses the interceptor to prevent recursion during sync
const syncClient = axios.create({
  timeout: 15000,
});

syncClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const customApiUrl = localStorage.getItem('peyala_api_url');
    if (customApiUrl) {
      config.baseURL = customApiUrl;
    } else if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes('localhost') && !process.env.NEXT_PUBLIC_API_URL.includes('127.0.0.1')) {
      config.baseURL = process.env.NEXT_PUBLIC_API_URL;
    } else if (!config.baseURL || config.baseURL.includes('localhost:4000') || config.baseURL.includes('127.0.0.1:4000')) {
      config.baseURL = '/api';
    }

    const token = localStorage.getItem('peyala_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Queue Storage Operations ───────────────────────────────────────
export function getOfflineQueue(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedRequest[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('peyala_offline_queue_changed', { detail: { count: queue.length } }));
  } catch (err) {
    console.error('[OfflineSync] Failed to persist queue to localStorage', err);
  }
}

export function getTempIdMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TEMP_ID_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveTempIdMap(map: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TEMP_ID_MAP_KEY, JSON.stringify(map));
  } catch (err) {
    console.error('[OfflineSync] Failed to persist tempIdMap', err);
  }
}

/**
 * Enqueue a failed mutation request to be executed once connectivity is restored.
 */
export function enqueueRequest(config: AxiosRequestConfig, tempId?: string): QueuedRequest {
  const queue = getOfflineQueue();
  const method = (config.method || 'post').toLowerCase() as QueuedRequest['method'];
  const url = config.url || '';

  let entityType: QueuedRequest['entityType'] = 'general';
  let description = `${method.toUpperCase()} ${url}`;

  if (url.includes('/orders')) {
    entityType = 'order';
    if (method === 'post' && !url.includes('/items') && !url.includes('/pay') && !url.includes('/cancel')) {
      description = `Create Order (Table ${config.data?.tableId ? 'Occupied' : 'Open'})`;
    } else if (url.includes('/pay')) {
      description = `Settle Order Payment`;
    } else if (url.includes('/items')) {
      description = `Add Round to Order`;
    }
  } else if (url.includes('/sales')) {
    entityType = 'sales';
    description = `Update Sales Entry`;
  } else if (url.includes('/customers')) {
    entityType = 'customer';
    description = `Customer / Due Operation`;
  }

  let parsedData = config.data;
  if (typeof parsedData === 'string') {
    try { parsedData = JSON.parse(parsedData); } catch {}
  } else if (parsedData && typeof parsedData === 'object') {
    parsedData = { ...parsedData };
  }

  // If this is an order creation or add items that was placed and already printed locally:
  // Mark shouldPrint = false / kotAlreadyPrinted = true so it is not double-printed by print station upon sync
  if (url.includes('/orders') && method === 'post' && parsedData) {
    parsedData.shouldPrint = false;
    parsedData.kotAlreadyPrinted = true;
  }

  const queuedItem: QueuedRequest = {
    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
    method,
    url,
    data: parsedData,
    params: config.params,
    tempId,
    entityType,
    description,
  };

  queue.push(queuedItem);
  saveOfflineQueue(queue);

  console.warn(`[OfflineSync] Enqueued ${description}. Total in queue: ${queue.length}`);
  return queuedItem;
}

/**
 * Checks if the backend database connection is actually reachable and responsive.
 * Uses local HTTP ping rather than navigator.onLine so local-first offline cafes operate seamlessly.
 */
export async function isBackendReachable(): Promise<boolean> {
  if (typeof window === 'undefined') return true;

  try {
    const res = await syncClient.get('/health', { timeout: 2000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

let isSyncInProgress = false;

/**
 * Flushes all queued offline actions to the database in FIFO order.
 */
export async function processOfflineQueue(): Promise<{ processed: number; remaining: number }> {
  if (typeof window === 'undefined' || isSyncInProgress) {
    return { processed: 0, remaining: getOfflineQueue().length };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) return { processed: 0, remaining: 0 };

  isSyncInProgress = true;
  let processedCount = 0;
  const tempIdMap = getTempIdMap();

  console.log(`[OfflineSync] Starting sync for ${queue.length} queued offline actions...`);

  try {
    const remainingQueue: QueuedRequest[] = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      let currentUrl = item.url;
      let currentData = item.data;

      // Replace any temporary IDs in URL or payload with real server IDs
      Object.keys(tempIdMap).forEach((tempId) => {
        const realId = tempIdMap[tempId];
        if (currentUrl.includes(tempId)) {
          currentUrl = currentUrl.replace(tempId, realId);
        }
        if (currentData) {
          try {
            let dataStr = JSON.stringify(currentData);
            if (dataStr.includes(tempId)) {
              dataStr = dataStr.replaceAll(tempId, realId);
              currentData = JSON.parse(dataStr);
            }
          } catch {}
        }
      });

      try {
        const res = await syncClient.request({
          method: item.method,
          url: currentUrl,
          data: currentData,
          params: item.params,
        });

        // If the operation created an entity and returned a real database _id
        if (item.tempId && res.data?._id) {
          tempIdMap[item.tempId] = res.data._id;
          saveTempIdMap(tempIdMap);
        }

        processedCount++;
        console.log(`[OfflineSync] Successfully synced: ${item.description || item.url}`);
      } catch (err: any) {
        // If it's a 4xx validation error, do not block the queue permanently
        if (err.response && err.response.status >= 400 && err.response.status < 500) {
          console.warn(`[OfflineSync] Discarding 4xx failed item (${err.response.status}):`, item);
          continue;
        }

        // If it's still a connection / 5xx error, stop here and keep remaining queue for next cycle
        console.warn(`[OfflineSync] Connection interrupted during sync. Pausing queue.`);
        remainingQueue.push(item);
        for (let j = i + 1; j < queue.length; j++) {
          remainingQueue.push(queue[j]);
        }
        break;
      }
    }

    saveOfflineQueue(remainingQueue);

    if (processedCount > 0) {
      toast.success(`Synced ${processedCount} offline change(s) to cloud database! ☁️`);
      window.dispatchEvent(new CustomEvent('peyala_data_synced', { detail: { count: processedCount } }));
    }

    return { processed: processedCount, remaining: remainingQueue.length };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Creates a valid optimistic mock response for offline callers so POS flows continue smoothly.
 */
export function buildOptimisticResponse(config: AxiosRequestConfig, tempId: string): AxiosResponse {
  const method = (config.method || 'post').toLowerCase();
  const url = config.url || '';

  let parsedData = config.data;
  if (typeof parsedData === 'string') {
    try { parsedData = JSON.parse(parsedData); } catch {}
  } else if (parsedData && typeof parsedData === 'object') {
    parsedData = { ...parsedData };
  }

  let mockData: any = { success: true, isOffline: true, tempId };

  if (url.includes('/orders')) {
    if (method === 'post' && !url.includes('/pay') && !url.includes('/items') && !url.includes('/cancel')) {
      // Order Creation (Round 1)
      const rawItems = Array.isArray(parsedData?.items) ? parsedData.items : [];
      let subtotal = 0;
      const mappedItems = rawItems.map((it: any) => {
        const qty = Math.max(1, Number(it.quantity) || 1);
        const price = Math.max(0, Number(it.price) || 0);
        subtotal += price * qty;
        return {
          _id: it._id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          menuItem: it.menuItemId || it.menuItem || it._id,
          name: it.name || 'Item',
          price,
          taxPercent: it.taxPercent !== undefined ? it.taxPercent : 5,
          quantity: qty,
          notes: it.notes || '',
          variant: it.variant,
          selectedAddons: it.selectedAddons || [],
          status: 'pending',
          roundNumber: 1,
        };
      });
      const taxAmount = Math.round(subtotal * 0.05 * 100) / 100;
      const total = subtotal + taxAmount;

      mockData = {
        _id: tempId,
        orderNumber: Math.floor(1000 + Math.random() * 9000),
        status: 'open',
        table: parsedData?.tableId,
        items: mappedItems,
        kotRounds: [{
          _id: `round_${Date.now()}`,
          roundNumber: 1,
          kotNumber: 1,
          roundTag: '[INITIAL ORDER]',
          printed: false,
          items: mappedItems.map((i: any) => ({
            name: i.name,
            quantity: i.quantity,
            notes: i.notes || '',
            variantName: i.variant?.name,
            addons: i.selectedAddons?.map((a: any) => a.name),
          })),
        }],
        subtotal,
        taxAmount,
        total,
        isOfflineCreated: true,
      };
    } else if (url.includes('/pay')) {
      // Payment settlement
      mockData = {
        success: true,
        message: 'Order payment queued offline. Will sync to database once connection is restored.',
      };
    } else if (url.includes('/items')) {
      // Add items round (Round 2+)
      const rawItems = Array.isArray(parsedData?.items) ? parsedData.items : [];
      let addSubtotal = 0;
      const mappedItems = rawItems.map((it: any) => {
        const qty = Math.max(1, Number(it.quantity) || 1);
        const price = Math.max(0, Number(it.price) || 0);
        addSubtotal += price * qty;
        return {
          _id: it._id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          menuItem: it.menuItemId || it.menuItem || it._id,
          name: it.name || 'Item',
          price,
          taxPercent: it.taxPercent !== undefined ? it.taxPercent : 5,
          quantity: qty,
          notes: it.notes || '',
          variant: it.variant,
          selectedAddons: it.selectedAddons || [],
          status: 'pending',
          roundNumber: 2,
        };
      });
      const addTax = Math.round(addSubtotal * 0.05 * 100) / 100;
      const addTotal = addSubtotal + addTax;

      mockData = {
        _id: tempId,
        status: 'open',
        items: mappedItems,
        kotRounds: [{
          _id: `round_${Date.now()}`,
          roundNumber: 2,
          kotNumber: 2,
          roundTag: '[ROUND 2 - ADD-ON]',
          printed: false,
          items: mappedItems.map((i: any) => ({
            name: i.name,
            quantity: i.quantity,
            notes: i.notes || '',
            variantName: i.variant?.name,
            addons: i.selectedAddons?.map((a: any) => a.name),
          })),
        }],
        subtotal: addSubtotal,
        taxAmount: addTax,
        total: addTotal,
      };
    }
  }

  return {
    data: mockData,
    status: 200,
    statusText: 'OK (Offline Queued)',
    headers: {},
    config: config as any,
  } as AxiosResponse;
}

// ── Auto-Sync Heartbeat and Event Listeners ────────────────────────
if (typeof window !== 'undefined') {
  // 1. Listen for browser online event
  window.addEventListener('online', () => {
    console.log('[OfflineSync] Browser reported online. Verifying backend...');
    setTimeout(processOfflineQueue, 1000);
  });

  // 2. Periodic sync poller: checks every 8 seconds if there are queued items
  setInterval(async () => {
    const queue = getOfflineQueue();
    if (queue.length > 0 && !isSyncInProgress) {
      const reachable = await isBackendReachable();
      if (reachable) {
        await processOfflineQueue();
      }
    }
  }, 8000);
}
