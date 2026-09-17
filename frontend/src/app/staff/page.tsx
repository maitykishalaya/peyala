// ─────────────────────────────────────────────────────────────────
// Staff Page
//
// Changes in this version:
//   1. Payment types: Salary, Advance, Bonus (separate buttons)
//   2. Staff card shows: Monthly Salary, Total Paid, Advance Paid,
//      Remaining Salary This Month
//   3. Pay modal has paymentType selector + paymentMode selector
//   4. Advance payments tracked separately from salary
//   5. All payments appear in Payments section automatically
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { staffApi, accountsApi } from '@/lib/api';
import { formatCurrency, formatDate, today, getInitials, cn } from '@/lib/utils';
import { ALL_PAYMENT_MODES } from '@/lib/paymentModes';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { Plus, Pencil, Phone, IndianRupee, ChevronDown, RefreshCw } from 'lucide-react';

const CACHE_KEY = 'peyala_staff_cache_v1';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data: { staff: any[]; accounts: any[] }) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // ignore
  }
}

// Payment type options
const PAYMENT_TYPES = [
  { value: 'salary',  label: '💰 Salary',  desc: 'Regular monthly salary payment' },
  { value: 'advance', label: '⚡ Advance',  desc: 'Advance against future salary' },
  { value: 'bonus',   label: '🎁 Bonus',   desc: 'Bonus or incentive payment' },
];

