'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, getInitials } from '@/lib/utils';
import { Plus, Pencil, UserX, Shield, User, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Full access — can manage users, see all data, delete entries' },
  { value: 'manager', label: 'Manager', desc: 'Can view and add entries, cannot manage users' },
  { value: 'staff', label: 'Staff', desc: 'Limited access — can add sales and purchases only' },
];

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const blank = () => ({ name: '', email: '', password: '', role: 'staff', isActive: true });
  const [form, setForm] = useState<any>(blank());

  // Redirect non-admins
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') router.push('/dashboard');
  }, [currentUser]);

  const load = async () => {
    const r = await authApi.listUsers();
    setUsers(r.data);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (u: any) => {
    setSelected(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, isActive: u.isActive });
    setModal('edit');
  };

  const save = async () => {
    setError('');
    try {
      if (modal === 'create') {
        if (!form.password) return setError('Password is required');
        await authApi.createUser(form);
      } else {
        await authApi.updateUser(selected._id, form);
      }
      setModal(null); setForm(blank()); load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error saving user');
    }
  };

  const deactivate = async (u: any) => {
    if (!confirm(`Deactivate ${u.name}? They won't be able to log in.`)) return;
    await authApi.deleteUser(u._id); load();
  };

  const roleColor = (role: string) => ({ admin: 'badge-red', manager: 'badge-blue', staff: 'badge-green' }[role] || 'badge-blue');

  return (
    <AppLayout>
      <div className="space-y-5 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-500" /> User Management
            </h1>
            <p className="text-sm text-gray-500">Admin only — create and manage staff accounts</p>
          </div>
          <button onClick={() => { setForm(blank()); setError(''); setModal('create'); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create User
          </button>
        </div>

        {/* Role guide */}
        <div className="grid grid-cols-3 gap-3">
          {ROLES.map(r => (
            <div key={r.value} className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={roleColor(r.value)}>{r.label}</span>
              </div>
              <p className="text-xs text-gray-400">{r.desc}</p>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="table-th">User</th>
                <th className="table-th">Email</th>
                <th className="table-th">Role</th>
                <th className="table-th">Status</th>
                <th className="table-th">Created</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {users.map((u: any) => (
                <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-brand-100 dark:bg-brand-900/30 rounded-full flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-bold flex-shrink-0">
                        {getInitials(u.name)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{u.name}</p>
                        {u._id === currentUser?.id && <p className="text-xs text-brand-500">You</p>}
                      </div>
                    </div>
                  </td>
                  <td className="table-td text-gray-500">{u.email}</td>
                  <td className="table-td"><span className={roleColor(u.role)}>{u.role}</span></td>
                  <td className="table-td">
                    <span className={u.isActive ? 'badge-green' : 'badge-red'}>{u.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="table-td text-gray-400">{formatDate(u.createdAt)}</td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-brand-500 rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      {u._id !== currentUser?.id && u.isActive && (
                        <button onClick={() => deactivate(u)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Deactivate"><UserX className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'create' ? 'Create Staff Account' : 'Edit User'}>
        <div className="space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
          <div><label className="label">Full Name *</label><input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Arpan Mandal" /></div>
          <div><label className="label">Email Address *</label><input type="email" className="input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="arpan@peyala.com" /></div>
          <div>
            <label className="label">{modal === 'edit' ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className="input pr-10" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Min 6 characters" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Role *</label>
            <div className="space-y-2">
              {ROLES.map(r => (
                <label key={r.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.role === r.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => setForm({...form, role: r.value})} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{r.label}</p>
                    <p className="text-xs text-gray-400">{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {modal === 'edit' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} />
              <span className="text-gray-700 dark:text-gray-300">Account Active</span>
            </label>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={save} className="btn-primary flex-1">{modal === 'create' ? 'Create Account' : 'Save Changes'}</button>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
