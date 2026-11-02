'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { realtime, SyncStatusState } from '@/lib/realtime';
import api from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  Server,
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
  Wifi,
  WifiOff,
  ShieldCheck,
  ChevronDown,
  X,
} from 'lucide-react';

export default function LocalServerStatus() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(realtime.getIsConnected());
  const [syncStatus, setSyncStatus] = useState<SyncStatusState>(realtime.getSyncStatus());
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Automatically close popover when switching pages / routes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const unsubConn = realtime.onConnectionChange((connected) => {
      setIsConnected(connected);
    });

    const unsubSync = realtime.onSyncStatusChange((status) => {
      setSyncStatus(status);
    });

    // Also fetch initial sync status over HTTP
    api.get('/sync/status')
      .then((res) => {
        if (res.data?.sync) {
          setSyncStatus({
            isOnline: res.data.sync.isOnline,
            isSyncing: res.data.sync.isSyncing,
            pendingCount: res.data.sync.pendingCount || 0,
            lastSyncTime: res.data.sync.lastSyncTime || null,
            lastError: res.data.sync.lastError || null,
          });
        }
      })
      .catch(() => {});

    const handleClickOutside = (e: Event) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    // Support mouse, touch (iOS/Android), and pointer events so taps anywhere outside dismiss reliably
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    document.addEventListener('pointerdown', handleClickOutside);

    return () => {
      unsubConn();
      unsubSync();
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, []);

  const handleManualSync = async () => {
    if (isSyncingManual || syncStatus.isSyncing) return;
    setIsSyncingManual(true);
    try {
      const res = await api.post('/sync/trigger');
      if (res.data?.status === 'offline') {
        toast.warning('Internet or cloud DB unavailable. Local changes preserved in queue.');
      } else {
        toast.success(`Delta sync completed: ${res.data?.processed || 0} items updated to cloud! ☁️`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Sync attempt failed.');
    } finally {
      setIsSyncingManual(false);
    }
  };

  const [isHydrating, setIsHydrating] = useState(false);
  const handleHydrateFromCentral = async () => {
    if (isHydrating) return;
    setIsHydrating(true);
    try {
      const res = await api.post('/sync/hydrate-from-central', {}, { timeout: 180000 });
      if (res.data?.status === 'in_progress') {
        toast.info(res.data?.message || 'Database replication is currently running in background... ⏳');
        return;
      }
      const count = res.data?.totalDocuments ?? 0;
      toast.success(res.data?.message || `Replicated ${count} items to Local DB! ☁️`);
      if (count > 0 || res.data?.status === 'hydrated_from_snapshot' || res.data?.status === 'hydrated') {
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Replication failed. Check internet or local MongoDB.');
    } finally {
      setIsHydrating(false);
    }
  };

  const formatLastSync = (timeStr: string | null) => {
    if (!timeStr) return 'Pending first cycle';
    try {
      const d = new Date(timeStr);
      const diffMins = Math.round((Date.now() - d.getTime()) / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins === 1) return '1 min ago';
      if (diffMins < 60) return `${diffMins}m ago`;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  // Determine indicator state
  let dotColor = 'bg-emerald-500';
  let badgeText = 'Local Server';
  let badgeClass = 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300';

  if (!isConnected) {
    dotColor = 'bg-rose-500 animate-pulse';
    badgeText = 'Server Reconnecting';
    badgeClass = 'border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300';
  } else if (syncStatus.pendingCount > 0) {
    dotColor = 'bg-amber-500';
    badgeText = `${syncStatus.pendingCount} to Sync`;
    badgeClass = 'border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300';
  }

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Small, unobtrusive header trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all hover:shadow-sm ${badgeClass}`}
        title="Local-First Server & Cloud Synchronization Status"
      >
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="hidden sm:inline font-bold">{badgeText}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {/* Mobile backdrop to easily dismiss when tapping anywhere outside */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10 md:bg-transparent"
          onClick={() => setIsOpen(false)}
          onTouchStart={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Popover Card */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 p-4 z-50 text-gray-800 dark:text-gray-100 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Local-First System</h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Primary Cafe Station · Version 12.0.0</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/60">
                <ShieldCheck className="w-3 h-3" /> Sub-5ms
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="py-3 space-y-2.5">
            {/* Local Server State */}
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" /> Local Server:
              </span>
              <span className="font-bold flex items-center gap-1">
                {isConnected ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Operational
                  </span>
                ) : (
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> Offline
                  </span>
                )}
              </span>
            </div>

            {/* Cloud Sync State */}
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" /> Central DB Sync:
              </span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                Every 15 min
              </span>
            </div>

            {/* Last Successful Sync */}
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Last Sync:
              </span>
              <span className="font-semibold">
                {formatLastSync(syncStatus.lastSyncTime)}
              </span>
            </div>

            {/* Pending Outbox Queue */}
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Pending Changes:
              </span>
              <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                syncStatus.pendingCount > 0
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}>
                {syncStatus.pendingCount} queued
              </span>
            </div>

            {/* Cloud Reachability */}
            <div className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                {syncStatus.isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />} Internet / Cloud:
              </span>
              <span className="font-semibold">
                {syncStatus.isOnline ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Reachable</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Offline (Buffered)</span>
                )}
              </span>
            </div>

            {syncStatus.lastError && !syncStatus.isOnline && (
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-[10px] leading-snug">
                <strong>Status Note:</strong> {syncStatus.lastError}
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleManualSync}
                disabled={isSyncingManual || syncStatus.isSyncing}
                className="flex-1 py-1.5 px-3 rounded-lg bg-gray-900 hover:bg-black text-white dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingManual || syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                {isSyncingManual || syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <a
                href="/settings"
                className="py-1.5 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-center"
                title="View Maintenance & Restore Points"
              >
                Restore Points
              </a>
            </div>

            {syncStatus.isOnline && (
              <button
                onClick={handleHydrateFromCentral}
                disabled={isHydrating}
                className="w-full py-1.5 px-2.5 rounded-lg border border-blue-500/80 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 text-[11px]"
                title="Replicate and hydrate all records from Central MongoDB Atlas"
              >
                <Cloud className={`w-3 h-3 ${isHydrating ? 'animate-spin' : ''}`} />
                {isHydrating ? 'Replicating from Cloud Atlas...' : 'Clone All from Cloud DB'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
