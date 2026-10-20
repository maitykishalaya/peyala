// ─────────────────────────────────────────────────────────────────
// Peyala Local-First Realtime WebSocket Client
// Connects to Local Server on the cafe network, handles instant multi-device
// updates for orders, tables, KOTs, and print jobs with auto-reconnection
// and catch-up for offline/disconnected devices.
// ─────────────────────────────────────────────────────────────────

export interface RealtimeEvent {
  seq: number;
  type: string;
  timestamp: number;
  isoTime: string;
  payload: any;
}

export interface SyncStatusState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  lastError: string | null;
}

type EventListenerCallback = (event: RealtimeEvent) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private lastAcknowledgedSeq: number = 0;
  private listeners: Map<string, Set<EventListenerCallback>> = new Map();
  private syncStatusListeners: Set<(status: SyncStatusState) => void> = new Set();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private currentSyncStatus: SyncStatusState = {
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    lastError: null,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      // Restore last seq from session if available
      try {
        const savedSeq = sessionStorage.getItem('peyala_last_seq');
        if (savedSeq) this.lastAcknowledgedSeq = parseInt(savedSeq, 10);
      } catch (_) {}

      // Start connection
      this.connect();
    }
  }

  private getWsUrl(): string {
    if (typeof window === 'undefined') return '';
    let host = window.location.hostname || 'localhost';
    const port = process.env.NEXT_PUBLIC_WS_PORT || '4000';

    const customApi = localStorage.getItem('peyala_api_url');
    if (customApi) {
      try {
        const u = new URL(customApi);
        if (u.hostname && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
          host = u.hostname;
        }
      } catch (_) {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${host}:${port}/ws/realtime?device=web&sinceSeq=${this.lastAcknowledgedSeq}`;
  }

  public connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = this.getWsUrl();
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.notifyConnection(true);
        console.log('[RealtimeClient] Connected to local server WebSocket');

        // Ping every 15s to keep connection warm
        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'PING' }));
          }
        }, 15000);
      };

      this.ws.onmessage = (messageEvent) => {
        try {
          const data = JSON.parse(messageEvent.data);
          this.handleIncoming(data);
        } catch (_) {}
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notifyConnection(false);
        clearInterval(this.pingInterval);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.notifyConnection(false);
      };
    } catch (err) {
      this.isConnected = false;
      this.notifyConnection(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 3000);
  }

  private handleIncoming(data: any) {
    if (!data) return;

    if (data.type === 'PONG') {
      return;
    }

    if (data.type === 'HUB_WELCOME') {
      if (data.currentSeq) {
        this.lastAcknowledgedSeq = Math.max(this.lastAcknowledgedSeq, data.currentSeq);
      }
      return;
    }

    if (data.type === 'CATCHUP_EVENTS' && Array.isArray(data.events)) {
      for (const ev of data.events) {
        this.dispatchEvent(ev);
      }
      return;
    }

    if (data.type === 'SYNC_STATUS_CHANGED') {
      this.currentSyncStatus = {
        isOnline: Boolean(data.payload?.isOnline),
        isSyncing: Boolean(data.payload?.isSyncing),
        pendingCount: data.payload?.pendingCount || 0,
        lastSyncTime: data.payload?.lastSyncTime || null,
        lastError: data.payload?.lastError || null,
      };
      this.notifySyncStatus();
    }

    // Normal broadcast event
    this.dispatchEvent(data);
  }

  private dispatchEvent(event: RealtimeEvent) {
    if (event.seq) {
      this.lastAcknowledgedSeq = Math.max(this.lastAcknowledgedSeq, event.seq);
      try {
        sessionStorage.setItem('peyala_last_seq', String(this.lastAcknowledgedSeq));
      } catch (_) {}
    }

    // Dispatch to specific listeners
    const specific = this.listeners.get(event.type);
    if (specific) {
      specific.forEach((cb) => {
        try { cb(event); } catch (e) { console.error(e); }
      });
    }

    // Dispatch to wildcard listeners
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      wildcard.forEach((cb) => {
        try { cb(event); } catch (e) { console.error(e); }
      });
    }

    // Also dispatch global DOM custom event for easy React listening
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('peyala_realtime_event', { detail: event }));
    }
  }

  public on(eventType: string, callback: EventListenerCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  public onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    callback(this.isConnected);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  public onSyncStatusChange(callback: (status: SyncStatusState) => void): () => void {
    this.syncStatusListeners.add(callback);
    callback(this.currentSyncStatus);
    return () => {
      this.syncStatusListeners.delete(callback);
    };
  }

  private notifyConnection(connected: boolean) {
    this.connectionListeners.forEach((cb) => {
      try { cb(connected); } catch (_) {}
    });
  }

  private notifySyncStatus() {
    this.syncStatusListeners.forEach((cb) => {
      try { cb(this.currentSyncStatus); } catch (_) {}
    });
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getSyncStatus(): SyncStatusState {
    return this.currentSyncStatus;
  }
}

export const realtime = new RealtimeClient();
export default realtime;
