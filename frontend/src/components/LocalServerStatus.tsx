'use client';

import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';

export default function LocalServerStatus() {
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(realtime.getIsConnected());
  const [syncStatus, setSyncStatus] = useState<SyncStatusState>(realtime.getSyncStatus());
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

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

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubConn();
      unsubSync();
      document.removeEventListener('mousedown', handleClickOutside);
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

      {/* Popover Card */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 p-4 z-50 text-gray-800 dark:text-gray-100 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Local-First System</h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Primary Cafe Station</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/60">
              <ShieldCheck className="w-3 h-3" /> Sub-5ms
            </span>
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
          </div>

          {/* Action Footer */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
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
        </div>
      )}
    </div>
  );
}
