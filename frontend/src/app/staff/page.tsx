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
import { formatCurrency, formatDate, today, getInitials } from '@/lib/utils';
import { ALL_PAYMENT_MODES } from '@/lib/paymentModes';
import { Plus, Pencil, Phone, IndianRupee, ChevronDown } from 'lucide-react';

// Payment type options
const PAYMENT_TYPES = [
  { value: 'salary',  label: '💰 Salary',  desc: 'Regular monthly salary payment' },
  { value: 'advance', label: '⚡ Advance',  desc: 'Advance against future salary' },
  { value: 'bonus',   label: '🎁 Bonus',   desc: 'Bonus or incentive payment' },
];

export default function StaffPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [modal, setModal] = useState<'create' | 'edit' | 'pay' | 'history' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null); // { member, payments }

  // Form for create/edit
  const blank = () => ({
    name: '', position: '', phone: '', address: '',
    joiningDate: '', monthlySalary: 0, status: 'active', notes: ''
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

  const load = async () => {
    const [s, a] = await Promise.all([staffApi.list(), accountsApi.list()]);
    setStaff(s.data);
    setAccounts(a.data);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (s: any) => {
    setSelected(s);
    setForm({
      name: s.name, position: s.position, phone: s.phone || '',
      address: s.address || '', joiningDate: s.joiningDate?.split('T')[0] || '',
      monthlySalary: s.monthlySalary, status: s.status, notes: s.notes || ''
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
    if (modal === 'edit') await staffApi.update(selected._id, form);
    else await staffApi.create(form);
    setModal(null); setForm(blank()); load();
  };

  // Pay salary/advance/bonus using new unified endpoint
  const pay = async () => {
    await staffApi.pay(selected._id, payForm);
    setModal(null); load();
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Staff</h1>
            <p className="text-sm text-gray-500">
              {staff.filter(s => s.status === 'active').length} active ·
              Monthly bill: <span className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(totalSalaryBill)}</span>
            </p>
          </div>
          <button
            onClick={() => { setForm(blank()); setModal('create'); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Staff
          </button>
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
                  <span className={statusColor(member.status)}>{member.status.replace('_', ' ')}</span>
                </div>
                <button onClick={() => openEdit(member)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              {member.phone && (
                <p className="text-sm text-gray-500 flex items-center gap-1.5 mb-3">
                  <Phone className="w-3.5 h-3.5" /> {member.phone}
                </p>
              )}

              {/* Salary breakdown */}
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 mb-3">
                <div>
                  <p className="text-xs text-gray-400">Monthly Salary</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(member.monthlySalary)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Salary Paid</p>
                  <p className="text-sm font-semibold text-green-600">{formatCurrency(member.totalSalaryPaid || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Advance Paid</p>
                  <p className="text-sm font-semibold text-yellow-600">{formatCurrency(member.totalAdvancePaid || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Bonus Paid</p>
                  <p className="text-sm font-semibold text-purple-600">{formatCurrency(member.totalBonusPaid || 0)}</p>
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
                <button onClick={() => openPay(member)} className="btn-primary flex-1 text-xs py-1.5 flex items-center justify-center gap-1">
                  <IndianRupee className="w-3 h-3" /> Pay
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Create/Edit Modal ────────────────────────────────────────── */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Staff Member' : 'Add Staff Member'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Name *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><label className="label">Position *</label><input className="input" value={form.position} onChange={e => setForm({...form, position: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            <div><label className="label">Joining Date</label><input type="date" className="input" value={form.joiningDate} onChange={e => setForm({...form, joiningDate: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          <div className="flex gap-3 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Pay Modal ────────────────────────────────────────────────── */}
      <Modal open={modal === 'pay'} onClose={() => setModal(null)} title={`Pay — ${selected?.name}`} size="md">
        <div className="space-y-4">

          {/* Payment type selector */}
          <div>
            <label className="label">Payment Type *</label>
            <div className="grid grid-cols-3 gap-2">
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
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 grid grid-cols-3 gap-3 text-center">
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

          <div className="grid grid-cols-2 gap-4">
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
            <button onClick={pay} className="btn-primary flex-1 py-2.5">
              Pay {formatCurrency(payForm.amount)}
              {payForm.paymentType !== 'salary' && ` (${payForm.paymentType})`}
            </button>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
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