export default function StaffPage() {
  const { canWrite } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [modal, setModal] = useState<'create' | 'edit' | 'pay' | 'history' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null); // { member, payments }
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Form for create/edit
  const blank = () => ({
    name: '', position: '', phone: '', address: '',
    joiningDate: '', monthlySalary: 0, dailySalary: 0, defaultDutyHours: 10,
    logDutyHours: true, status: 'active', notes: ''
  });
  const [form, setForm] = useState<any>(blank());

  // Form for pay modal
  const [payForm, setPayForm] = useState({
    amount: 0,
    paidFrom: '',
    paymentType: 'salary',  // salary | advance | bonus
    paymentMode: 'cash',
    description: '',
    date: today(),
    notes: '',
  });

  const load = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const [s, a] = await Promise.all([staffApi.list(), accountsApi.list()]);
      setStaff(s.data);
      setAccounts(a.data);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      writeCache({ staff: s.data, accounts: a.data });
    } catch (err) {
      console.error('Failed to load staff:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const cached = readCache();
    if (cached?.staff && cached?.accounts) {
      setStaff(cached.staff);
      setAccounts(cached.accounts);
      if (cached.savedAt) {
        setLastUpdated(new Date(cached.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      return;
    }
    load();
  }, []);

  const openEdit = (s: any) => {
    setSelected(s);
    setForm({
      name: s.name, position: s.position, phone: s.phone || '',
      address: s.address || '', joiningDate: s.joiningDate?.split('T')[0] || '',
      monthlySalary: s.monthlySalary,
      dailySalary: s.dailySalary || (s.monthlySalary ? Math.round(s.monthlySalary / 30) : 0),
      defaultDutyHours: s.defaultDutyHours || 10,
      logDutyHours: s.logDutyHours !== false,
      status: s.status, notes: s.notes || ''
    });
    setModal('edit');
  };

  // Open pay modal — pre-fill amount with monthly salary for salary type
  const openPay = (s: any) => {
    setSelected(s);
    setPayForm({
      amount: s.monthlySalary,
      paidFrom: accounts[0]?._id || '',
      paymentType: 'salary',
      paymentMode: 'cash',
      description: '',
      date: today(),
      notes: '',
    });
    setModal('pay');
  };

  // Load full history for a staff member
  const openHistory = async (s: any) => {
    setSelected(s);
    const r = await staffApi.get(s._id);
    setDetail(r.data);
    setModal('history');
  };

  // When payment type changes, auto-update amount and description
  const handlePaymentTypeChange = (type: string) => {
    setPayForm(f => ({
      ...f,
      paymentType: type,
      // Reset amount to salary for salary type, 0 for others
      amount: type === 'salary' ? (selected?.monthlySalary || 0) : 0,
      description: '',
    }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Staff name is required');
      return;
    }
    if (!form.position.trim()) {
      toast.error('Position / role is required');
      return;
    }
    if (form.monthlySalary === undefined || +form.monthlySalary < 0) {
      toast.error('Please enter a valid monthly salary');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        monthlySalary: +form.monthlySalary || 0,
        dailySalary: +form.dailySalary || (+form.monthlySalary > 0 ? Math.round(+form.monthlySalary / 30) : 0),
        defaultDutyHours: +form.defaultDutyHours || 10,
        logDutyHours: Boolean(form.logDutyHours),
      };

      if (modal === 'edit') {
        await staffApi.update(selected._id, payload);
        toast.success(`Staff member "${form.name}" updated successfully`);
      } else {
        await staffApi.create(payload);
        toast.success(`Staff member "${form.name}" added successfully`);
      }
      setModal(null);
      setForm(blank());
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save staff member');
    } finally {
      setSaving(false);
    }
  };

  // Pay salary/advance/bonus using new unified endpoint
  const pay = async () => {
    if (!payForm.amount || +payForm.amount <= 0) {
      toast.error('Payment amount must be greater than 0');
      return;
    }
    if (!payForm.paidFrom) {
      toast.error('Please select an account to pay from');
      return;
    }

    setPaying(true);
    try {
      await staffApi.pay(selected._id, payForm);
      toast.success(`${payForm.paymentType.toUpperCase()} of ${formatCurrency(payForm.amount)} recorded for ${selected?.name}`);
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  };

  const totalSalaryBill = staff.filter(s => s.status === 'active')
    .reduce((s, m) => s + m.monthlySalary, 0);

  const statusColor = (s: string) => ({
    active: 'badge-green', inactive: 'badge-red', on_leave: 'badge-yellow'
  }[s] || 'badge-blue');

  // Remaining salary = Monthly Salary − Total Advance Paid
  const remainingSalary = (member: any) => {
    const monthly = member.monthlySalary || 0;
    const advance = member.totalAdvancePaid || 0;
    return monthly - advance;
  };

  return (
    <AppLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Staff</h1>
            <p className="text-sm text-gray-500">
              {staff.filter(s => s.status === 'active').length} active ·
              Monthly bill: <span className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(totalSalaryBill)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                Cached ({lastUpdated})
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(CACHE_KEY);
                load(true);
              }}
              disabled={refreshing}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              title="Fetch latest data from server"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin text-brand-500")} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {canWrite ? (
              <button
                onClick={() => { setForm(blank()); setModal('create'); }}
                className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Plus className="w-4 h-4" /> Add Staff
              </button>
            ) : (
              <div className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                Read-only staff roster
              </div>
            )}
          </div>
        </div>

        {/* Staff Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map(member => (
            <div key={member._id} className="card p-5 hover:shadow-md transition-shadow">

              {/* Header: avatar + name + edit button */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold flex-shrink-0">
                  {getInitials(member.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{member.name}</h3>
                  <p className="text-sm text-gray-500">{member.position}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className={statusColor(member.status)}>{member.status.replace('_', ' ')}</span>
                    {member.logDutyHours === false ? (
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                        Attendance Only
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 px-1.5 py-0.5 rounded">
                        Duty Hours Loggable
                      </span>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <button onClick={() => openEdit(member)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {member.phone && (
                <p className="text-sm text-gray-500 flex items-center gap-1.5 mb-3">
                  <Phone className="w-3.5 h-3.5" /> {member.phone}
                </p>
              )}

              {/* Salary breakdown */}
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 mb-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Monthly Salary</p>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{formatCurrency(member.monthlySalary)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total Advance</p>
                  <p className="font-semibold text-amber-600 text-sm">{formatCurrency(member.totalAdvancePaid || 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Salary Paid</p>
                  <p className="font-semibold text-emerald-600 text-sm">{formatCurrency(member.totalSalaryPaid || 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Bonus Paid</p>
                  <p className="font-semibold text-blue-600 text-sm">{formatCurrency(member.totalBonusPaid || 0)}</p>
                </div>
              </div>

              {/* Remaining salary indicator: Monthly Salary − Total Advance */}
              <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg px-3 py-2 mb-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-orange-600 font-medium">Remaining Salary</span>
                  <span className="text-sm font-bold text-orange-600">{formatCurrency(remainingSalary(member))}</span>
                </div>
                {/* Progress bar showing advance taken vs monthly salary */}
                <div className="w-full bg-orange-100 dark:bg-orange-900/30 rounded-full h-1.5 mt-1.5">
                  <div
                    className="h-1.5 bg-orange-400 rounded-full transition-all"
                    style={{ width: `${member.monthlySalary > 0 ? Math.min(100, ((member.totalAdvancePaid || 0) / member.monthlySalary) * 100) : 0}%` }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button onClick={() => openHistory(member)} className="btn-secondary flex-1 text-xs py-1.5">
                  History
                </button>
                {canWrite && (
                  <>
                    <button onClick={() => openPay(member)} className="btn-primary flex-1 text-xs py-1.5 flex items-center justify-center gap-1">
                      <IndianRupee className="w-3 h-3" /> Pay
                    </button>
                    <button
                      onClick={async () => {
                        if (typeof window !== 'undefined' && window.confirm(`Reset salary totals for ${member.name}? This will set salary paid, advance paid, and bonus paid back to 0.`)) {
                          await staffApi.resetSalary(member._id);
                          load();
                        }
                      }}
                      className="btn-outline text-xs py-1.5"
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Create/Edit Modal ────────────────────────────────────────── */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Staff Member' : 'Add Staff Member'}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><label className="label">Position *</label><input className="input" value={form.position} onChange={e => setForm({...form, position: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><label className="label">Joining Date</label><input type="date" className="input" value={form.joiningDate} onChange={e => setForm({...form, joiningDate: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div><label className="label">Monthly Salary (₹)</label><input type="number" className="input" value={form.monthlySalary} onChange={e => setForm({...form, monthlySalary: +e.target.value})} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>
          </div>
          <div><label className="label">Address</label><textarea className="input" rows={2} value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>

          {/* Track & Log Duty Hours Setting */}
          <div className="p-3.5 bg-gray-50 dark:bg-gray-800/70 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.logDutyHours}
                onChange={(e) => setForm({ ...form, logDutyHours: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    Track & Log Duty Hours
                  </span>
                  <span
                    className={cn(
                      'text-[10px] font-black uppercase px-2 py-0.5 rounded',
                      form.logDutyHours
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    )}
                  >
                    {form.logDutyHours ? 'Duty Log Enabled' : 'Attendance Only'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {form.logDutyHours
                    ? 'Shift entry & exit times can be logged with pro-rata deduction & penalty calculations.'
                    : 'Duty hours cannot be logged. Only the main attendance table (Present, Absent, Leave, Half Duty) will be accessible for this staff member.'}
                </p>
              </div>
            </label>

            {form.logDutyHours && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    Default Duty Target (Hours)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    className="input h-9 text-sm font-bold"
                    value={form.defaultDutyHours}
                    onChange={(e) => setForm({ ...form, defaultDutyHours: +e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 block mb-1">
                    Gross Daily Salary (₹)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={form.monthlySalary > 0 ? String(Math.round(form.monthlySalary / 30)) : '0'}
                    className="input h-9 text-sm font-bold"
                    value={form.dailySalary || ''}
                    onChange={(e) => setForm({ ...form, dailySalary: +e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary flex-1 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {saving
                ? (modal === 'edit' ? 'Saving Changes...' : 'Adding Staff...')
                : (modal === 'edit' ? 'Save Changes' : 'Add Staff')}
            </button>
            <button onClick={() => setModal(null)} disabled={saving} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Pay Modal ────────────────────────────────────────────────── */}
      <Modal open={modal === 'pay'} onClose={() => setModal(null)} title={`Pay — ${selected?.name}`} size="md">
        <div className="space-y-4">

          {/* Payment type selector */}
          <div>
            <label className="label">Payment Type *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PAYMENT_TYPES.map(pt => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => handlePaymentTypeChange(pt.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    payForm.paymentType === pt.value
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{pt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{pt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Staff salary summary */}
          {selected && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-400">Monthly</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selected.monthlySalary)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Advance Given</p>
                <p className="text-sm font-bold text-yellow-600">{formatCurrency(selected.totalAdvancePaid || 0)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Salary Paid</p>
                <p className="text-sm font-bold text-green-600">{formatCurrency(selected.totalSalaryPaid || 0)}</p>
              </div>
            </div>
          )}

          <div>
            <label className="label">Amount (₹) *</label>
            <input
              type="number"
              className="input text-lg font-bold"
              value={payForm.amount || ''}
              onChange={e => setPayForm({...payForm, amount: +e.target.value})}
            />
            {/* Helpful hints based on payment type */}
            {payForm.paymentType === 'salary' && selected && (
              <p className="text-xs text-gray-400 mt-1">
                Monthly salary: {formatCurrency(selected.monthlySalary)}
                {selected.totalAdvancePaid > 0 && ` · Advance already given: ${formatCurrency(selected.totalAdvancePaid)}`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="label">Paid From Account *</label>
              <select className="input" value={payForm.paidFrom} onChange={e => setPayForm({...payForm, paidFrom: e.target.value})}>
                <option value="">Select Account</option>
                {accounts.map(a => (
                  <option key={a._id} value={a._id}>{a.name} ({formatCurrency(a.currentBalance)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Payment Mode</label>
              <select className="input" value={payForm.paymentMode} onChange={e => setPayForm({...payForm, paymentMode: e.target.value})}>
                {ALL_PAYMENT_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={payForm.date} onChange={e => setPayForm({...payForm, date: e.target.value})} />
          </div>

          <div>
            <label className="label">Description (optional)</label>
            <input
              className="input"
              placeholder={`e.g. ${payForm.paymentType === 'advance' ? 'Advance for medical emergency' : payForm.paymentType === 'bonus' ? 'Diwali bonus' : 'June 2026 salary'}`}
              value={payForm.description}
              onChange={e => setPayForm({...payForm, description: e.target.value})}
            />
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={pay}
              disabled={paying}
              className="btn-primary flex-1 py-2.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {paying && <RefreshCw className="w-4 h-4 animate-spin" />}
              {paying ? 'Processing Payment...' : `Pay ${formatCurrency(payForm.amount)}${payForm.paymentType !== 'salary' ? ` (${payForm.paymentType})` : ''}`}
            </button>
            <button onClick={() => setModal(null)} disabled={paying} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── History Modal ─────────────────────────────────────────────── */}
      <Modal open={modal === 'history'} onClose={() => setModal(null)} title={`Payment History — ${selected?.name}`} size="lg">
        {detail && (
          <div className="space-y-4">

            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Monthly Salary', value: detail.member.monthlySalary, color: 'text-gray-900 dark:text-white' },
                { label: 'Salary Paid', value: detail.member.totalSalaryPaid || 0, color: 'text-green-600' },
                { label: 'Advance Given', value: detail.member.totalAdvancePaid || 0, color: 'text-yellow-600' },
                { label: 'Bonus Given', value: detail.member.totalBonusPaid || 0, color: 'text-purple-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>

            {/* Payment history table */}
            {detail.payments?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No payments recorded yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="table-th">Date</th>
                    <th className="table-th">Type</th>
                    <th className="table-th">Description</th>
                    <th className="table-th">From</th>
                    <th className="table-th">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {detail.payments.map((p: any) => {
                    // Determine type from description or subcategory
                    const isAdvance = p.description?.toLowerCase().includes('advance');
                    const isBonus = p.description?.toLowerCase().includes('bonus');
                    return (
                      <tr key={p._id}>
                        <td className="table-td">{formatDate(p.date)}</td>
                        <td className="table-td">
                          <span className={isAdvance ? 'badge-yellow' : isBonus ? 'badge-purple' : 'badge-green'}>
                            {isAdvance ? 'Advance' : isBonus ? 'Bonus' : 'Salary'}
                          </span>
                        </td>
                        <td className="table-td text-gray-500">{p.description || '—'}</td>
                        <td className="table-td text-gray-400">{p.paidFrom?.name || '—'}</td>
                        <td className="table-td font-semibold text-green-600">{formatCurrency(p.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <td colSpan={4} className="table-td font-semibold">Total Paid (all types)</td>
                    <td className="table-td font-bold text-brand-600">
                      {formatCurrency(detail.payments.reduce((s: number, p: any) => s + p.amount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
