'use client';

import React, { useState, useEffect } from 'react';
import {
  getOfflineQueue,
  processOfflineQueue,
  isBackendReachable,
} from '@/lib/offline-sync';
import { WifiOff, RefreshCw, CloudUpload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function OfflineSyncBanner() {
  const [queueCount, setQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Initial state check
    if (typeof window !== 'undefined') {
      setQueueCount(getOfflineQueue().length);

      const updateQueue = () => {
        setQueueCount(getOfflineQueue().length);
      };

      const checkConnectivity = async () => {
        const reachable = await isBackendReachable();
        setIsOnline(reachable);
      };

      const handleOnline = () => {
        checkConnectivity();
      };

      const handleOffline = () => {
        // In local-first cafes, LAN / local server is what matters even if WAN drops
        checkConnectivity();
      };

      window.addEventListener('peyala_offline_queue_changed', updateQueue);
      window.addEventListener('peyala_data_synced', updateQueue);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Periodic check every 5 seconds
      const interval = setInterval(async () => {
        setQueueCount(getOfflineQueue().length);
        const reachable = await isBackendReachable();
        setIsOnline(reachable);
      }, 5000);

      // Check immediately upon mount
      checkConnectivity();

      return () => {
        window.removeEventListener('peyala_offline_queue_changed', updateQueue);
        window.removeEventListener('peyala_data_synced', updateQueue);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        clearInterval(interval);
      };
    }
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await processOfflineQueue();
    } finally {
      setIsSyncing(false);
      setQueueCount(getOfflineQueue().length);
    }
  };

  // Only render if genuinely offline or if there are items queued, and not dismissed
  if ((isOnline && queueCount === 0) || (isDismissed && queueCount === 0)) {
    return null;
  }

  return (
    <aside
      aria-label="Offline Sync Status"
      className="fixed bottom-20 md:bottom-4 right-4 z-30 max-w-sm w-[calc(100vw-2rem)] sm:w-auto animate-in fade-in slide-in-from-bottom-3 duration-300"
    >
      <div
        className={cn(
          'p-3 px-4 rounded-2xl shadow-xl border flex items-center justify-between gap-3 backdrop-blur-md transition-all',
          !isOnline
            ? 'bg-amber-500/95 dark:bg-amber-950/95 text-white border-amber-400 dark:border-amber-700 shadow-amber-500/20'
            : 'bg-blue-600/95 dark:bg-blue-950/95 text-white border-blue-400 dark:border-blue-700 shadow-blue-500/20'
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-1.5 rounded-xl bg-white/20 shrink-0">
            {!isOnline ? (
              <WifiOff className="w-4 h-4 text-white animate-pulse" />
            ) : (
              <CloudUpload className="w-4 h-4 text-white animate-bounce" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black tracking-wide leading-tight">
              {!isOnline ? 'Offline / DB Disconnected' : 'Restoring Cloud Sync'}
            </p>
            <p className="text-[11px] opacity-90 truncate">
              {queueCount === 0
                ? 'Operating offline. Changes queue locally.'
                : `${queueCount} change${queueCount !== 1 ? 's' : ''} queued locally`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {queueCount > 0 && isOnline && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-white text-blue-900 text-xs font-black flex items-center gap-1.5 hover:bg-white/90 active:scale-95 transition-all shrink-0 cursor-pointer shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          )}

          {/* Dismiss button so staff can close prompt and work uninterrupted */}
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
            title="Dismiss notice"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
