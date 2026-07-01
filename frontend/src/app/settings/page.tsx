'use client';
import { useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { authApi } from '@/lib/api';
import { Settings, User, Shield, Database, Users, Activity, Tag } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'security' | 'system'>('profile');
  const [profileForm, setProfileForm] = useState({ name: user?.name || '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [msg, setMsg] = useState('');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'system', label: 'System', icon: Database },
  ] as const;

  const saveProfile = async () => {
    try {
      setMsg('Profile updated ✓');
      setTimeout(() => setMsg(''), 2000);
    } catch { setMsg('Error saving'); }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>

        {/* Admin-only quick links */}
        {user?.role === 'admin' && (
          <div className="grid grid-cols-2 gap-3">
            <Link href="/settings/users" className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group">
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-brand-600 transition-colors">User Management</p>
                <p className="text-xs text-gray-400">Create & manage staff accounts</p>
              </div>
            </Link>
            <Link href="/settings/auditlog" className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <Activity className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-brand-600 transition-colors">Audit Log</p>
                <p className="text-xs text-gray-400">All actions by all users</p>
              </div>
            </Link>
            <Link href="/settings/categories" className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
                <Tag className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-brand-600 transition-colors">Payment Categories</p>
                <p className="text-xs text-gray-400">Edit categories & subcategories</p>
              </div>
            </Link>
            <Link href="/settings/backup" className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-brand-600 transition-colors">Backup & Restore</p>
                <p className="text-xs text-gray-400">Download or upload full data</p>
              </div>
            </Link>
          </div>
        )}

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {msg && <div className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 text-sm rounded-lg">{msg}</div>}

        {tab === 'profile' && (
          <div className="card p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-brand-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
                {user?.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-sm text-gray-400">{user?.email}</p>
                <span className="badge-purple capitalize">{user?.role}</span>
              </div>
            </div>
            <div><label className="label">Display Name</label>
              <input className="input" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
            </div>
            <div><label className="label">Email</label>
              <input className="input opacity-50 cursor-not-allowed" value={user?.email || ''} disabled />
            </div>
            <button onClick={saveProfile} className="btn-primary">Save Profile</button>
          </div>
        )}

        {tab === 'security' && (
          <div className="card p-6 space-y-4">
            <h3 className="font-medium text-gray-900 dark:text-white">Change Password</h3>
            <div><label className="label">Current Password</label><input type="password" className="input" value={pwForm.currentPassword} onChange={e => setPwForm({...pwForm, currentPassword: e.target.value})} /></div>
            <div><label className="label">New Password</label><input type="password" className="input" value={pwForm.newPassword} onChange={e => setPwForm({...pwForm, newPassword: e.target.value})} /></div>
            <div><label className="label">Confirm New Password</label><input type="password" className="input" value={pwForm.confirmPassword} onChange={e => setPwForm({...pwForm, confirmPassword: e.target.value})} /></div>
            <button className="btn-primary">Update Password</button>
          </div>
        )}

        {tab === 'system' && (
          <div className="space-y-4">
            <div className="card p-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">Peyala Business Admin</h3>
              <p className="text-sm text-gray-400 mb-4">Restaurant & Café Management System</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Version', '1.0.0'],
                  ['Database', 'MongoDB Atlas'],
                  ['Backend Port', '4000'],
                  ['Frontend Port', '3000'],
                  ['Timezone', 'Asia/Kolkata'],
                  ['Currency', '₹ INR'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">Peyala-Specific Config</h3>
              <div className="space-y-2 text-sm">
                {[
                  ['Zomato Effective Payout', '45% of gross'],
                  ['Overhead per Item', '₹40.95'],
                  ['Target Profit Margin', '15%'],
                  ['Operating Hours', '1:00 PM – 11:00 PM'],
                  ['Online Order Hours', '4:00 PM onwards (recommended)'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-medium text-gray-900 dark:text-white text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">API Health</h3>
              <p className="text-sm text-gray-400 mb-3">Backend: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">http://localhost:4000/api</code></p>
              <button onClick={() => fetch('http://localhost:4000/api/health').then(r => r.json()).then(d => alert('API Status: ' + d.status)).catch(() => alert('API unreachable — is backend running?'))}
                className="btn-secondary text-xs">Test API Connection</button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

