'use client';

import React, { useEffect, useState } from 'react';
import { TOAST_EVENT, ToastItem } from '@/lib/toast';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastItem>;
      if (!customEvent.detail) return;
      const newToast = customEvent.detail;

      setToasts((prev) => [...prev, newToast]);

      // Auto-dismiss
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, newToast.duration || 4000);

      return () => clearTimeout(timer);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full px-3 sm:px-0 pointer-events-none"
    >
      {toasts.map((t) => {
        const isSuccess = t.type === 'success';
        const isError = t.type === 'error';
        const isWarning = t.type === 'warning';
        const isInfo = t.type === 'info';

        return (
          <div
            key={t.id}
            role="alert"
            className={cn(
              'pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-xl border transition-all animate-in fade-in slide-in-from-top-3 duration-200',
              isSuccess && 'bg-white dark:bg-gray-900 border-emerald-500/40 text-gray-900 dark:text-gray-100',
              isError && 'bg-white dark:bg-gray-900 border-rose-500/40 text-gray-900 dark:text-gray-100',
              isWarning && 'bg-white dark:bg-gray-900 border-amber-500/40 text-gray-900 dark:text-gray-100',
              isInfo && 'bg-white dark:bg-gray-900 border-blue-500/40 text-gray-900 dark:text-gray-100'
            )}
          >
            {/* Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
              {isError && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" />}
              {isInfo && <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
            </div>

            {/* Message */}
            <div className="flex-1 text-xs sm:text-sm font-semibold leading-snug break-words">
              {t.message}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-0.5 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
