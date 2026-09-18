// ─────────────────────────────────────────────────────────────────
// Audio Alerts & Kitchen Notification Dispatcher
// Provides synthesized 2-blink audio alerts and cross-tab sync for Cashier & KDS
// ─────────────────────────────────────────────────────────────────

export interface KdsReadyEvent {
  id: string;
  name: string;
  variantName?: string;
  tables?: string[];
  tableNumber?: string;
  timestamp: number;
}

/**
 * Synthesizes a high-contrast, attention-grabbing 2-blink alert chime.
 * Blink 1: Clear crystal ping (1046.5Hz C6 -> 1318.5Hz E6)
 * [Gap: 60ms]
 * Blink 2: Higher urgent ping (1318.5Hz E6 -> 1760.0Hz A6)
 * Specifically tuned to penetrate ambient cafe noise and catch the cashier's notice.
 */
export function playTwoBlinkAlertSound(): void {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // ── Blink 1 (0.00s to 0.16s) ──
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.5, now); // C6
    osc1.frequency.exponentialRampToValueAtTime(1318.51, now + 0.12); // E6

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.65, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.16);

    // ── Blink 2 (0.22s to 0.44s) — higher pitch alert ──
    const blink2Start = now + 0.22;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.51, blink2Start); // E6
    osc2.frequency.exponentialRampToValueAtTime(1760.0, blink2Start + 0.14); // A6

    gain2.gain.setValueAtTime(0.001, blink2Start);
    gain2.gain.linearRampToValueAtTime(0.75, blink2Start + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.001, blink2Start + 0.22);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(blink2Start);
    osc2.stop(blink2Start + 0.22);
  } catch (err) {
    console.warn('Audio 2-blink alert could not be played:', err);
  }
}

/**
 * Broadcasts a KDS ready event to all active tabs (e.g. Cashier POS screen).
 */
export function broadcastKdsReady(event: KdsReadyEvent): void {
  if (typeof window === 'undefined') return;

  try {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('peyala_kds_alerts');
      channel.postMessage(event);
      channel.close();
    }
    localStorage.setItem(
      'peyala_kds_ready_ping',
      JSON.stringify({ ...event, _pingTime: Date.now() })
    );
  } catch (err) {
    console.warn('Failed to broadcast KDS ready event:', err);
  }
}

/**
 * Subscribes to KDS ready events from other tabs.
 * Returns an unsubscribe callback.
 */
export function listenToKdsReady(callback: (event: KdsReadyEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let channel: BroadcastChannel | null = null;
  if ('BroadcastChannel' in window) {
    try {
      channel = new BroadcastChannel('peyala_kds_alerts');
      channel.onmessage = (msg) => {
        if (msg.data && msg.data.id) {
          callback(msg.data as KdsReadyEvent);
        }
      };
    } catch (e) {
      channel = null;
    }
  }

  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'peyala_kds_ready_ping' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed && parsed.id) {
          callback(parsed as KdsReadyEvent);
        }
      } catch (err) {}
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    if (channel) {
      channel.close();
    }
    window.removeEventListener('storage', handleStorage);
  };
}
