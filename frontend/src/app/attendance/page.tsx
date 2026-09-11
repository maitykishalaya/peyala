'use client';
import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { attendanceApi, staffApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, getInitials } from '@/lib/utils';
import { CalendarCheck, ChevronLeft, ChevronRight, CalendarDays, Info } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const STATUS_CONFIG = {
  present: {
    label: 'P',
    text: 'Present',
    cellActive: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-emerald-700 shadow-xs',
    pill: 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    modalActive: 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-600/30',
    legendBadge: 'bg-emerald-600 text-white',
  },
  absent: {
    label: 'A',
    text: 'Absent',
    cellActive: 'bg-rose-600 hover:bg-rose-700 text-white font-bold border-rose-700 shadow-xs',
    pill: 'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    modalActive: 'bg-rose-600 text-white border-rose-700 shadow-xs ring-2 ring-rose-600/30',
    legendBadge: 'bg-rose-600 text-white',
  },
  leave: {
    label: 'L',
    text: 'Leave',
    cellActive: 'bg-amber-500 hover:bg-amber-600 text-white font-bold border-amber-600 shadow-xs',
    pill: 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    modalActive: 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-500/30',
    legendBadge: 'bg-amber-500 text-white',
  },
  halfday: {
    label: 'H',
    text: 'Half Day',
    cellActive: 'bg-blue-600 hover:bg-blue-700 text-white font-bold border-blue-700 shadow-xs',
    pill: 'bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    modalActive: 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-600/30',
    legendBadge: 'bg-blue-600 text-white',
  },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

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

function normalizeStatusValue(status?: string): StatusKey {
  if (status === 'halfday' || status === 'holiday') return 'halfday';
  if (status === 'present' || status === 'absent' || status === 'leave') return status;
  return 'present';
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
  const [form, setForm] = useState({ status: 'present' as StatusKey, note: '' });
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

  const notesSummary = useMemo(() => {
    const entries: Array<{ date: string; staff: string; status: string; note: string }> = [];

    activeStaff.forEach((member) => {
      const summary = summaries[member._id];
      const list = Array.isArray(summary?.notes) ? summary.notes : [];
      list.forEach((item: any) => {
        entries.push({
          date: item.date,
          staff: member.name,
          status: item.status,
          note: item.note,
        });
      });
    });

    return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activeStaff, summaries]);

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
    const normalizedStatus = normalizeStatusValue(record?.status);
    setSelected({ member, date: formatDateOnly(date), record });
    setForm({ status: normalizedStatus, note: record?.note || '' });
    setModalOpen(true);
  };

  const saveAttendance = async () => {
    if (!selected) return;

    const statusValue = normalizeStatusValue(form.status);

    if (selected.record?._id) {
      await attendanceApi.update(selected.record._id, {
        status: statusValue,
        note: form.note,
      });
    } else {
      await attendanceApi.mark({
        date: selected.date,
        status: statusValue,
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
      <div className="space-y-6">
        {/* Header and Month Controls */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-brand-600 dark:text-brand-400 mb-1">
              <CalendarDays className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span>Attendance Management</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Staff Attendance</h1>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 max-w-2xl mt-0.5">
              Daily staff presence tracking. Click any past cell to record or update attendance.
            </p>
          </div>

          {/* Month/Year Navigation */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = new Date(year, month - 2, 1);
                setMonth(next.getMonth() + 1);
                setYear(next.getFullYear());
              }}
              title="Previous Month"
              className="h-10 w-10 flex items-center justify-center rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-xs transition-colors"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>
            <div className="flex items-center gap-2 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 shadow-xs">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="bg-transparent text-sm font-bold text-gray-900 dark:text-white cursor-pointer focus:outline-none"
              >
                {MONTHS.map((label, index) => (
                  <option key={label} value={index + 1} className="text-gray-900 dark:text-white bg-white dark:bg-gray-900">{label}</option>
                ))}
              </select>
              <span className="text-gray-400 font-bold">/</span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-transparent text-sm font-bold text-gray-900 dark:text-white cursor-pointer focus:outline-none"
              >
                {YEARS.map((yearOption) => (
                  <option key={yearOption} value={yearOption} className="text-gray-900 dark:text-white bg-white dark:bg-gray-900">{yearOption}</option>
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
              title="Next Month"
              className="h-10 w-10 flex items-center justify-center rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-xs transition-colors"
            >
              <ChevronRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Main Grid: Attendance Table & Sidebar */}
        <div className="grid gap-6 lg:grid-cols-[1.85fr_0.75fr] items-start">
          {/* Attendance Table Card */}
          <div className="card border-2 border-gray-300 dark:border-gray-700 overflow-hidden p-0 shadow-md">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    {/* Sticky Staff Column Header */}
                    <th className="sticky left-0 z-20 bg-gray-100 dark:bg-gray-800 border-b-2 border-r-2 border-gray-300 dark:border-gray-700 px-4 py-3 text-left font-bold text-xs uppercase tracking-wider text-gray-800 dark:text-gray-200 w-[220px] shadow-[2px_0_5px_rgba(0,0,0,0.04)]">
                      Staff Member
                    </th>

                    {/* Day Headers */}
                    {days.map((day) => {
                      const date = new Date(year, month - 1, day);
                      const isFuture = date > today;
                      const isToday =
                        today.getFullYear() === year &&
                        today.getMonth() + 1 === month &&
                        today.getDate() === day;

                      return (
                        <th
                          key={day}
                          className={cn(
                            'text-center px-1.5 py-2.5 sticky top-0 border-b-2 border-gray-300 dark:border-gray-700 transition-colors',
                            isToday
                              ? 'bg-amber-100/70 dark:bg-amber-950/40 border-b-amber-500 text-amber-900 dark:text-amber-200'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                          )}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className={cn('text-xs font-black', isToday ? 'text-amber-900 dark:text-amber-300' : 'text-gray-900 dark:text-gray-100')}>
                              {day}
                            </span>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => bulkMarkPresentForDay(day)}
                                disabled={isFuture}
                                title={isFuture ? 'Future date' : `Mark all present for Day ${day}`}
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-black tracking-tight uppercase transition-all shadow-2xs',
                                  isFuture
                                    ? 'border border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-600 cursor-not-allowed bg-gray-50/50 dark:bg-gray-900/50'
                                    : 'border border-brand-500 bg-white hover:bg-brand-500 hover:text-white text-brand-700 dark:bg-gray-900 dark:border-brand-600 dark:text-brand-300 dark:hover:bg-brand-600 dark:hover:text-white'
                                )}
                              >
                                All
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-400 font-bold">—</span>
                            )}
                          </div>
                        </th>
                      );
                    })}

                    {/* Sticky Summary Column Header */}
                    <th className="sticky right-0 z-20 bg-gray-100 dark:bg-gray-800 border-b-2 border-l-2 border-gray-300 dark:border-gray-700 px-3 py-2.5 text-left font-bold text-xs uppercase tracking-wider text-gray-800 dark:text-gray-200 w-44 min-w-[150px] shadow-[-2px_0_5px_rgba(0,0,0,0.04)]">
                      Summary
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-gray-200 dark:divide-gray-800">
                  {activeStaff.map((member) => (
                    <tr
                      key={member._id}
                      className="hover:bg-brand-50/20 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      {/* Sticky Staff Info */}
                      <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 border-r-2 border-gray-300 dark:border-gray-700 px-4 py-3 shadow-[2px_0_5px_rgba(0,0,0,0.04)]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-xs shadow-xs shrink-0">
                            {getInitials(member.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-gray-900 dark:text-white truncate">
                              {member.name}
                            </div>
                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                              {member.position}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Day Cells */}
                      {days.map((day) => {
                        const record = attendanceMap[member._id]?.[day];
                        const date = new Date(year, month - 1, day);
                        date.setHours(0, 0, 0, 0);
                        const isFuture = date > today;
                        const recordStatus = normalizeStatusValue(record?.status);
                        const config = STATUS_CONFIG[recordStatus];

                        return (
                          <td key={day} className="px-1 py-2 text-center align-middle">
                            <button
                              type="button"
                              disabled={!canEdit || isFuture}
                              onClick={() => openCell(member, day)}
                              title={
                                isFuture
                                  ? 'Future date'
                                  : record
                                  ? `${config.text}${record.note ? `: ${record.note}` : ''}`
                                  : 'Click to mark attendance'
                              }
                              className={cn(
                                'mx-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all',
                                record
                                  ? config.cellActive
                                  : isFuture
                                  ? 'border border-gray-200 dark:border-gray-800 bg-gray-100/40 dark:bg-gray-900/30 text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-40'
                                  : 'border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/60 text-gray-400 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-600 cursor-pointer shadow-2xs'
                              )}
                            >
                              {record ? config.label : '·'}
                            </button>
                          </td>
                        );
                      })}

                      {/* Sticky Summary Cell */}
                      <td className="sticky right-0 z-10 bg-white dark:bg-gray-900 border-l-2 border-gray-300 dark:border-gray-700 px-3 py-2 shadow-[-2px_0_5px_rgba(0,0,0,0.04)] w-44 min-w-[150px]">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-gray-700 dark:text-gray-300">P</span>
                            <span className="font-bold text-gray-900 dark:text-white">
                              {summaries[member._id]?.presentMonth ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-gray-700 dark:text-gray-300">A</span>
                            <span className="font-bold text-red-600 dark:text-red-400">
                              {summaries[member._id]?.absentMonth ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-gray-700 dark:text-gray-300">H</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {summaries[member._id]?.halfDayMonth ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-gray-700 dark:text-gray-300">Leaves</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">
                              {summaries[member._id]?.leavesRemainingMonth ?? summaries[member._id]?.leavesRemaining ?? 0}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar: Legend, Notes, Bulk Actions */}
          <div className="space-y-5">
            {/* Legend Card */}
            <div className="card border-2 border-gray-300 dark:border-gray-700 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3 border-b-2 border-gray-200 dark:border-gray-800 pb-3">
                <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400">
                  <CalendarCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">Attendance Legend</h2>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Click any open date to set status</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {(Object.entries(STATUS_CONFIG) as [StatusKey, typeof STATUS_CONFIG[StatusKey]][]).map(([status, meta]) => (
                  <div
                    key={status}
                    className="flex items-center gap-2.5 p-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50"
                  >
                    <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-black shadow-xs shrink-0', meta.legendBadge)}>
                      {meta.label}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-gray-900 dark:text-white leading-tight capitalize">
                        {meta.text}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes Summary Card */}
            <div className="card border-2 border-gray-300 dark:border-gray-700 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b-2 border-gray-200 dark:border-gray-800 pb-2.5">
                <div className="text-xs uppercase tracking-wider text-gray-800 dark:text-gray-200 font-black flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-brand-600" />
                  <span>Notes & Remarks</span>
                </div>
                <span className="text-xs font-bold text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  {notesSummary.length}
                </span>
              </div>

              {notesSummary.length === 0 ? (
                <p className="py-2 text-xs font-medium text-gray-500 dark:text-gray-400 text-center">
                  No notes entered for this month yet.
                </p>
              ) : (
                <ul className="space-y-2.5 text-xs">
                  {notesSummary.slice(0, 6).map((note, index) => {
                    const statusKey = normalizeStatusValue(note.status);
                    const meta = STATUS_CONFIG[statusKey];
                    return (
                      <li
                        key={`${note.date}-${note.staff}-${index}`}
                        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                          <span className="text-gray-700 dark:text-gray-300 font-bold">{note.date}</span>
                          <span className="text-brand-700 dark:text-brand-400 font-bold">{note.staff}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-black uppercase shadow-2xs', meta.pill)}>
                            {meta.text}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs font-medium text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/60 p-2 rounded border border-gray-200 dark:border-gray-700">
                          {note.note}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Bulk Actions Card */}
            <div className="rounded-xl bg-blue-50/80 dark:bg-blue-950/40 p-4 border-2 border-blue-200 dark:border-blue-900/60 shadow-xs">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-blue-950 dark:text-blue-200 font-black">
                <Info className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>Quick Bulk Action</span>
              </div>
              <p className="mt-1.5 text-xs font-medium text-blue-900 dark:text-blue-300 leading-relaxed">
                Click <span className="font-bold text-brand-700 dark:text-brand-400 underline">"All"</span> at the top of any day column to instantly mark all active staff present for that date.
              </p>
            </div>

            {loading && (
              <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-4 text-xs font-bold text-gray-500 dark:text-gray-400 text-center animate-pulse">
                Updating attendance records...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Attendance Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selected ? `Mark Attendance — ${selected.member.name}` : 'Mark Attendance'}
        size="sm"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">Date:</span>
              <span className="text-sm font-black text-gray-900 dark:text-white">
                {formatDate(new Date(selected.date))}
              </span>
            </div>

            <div>
              <label className="label font-bold text-gray-900 dark:text-gray-200 mb-2">Select Status</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(Object.entries(STATUS_CONFIG) as [StatusKey, typeof STATUS_CONFIG[StatusKey]][]).map(([status, meta]) => {
                  const isSelected = form.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, status }))}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 text-xs font-bold transition-all shadow-xs',
                        isSelected
                          ? meta.modalActive
                          : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 items-center justify-center rounded text-xs font-black',
                          isSelected ? 'bg-white/20 text-white' : meta.legendBadge
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="capitalize">{meta.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label font-bold text-gray-900 dark:text-gray-200">Remarks / Note (Optional)</label>
              <textarea
                className="input h-24 border-2 border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-white"
                placeholder="Reason for leave, half-day shift note, etc."
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={saveAttendance}
                className="btn-primary flex-1 font-bold shadow-xs"
              >
                Save Attendance
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn-secondary font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
