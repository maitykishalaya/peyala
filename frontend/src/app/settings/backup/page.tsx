// ─────────────────────────────────────────────────────────────────
// Backup & Restore Page
// Admin only — accessible from Settings → Backup & Restore
//
// Features:
//   1. Download full database as one JSON file (recommended for backup)
//   2. Download any single collection as CSV (for Excel/Tally/accountant)
//   3. Upload a JSON backup to restore data
//      - Merge mode: adds/updates records, keeps everything else
//      - Replace mode: wipes only the collections present in the file
//      - Requires typing "RESTORE" to confirm — prevents accidents
// ─────────────────────────────────────────────────────────────────

'use client';
import { useEffect, useState, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { backupApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Download, Upload, Database, FileJson, FileSpreadsheet,
  AlertTriangle, CheckCircle2, Loader2
} from 'lucide-react';

// Friendly display names for each collection
const COLLECTION_LABELS: Record<string, string> = {
  accounts: 'Accounts',
  suppliers: 'Suppliers',
  inventoryCategories: 'Inventory Categories',
  inventoryItems: 'Inventory Items',
  purchaseEntries: 'Purchases',
  salesEntries: 'Sales',
  payments: 'Payments',
  receipts: 'Receipts',
  staff: 'Staff',
  transfers: 'Transfers',
  balanceSheet: 'Balance Sheet',
  paymentCategories: 'Payment Categories',
};

export default function BackupPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [exportingJson, setExportingJson] = useState(false);
  const [exportingCsv, setExportingCsv] = useState<string | null>(null);

  // ── Restore flow state ──────────────────────────────────────────
  const [restoreModal, setRestoreModal] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreData, setRestoreData] = useState<any>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await backupApi.collections();
      setCounts(r.data);
    } catch (err) {
      console.error('Failed to load collection counts:', err);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Trigger browser download from a blob ─────────────────────────
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // ── Export full JSON backup ───────────────────────────────────────
  const exportJson = async () => {
    setExportingJson(true);
    try {
      const res = await backupApi.exportJson();
      const filename = `peyala-backup-${new Date().toISOString().split('T')[0]}.json`;
      downloadBlob(res.data, filename);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Export failed');
    }
    setExportingJson(false);
  };

  // ── Export single collection as CSV ───────────────────────────────
  const exportCsv = async (collection: string) => {
    setExportingCsv(collection);
    try {
      const res = await backupApi.exportCsv(collection);
      const filename = `peyala-${collection}-${new Date().toISOString().split('T')[0]}.csv`;
      downloadBlob(res.data, filename);
    } catch (err: any) {
      alert(err.response?.data?.message || `No data to export for ${COLLECTION_LABELS[collection]}`);
    }
    setExportingCsv(null);
  };

  // ── Handle file selection for restore ─────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setConfirmText('');
    setRestoreResult(null);

    // Read and parse the JSON file to preview what's inside
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setRestoreData(parsed);
        setRestoreModal(true);
      } catch (err) {
        alert('Invalid JSON file. Please select a valid Peyala backup file.');
        setRestoreFile(null);
      }
    };
    reader.readAsText(file);
  };

  // ── Submit the restore ────────────────────────────────────────────
  const submitRestore = async () => {
    if (confirmText !== 'RESTORE') return;
    setRestoring(true);
    try {
      const res = await backupApi.import(restoreData.data, restoreMode, confirmText);
      setRestoreResult(res.data.results);
      load(); // refresh counts
    } catch (err: any) {
      alert(err.response?.data?.message || 'Restore failed');
    }
    setRestoring(false);
  };

  const closeRestoreModal = () => {
    setRestoreModal(false);
    setRestoreFile(null);
    setRestoreData(null);
    setConfirmText('');
    setRestoreResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const totalRecords = Object.values(counts).reduce((s, c) => s + c, 0);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-500" /> Backup & Restore
          </h1>
          <p className="text-sm text-gray-500">
            Download a complete backup of your business data, or restore from a previous backup.
          </p>
        </div>

        {/* ── Database Overview ────────────────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Current Database</h2>
            <span className="text-sm text-gray-400">{totalRecords} total records</span>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(counts).map(([key, count]) => (
                <div key={key} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-xs text-gray-500">{COLLECTION_LABELS[key] || key}</span>
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Full JSON Backup (Recommended) ──────────────────────── */}
        <div className="card p-5 border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-900/10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-brand-100 dark:bg-brand-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileJson className="w-6 h-6 text-brand-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">Full Backup (JSON)</h3>
              <p className="text-sm text-gray-500 mt-1">
                Complete snapshot of every account, purchase, sale, payment, receipt, staff record, and balance sheet.
                This is the file you should download regularly and keep safe — it can fully restore your business data.
              </p>
              <button
                onClick={exportJson}
                disabled={exportingJson}
                className="btn-primary mt-3 flex items-center gap-2"
              >
                {exportingJson ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exportingJson ? 'Preparing...' : 'Download Full Backup'}
              </button>
            </div>
          </div>
        </div>

        {/* ── CSV Export (per collection) ─────────────────────────── */}
        <div className="card p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">CSV Export (for Excel / Accountant)</h3>
              <p className="text-sm text-gray-500 mt-1">
                Download individual tables as CSV files — useful for sharing with your accountant or opening in Excel.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(COLLECTION_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => exportCsv(key)}
                disabled={exportingCsv === key || !counts[key]}
                className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {exportingCsv === key
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Download className="w-3 h-3" />
                }
                {label} {counts[key] ? `(${counts[key]})` : ''}
              </button>
            ))}
          </div>
        </div>

        {/* ── Restore from Backup ──────────────────────────────────── */}
        <div className="card p-5 border-yellow-200 dark:border-yellow-900">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <Upload className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">Restore from Backup</h3>
              <p className="text-sm text-gray-500 mt-1">
                Upload a previously downloaded JSON backup file to restore data. You'll be able to choose
                merge (safe — adds/updates only) or replace (wipes and reinserts) before confirming.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
                id="restore-file-input"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary mt-3 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Choose Backup File
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Restore Confirmation Modal ───────────────────────────────── */}
      <Modal open={restoreModal} onClose={closeRestoreModal} title="Restore from Backup" size="lg">
        {restoreResult ? (
          // ── Result view after restore completes ──────────────────
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <CheckCircle2 className="w-8 h-8 text-green-500 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-300">Restore Complete</p>
                <p className="text-xs text-green-500">Your data has been restored successfully</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {Object.entries(restoreResult).map(([key, info]: any) => (
                <div key={key} className="flex justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                  <span className="text-gray-600 dark:text-gray-400">{COLLECTION_LABELS[key] || key}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{info.count} records ({info.mode})</span>
                </div>
              ))}
            </div>
            <button onClick={closeRestoreModal} className="btn-primary w-full">Done</button>
          </div>
        ) : (
          // ── Pre-restore confirmation view ────────────────────────
          <div className="space-y-5">
            {restoreData && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-1">Backup File Info</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Exported: {restoreData.exportedAt ? formatDate(restoreData.exportedAt) : 'Unknown'}
                  {restoreData.exportedBy && ` by ${restoreData.exportedBy}`}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {restoreData.data && Object.entries(restoreData.data).map(([key, docs]: any) => (
                    <div key={key} className="text-xs flex justify-between p-1.5 bg-white dark:bg-gray-900 rounded">
                      <span className="text-gray-500">{COLLECTION_LABELS[key] || key}</span>
                      <span className="font-medium">{Array.isArray(docs) ? docs.length : 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mode selection */}
            <div>
              <label className="label">Restore Mode</label>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${restoreMode === 'merge' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <input type="radio" checked={restoreMode === 'merge'} onChange={() => setRestoreMode('merge')} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Merge (Recommended)</p>
                    <p className="text-xs text-gray-400">Adds new records and updates existing ones by ID. Nothing is deleted.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${restoreMode === 'replace' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                  <input type="radio" checked={restoreMode === 'replace'} onChange={() => setRestoreMode('replace')} className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Replace</p>
                    <p className="text-xs text-gray-400">Wipes collections present in this file and reinserts from backup. Use with caution.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                {restoreMode === 'replace'
                  ? 'This will permanently delete current data in the affected collections before restoring. Make sure you have a recent backup first.'
                  : 'This will add or update records. Existing data not in the backup file remains untouched.'}
              </p>
            </div>

            {/* Confirmation input */}
            <div>
              <label className="label">Type <strong>RESTORE</strong> to confirm</label>
              <input
                className="input"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="RESTORE"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={submitRestore}
                disabled={confirmText !== 'RESTORE' || restoring}
                className="btn-primary flex-1 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {restoring && <Loader2 className="w-4 h-4 animate-spin" />}
                {restoring ? 'Restoring...' : 'Confirm Restore'}
              </button>
              <button onClick={closeRestoreModal} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
