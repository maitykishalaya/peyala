// ─────────────────────────────────────────────────────────────────
// Accounts Page
// Shows all financial accounts with their balances.
// NEW: Each account can now have:
//   - allowedPaymentModes → which modes are valid for this account
//   - defaultPaymentMode  → which mode is pre-selected by default
// This is configured in the Edit Account modal (Payment Mode Settings tab)
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import AccountLedger from '@/components/ui/AccountLedger';
import { accountsApi, transfersApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ALL_PAYMENT_MODES } from '@/lib/paymentModes';
import { Plus, ArrowRightLeft, Pencil, Trash2, Wallet, Building2, Smartphone, MoreHorizontal, Settings2 } from 'lucide-react';

const ACCOUNTS_CACHE_KEY = 'peyala_accounts_cache_v1';

function readCache() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data: any) {
  try {
    localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable (private browsing) — safe to ignore, just no cache this time
  }
}

const CACHE_TTL_MS = 30 * 1000; // 30s — reuse cache as-is within this window, no network call at all

// ── Icon mapping for account types ───────────────────────────────
const TYPE_ICONS = {
  cash: Wallet,
  bank: Building2,
  digital: Smartphone,
  other: MoreHorizontal
};

// ── Badge colour for account type label ──────────────────────────
const TYPE_COLORS = {
  cash: 'bg-green-100 text-green-600',
  bank: 'bg-blue-100 text-blue-600',
  digital: 'bg-purple-100 text-purple-600',
  other: 'bg-gray-100 text-gray-600'
};

// ── Smart defaults per account type ──────────────────────────────
// When user creates/changes account type, we suggest sensible defaults.
// User can override these in the Payment Mode Settings tab.
const TYPE_DEFAULTS: Record<string, { allowed: string[]; default: string }> = {
  cash:    { allowed: ['cash'],                                  default: 'cash' },
  bank:    { allowed: ['bank_transfer', 'cheque', 'card', 'upi'], default: 'bank_transfer' },
  digital: { allowed: ['upi', 'card'],                           default: 'upi' },
  other:   { allowed: ['cash', 'upi', 'card', 'bank_transfer', 'cheque'], default: 'cash' },
};

