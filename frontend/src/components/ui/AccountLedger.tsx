// ─────────────────────────────────────────────────────────────────
// AccountLedger.tsx
// Full-screen modal showing all transactions for one account.
// Opened when user clicks on an account card in the Dashboard
// or Accounts page.
//
// Shows: purchases, payments, sales credits, receipts, transfers
// Each row: date, type badge, description, amount (+ green / - red)
// Running total in/out shown at the top.
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState } from 'react';
import Modal from './Modal';
import { accountsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

// Colour and label for each transaction type
const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  purchase:     { label: 'Purchase',     color: 'badge-red' },
  payment:      { label: 'Payment',      color: 'badge-red' },
  receipt:      { label: 'Receipt',      color: 'badge-green' },
  transfer_out: { label: 'Transfer Out', color: 'badge-yellow' },
  transfer_in:  { label: 'Transfer In',  color: 'badge-blue' },
  sale_credit:  { label: 'Sales',        color: 'badge-green' },
};

interface AccountLedgerProps {
  account: any;          // the account object { _id, name, currentBalance, type }
  open: boolean;
  onClose: () => void;
}

export default function AccountLedger({ account, open, onClose }: AccountLedgerProps) {
  const [ledger, setLedger] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalIn, setTotalIn] = useState(0);
  const [totalOut, setTotalOut] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const load = async () => {
    if (!account?._id) return;
    setLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (dateRange.start) params.startDate = dateRange.start;
      if (dateRange.end) params.endDate = dateRange.end;

      const res = await accountsApi.getLedger(account._id, params);
      setLedger(res.data.ledger);
      setTotalPages(res.data.pages);
      setTotalCount(res.data.total);
      setTotalIn(res.data.totalIn);
      setTotalOut(res.data.totalOut);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    }
    setLoading(false);
  };

  // Reload when modal opens or page/filters change
  useEffect(() => {
    if (open) load();
  }, [open, page, dateRange]);

  // Reset page when account changes
  useEffect(() => { setPage(1); }, [account?._id]);

  if (!account) return null;

  return (
    <Modal open={open} onClose={onClose} title={`${account.name} — All Transactions`} size="xl">
      <div className="space-y-4 -mt-2">

        {/* ── Summary Row ──────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
            <p className="text-xs text-green-600 font-medium">Total In</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalIn)}</p>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg">
            <p className="text-xs text-red-500 font-medium">Total Out</p>
            <p className="text-xl font-bold text-red-500">{formatCurrency(totalOut)}</p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-500 font-medium">Current Balance</p>
            <p className={`text-xl font-bold ${account.currentBalance >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-500'}`}>
              {formatCurrency(account.currentBalance)}
            </p>
          </div>
        </div>

        {/* ── Date Filter ───────────────────────────────────────── */}
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <p className="text-xs text-gray-400 mb-1">From</p>
            <input type="date" className="input text-sm py-1.5"
              value={dateRange.start}
              onChange={e => { setDateRange(d => ({ ...d, start: e.target.value })); setPage(1); }}
            />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">To</p>
            <input type="date" className="input text-sm py-1.5"
              value={dateRange.end}
              onChange={e => { setDateRange(d => ({ ...d, end: e.target.value })); setPage(1); }}
            />
          </div>
          {(dateRange.start || dateRange.end) && (
            <button onClick={() => { setDateRange({ start: '', end: '' }); setPage(1); }} className="btn-secondary text-xs py-1.5">
              Clear
            </button>
          )}
          <p className="text-xs text-gray-400 ml-auto">{totalCount} transactions</p>
        </div>

        {/* ── Transaction Table ────────────────────────────────── */}
        <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full min-w-max">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="table-th whitespace-nowrap">Date</th>
                <th className="table-th whitespace-nowrap">Type</th>
                <th className="table-th whitespace-nowrap">Description</th>
                <th className="table-th whitespace-nowrap hidden sm:table-cell">Details</th>
                <th className="table-th text-right whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">Loading...</td></tr>
              ) : ledger.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center py-8 text-gray-400">No transactions found</td></tr>
              ) : ledger.map((tx: any, i: number) => {
                const cfg = TYPE_CONFIG[tx.type] || { label: tx.type, color: 'badge-blue' };
                const isIn = tx.direction === 'in';
                return (
                  <tr key={`${tx.id}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="table-td py-1.5 sm:py-3 text-xs sm:text-sm whitespace-nowrap">{formatDate(tx.date)}</td>
                    <td className="table-td py-1.5 sm:py-3"><span className={`${cfg.color} text-xs sm:text-sm`}>{cfg.label}</span></td>
                    <td className="table-td py-1.5 sm:py-3 text-xs sm:text-sm max-w-xs">{tx.description}</td>
                    <td className="table-td py-1.5 sm:py-3 text-xs text-gray-400 hidden sm:table-cell">{tx.meta || '-'}</td>
                    <td className="table-td py-1.5 sm:py-3 text-right">
                      <div className={`flex items-center justify-end gap-1 font-semibold text-xs sm:text-sm ${isIn ? 'text-green-600' : 'text-red-500'}`}>
                        {isIn
                          ? <ArrowDownLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          : <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        }
                        {formatCurrency(tx.amount)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary p-1.5 disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary p-1.5 disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
