// Global event-based lightweight Toast notification system

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

export const TOAST_EVENT = 'peyala_toast_event';

class ToastEmitter {
  private dispatch(type: ToastType, message: string, duration = 4000) {
    if (typeof window === 'undefined') return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const event = new CustomEvent<ToastItem>(TOAST_EVENT, {
      detail: { id, type, message, duration },
    });
    window.dispatchEvent(event);
  }

  success(message: string, duration?: number) {
    this.dispatch('success', message, duration);
  }

  error(message: string, duration?: number) {
    // Default error duration slightly longer (5000ms) for readability
    this.dispatch('error', message, duration || 5000);
  }

  warning(message: string, duration?: number) {
    this.dispatch('warning', message, duration || 4500);
  }

  info(message: string, duration?: number) {
    this.dispatch('info', message, duration);
  }
}

export const toast = new ToastEmitter();