export default function AccountsPage() {
  // ── State ───────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<any[]>([]);        // all accounts from API
  const [transfers, setTransfers] = useState<any[]>([]);      // recent transfers from API
  const [modal, setModal] = useState<'create' | 'edit' | 'transfer' | null>(null);
  const [selected, setSelected] = useState<any>(null);        // account being edited
  const [loading, setLoading] = useState(true);
  const [ledgerAccount, setLedgerAccount] = useState<any>(null); // account whose ledger is open

  // Tab inside the Edit/Create modal
  // 'basic' = name/type/balance, 'payment' = payment mode config
  const [modalTab, setModalTab] = useState<'basic' | 'payment'>('basic');

  // ── Form state for create/edit ──────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    type: 'cash',
    openingBalance: 0,
    bankName: '',
    accountNumber: '',
    color: '#6366f1',
    notes: '',
    // Payment mode config fields (NEW)
    allowedPaymentModes: ['cash'] as string[],  // which modes are allowed
    defaultPaymentMode: 'cash',                  // which mode is pre-selected
  });

  // ── Transfer form state ─────────────────────────────────────────
  const [transferForm, setTransferForm] = useState({
    fromAccount: '',
    toAccount: '',
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  // ── Load all accounts and recent transfers ──────────────────────
  const load = async () => {
    const [a, t] = await Promise.all([accountsApi.list(), transfersApi.list()]);
    setAccounts(a.data);
    setTransfers(t.data);
    setLoading(false);
    writeCache({ accounts: a.data, transfers: t.data });
  };

  // Run load() once when component mounts — show cache instantly first if we have it
  useEffect(() => {
    const cached = readCache();
    const isStale = !cached?.savedAt || (Date.now() - cached.savedAt > CACHE_TTL_MS);
    if (cached) {
      setAccounts(cached.accounts || []);
      setTransfers(cached.transfers || []);
      setLoading(false);
    }
    if (!cached || isStale) load(); // only hit the server if nothing cached, or it's gone stale
  }, []);

  // ── When account type changes, auto-suggest payment modes ───────
  // Called when user picks a type in the form dropdown
  const handleTypeChange = (newType: string) => {
    const defaults = TYPE_DEFAULTS[newType] || TYPE_DEFAULTS.other;
    setForm(f => ({
      ...f,
      type: newType,
      // Auto-fill allowed modes and default based on type
      // User can override these in the Payment tab
      allowedPaymentModes: defaults.allowed,
      defaultPaymentMode: defaults.default,
    }));
  };

  // ── Toggle a payment mode in the allowed list ───────────────────
  // Called when user checks/unchecks a mode checkbox in Payment tab
  const toggleAllowedMode = (modeValue: string) => {
    setForm(f => {
      const current = f.allowedPaymentModes;
      if (current.includes(modeValue)) {
        // Remove it — but don't allow removing the last one (need at least 1)
        if (current.length === 1) return f;
        const updated = current.filter(m => m !== modeValue);
        // If the removed mode was the default, reset default to first remaining
        const newDefault = f.defaultPaymentMode === modeValue ? updated[0] : f.defaultPaymentMode;
        return { ...f, allowedPaymentModes: updated, defaultPaymentMode: newDefault };
      } else {
        // Add it
        return { ...f, allowedPaymentModes: [...current, modeValue] };
      }
    });
  };

  // ── Open edit modal, populate form with existing account data ───
  const openEdit = (acc: any) => {
    setSelected(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      openingBalance: acc.openingBalance,
      bankName: acc.bankName || '',
      accountNumber: acc.accountNumber || '',
      color: acc.color || '#6366f1',
      notes: acc.notes || '',
      // Load existing payment mode config from the account
      allowedPaymentModes: acc.allowedPaymentModes?.length
        ? acc.allowedPaymentModes
        : TYPE_DEFAULTS[acc.type]?.allowed || ['cash'],
      defaultPaymentMode: acc.defaultPaymentMode || TYPE_DEFAULTS[acc.type]?.default || 'cash',
    });
    setModalTab('basic'); // always start on basic tab
    setModal('edit');
  };

  // ── Open create modal with blank form ───────────────────────────
  const openCreate = () => {
    setForm({
      name: '',
      type: 'cash',
      openingBalance: 0,
      bankName: '',
      accountNumber: '',
      color: '#6366f1',
      notes: '',
      allowedPaymentModes: TYPE_DEFAULTS.cash.allowed,  // sensible default for cash type
      defaultPaymentMode: TYPE_DEFAULTS.cash.default,
    });
    setModalTab('basic');
    setModal('create');
  };

  // ── Save account (create or update) ────────────────────────────
  const save = async () => {
    if (modal === 'create') {
      await accountsApi.create(form);
    } else {
      await accountsApi.update(selected._id, form);
    }
    setModal(null);
    load(); // refresh list
  };

  // ── Deactivate account ──────────────────────────────────────────
  const del = async (id: string) => {
    if (!confirm('Deactivate this account? All transaction history is preserved.')) return;
    await accountsApi.delete(id);
    load();
  };

  // ── Create a transfer between two accounts ──────────────────────
  const doTransfer = async () => {
    await transfersApi.create(transferForm);
    setModal(null);
    load();
  };

  // ── Total balance across all accounts ──────────────────────────
  const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);

  return (
    <AppLayout>
      <div className="space-y-6 pb-24">

        {/* ── Page Header ────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Accounts</h1>
            <p className="text-sm text-gray-500">
              Total Balance: <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(totalBalance)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModal('transfer')} className="btn-secondary flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" /> Transfer
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Account
            </button>
          </div>
        </div>

        {/* ── Account Cards Grid ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const Icon = TYPE_ICONS[acc.type as keyof typeof TYPE_ICONS] || Wallet;
            return (
              <div key={acc._id} className="card p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLedgerAccount(acc)}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {/* Coloured icon based on account type */}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: acc.color + '20' }}>
                      <Icon className="w-5 h-5" style={{ color: acc.color }} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{acc.name}</p>
                      <span className={`badge text-xs capitalize ${TYPE_COLORS[acc.type as keyof typeof TYPE_COLORS]}`}>{acc.type}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={e => { e.stopPropagation(); openEdit(acc); }} className="p-1.5 text-gray-400 hover:text-brand-500 rounded transition-colors" title="Edit account">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); del(acc._id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Deactivate">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Current Balance</p>
                  <p className={`text-2xl font-bold ${acc.currentBalance >= 0 ? 'text-gray-900 dark:text-white' : 'text-red-500'}`}>
                    {formatCurrency(acc.currentBalance)}
                  </p>
                  {acc.bankName && (
                    <p className="text-xs text-gray-400 mt-1">
                      {acc.bankName}{acc.accountNumber ? ` · ${acc.accountNumber}` : ''}
                    </p>
                  )}
                </div>

                {/* ── Payment Mode Badge (NEW) ──────────────────── */}
                {/* Shows what payment modes are configured for this account */}
                {acc.allowedPaymentModes?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
                      <Settings2 className="w-3 h-3" /> Payment Modes
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {acc.allowedPaymentModes.map((mode: string) => {
                        // Find the label for this mode value
                        const modeInfo = ALL_PAYMENT_MODES.find(m => m.value === mode);
                        const isDefault = mode === acc.defaultPaymentMode;
                        return (
                          <span
                            key={mode}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isDefault
                                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 ring-1 ring-brand-300'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                            title={isDefault ? 'Default mode' : ''}
                          >
                            {modeInfo?.label || mode} {isDefault && '★'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Recent Transfers Table ──────────────────────────────── */}
        {transfers.length > 0 && (
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Recent Transfers</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="table-th whitespace-nowrap">Date</th>
                    <th className="table-th whitespace-nowrap">From</th>
                    <th className="table-th whitespace-nowrap">To</th>
                    <th className="table-th whitespace-nowrap">Amount</th>
                    <th className="table-th whitespace-nowrap">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {transfers.slice(0, 10).map((t: any) => (
                    <tr key={t._id}>
                      <td className="table-td py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="table-td py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">{t.fromAccount?.name}</td>
                      <td className="table-td py-2 sm:py-3 text-xs sm:text-sm whitespace-nowrap">{t.toAccount?.name}</td>
                      <td className="table-td py-2 sm:py-3 text-xs sm:text-sm font-medium text-brand-600 whitespace-nowrap">{formatCurrency(t.amount)}</td>
                      <td className="table-td py-2 sm:py-3 text-xs sm:text-sm text-gray-400 whitespace-nowrap">{t.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Create / Edit Account Modal ─────────────────────────────── */}
      <Modal
        open={modal === 'create' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'create' ? 'Add Account' : `Edit Account — ${selected?.name}`}
        size="md"
      >
        {/* Two tabs inside the modal: Basic Info and Payment Mode Settings */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-5 -mt-2">
          <button
            onClick={() => setModalTab('basic')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${modalTab === 'basic' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Basic Info
          </button>
          <button
            onClick={() => setModalTab('payment')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${modalTab === 'payment' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <Settings2 className="w-3.5 h-3.5" /> Payment Mode Settings
          </button>
        </div>

        {/* ── Tab 1: Basic Info ─────────────────────────────── */}
        {modalTab === 'basic' && (
          <div className="space-y-4">
            <div>
              <label className="label">Account Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Cash Counter, HDFC Current" />
            </div>

            <div>
              <label className="label">Account Type *</label>
              {/* When type changes, payment modes auto-update (see handleTypeChange) */}
              <select className="input" value={form.type} onChange={e => handleTypeChange(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="digital">Digital / UPI</option>
                <option value="other">Other</option>
              </select>
              {/* Hint text explaining what changes with type */}
              <p className="text-xs text-gray-400 mt-1">
                {form.type === 'cash' && '→ Payment modes auto-set to Cash only'}
                {form.type === 'bank' && '→ Payment modes auto-set to Bank Transfer, Cheque, Card, UPI'}
                {form.type === 'digital' && '→ Payment modes auto-set to UPI and Card'}
                {form.type === 'other' && '→ All payment modes allowed'}
              </p>
            </div>

            <div>
              <label className="label">Opening Balance (₹)</label>
              <input type="number" className="input" value={form.openingBalance} onChange={e => setForm({...form, openingBalance: +e.target.value})} />
            </div>

            {/* Bank-specific fields — only shown for bank type */}
            {form.type === 'bank' && (
              <>
                <div>
                  <label className="label">Bank Name</label>
                  <input className="input" value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} placeholder="e.g. HDFC Bank" />
                </div>
                <div>
                  <label className="label">Account Number</label>
                  <input className="input" value={form.accountNumber} onChange={e => setForm({...form, accountNumber: e.target.value})} placeholder="Last 4 digits or full number" />
                </div>
              </>
            )}

            <div>
              <label className="label">Colour (shown on dashboard)</label>
              <input type="color" className="input h-10" value={form.color} onChange={e => setForm({...form, color: e.target.value})} />
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModalTab('payment')} className="btn-secondary flex items-center gap-2">
                <Settings2 className="w-4 h-4" /> Configure Payment Modes →
              </button>
              <button onClick={save} className="btn-primary flex-1">Save Account</button>
            </div>
          </div>
        )}

        {/* ── Tab 2: Payment Mode Settings ─────────────────── */}
        {modalTab === 'payment' && (
          <div className="space-y-5">

            {/* Explanation banner */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">
                💡 How this works
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                When you select <strong>{form.name || 'this account'}</strong> in a Purchase or Payment form,
                the payment mode dropdown will ONLY show the modes you tick below.
                The ★ starred one will be pre-selected automatically.
              </p>
            </div>

            {/* Allowed Payment Modes — checkbox list */}
            <div>
              <label className="label text-sm font-semibold">Allowed Payment Modes</label>
              <p className="text-xs text-gray-400 mb-3">Tick which modes are valid for this account. At least one must be selected.</p>

              <div className="space-y-2">
                {ALL_PAYMENT_MODES.map(mode => {
                  const isAllowed = form.allowedPaymentModes.includes(mode.value);
                  const isDefault = form.defaultPaymentMode === mode.value;

                  return (
                    <div
                      key={mode.value}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isAllowed
                          ? 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/10'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                      }`}
                    >
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        {/* Checkbox to allow/disallow this mode */}
                        <input
                          type="checkbox"
                          checked={isAllowed}
                          onChange={() => toggleAllowedMode(mode.value)}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {mode.label}
                        </span>
                      </label>

                      {/* "Set as Default" button — only shown if mode is allowed */}
                      {isAllowed && (
                        <button
                          onClick={() => setForm(f => ({ ...f, defaultPaymentMode: mode.value }))}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                            isDefault
                              ? 'bg-brand-500 text-white'       // active default = filled
                              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-500 hover:border-brand-400 hover:text-brand-500'
                          }`}
                        >
                          {isDefault ? '★ Default' : 'Set Default'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary of current config */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Current Configuration:</p>
              <p className="text-xs text-gray-500">
                <span className="font-medium">Allowed:</span>{' '}
                {form.allowedPaymentModes.map(m => ALL_PAYMENT_MODES.find(p => p.value === m)?.label).join(', ')}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                <span className="font-medium">Default:</span>{' '}
                {ALL_PAYMENT_MODES.find(m => m.value === form.defaultPaymentMode)?.label || '—'}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModalTab('basic')} className="btn-secondary">← Back</button>
              <button onClick={save} className="btn-primary flex-1">Save Account</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Transfer Modal ──────────────────────────────────────────── */}
      <Modal open={modal === 'transfer'} onClose={() => setModal(null)} title="Transfer Between Accounts">
        <div className="space-y-4">
          <div>
            <label className="label">From Account *</label>
            <select className="input" value={transferForm.fromAccount} onChange={e => setTransferForm({...transferForm, fromAccount: e.target.value})}>
              <option value="">Select account</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.name} ({formatCurrency(a.currentBalance)})</option>)}
            </select>
          </div>
          <div>
            <label className="label">To Account *</label>
            <select className="input" value={transferForm.toAccount} onChange={e => setTransferForm({...transferForm, toAccount: e.target.value})}>
              <option value="">Select account</option>
              {accounts.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount (₹) *</label>
            <input type="number" className="input" value={transferForm.amount} onChange={e => setTransferForm({...transferForm, amount: +e.target.value})} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={transferForm.date} onChange={e => setTransferForm({...transferForm, date: e.target.value})} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={transferForm.description} onChange={e => setTransferForm({...transferForm, description: e.target.value})} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={doTransfer} className="btn-primary flex-1">Transfer</button>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Account Ledger Modal ────────────────────────────────────── */}
      <AccountLedger
        account={ledgerAccount}
        open={!!ledgerAccount}
        onClose={() => setLedgerAccount(null)}
      />
    </AppLayout>
  );
}
