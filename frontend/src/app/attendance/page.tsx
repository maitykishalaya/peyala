'use client';
import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { attendanceApi, staffApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, getInitials } from '@/lib/utils';
import { CalendarCheck, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABELS = {
  present: { label: 'P', color: 'badge-green' },
  absent: { label: 'A', color: 'badge-red' },
  leave: { label: 'L', color: 'badge-yellow' },
  holiday: { label: 'H', color: 'badge-blue' },
};

const SELECTED_CLASSES: Record<keyof typeof STATUS_LABELS, string> = {
  present: 'bg-green-600 text-white',
  absent: 'bg-red-600 text-white',
  leave: 'bg-yellow-600 text-white',
  holiday: 'bg-blue-600 text-white',
};

const YEARS = (() => {
  const current = new Date().getFullYear();
  return [current - 1, current, current + 1];
})();

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }

// Return local YYYY-MM-DD (avoid toISOString which converts to UTC and may shift date)
function formatDateOnly(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}-${pad(m)}-${pad(d)}`;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [staff, setStaff] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<Record<string, any>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ status: 'present', note: '' });
  const [loading, setLoading] = useState(false);

  const activeStaff = useMemo(() => staff.filter((member) => member.status === 'active'), [staff]);
  const canEdit = useMemo(() => ['admin', 'manager'].includes(user?.role || ''), [user]);

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);

  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<number, any>> = {};
    attendance.forEach((record) => {
      const staffId = record.staff?._id || record.staff;
      const day = new Date(record.date).getDate();
      map[staffId] = map[staffId] || {};
      map[staffId][day] = record;
    });
    return map;
  }, [attendance]);

  const loadStaff = async () => {
    const res = await staffApi.list();
    setStaff(res.data || []);
  };

  const loadAttendance = async () => {
    const res = await attendanceApi.getMonthly(month, year);
    setAttendance(res.data || []);
  };

  const loadSummaries = async () => {
    if (activeStaff.length === 0) {
      setSummaries({});
      return;
    }

    const list = await Promise.all(activeStaff.map(async (member) => {
      const res = await attendanceApi.getSummary(member._id, month, year);
      return { staffId: member._id, summary: res.data };
    }));

    setSummaries(Object.fromEntries(list.map((item) => [item.staffId, item.summary])));
  };

  useEffect(() => {
    loadStaff();
  }, []);

  useEffect(() => {
    if (activeStaff.length) {
      setLoading(true);
      Promise.all([loadAttendance(), loadSummaries()])
        .finally(() => setLoading(false));
    }
  }, [activeStaff, month, year]);

  const openCell = (member: any, day: number) => {
    if (!canEdit) return;
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    if (date > today) return;

    const record = attendanceMap[member._id]?.[day] || null;
    setSelected({ member, date: formatDateOnly(date), record });
    setForm({ status: record?.status || 'present', note: record?.note || '' });
    setModalOpen(true);
  };

  const saveAttendance = async () => {
    if (!selected) return;

    if (selected.record?._id) {
      await attendanceApi.update(selected.record._id, {
        status: form.status,
        note: form.note,
      });
    } else {
      await attendanceApi.mark({
        date: selected.date,
        status: form.status,
        note: form.note,
        staffId: selected.member._id,
      });
    }

    setModalOpen(false);
    await Promise.all([loadAttendance(), loadSummaries()]);
  };

  const bulkMarkPresentForDay = async (day: number) => {
    if (!canEdit) return;
    const dateValue = new Date(year, month - 1, day);
    dateValue.setHours(0, 0, 0, 0);
    if (dateValue > today) return;

    if (!window.confirm(`Mark all active staff present for ${formatDate(dateValue)}?`)) return;

    await attendanceApi.mark({
      date: formatDateOnly(dateValue),
      status: 'present',
      staffIds: activeStaff.map((member) => member._id),
    });

    await Promise.all([loadAttendance(), loadSummaries()]);
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
              <CalendarDays className="w-4 h-4" />
              <span>Attendance overview</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Staff Attendance</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
              Track attendance for your active staff. Click a day to mark present, absent, leave, or holiday. Admins and managers can edit records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const next = new Date(year, month - 2, 1);
                setMonth(next.getMonth() + 1);
                setYear(next.getFullYear());
              }}
              className="btn-secondary px-3 py-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="input !px-2 !py-1 text-sm"
              >
                {MONTHS.map((label, index) => (
                  <option key={label} value={index + 1}>{label}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="input !px-2 !py-1 text-sm"
              >
                {YEARS.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>{yearOption}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = new Date(year, month, 1);
                setMonth(next.getMonth() + 1);
                setYear(next.getFullYear());
              }}
              className="btn-secondary px-3 py-2"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.8fr_0.8fr]">
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="table-th sticky left-0 z-20 bg-white dark:bg-gray-900">Staff</th>
                    {days.map((day) => {
                      const date = new Date(year, month - 1, day);
                      const isFuture = date > today;
                      return (
                        <th key={day} className="table-th text-center px-2 py-2 sticky top-0 bg-white dark:bg-gray-900">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-medium">{day}</span>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => bulkMarkPresentForDay(day)}
                                disabled={isFuture}
                                className={cn(
                                  'rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors',
                                  isFuture ? 'border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-500 cursor-not-allowed' : 'border-brand-200 text-brand-700 hover:bg-brand-50 dark:border-brand-900 dark:text-brand-300 dark:hover:bg-brand-900/30'
                                )}
                              >
                                All
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th className="table-th sticky right-0 bg-white dark:bg-gray-900">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((member) => (
                    <tr key={member._id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950/40">
                      <td className="table-td sticky left-0 z-10 bg-white dark:bg-gray-900 w-[240px]">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold">
                            {getInitials(member.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 dark:text-white truncate">{member.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.position}</div>
                          </div>
                        </div>
                      </td>
                      {days.map((day) => {
                        const record = attendanceMap[member._id]?.[day];
                        const date = new Date(year, month - 1, day);
                        date.setHours(0, 0, 0, 0);
                        const isFuture = date > today;
                        const recordStatus = record?.status as keyof typeof STATUS_LABELS;

                        return (
                          <td key={day} className="table-td px-1.5 py-1 text-center">
                            <button
                              type="button"
                              disabled={!canEdit || isFuture}
                              onClick={() => openCell(member, day)}
                              className={cn(
                                'mx-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
                                record
                                  ? `${STATUS_LABELS[recordStatus].color} border-transparent text-white` : 'border-gray-200 bg-white dark:bg-gray-950 dark:border-gray-800 text-gray-400 hover:border-brand-300 dark:hover:border-brand-700',
                                isFuture && 'cursor-not-allowed opacity-40'
                              )}
                            >
                              {record ? STATUS_LABELS[recordStatus].label : ''}
                            </button>
                          </td>
                        );
                      })}
                      <td className="table-td sticky right-0 z-10 bg-white dark:bg-gray-900 w-40">
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">P</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{summaries[member._id]?.present ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">A</span>
                            <span className="font-semibold text-red-600">{summaries[member._id]?.absent ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-500">Leaves</span>
                            <span className="font-semibold text-yellow-600">{summaries[member._id]?.leavesRemainingMonth ?? summaries[member._id]?.leavesRemaining ?? 24}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <CalendarCheck className="w-5 h-5 text-brand-600" />
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Attendance legend</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Tap a cell to mark attendance for that day.</p>
              </div>
            </div>
            <div className="space-y-3">
              {Object.entries(STATUS_LABELS).map(([status, meta]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className={`${meta.color} inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold`}>{meta.label}</span>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white capitalize">{status}</div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : status === 'leave' ? 'Leave' : 'Holiday'}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-gray-950 p-4 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 font-semibold">Bulk actions</div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Click "All" in the day header to mark the entire active staff list present for that date.</p>
            </div>
            {loading && (
              <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-800 p-4 text-sm text-gray-500 dark:text-gray-400">Loading attendance...</div>
            )}
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={selected ? `Mark attendance — ${selected.member.name}` : 'Mark attendance'} size="sm">
        {selected && (
          <div className="space-y-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Date: <span className="font-medium text-gray-900 dark:text-white">{formatDate(new Date(selected.date))}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_LABELS).map(([status, meta]) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, status }))}
                  className={cn(
                    'rounded-lg border px-3 py-3 text-sm font-medium transition-colors',
                    form.status === status
                      ? `${SELECTED_CLASSES[status as keyof typeof STATUS_LABELS]} border-transparent`
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-600 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-700'
                  )}
                >
                  <span className={`${meta.color} inline-flex items-center justify-center rounded-md mr-2`}>{meta.label}</span>
                  <span className="capitalize">{status}</span>
                </button>
              ))}
            </div>

            <div>
              <label className="label">Note</label>
              <textarea
                className="input h-24"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={saveAttendance} className="btn-primary flex-1">Save</button>
              <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
