const { WebSocketServer, WebSocket } = require('ws');

class RealtimeHub {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // ws -> { id, deviceType, connectedAt, lastSeen }
    this.eventBuffer = []; // Circular ring buffer of recent events
    this.maxBufferSize = 200;
    this.sequence = 0;
  }

  /**
   * Attach WebSocket server to existing HTTP server
   */
  init(server) {
    if (this.wss) return;

    this.wss = new WebSocketServer({ server, path: '/ws/realtime' });
    console.log('[RealtimeHub] WebSocket hub initialized at path: /ws/realtime');

    this.wss.on('connection', (ws, req) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const deviceType = url.searchParams.get('device') || 'browser';
      const sinceSeq = parseInt(url.searchParams.get('sinceSeq') || '0', 10);

      this.clients.set(ws, {
        id: clientId,
        deviceType,
        ip: req.socket.remoteAddress,
        connectedAt: Date.now(),
        lastSeen: Date.now(),
      });

      console.log(`[RealtimeHub] Client connected: ${clientId} (${deviceType}) - Active clients: ${this.clients.size}`);

      // Send initial welcome message with server state and sequence
      ws.send(JSON.stringify({
        type: 'HUB_WELCOME',
        clientId,
        serverTime: new Date().toISOString(),
        currentSeq: this.sequence,
        activeClients: this.clients.size,
      }));

      // Catch-up missed events if requested
      if (sinceSeq > 0 && sinceSeq < this.sequence) {
        const missed = this.eventBuffer.filter(e => e.seq > sinceSeq);
        if (missed.length > 0) {
          console.log(`[RealtimeHub] Catching up client ${clientId} with ${missed.length} missed events (from seq ${sinceSeq})`);
          ws.send(JSON.stringify({
            type: 'CATCHUP_EVENTS',
            events: missed,
          }));
        }
      }

      ws.on('message', (message) => {
        try {
          const clientData = this.clients.get(ws);
          if (clientData) clientData.lastSeen = Date.now();

          const data = JSON.parse(message.toString());
          if (data.type === 'PING') {
            ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          } else if (data.type === 'CATCHUP_REQUEST') {
            const fromSeq = parseInt(data.sinceSeq || '0', 10);
            const missed = this.eventBuffer.filter(e => e.seq > fromSeq);
            ws.send(JSON.stringify({ type: 'CATCHUP_EVENTS', events: missed }));
          }
        } catch (_) {}
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[RealtimeHub] Client disconnected: ${clientId} - Remaining clients: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.warn(`[RealtimeHub] Client error (${clientId}):`, err.message);
        this.clients.delete(ws);
      });
    });

    // Heartbeat ping loop every 20 seconds to drop stale connections
    setInterval(() => {
      for (const [ws, meta] of this.clients.entries()) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.ping();
          } catch (_) {
            this.clients.delete(ws);
          }
        } else {
          this.clients.delete(ws);
        }
      }
    }, 20000);
  }

  /**
   * Broadcast an event to all connected devices on the local network
   */
  broadcast(eventType, payload = {}, options = {}) {
    this.sequence++;
    const event = {
      seq: this.sequence,
      type: eventType,
      event: eventType,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      payload,
    };

    // Push into circular buffer
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    if (!this.wss) return event;

    const message = JSON.stringify(event);
    let sentCount = 0;

    for (const [ws, meta] of this.clients.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        // Optional filter (e.g. exclude sender)
        if (options.excludeClientId && meta.id === options.excludeClientId) {
          continue;
        }
        try {
          ws.send(message);
          sentCount++;
        } catch (err) {
          console.warn(`[RealtimeHub] Failed to send to ${meta.id}:`, err.message);
        }
      }
    }

    return event;
  }

  /**
   * Get missed events since a sequence number or timestamp
   */
  getMissedEvents(since) {
    if (typeof since === 'number') {
      // If since is a large number (timestamp), compare with event.timestamp
      if (since > 1000000000000) {
        return this.eventBuffer.filter(e => e.timestamp >= since);
      }
      // Otherwise treat as sequence number
      return this.eventBuffer.filter(e => e.seq > since);
    }
    return [...this.eventBuffer];
  }

  /**
   * Get active connection stats
   */
  getStats() {
    return {
      activeConnections: this.clients.size,
      currentSequence: this.sequence,
      bufferedEvents: this.eventBuffer.length,
      clients: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        deviceType: c.deviceType,
        ip: c.ip,
        connectedAt: new Date(c.connectedAt).toISOString(),
        idleSeconds: Math.round((Date.now() - c.lastSeen) / 1000),
      })),
    };
  }
}

const realtimeHub = new RealtimeHub();
module.exports = realtimeHub;
