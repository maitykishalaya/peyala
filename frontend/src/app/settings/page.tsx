'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { authApi, ownerNoteApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Settings, User, Shield, Database, Users, Activity, Tag, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'security' | 'system'>('profile');
  const [profileForm, setProfileForm] = useState({ name: user?.name || '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [ownerNote, setOwnerNote] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [pwUpdating, setPwUpdating] = useState(false);
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [testingApi, setTestingApi] = useState(false);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'system', label: 'System', icon: Database },
  ] as const;

  const saveProfile = async () => {
    if (!profileForm.name.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }
    setProfileSaving(true);
    try {
      if (user?.id) {
        await authApi.updateUser(user.id, { name: profileForm.name });
      }
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const updatePassword = async () => {
    if (!pwForm.currentPassword) {
      toast.error('Current password is required');
      return;
    }
    if (!pwForm.newPassword) {
      toast.error('New password is required');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error('New password and confirm password do not match');
      return;
    }
    if (pwForm.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    setPwUpdating(true);
    try {
      if (user?.id) {
        await authApi.updateUser(user.id, { password: pwForm.newPassword });
      }
      toast.success('Password updated successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setPwUpdating(false);
    }
  };

  const saveOwnerNote = async () => {
    setNoticeSaving(true);
    try {
      await ownerNoteApi.update({ note: ownerNote });
      try {
        localStorage.removeItem('peyala_dashboard_cache_v1');
        localStorage.removeItem('peyala_dashboard_cache_v2');
      } catch {}
      toast.success('Owner notice saved successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save owner notice');
    } finally {
      setNoticeSaving(false);
    }
  };

  const testApiConnection = async () => {
    setTestingApi(true);
    try {
      const res = await fetch('http://localhost:4000/api/health');
      const data = await res.json();
      if (res.ok) {
        toast.success(`API Status: ${data.status || 'healthy'}`);
      } else {
        toast.error(`API returned status ${res.status}`);
      }
    } catch {
      toast.error('API unreachable — is backend running?');
    } finally {
      setTestingApi(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      ownerNoteApi.get().then(r => setOwnerNote(r.data.note || '')).catch(() => {});
    }
  }, [user?.role]);

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>

        {/* Admin-only quick links */}
        {user?.role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none pb-0.5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

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
            <button
              onClick={saveProfile}
              disabled={profileSaving}
              className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {profileSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {profileSaving ? 'Saving Profile...' : 'Save Profile'}
            </button>
          </div>
        )}

        {tab === 'security' && (
          <div className="card p-6 space-y-4">
            <h3 className="font-medium text-gray-900 dark:text-white">Change Password</h3>
            <div><label className="label">Current Password</label><input type="password" className="input" value={pwForm.currentPassword} onChange={e => setPwForm({...pwForm, currentPassword: e.target.value})} /></div>
            <div><label className="label">New Password</label><input type="password" className="input" value={pwForm.newPassword} onChange={e => setPwForm({...pwForm, newPassword: e.target.value})} /></div>
            <div><label className="label">Confirm New Password</label><input type="password" className="input" value={pwForm.confirmPassword} onChange={e => setPwForm({...pwForm, confirmPassword: e.target.value})} /></div>
            <button
              onClick={updatePassword}
              disabled={pwUpdating}
              className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {pwUpdating && <RefreshCw className="w-4 h-4 animate-spin" />}
              {pwUpdating ? 'Updating Password...' : 'Update Password'}
            </button>
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

            {user?.role === 'admin' && (
              <div className="card p-6">
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">Owner Notice</h3>
                <p className="text-sm text-gray-500 mb-3">Write a message for managers and staff. Only admins can update this notice.</p>
                <textarea
                  className="input h-32 min-h-[8rem] resize-none"
                  value={ownerNote}
                  onChange={e => setOwnerNote(e.target.value)}
                  placeholder="Enter owner notice for managers and staff..."
                />
                <div className="mt-3 flex items-center justify-between gap-4">
                  <button
                    onClick={saveOwnerNote}
                    disabled={noticeSaving}
                    className="btn-primary flex items-center gap-2"
                  >
                    {noticeSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                    {noticeSaving ? 'Saving Notice...' : 'Save Notice'}
                  </button>
                </div>
              </div>
            )}

            <div className="card p-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">API Health</h3>
              <p className="text-sm text-gray-400 mb-3">Backend: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">http://localhost:4000/api</code></p>
              <button
                onClick={testApiConnection}
                disabled={testingApi}
                className="btn-secondary text-xs flex items-center gap-1.5"
              >
                {testingApi && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {testingApi ? 'Testing Connection...' : 'Test API Connection'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

