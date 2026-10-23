'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import api, { authApi, ownerNoteApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Settings,
  User,
  Shield,
  Database,
  Users,
  Activity,
  Tag,
  RefreshCw,
  LayoutGrid,
  Server,
  Cloud,
  History,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Layers,
  Clock,
  Printer,
  Percent,
  ShieldCheck,
} from 'lucide-react';
import { getSavedMergeBillItems, saveMergeBillItems } from '@/lib/thermal-print';
import { posSettingsApi, POSSetting } from '@/lib/pos-api';

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'security' | 'system' | 'maintenance'>('profile');
  const [profileForm, setProfileForm] = useState({ name: user?.name || '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [ownerNote, setOwnerNote] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [pwUpdating, setPwUpdating] = useState(false);
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [mergeSameBillItems, setMergeSameBillItems] = useState(false);
  const [posLimits, setPosLimits] = useState<POSSetting>({
    maxDiscountStaffPercent: 10,
    maxDiscountManagerPercent: 20,
    maxWaiveStaffPercent: 2,
    maxWaiveManagerPercent: 5,
    dbSyncIntervalMinutes: 15,
  });
  const [posLimitsSaving, setPosLimitsSaving] = useState(false);

  // Maintenance & Local Server States
  const [maintenanceData, setMaintenanceData] = useState<any>(null);
  const [restorePoints, setRestorePoints] = useState<any[]>([]);
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [newVersionDesc, setNewVersionDesc] = useState('');
  const [creatingRestore, setCreatingRestore] = useState(false);
  const [rollbackModal, setRollbackModal] = useState<{ open: boolean; version: string; id: string } | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'system', label: 'System', icon: Database },
    ...(user?.role === 'admin' || user?.role === 'manager'
      ? [{ id: 'maintenance', label: 'Local Server & Versions', icon: Server }]
      : []),
  ] as const;

  const loadMaintenanceData = async () => {
    if (user?.role !== 'admin' && user?.role !== 'manager') return;
    setLoadingMaintenance(true);
    try {
      const [overviewRes, pointsRes] = await Promise.all([
        api.get('/maintenance/overview').catch(() => ({ data: null })),
        api.get('/maintenance/restore-points').catch(() => ({ data: { restorePoints: [] } })),
      ]);
      if (overviewRes.data) setMaintenanceData(overviewRes.data);
      if (pointsRes.data?.restorePoints) setRestorePoints(pointsRes.data.restorePoints);
    } catch (_) {
    } finally {
      setLoadingMaintenance(false);
    }
  };

  useEffect(() => {
    if (tab === 'maintenance') {
      loadMaintenanceData();
    }
  }, [tab]);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      const res = await api.post('/sync/trigger');
      if (res.data?.status === 'offline') {
        toast.warning('Internet or cloud DB unavailable. Local changes preserved in queue.');
      } else {
        toast.success(`Delta sync completed: ${res.data?.processed || 0} items updated to cloud! ☁️`);
      }
      loadMaintenanceData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Sync failed.');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleCreateRestorePoint = async () => {
    if (!newVersion.trim()) {
      toast.error('Version number is required (e.g. 10.0.1)');
      return;
    }
    setCreatingRestore(true);
    try {
      await api.post('/maintenance/restore-points', {
        version: newVersion.trim(),
        description: newVersionDesc.trim(),
      });
      toast.success(`Restore point v${newVersion} created successfully! 📸`);
      setNewVersion('');
      setNewVersionDesc('');
      loadMaintenanceData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create restore point');
    } finally {
      setCreatingRestore(false);
    }
  };

  const handleExecuteRollback = async () => {
    if (!rollbackModal) return;
    setRollingBack(true);
    try {
      const res = await api.post('/maintenance/rollback', {
        targetVersion: rollbackModal.id || rollbackModal.version,
      });
      toast.success(`Safe rollback complete! Restored to v${res.data?.restoredVersion || rollbackModal.version} (${res.data?.totalDocuments || 0} documents verified). ⏪`);
      setRollbackModal(null);
      loadMaintenanceData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  };

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
        localStorage.removeItem('peyala_dashboard_cache_v2');
      } catch {}
      toast.success('Owner notice updated and broadcast to dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update owner notice');
    } finally {
      setNoticeSaving(false);
    }
  };

  const testApiConnection = async () => {
    setTestingApi(true);
    try {
      const res = await api.get('/health');
      if (res.data?.status === 'ok') {
        toast.success(`Local API responsive! Mode: ${res.data.mode || 'standard'} (${res.data.app || 'Peyala'})`);
      } else {
        toast.warning('API responded with non-standard status');
      }
    } catch (err: any) {
      toast.error(`Connection failed: ${err.message || 'Cannot reach API'}`);
    } finally {
      setTestingApi(false);
    }
  };

  useEffect(() => {
    ownerNoteApi.get()
      .then(res => setOwnerNote(res.data?.note || ''))
      .catch(() => {});
    setMergeSameBillItems(getSavedMergeBillItems());
    posSettingsApi.get()
      .then(res => {
        if (res.data) {
          setPosLimits({
            maxDiscountStaffPercent: res.data.maxDiscountStaffPercent ?? 10,
            maxDiscountManagerPercent: res.data.maxDiscountManagerPercent ?? 20,
            maxWaiveStaffPercent: res.data.maxWaiveStaffPercent ?? 2,
            maxWaiveManagerPercent: res.data.maxWaiveManagerPercent ?? 5,
            dbSyncIntervalMinutes: res.data.dbSyncIntervalMinutes ?? 15,
            lastUpdatedBy: res.data.lastUpdatedBy,
            updatedAt: res.data.updatedAt,
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSavePosLimits = async () => {
    if (user?.role !== 'admin') {
      toast.error('Only Admins can modify POS discount & sync settings');
      return;
    }
    setPosLimitsSaving(true);
    try {
      const res = await posSettingsApi.update({
        maxDiscountStaffPercent: Number(posLimits.maxDiscountStaffPercent) || 0,
        maxDiscountManagerPercent: Number(posLimits.maxDiscountManagerPercent) || 0,
        maxWaiveStaffPercent: Number(posLimits.maxWaiveStaffPercent) || 0,
        maxWaiveManagerPercent: Number(posLimits.maxWaiveManagerPercent) || 0,
        dbSyncIntervalMinutes: Number(posLimits.dbSyncIntervalMinutes) || 15,
      });
      if (res.data) {
        setPosLimits(res.data);
      }
      toast.success('Settings & database sync schedule saved successfully! 🛡️');
      if (tab === 'maintenance') {
        loadMaintenanceData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setPosLimitsSaving(false);
    }
  };

  const handlePresetSyncInterval = async (val: number) => {
    if (user?.role !== 'admin') {
      toast.error('Only Admins can modify the DB sync schedule');
      return;
    }
    const updated = { ...posLimits, dbSyncIntervalMinutes: val };
    setPosLimits(updated);
    setPosLimitsSaving(true);
    try {
      const res = await posSettingsApi.update({
        dbSyncIntervalMinutes: val,
      });
      if (res.data) {
        setPosLimits(res.data);
      }
      toast.success(`Database sync interval updated to ${val} minute(s)! ☁️`);
      if (tab === 'maintenance') {
        loadMaintenanceData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update sync interval');
    } finally {
      setPosLimitsSaving(false);
    }
  };

  const handleToggleMergeSameBillItems = (checked: boolean) => {
    setMergeSameBillItems(checked);
    saveMergeBillItems(checked);
    toast.success(
      checked
        ? 'Customer bills will now merge identical items together across rounds'
        : 'Customer bills will now show items ordered in separate rounds'
    );
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-brand-600" /> Settings & Administration
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage account, local server, 15-minute sync, and version restore points
          </p>
        </div>

        {/* Quick Links */}
        {user?.role === 'admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              onClick={() => setTab('maintenance')}
              className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group text-left border-l-4 border-l-emerald-500"
            >
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                <Server className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-brand-600 transition-colors">
                  Local Server & Versions
                </p>
                <p className="text-xs text-gray-400">Sync status, restore points & rollbacks</p>
              </div>
            </button>

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

            <Link href="/settings/outlet-design" className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                <LayoutGrid className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-brand-600 transition-colors">Outlet Design</p>
                <p className="text-xs text-gray-400">Floor sections & zone sales tracking</p>
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
                <p className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-brand-600 transition-colors">JSON Backup</p>
                <p className="text-xs text-gray-400">Download or upload JSON dump</p>
              </div>
            </Link>
          </div>
        )}

        {/* Tab Headers */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none pb-0.5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Profile Tab */}
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
            <div>
              <label className="label">Display Name</label>
              <input
                className="input"
                value={profileForm.name}
                onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={user?.email || ''} disabled />
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

        {/* Security Tab */}
        {tab === 'security' && (
          <div className="card p-6 space-y-4">
            <h3 className="font-medium text-gray-900 dark:text-white">Change Password</h3>
            <div>
              <label className="label">Current Password</label>
              <input
                type="password"
                className="input"
                value={pwForm.currentPassword}
                onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })}
              />
            </div>
            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                className="input"
                value={pwForm.newPassword}
                onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                className="input"
                value={pwForm.confirmPassword}
                onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
              />
            </div>
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

        {/* System Tab */}
        {tab === 'system' && (
          <div className="space-y-4">
            <div className="card p-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">Peyala Business Admin</h3>
              <p className="text-sm text-gray-400 mb-4">Local-First Restaurant & Café Management System</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Architecture', 'Local-First Operational Data Store'],
                  ['Application Version', '12.0.0'],
                  ['Local Database', 'WiredTiger Local MongoDB (Sub-5ms)'],
                  ['Central Database', `MongoDB Atlas (Periodic ${posLimits.dbSyncIntervalMinutes || 15}-Min Sync)`],
                  ['Backend Port', '4000'],
                  ['Frontend Port', '3000'],
                  ['Timezone', 'Asia/Kolkata (IST)'],
                  ['Currency', '₹ INR'],
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

            {/* Bill Printing Preferences (Requirement 5) */}
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Printer className="w-5 h-5 text-brand-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Customer Bill Printing Preferences</h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Control how repeat items from separate ordering rounds are presented on printed customer bills.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-gray-900 dark:text-white">Merge Identical Items on Printed Bill</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {mergeSameBillItems
                      ? 'Enabled: Items ordered across multiple rounds are merged into a single line with their total quantity.'
                      : 'Disabled: Items are printed in the order/rounds they were punched.'}
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={mergeSameBillItems}
                    onChange={(e) => handleToggleMergeSameBillItems(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-600"></div>
                </label>
              </div>
            </div>

            {/* Role-Based Discount & Shortage Limits Card */}
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Percent className="w-5 h-5 text-brand-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Role-Based Discount & Cash Shortage Limits</h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Configure maximum discount and cash counter shortage / waive-off permissions by user role. Enforces cash counter discipline and prevents unauthorized write-offs.
                  </p>
                </div>
                {user?.role === 'admin' ? (
                  <span className="badge-emerald text-xs font-semibold px-2.5 py-1">Admin Configurable</span>
                ) : (
                  <span className="badge-gray text-xs font-semibold px-2.5 py-1">View Only</span>
                )}
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Staff Limits Column */}
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/60 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2 dark:border-gray-700">
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Staff Permissions
                    </span>
                    <span className="text-[11px] text-gray-400 font-medium">Front-desk / Cashier</span>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                      Max Order Discount (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={user?.role !== 'admin'}
                        value={posLimits.maxDiscountStaffPercent}
                        onChange={(e) =>
                          setPosLimits({ ...posLimits, maxDiscountStaffPercent: Math.max(0, Math.min(100, Number(e.target.value))) })
                        }
                        className="input h-9 text-sm pr-8 font-semibold"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-gray-400">%</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Staff cannot apply more than {posLimits.maxDiscountStaffPercent}% discount on any order (e.g. ₹{((200 * posLimits.maxDiscountStaffPercent) / 100).toFixed(0)} on ₹200).
                    </p>
                  </div>

                  <div className="pt-1">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                      Max Cash Shortage / Waive-off (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={user?.role !== 'admin'}
                        value={posLimits.maxWaiveStaffPercent}
                        onChange={(e) =>
                          setPosLimits({ ...posLimits, maxWaiveStaffPercent: Math.max(0, Math.min(100, Number(e.target.value))) })
                        }
                        className="input h-9 text-sm pr-8 font-semibold"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-gray-400">%</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Staff cannot record settlement below {posLimits.maxWaiveStaffPercent}% shortage (e.g. on ₹200, max shortage ₹{((200 * posLimits.maxWaiveStaffPercent) / 100).toFixed(0)}, min settlement ₹{(200 - (200 * posLimits.maxWaiveStaffPercent) / 100).toFixed(0)}). More is strictly blocked.
                    </p>
                  </div>
                </div>

                {/* Manager Limits Column */}
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/60 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2 dark:border-gray-700">
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      Manager Permissions
                    </span>
                    <span className="text-[11px] text-gray-400 font-medium">Floor Supervisor</span>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                      Max Order Discount (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={user?.role !== 'admin'}
                        value={posLimits.maxDiscountManagerPercent}
                        onChange={(e) =>
                          setPosLimits({ ...posLimits, maxDiscountManagerPercent: Math.max(0, Math.min(100, Number(e.target.value))) })
                        }
                        className="input h-9 text-sm pr-8 font-semibold"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-gray-400">%</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Managers cannot apply more than {posLimits.maxDiscountManagerPercent}% discount on any order (e.g. ₹{((200 * posLimits.maxDiscountManagerPercent) / 100).toFixed(0)} on ₹200).
                    </p>
                  </div>

                  <div className="pt-1">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                      Max Cash Shortage / Waive-off (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={user?.role !== 'admin'}
                        value={posLimits.maxWaiveManagerPercent}
                        onChange={(e) =>
                          setPosLimits({ ...posLimits, maxWaiveManagerPercent: Math.max(0, Math.min(100, Number(e.target.value))) })
                        }
                        className="input h-9 text-sm pr-8 font-semibold"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-gray-400">%</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Managers cannot record settlement below {posLimits.maxWaiveManagerPercent}% shortage (e.g. on ₹200, max shortage ₹{((200 * posLimits.maxWaiveManagerPercent) / 100).toFixed(0)}, min settlement ₹{(200 - (200 * posLimits.maxWaiveManagerPercent) / 100).toFixed(0)}).
                    </p>
                  </div>
                </div>
              </div>

              {/* Admin Note & Action */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    <b>Admin Authority:</b> Admin users have unrestricted 100% discount and full settlement override authority.
                  </span>
                </div>

                {user?.role === 'admin' && (
                  <button
                    onClick={handleSavePosLimits}
                    disabled={posLimitsSaving}
                    className="btn-primary flex items-center justify-center gap-2 text-xs font-bold px-4 py-2"
                  >
                    {posLimitsSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    {posLimitsSaving ? 'Saving Limits...' : 'Save POS Limits'}
                  </button>
                )}
              </div>
            </div>

            {/* Central Database Sync Schedule Card */}
            <div className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900 dark:text-white">Central Database Sync Schedule</h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Configure the background schedule for periodic delta synchronization from this Local Server to Central MongoDB Atlas.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge-blue text-xs font-semibold px-2.5 py-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    Every {posLimits.dbSyncIntervalMinutes || 15} min
                  </span>
                  {user?.role === 'admin' ? (
                    <span className="badge-emerald text-xs font-semibold px-2.5 py-1">Admin Managed</span>
                  ) : (
                    <span className="badge-gray text-xs font-semibold px-2.5 py-1">View Only</span>
                  )}
                </div>
              </div>

              <div className="mt-5 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-900 dark:text-white block">
                      Sync Frequency Interval
                    </label>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Determines how often buffered local mutations (orders, payments, bills, inventory) are pushed to the cloud.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative w-32">
                      <input
                        type="number"
                        min="0.5"
                        max="1440"
                        step="1"
                        disabled={user?.role !== 'admin' || posLimitsSaving}
                        value={posLimits.dbSyncIntervalMinutes || 15}
                        onChange={(e) =>
                          setPosLimits({
                            ...posLimits,
                            dbSyncIntervalMinutes: Math.max(0.2, Math.min(1440, Number(e.target.value))),
                          })
                        }
                        className="input h-9 text-sm pr-10 font-bold"
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-gray-400">min</span>
                    </div>

                    {user?.role === 'admin' && (
                      <button
                        onClick={handleSavePosLimits}
                        disabled={posLimitsSaving}
                        className="btn-primary text-xs font-bold px-3 h-9 flex items-center gap-1.5"
                      >
                        {posLimitsSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Presets */}
                {user?.role === 'admin' && (
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-2">
                      Quick Presets:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: '1 Min (Realtime)', val: 1 },
                        { label: '5 Min (High Frequency)', val: 5 },
                        { label: '10 Min (Balanced)', val: 10 },
                        { label: '15 Min (Recommended Default)', val: 15 },
                        { label: '30 Min (Low Bandwidth)', val: 30 },
                        { label: '60 Min (Hourly)', val: 60 },
                      ].map(({ label, val }) => {
                        const active = posLimits.dbSyncIntervalMinutes === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handlePresetSyncInterval(val)}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-2xs',
                              active
                                ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/20'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Status footer with manual trigger button */}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>
                    Local operations run continuously with <b>sub-5ms latency</b>. Sync runs silently in background.
                  </span>
                </div>

                <button
                  onClick={handleManualSync}
                  disabled={isManualSyncing}
                  className="btn-secondary text-xs font-bold px-3 py-1.5 flex items-center gap-1.5"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', isManualSyncing && 'animate-spin')} />
                  {isManualSyncing ? 'Syncing Now...' : 'Trigger Sync Now'}
                </button>
              </div>
            </div>

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

        {/* Maintenance & Local Server Tab */}
        {tab === 'maintenance' && (
          <div className="space-y-6">
            {/* KPI Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Local Server */}
              <div className="card p-4 border-l-4 border-l-emerald-500 space-y-1">
                <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
                  <span>LOCAL SERVER</span>
                  <Server className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Operational
                </div>
                <p className="text-[11px] text-gray-400">Sub-5ms Local Response</p>
              </div>

              {/* Cloud Sync */}
              <div className="card p-4 border-l-4 border-l-blue-500 space-y-1">
                <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
                  <span>{posLimits.dbSyncIntervalMinutes || maintenanceData?.sync?.syncIntervalMinutes || 15}-MIN CLOUD SYNC</span>
                  <Cloud className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  {maintenanceData?.sync?.isOnline ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-sm font-bold">
                      <Wifi className="w-4 h-4" /> Reachable
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 text-sm font-bold">
                      <WifiOff className="w-4 h-4" /> Buffered Locally
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  {maintenanceData?.sync?.pendingCount || 0} change(s) queued
                </p>
              </div>

              {/* Connected Devices */}
              <div className="card p-4 border-l-4 border-l-purple-500 space-y-1">
                <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
                  <span>CONNECTED FLEET</span>
                  <Users className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {maintenanceData?.connectedDevices?.activeConnections || 1} Device(s)
                </div>
                <p className="text-[11px] text-gray-400">Phones, Laptops & Tablets</p>
              </div>

              {/* Application Version */}
              <div className="card p-4 border-l-4 border-l-amber-500 space-y-1">
                <div className="flex items-center justify-between text-gray-500 text-xs font-semibold">
                  <span>VERSION</span>
                  <History className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  v{maintenanceData?.system?.applicationVersion || '12.0.0'}
                </div>
                <p className="text-[11px] text-gray-400">
                  {restorePoints.length} Restore Points Available
                </p>
              </div>
            </div>

            {/* Sync Controls */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-blue-600" /> Periodic Cloud Synchronization
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Operational data is saved locally first. Background delta updates sync to MongoDB Atlas every {posLimits.dbSyncIntervalMinutes || maintenanceData?.sync?.syncIntervalMinutes || 15} minutes.
                  </p>
                </div>
                <button
                  onClick={handleManualSync}
                  disabled={isManualSyncing}
                  className="btn-primary py-2 px-4 flex items-center gap-2 text-xs font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
                  {isManualSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-400 block mb-1">Queue Status</span>
                  <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                    {maintenanceData?.sync?.pendingCount || 0} Pending Outbox Changes
                  </span>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-400 block mb-1">Sync Interval</span>
                  <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                    Every {posLimits.dbSyncIntervalMinutes || maintenanceData?.sync?.syncIntervalMinutes || 15} Minutes (Background Worker)
                  </span>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-400 block mb-1">Last Sync Cycle</span>
                  <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                    {maintenanceData?.sync?.lastSyncTime
                      ? new Date(maintenanceData.sync.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Initial sync scheduled'}
                  </span>
                </div>
              </div>
            </div>

            {/* Create Restore Point */}
            <div className="card p-6 space-y-4">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-600" /> Create Project & Data Restore Point
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Snapshots the entire database schema, local dataset, and configuration state before major releases or migrations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label text-xs">Version Number</label>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="e.g. 10.0.1"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label text-xs">Description / Release Notes</label>
                  <input
                    type="text"
                    className="input text-xs"
                    placeholder="e.g. Pre-rush inventory & menu configuration"
                    value={newVersionDesc}
                    onChange={(e) => setNewVersionDesc(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleCreateRestorePoint}
                  disabled={creatingRestore}
                  className="btn-primary py-2 px-4 flex items-center gap-2 text-xs font-bold"
                >
                  {creatingRestore && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {creatingRestore ? 'Creating Snapshot...' : 'Create Restore Point'}
                </button>
              </div>
            </div>

            {/* Available Restore Points & Rollback List */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-amber-600" /> Versioned Restore Points & Safe Rollback
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Revert the application and data state to any verified release (e.g. "GO BACK TO VERSION 10.0.0").
                  </p>
                </div>
                <button
                  onClick={loadMaintenanceData}
                  disabled={loadingMaintenance}
                  className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMaintenance ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3">Version</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Created</th>
                      <th className="py-2.5 px-3">Total Documents</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {restorePoints.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-gray-400">
                          No restore points found. Create one above to establish a baseline.
                        </td>
                      </tr>
                    ) : (
                      restorePoints.map((point) => (
                        <tr key={point.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="py-3 px-3 font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            v{point.version}
                            {point.isBaseline && (
                              <span className="ml-1 text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                Baseline
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">
                            {point.description || 'Snapshot'}
                          </td>
                          <td className="py-3 px-3 text-gray-400">
                            {new Date(point.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-3 px-3 font-semibold text-gray-700 dark:text-gray-300">
                            {point.totalDocuments ? `${point.totalDocuments.toLocaleString()} records` : 'Full dump'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => setRollbackModal({ open: true, version: point.version, id: point.id })}
                              className="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800/80 transition-colors"
                            >
                              ⏪ Rollback
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Rollback Confirmation Modal */}
        {rollbackModal?.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">
                    Confirm Safe Rollback to v{rollbackModal.version}
                  </h3>
                  <p className="text-xs text-gray-500">Safe 8-Step State Restoration</p>
                </div>
              </div>

              <div className="text-xs text-gray-600 dark:text-gray-300 space-y-2 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-lg border border-amber-200 dark:border-amber-900/60">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Before performing this rollback, the system will:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-amber-800 dark:text-amber-300 text-[11px]">
                  <li>Pause cloud background synchronization.</li>
                  <li>Safely flush all pending local mutations.</li>
                  <li>Create an automatic pre-rollback snapshot of current state.</li>
                  <li>Restore all collections to version {rollbackModal.version}.</li>
                  <li>Verify database integrity and document counts.</li>
                  <li>Resume normal operations.</li>
                </ol>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setRollbackModal(null)}
                  disabled={rollingBack}
                  className="btn-secondary py-2 px-4 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteRollback}
                  disabled={rollingBack}
                  className="py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {rollingBack && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {rollingBack ? 'Executing Safe Rollback...' : `Rollback to v${rollbackModal.version}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
