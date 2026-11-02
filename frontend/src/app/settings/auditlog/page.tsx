'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { auditApi } from '@/lib/api';
import { getInitials } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Activity, Search, X } from 'lucide-react';

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'badge-green',
  UPDATE: 'badge-blue',
  DELETE: 'badge-red',
  LOGIN: 'badge-purple',
  LOGOUT: 'badge-yellow',
};

const MODULES = [
  'All',
  'Orders',
  'Auth',
  'Purchases',
  'Sales',
  'Payments',
  'Staff',
  'Users',
  'Accounts',
  'Inventory',
  'Tables',
  'Menu',
  'Categories',
  'BalanceSheet',
  'Attendance',
];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const load = async () => {
    setLoading(true);
    const params: any = { page, limit: 50 };
    if (moduleFilter) params.module = moduleFilter;
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
      params.user = searchQuery.trim();
    }
    try {
      const r = await auditApi.list(params);
      setLogs(r.data.logs || []);
      setTotal(r.data.total || 0);
    } catch (_) {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, moduleFilter, searchQuery]);

  useEffect(() => {
    const handleDataSynced = () => {
      load();
    };
    window.addEventListener('peyala_data_synced', handleDataSynced);
    return () => {
      window.removeEventListener('peyala_data_synced', handleDataSynced);
    };
  }, [page, moduleFilter, searchQuery]);

  const pages = Math.ceil(total / 50);

  // Format as dd/mm/yy - hr:min:sec in Indian Standard Time (IST)
  const formatAuditTimestamp = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';

    const pad = (n: number) => String(n).padStart(2, '0');
    try {
      const parts = new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata',
      }).formatToParts(d);

      const day = parts.find((p) => p.type === 'day')?.value || pad(d.getDate());
      const month = parts.find((p) => p.type === 'month')?.value || pad(d.getMonth() + 1);
      const year = parts.find((p) => p.type === 'year')?.value || String(d.getFullYear()).slice(-2);
      const hour = parts.find((p) => p.type === 'hour')?.value || pad(d.getHours());
      const minute = parts.find((p) => p.type === 'minute')?.value || pad(d.getMinutes());
      const second = parts.find((p) => p.type === 'second')?.value || pad(d.getSeconds());

      return `${day}/${month}/${year} - ${hour}:${minute}:${second}`;
    } catch (_) {
      const day = pad(d.getDate());
      const month = pad(d.getMonth() + 1);
      const year = String(d.getFullYear()).slice(-2);
      const hour = pad(d.getHours());
      const minute = pad(d.getMinutes());
      const second = pad(d.getSeconds());
      return `${day}/${month}/${year} - ${hour}:${minute}:${second}`;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-500" /> Audit Log
          </h1>
          <p className="text-sm text-gray-500">{total} entries — every action logged with username & details</p>
        </div>

        {/* Filters */}
        <div className="card p-4 flex gap-3 flex-wrap items-end">
          <div>
            <label className="label">Module</label>
            <select
              className="input min-w-[140px]"
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value === 'All' ? '' : e.target.value);
                setPage(1);
              }}
            >
              {MODULES.map((m) => (
                <option key={m} value={m === 'All' ? '' : m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[280px]">
            <label className="label">General Search (User, Table, Bill, Action, etc.)</label>
            <div className="relative">
              <input
                className="input pl-9 pr-8 w-full"
                placeholder="Search e.g. Joydev, Table Indoor 1, Bill #986, Discount..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              setModuleFilter('');
              setSearchQuery('');
              setPage(1);
            }}
            className="btn-secondary"
          >
            Clear
          </button>
        </div>

        {/* Log table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="table-th">Timestamp (DD/MM/YY - Time)</th>
                <th className="table-th">User</th>
                <th className="table-th">Action</th>
                <th className="table-th">Module</th>
                <th className="table-th">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="table-td text-center py-12 text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-td text-center py-12 text-gray-400">
                    No log entries found matching criteria
                  </td>
                </tr>
              ) : (
                logs.map((l: any) => (
                  <tr key={l._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="table-td text-gray-700 dark:text-gray-300 font-mono text-xs whitespace-nowrap">
                      {formatAuditTimestamp(l.createdAt)}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-brand-100 dark:bg-brand-900/30 rounded-full flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-bold flex-shrink-0">
                          {getInitials(l.userName || '?')}
                        </div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {l.userName}
                        </span>
                      </div>
                    </td>
                    <td className="table-td">
                      <span className={ACTION_COLORS[l.action] || 'badge-blue'}>{l.action}</span>
                    </td>
                    <td className="table-td text-gray-500 text-xs">{l.module}</td>
                    <td className="table-td text-gray-600 dark:text-gray-400 text-sm">{l.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Page {page} of {pages} · {total} entries
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary p-2 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="btn-secondary p-2 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
