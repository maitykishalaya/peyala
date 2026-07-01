'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { auditApi } from '@/lib/api';
import { formatDate, getInitials } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Activity } from 'lucide-react';

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'badge-green',
  UPDATE: 'badge-blue',
  DELETE: 'badge-red',
  LOGIN: 'badge-purple',
  LOGOUT: 'badge-yellow',
};

const MODULES = ['All', 'Auth', 'Purchases', 'Sales', 'Payments', 'Receipts', 'Staff', 'Users', 'Accounts', 'Inventory'];

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const load = async () => {
    setLoading(true);
    const params: any = { page, limit: 50 };
    if (moduleFilter) params.module = moduleFilter;
    if (userFilter) params.user = userFilter;
    const r = await auditApi.list(params);
    setLogs(r.data.logs); setTotal(r.data.total); setLoading(false);
  };

  useEffect(() => { load(); }, [page, moduleFilter, userFilter]);

  const pages = Math.ceil(total / 50);

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return formatDate(date);
  };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-500" /> Audit Log
          </h1>
          <p className="text-sm text-gray-500">{total} entries — every action logged with username</p>
        </div>

        {/* Filters */}
        <div className="card p-4 flex gap-3 flex-wrap items-end">
          <div>
            <label className="label">Module</label>
            <select className="input" value={moduleFilter} onChange={e => { setModuleFilter(e.target.value === 'All' ? '' : e.target.value); setPage(1); }}>
              {MODULES.map(m => <option key={m} value={m === 'All' ? '' : m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Search User</label>
            <input className="input" placeholder="Name..." value={userFilter} onChange={e => { setUserFilter(e.target.value); setPage(1); }} />
          </div>
          <button onClick={() => { setModuleFilter(''); setUserFilter(''); setPage(1); }} className="btn-secondary">Clear</button>
        </div>

        {/* Log table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="table-th">When</th>
                <th className="table-th">User</th>
                <th className="table-th">Action</th>
                <th className="table-th">Module</th>
                <th className="table-th">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={5} className="table-td text-center py-12 text-gray-400">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center py-12 text-gray-400">No log entries yet</td></tr>
              ) : logs.map((l: any) => (
                <tr key={l._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="table-td text-gray-400 whitespace-nowrap text-xs">{timeAgo(l.createdAt)}</td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-brand-100 dark:bg-brand-900/30 rounded-full flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-bold flex-shrink-0">
                        {getInitials(l.userName || '?')}
                      </div>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{l.userName}</span>
                    </div>
                  </td>
                  <td className="table-td">
                    <span className={ACTION_COLORS[l.action] || 'badge-blue'}>{l.action}</span>
                  </td>
                  <td className="table-td text-gray-500 text-xs">{l.module}</td>
                  <td className="table-td text-gray-600 dark:text-gray-400 text-sm">{l.description}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {pages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-400">Page {page} of {pages} · {total} entries</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="btn-secondary p-2 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages} className="btn-secondary p-2 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
