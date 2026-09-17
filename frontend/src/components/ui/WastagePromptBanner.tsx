'use client';

import { useState, useEffect, useCallback } from 'react';
import { wastageApi } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import { toast } from '@/lib/toast';
import { formatCurrency, today } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import {
  AlertTriangle,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Plus,
  ShieldCheck,
  Clock,
} from 'lucide-react';

const COMMON_UNITS = ['kg', 'g', 'pcs', 'plates', 'portions', 'litres', 'ml', 'box', 'packet', 'units'];
const PNL_CACHE_KEY = 'peyala_reports_pnl_cache_v2';

export default function WastagePromptBanner() {
  const { user } = useAuth();
  const [isAfter10PM, setIsAfter10PM] = useState(false);
  const [hasRecordedToday, setHasRecordedToday] = useState(true); // Default true until checked
  const [checking, setChecking] = useState(false);

  // Modals
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [zeroModalOpen, setZeroModalOpen] = useState(false);

  // Fast Record Form
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('units');
  const [approxValue, setApproxValue] = useState('');
  const [reason, setReason] = useState('');
  const [savingRecord, setSavingRecord] = useState(false);

  // Zero Confirmation
  const [zeroConfirmed, setZeroConfirmed] = useState(false);
  const [zeroNotes, setZeroNotes] = useState('');
  const [savingZero, setSavingZero] = useState(false);

  // Check if current time is after 10:00 PM (22:00 to 04:00 AM)
  const checkTime = useCallback(() => {
    const now = new Date();
    const hour = now.getHours();
    // After 10:00 PM: 22:00, 23:00, or early morning closing hours 00:00 to 04:00
    const after10 = hour >= 22 || hour < 4;
    setIsAfter10PM(after10);
    return after10;
  }, []);

  // Check backend if wastage or zero-wastage is already logged today
  const checkWastageStatus = useCallback(async () => {
    if (!user || user.role === 'viewer') return;
    try {
      setChecking(true);
      const res = await wastageApi.todayStatus();
      setHasRecordedToday(Boolean(res.data?.recorded));
    } catch (err) {
      console.error('Failed to check today wastage status:', err);
    } finally {
      setChecking(false);
    }
  }, [user]);

  // Initial mount & periodic timer
  useEffect(() => {
    const after10 = checkTime();
    if (after10) {
      checkWastageStatus();
    }

    // Interval to re-check time and status every 45 seconds
    const interval = setInterval(() => {
      const isLate = checkTime();
      if (isLate) {
        checkWastageStatus();
      }
    }, 45000);

    // Listen to custom event when wastage is updated from any page
    const handleWastageUpdate = () => {
      checkWastageStatus();
    };
    window.addEventListener('peyala_wastage_updated', handleWastageUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('peyala_wastage_updated', handleWastageUpdate);
    };
  }, [checkTime, checkWastageStatus]);

  // Submit Fast Record Wastage
  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      toast.error('Please specify the name of the item');
      return;
    }
    const numQty = Number(quantity);
    if (Number.isNaN(numQty) || numQty <= 0) {
      toast.error('Please enter a valid quantity greater than 0');
      return;
    }
    const numVal = Number(approxValue);
    if (Number.isNaN(numVal) || numVal < 0) {
      toast.error('Please enter a valid approximate value (₹)');
      return;
    }

    setSavingRecord(true);
    try {
      await wastageApi.create({
        itemName: itemName.trim(),
        quantity: numQty,
        approxValue: numVal,
        unit: unit || 'units',
        date: today(),
        reason: reason.trim(),
      });

      toast.success(`Wastage recorded for "${itemName}" (₹${numVal})`);

      try {
        localStorage.removeItem(PNL_CACHE_KEY);
      } catch {}

      setHasRecordedToday(true);
      setRecordModalOpen(false);
      setItemName('');
      setQuantity('');
      setApproxValue('');
      setReason('');

      // Notify any other components on the page
      window.dispatchEvent(new CustomEvent('peyala_wastage_updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to record wastage');
    } finally {
      setSavingRecord(false);
    }
  };

  // Submit Zero Wastage Confirmation
  const handleSignZeroWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zeroConfirmed) {
      toast.error('Please check the verification confirmation box');
      return;
    }

    setSavingZero(true);
    try {
      await wastageApi.signZeroWastage({
        notes: zeroNotes.trim() || 'Verified zero food or material wastage today',
      });

      toast.success('Zero wastage verified and signed for today!');

      try {
        localStorage.removeItem(PNL_CACHE_KEY);
      } catch {}

      setHasRecordedToday(true);
      setZeroModalOpen(false);
      setZeroConfirmed(false);
      setZeroNotes('');

      window.dispatchEvent(new CustomEvent('peyala_wastage_updated'));
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to sign zero wastage');
    } finally {
      setSavingZero(false);
    }
  };

  // Only render if after 10 PM, today's wastage has not been recorded, and not in viewer demo mode
  if (!isAfter10PM || hasRecordedToday || user?.role === 'viewer') {
    return null;
  }

  return (
    <>
      {/* Persistent Top Prompt Banner */}
      <div className="w-full bg-gradient-to-r from-rose-700 via-amber-600 to-rose-600 text-white shadow-xl border-b-2 border-rose-300 z-50 animate-fadeIn">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Left: Icon & Alert Message */}
          <div className="flex items-center gap-3 text-center md:text-left">
            <div className="p-2 bg-black/20 rounded-xl flex-shrink-0 animate-pulse">
              <Clock className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                <span className="bg-yellow-300 text-gray-950 font-black text-[11px] px-2 py-0.5 rounded uppercase tracking-wider">
                  After 10:00 PM Closing Check
                </span>
                <span className="text-xs sm:text-sm font-black">
                  Today&apos;s wastage has not been recorded yet!
                </span>
              </div>
              <p className="text-xs text-rose-100 mt-0.5 max-w-2xl">
                Please log today&apos;s discarded items or sign zero wastage. This prompt will only disappear once recorded.
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-wrap justify-center flex-shrink-0">
            <button
              onClick={() => setRecordModalOpen(true)}
              className="bg-white text-rose-700 hover:bg-rose-50 font-bold text-xs sm:text-sm py-2 px-3.5 rounded-lg shadow transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4 text-rose-600" />
              Record Wastage
            </button>

            <button
              onClick={() => {
                setZeroConfirmed(false);
                setZeroModalOpen(true);
              }}
              className="bg-black/25 hover:bg-black/40 text-white border border-white/40 font-bold text-xs sm:text-sm py-2 px-3.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95"
            >
              <ShieldCheck className="w-4 h-4 text-yellow-300" />
              Sign Zero Wastage
            </button>
          </div>
        </div>
      </div>

      {/* Fast Record Wastage Modal */}
      {recordModalOpen && (
        <Modal
          open={recordModalOpen}
          onClose={() => setRecordModalOpen(false)}
          title="End-of-Day Wastage Entry"
        >
          <form onSubmit={handleRecordSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-200">
              Enter any spoiled dishes, burnt prep, or discarded raw materials from today.
            </div>

            {/* Core Field 1: Name of Item */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                1. Name of the Item <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Chicken Momo, Milk, Rice"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className="input w-full text-sm font-medium"
                autoFocus
              />
            </div>

            {/* Core Field 2: Quantity & Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                  2. Quantity (Qty) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="e.g. 3 or 1.5"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="input w-full text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="input w-full text-sm"
                >
                  {COMMON_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Core Field 3: Approximate Value (₹) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                3. Approximate Value (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="e.g. 250"
                  value={approxValue}
                  onChange={(e) => setApproxValue(e.target.value)}
                  className="input w-full pl-8 text-sm font-bold text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Optional Reason */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                Reason / Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Expired, Burnt, Leftover"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input w-full text-sm"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setRecordModalOpen(false)}
                className="btn-secondary text-sm py-2 px-4"
                disabled={savingRecord}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingRecord}
                className="btn-primary text-sm py-2 px-5 flex items-center gap-1.5"
              >
                {savingRecord && <RefreshCw className="w-4 h-4 animate-spin" />}
                {savingRecord ? 'Recording...' : 'Save Wastage & Dismiss Prompt'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Double Confirmation: Sign Zero Wastage Modal */}
      {zeroModalOpen && (
        <Modal
          open={zeroModalOpen}
          onClose={() => setZeroModalOpen(false)}
          title="Double Confirmation: Sign Zero Wastage"
        >
          <form onSubmit={handleSignZeroWastage} className="space-y-4">
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
                <span className="font-bold">Official Audit Verification: </span>
                You are verifying that the restaurant, kitchen prep stations, bar, and storage experienced{' '}
                <strong className="font-black text-rose-700 dark:text-rose-400">ZERO wastage or discarded food</strong> for today.
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={zeroConfirmed}
                  onChange={(e) => setZeroConfirmed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 leading-snug">
                  I confirm and certify that all stations have been verified and there was absolutely zero discarded food or material wastage today.
                </span>
              </label>

              <div className="text-[11px] text-gray-500 dark:text-gray-400 pl-7">
                Signed by: <strong className="text-gray-900 dark:text-white">{user?.name || 'Current User'}</strong> ({user?.role?.toUpperCase()}) on {today()}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                Optional Sign-off Remark
              </label>
              <input
                type="text"
                placeholder="e.g. All batch prep utilized, full stock accounted"
                value={zeroNotes}
                onChange={(e) => setZeroNotes(e.target.value)}
                className="input w-full text-xs"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setZeroModalOpen(false)}
                className="btn-secondary text-sm py-2 px-4"
                disabled={savingZero}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!zeroConfirmed || savingZero}
                className="btn-danger text-sm py-2 px-5 flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingZero ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {savingZero ? 'Signing...' : 'Yes, Confirm & Sign Zero Wastage'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
