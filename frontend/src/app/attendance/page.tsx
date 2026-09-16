'use client';
import { useEffect, useMemo, useState, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import { attendanceApi, staffApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatDate, getInitials, formatCurrency } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  CalendarCheck, ChevronLeft, ChevronRight, CalendarDays, Info, RefreshCw,
  Clock, Plus, Pencil, CheckCircle2, AlertTriangle, ArrowRight, UserCheck, ShieldAlert, Check
} from 'lucide-react';

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

function formatHoursMinutes(hoursNum: number) {
  const totalMin = Math.round((hoursNum || 0) * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0 && m === 0) return '0 hrs';
  if (m === 0) return `${h} hrs`;
  if (h === 0) return `${m} mins`;
  return `${h}h ${m}m`;
}

function timeToMinutes(timeStr?: string) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return null;
  const [h, m] = timeStr.trim().split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function calculateShiftMinutes(entry?: string, exit?: string) {
  const entryMin = timeToMinutes(entry || '');
  const exitMin = timeToMinutes(exit || '');
  if (entryMin === null || exitMin === null) return 0;
  if (exitMin >= entryMin) {
    return exitMin - entryMin;
  } else {
    // Cross-midnight / overnight
    return (1440 - entryMin) + exitMin;
  }
}

const STAFF_CACHE_KEY = 'peyala_attendance_staff_cache_v1';
const getAttendanceCacheKey = (y: number, m: number) => `peyala_attendance_${y}_${m}_v1`;

function readCache(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // ignore
  }
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
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const todayColRef = useRef<HTMLTableCellElement>(null);

  const scrollToToday = () => {
    if (todayColRef.current) {
      todayColRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } else if (tableContainerRef.current) {
      const targetDay = today.getDate();
      const approxOffset = Math.max(0, (targetDay - 2) * 40);
      tableContainerRef.current.scrollTo({ left: approxOffset, behavior: 'smooth' });
    }
  };

  const scrollToSummary = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: tableContainerRef.current.scrollWidth, behavior: 'smooth' });
    }
  };

  const scrollToStaff = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const activeStaff = useMemo(() => staff.filter((member) => member.status === 'active'), [staff]);
  const canEdit = useMemo(() => ['admin', 'manager'].includes(user?.role || ''), [user]);

  // ── Duty & Shift Time Tracking State ─────────────────────────────
  const [selectedLogDate, setSelectedLogDate] = useState(formatDateOnly(today));
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [timeLogsLoading, setTimeLogsLoading] = useState(false);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [timeModalStaff, setTimeModalStaff] = useState<any>(null);
  const [timeSaving, setTimeSaving] = useState(false);
  const [timeForm, setTimeForm] = useState({
    staffId: '',
    date: formatDateOnly(today),
    dutyHours: '10',
    dailySalary: '',
    shift1: { entry: '', exit: '' },
    shift2: { entry: '', exit: '' },
    hasSecondShift: false,
    penaltyReason: '',
    penaltyAmount: '',
    note: '',
  });

  const loadDayTimeLogs = async (dateStr = selectedLogDate) => {
    setTimeLogsLoading(true);
    try {
      const res = await attendanceApi.getDayTimeLogs(dateStr);
      setTimeLogs(res.data?.logs || []);
    } catch (err) {
      console.error('Failed to load day time logs:', err);
    } finally {
      setTimeLogsLoading(false);
    }
  };

  useEffect(() => {
    loadDayTimeLogs(selectedLogDate);
  }, [selectedLogDate]);

  const openTimeModal = (member?: any, existingRecord?: any) => {
    const targetMember = member || activeStaff[0];
    if (!targetMember) {
      toast.error('No active staff found');
      return;
    }
    setTimeModalStaff(targetMember);

    const defaultSalary = existingRecord?.dailySalary
      ? String(existingRecord.dailySalary)
      : targetMember.dailySalary
      ? String(targetMember.dailySalary)
      : targetMember.monthlySalary
      ? String(Math.round(targetMember.monthlySalary / 30))
      : '';

    const defaultDuty = existingRecord?.dutyHours
      ? String(existingRecord.dutyHours)
      : targetMember.defaultDutyHours
      ? String(targetMember.defaultDutyHours)
      : '10';

    const hasShift2 = Boolean(
      (existingRecord?.shift2?.entry && existingRecord?.shift2?.entry.trim() !== '') ||
      (existingRecord?.shift2?.exit && existingRecord?.shift2?.exit.trim() !== '')
    );

    setTimeForm({
      staffId: targetMember._id,
      date: selectedLogDate,
      dutyHours: defaultDuty,
      dailySalary: defaultSalary,
      shift1: {
        entry: existingRecord?.shift1?.entry || '',
        exit: existingRecord?.shift1?.exit || '',
      },
      shift2: {
        entry: existingRecord?.shift2?.entry || '',
        exit: existingRecord?.shift2?.exit || '',
      },
      hasSecondShift: hasShift2,
      penaltyReason: existingRecord?.penaltyReason || '',
      penaltyAmount: existingRecord?.penaltyAmount ? String(existingRecord.penaltyAmount) : '',
      note: existingRecord?.note || '',
    });
    setTimeModalOpen(true);
  };

  const handleStaffChangeInModal = (staffId: string) => {
    const foundStaff = activeStaff.find((s) => s._id === staffId);
    if (!foundStaff) return;
    setTimeModalStaff(foundStaff);

    // Look for existing record in timeLogs
    const logItem = timeLogs.find((l) => (l.staff?._id || l.staff) === staffId);
    const existingRecord = logItem?.record;

    const defaultSalary = existingRecord?.dailySalary
      ? String(existingRecord.dailySalary)
      : foundStaff.dailySalary
      ? String(foundStaff.dailySalary)
      : foundStaff.monthlySalary
      ? String(Math.round(foundStaff.monthlySalary / 30))
      : '';

    const defaultDuty = existingRecord?.dutyHours
      ? String(existingRecord.dutyHours)
      : foundStaff.defaultDutyHours
      ? String(foundStaff.defaultDutyHours)
      : '10';

    const hasShift2 = Boolean(
      (existingRecord?.shift2?.entry && existingRecord?.shift2?.entry.trim() !== '') ||
      (existingRecord?.shift2?.exit && existingRecord?.shift2?.exit.trim() !== '')
    );

    setTimeForm((prev) => ({
      ...prev,
      staffId,
      dutyHours: defaultDuty,
      dailySalary: defaultSalary,
      shift1: {
        entry: existingRecord?.shift1?.entry || '',
        exit: existingRecord?.shift1?.exit || '',
      },
      shift2: {
        entry: existingRecord?.shift2?.entry || '',
        exit: existingRecord?.shift2?.exit || '',
      },
      hasSecondShift: hasShift2,
      penaltyReason: existingRecord?.penaltyReason || '',
      penaltyAmount: existingRecord?.penaltyAmount ? String(existingRecord.penaltyAmount) : '',
      note: existingRecord?.note || '',
    }));
  };

  // Live real-time calculations inside modal
  const timeCalc = useMemo(() => {
    const shift1Min = calculateShiftMinutes(timeForm.shift1.entry, timeForm.shift1.exit);
    const shift2Min = timeForm.hasSecondShift
      ? calculateShiftMinutes(timeForm.shift2.entry, timeForm.shift2.exit)
      : 0;
    const totalMinutes = shift1Min + shift2Min;
    const totalPresentHours = +(totalMinutes / 60).toFixed(2);
    const dutyHours = parseFloat(timeForm.dutyHours) || 0;
    const absentHours = Math.max(0, +(dutyHours - totalPresentHours).toFixed(2));
    const dailySalary = parseFloat(timeForm.dailySalary) || 0;
    const hourlyRate = dutyHours > 0 ? +(dailySalary / dutyHours).toFixed(2) : 0;
    const deductionAmount = +(absentHours * hourlyRate).toFixed(2);
    const penaltyAmount = Math.max(0, parseFloat(timeForm.penaltyAmount) || 0);
    const payableAmount = Math.max(0, +(dailySalary - deductionAmount - penaltyAmount).toFixed(2));
    const hasEntry = Boolean(
      (timeForm.shift1.entry && timeForm.shift1.entry.trim() !== '') ||
      (timeForm.hasSecondShift && timeForm.shift2.entry && timeForm.shift2.entry.trim() !== '')
    );
    const autoStatus = hasEntry ? 'present' : 'absent';

    return {
      shift1Min,
      shift2Min,
      totalMinutes,
      totalPresentHours,
      dutyHours,
      absentHours,
      dailySalary,
      hourlyRate,
      deductionAmount,
      penaltyAmount,
      payableAmount,
      hasEntry,
      autoStatus,
    };
  }, [timeForm]);

  const saveTimeLog = async () => {
    if (!timeForm.staffId) {
      toast.error('Please select a staff member');
      return;
    }
    if (!timeForm.date) {
      toast.error('Please select a date');
      return;
    }
    const numDuty = parseFloat(timeForm.dutyHours);
    if (isNaN(numDuty) || numDuty <= 0) {
      toast.error('Target duty hours is mandatory and must be greater than 0');
      return;
    }
    const numDailySalary = parseFloat(timeForm.dailySalary);
    if (isNaN(numDailySalary) || numDailySalary <= 0) {
      toast.error('Gross daily salary is mandatory and must be greater than 0');
      return;
    }

    setTimeSaving(true);
    try {
      await attendanceApi.logTime({
        staffId: timeForm.staffId,
        date: timeForm.date,
        dutyHours: numDuty,
        dailySalary: numDailySalary,
        shift1: timeForm.shift1,
        shift2: timeForm.hasSecondShift ? timeForm.shift2 : { entry: '', exit: '' },
        penaltyReason: timeForm.penaltyReason.trim(),
        penaltyAmount: Math.max(0, parseFloat(timeForm.penaltyAmount) || 0),
        note: timeForm.note,
      });

      const memberName = activeStaff.find((s) => s._id === timeForm.staffId)?.name || 'staff';
      toast.success(`Duty time & attendance updated for ${memberName}`);
      setTimeModalOpen(false);

      // Refresh both day logs and monthly calendar
      await Promise.all([
        loadDayTimeLogs(selectedLogDate),
        loadData(true),
      ]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save duty time log');
    } finally {
      setTimeSaving(false);
    }
  };

  const handlePrevLogDate = () => {
    const cur = new Date(selectedLogDate);
    cur.setDate(cur.getDate() - 1);
    setSelectedLogDate(formatDateOnly(cur));
  };

  const handleNextLogDate = () => {
    const cur = new Date(selectedLogDate);
    cur.setDate(cur.getDate() + 1);
    if (cur > today) {
      toast.warning('Cannot view future dates');
      return;
    }
    setSelectedLogDate(formatDateOnly(cur));
  };

  const handleTodayLogDate = () => {
    setSelectedLogDate(formatDateOnly(today));
  };

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

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setLoading(true);
    try {
      let currentStaff = staff;
      if (!currentStaff.length || isManual) {
        const staffRes = await staffApi.list();
        currentStaff = staffRes.data || [];
        setStaff(currentStaff);
        writeCache(STAFF_CACHE_KEY, { staff: currentStaff });
      }

      const active = currentStaff.filter((member: any) => member.status === 'active');

      const [attRes, sumList] = await Promise.all([
        attendanceApi.getMonthly(month, year),
        Promise.all(active.map(async (member: any) => {
          const res = await attendanceApi.getSummary(member._id, month, year);
          return { staffId: member._id, summary: res.data };
        }))
      ]);

      const attData = attRes.data || [];
      const sumMap = Object.fromEntries(sumList.map((item: any) => [item.staffId, item.summary]));

      setAttendance(attData);
      setSummaries(sumMap);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      writeCache(getAttendanceCacheKey(year, month), { attendance: attData, summaries: sumMap });
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let currentStaff = staff;
    if (!currentStaff.length) {
      const cachedStaff = readCache(STAFF_CACHE_KEY);
      if (cachedStaff?.staff) {
        currentStaff = cachedStaff.staff;
        setStaff(currentStaff);
      }
    }

    const cacheKey = getAttendanceCacheKey(year, month);
    const cachedAtt = readCache(cacheKey);
    if (cachedAtt?.attendance && currentStaff.length) {
      setAttendance(cachedAtt.attendance);
      setSummaries(cachedAtt.summaries || {});
      if (cachedAtt.savedAt) {
        setLastUpdated(new Date(cachedAtt.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
      setLoading(false);
      return;
    }

    loadData();
  }, [month, year]);

  useEffect(() => {
    if (today.getMonth() + 1 === month && today.getFullYear() === year) {
      const timer = setTimeout(() => {
        scrollToToday();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [month, year, attendance.length]);

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
    setSaving(true);
    try {
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

      toast.success(`Marked ${STATUS_CONFIG[statusValue].text} for ${selected.member?.name || 'staff'}`);
      setModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update attendance');
    } finally {
      setSaving(false);
    }
  };

  const bulkMarkPresentForDay = async (day: number) => {
    if (!canEdit) return;
    const dateValue = new Date(year, month - 1, day);
    dateValue.setHours(0, 0, 0, 0);
    if (dateValue > today) return;

    if (!window.confirm(`Mark all active staff present for ${formatDate(dateValue)}?`)) return;

    try {
      await attendanceApi.mark({
        date: formatDateOnly(dateValue),
        status: 'present',
        staffIds: activeStaff.map((member) => member._id),
      });

      toast.success(`Marked all active staff present for ${formatDate(dateValue)}`);
      await loadData(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to mark attendance');
    }
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
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline ml-1">
                Cached ({lastUpdated})
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(getAttendanceCacheKey(year, month));
                loadData(true);
              }}
              disabled={refreshing}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              title="Fetch latest data from server"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin text-brand-500")} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Main Grid: Attendance Table & Sidebar */}
        <div className="grid gap-6 lg:grid-cols-[1.85fr_0.75fr] items-start">
          {/* Attendance Table Card */}
          <div className="card border-2 border-gray-300 dark:border-gray-700 overflow-hidden p-0 shadow-md">
            {/* Mobile quick scroll & navigation bar */}
            <div className="lg:hidden flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-brand-50/80 dark:bg-gray-800/80 border-b-2 border-gray-200 dark:border-gray-700 text-xs">
              <span className="text-gray-600 dark:text-gray-400 font-medium text-[11px] sm:text-xs">
                👈 <strong className="text-brand-600 dark:text-brand-400">Swipe</strong> to scroll days 👉
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={scrollToStaff}
                  className="px-2 py-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded text-[11px] font-bold shadow-2xs hover:bg-gray-100"
                >
                  Staff
                </button>
                <button
                  type="button"
                  onClick={scrollToToday}
                  className="px-2 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded text-[11px] font-bold shadow-2xs"
                >
                  📅 Today ({today.getDate()})
                </button>
                <button
                  type="button"
                  onClick={scrollToSummary}
                  className="px-2 py-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded text-[11px] font-bold shadow-2xs hover:bg-gray-100"
                >
                  Summary 📊
                </button>
              </div>
            </div>

            <div ref={tableContainerRef} className="overflow-x-auto scroll-smooth">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    {/* Sticky Staff Column Header — compact on mobile */}
                    <th className="sticky left-0 z-20 bg-gray-100 dark:bg-gray-800 border-b-2 border-r-2 border-gray-300 dark:border-gray-700 px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left font-bold text-xs uppercase tracking-wider text-gray-800 dark:text-gray-200 w-28 sm:w-40 md:w-56 shadow-[2px_0_5px_rgba(0,0,0,0.06)]">
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
                          ref={isToday ? todayColRef : undefined}
                          className={cn(
                            'text-center px-1 sm:px-1.5 py-2 sm:py-2.5 sticky top-0 border-b-2 border-gray-300 dark:border-gray-700 transition-colors min-w-[36px] sm:min-w-[42px]',
                            isToday
                              ? 'bg-amber-100/80 dark:bg-amber-950/50 border-b-amber-500 text-amber-900 dark:text-amber-200'
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

                    {/* Summary Column Header — only sticky on desktop (lg:) so mobile scroll is never blocked */}
                    <th className="lg:sticky lg:right-0 z-10 lg:z-20 bg-gray-100 dark:bg-gray-800 border-b-2 border-l-2 border-gray-300 dark:border-gray-700 px-3 py-2.5 text-left font-bold text-xs uppercase tracking-wider text-gray-800 dark:text-gray-200 w-36 sm:w-44 min-w-[130px] sm:min-w-[150px] lg:shadow-[-2px_0_5px_rgba(0,0,0,0.06)]">
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
                      {/* Sticky Staff Info — responsive width on mobile */}
                      <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 border-r-2 border-gray-300 dark:border-gray-700 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 shadow-[2px_0_5px_rgba(0,0,0,0.06)] w-28 sm:w-40 md:w-56 max-w-[115px] sm:max-w-none">
                        <div className="flex items-center gap-1.5 sm:gap-3">
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-[10px] sm:text-xs shadow-xs shrink-0">
                            {getInitials(member.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate leading-tight">
                              {member.name}
                            </div>
                            <div className="text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 truncate hidden sm:block">
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
                          <td key={day} className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center align-middle min-w-[36px] sm:min-w-[42px]">
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

                      {/* Summary Cell — only sticky on desktop (lg:) so mobile scroll is never blocked */}
                      <td className="lg:sticky lg:right-0 z-10 bg-white dark:bg-gray-900 border-l-2 border-gray-300 dark:border-gray-700 px-2.5 sm:px-3 py-2 lg:shadow-[-2px_0_5px_rgba(0,0,0,0.06)] w-36 sm:w-44 min-w-[130px] sm:min-w-[150px]">
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">P:</span>
                            <span className="font-bold text-gray-900 dark:text-white">
                              {summaries[member._id]?.presentMonth ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-rose-700 dark:text-rose-400">A:</span>
                            <span className="font-bold text-red-600 dark:text-red-400">
                              {summaries[member._id]?.absentMonth ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-blue-700 dark:text-blue-400">H:</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {summaries[member._id]?.halfDayMonth ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-amber-700 dark:text-amber-400">L:</span>
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

        {/* ── Section: Staff Duty & Shift Time Tracking (Entry / Exit / 2 Shifts) ── */}
        <div className="card p-4 sm:p-6 border-2 border-indigo-100 dark:border-indigo-950/60 bg-gradient-to-b from-white to-indigo-50/20 dark:from-gray-900 dark:to-gray-900/60 space-y-5">
          {/* Header & Date Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                <Clock className="w-4 h-4" />
                <span>Duty & Shift Time Tracking</span>
                <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 text-[10px] px-2 py-0.5 rounded-full font-bold">Manager & Admin Only</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
                Daily Shift Timings & Pro-Rata Salary Deduction
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl leading-relaxed">
                Log 1 or 2 shift entry and exit times. Target duty hours is mandatory. The system calculates duty shortage and suggests daily salary deductions based on hours worked.
              </p>
            </div>

            {/* Date Selector & Action */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-300 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handlePrevLogDate}
                  className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="date"
                  max={formatDateOnly(today)}
                  value={selectedLogDate}
                  onChange={(e) => setSelectedLogDate(e.target.value)}
                  className="bg-transparent text-xs font-black px-2 py-1 text-gray-900 dark:text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleNextLogDate}
                  disabled={selectedLogDate >= formatDateOnly(today)}
                  className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next Day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleTodayLogDate}
                className="btn-secondary text-xs font-bold py-2 px-3"
              >
                Today
              </button>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => openTimeModal()}
                  className="btn-primary text-xs font-bold py-2 px-3.5 flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Log Staff Duty</span>
                </button>
              )}
            </div>
          </div>

          {!canEdit && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Read-only mode. Managers and Administrators can add or edit entry/exit timings, duty hours, and deductions.</span>
            </div>
          )}

          {/* Daily Table of Staff Shift Times */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/80 dark:bg-gray-800/80 text-[11px] font-black uppercase tracking-wider text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="py-3 px-3.5">Staff Member</th>
                  <th className="py-3 px-3 text-center">Shift 1 (Entry - Exit)</th>
                  <th className="py-3 px-3 text-center">Shift 2 (Entry - Exit)</th>
                  <th className="py-3 px-3 text-center">Duty Target</th>
                  <th className="py-3 px-3 text-center">Present Duty</th>
                  <th className="py-3 px-3 text-center">Shortage / Absent</th>
                  <th className="py-3 px-3 text-right">Daily Salary</th>
                  <th className="py-3 px-3 text-right">Deduction</th>
                  <th className="py-3 px-3 text-right">Day Net Pay</th>
                  <th className="py-3 px-3 text-center">Attendance</th>
                  {canEdit && <th className="py-3 px-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                {timeLogsLoading ? (
                  <tr>
                    <td colSpan={canEdit ? 11 : 10} className="py-8 text-center text-gray-400 font-bold">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                      Loading shift time records for {selectedLogDate}...
                    </td>
                  </tr>
                ) : timeLogs.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 11 : 10} className="py-8 text-center text-gray-400 font-medium">
                      No active staff found.
                    </td>
                  </tr>
                ) : (
                  timeLogs.map(({ staff: member, record }: any) => {
                    const hasRecord = Boolean(record && (record.dutyHours || record.shift1?.entry));
                    const isPresent = record?.status === 'present';
                    const hasShortage = record?.absentHours > 0;

                    return (
                      <tr
                        key={member._id}
                        className="hover:bg-indigo-50/30 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        {/* Staff */}
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                              {getInitials(member.name)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 dark:text-white leading-tight">{member.name}</p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">{member.position}</p>
                            </div>
                          </div>
                        </td>

                        {/* Shift 1 */}
                        <td className="py-3 px-3 text-center">
                          {record?.shift1?.entry ? (
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                              {record.shift1.entry} <span className="text-gray-400">→</span> {record.shift1.exit || 'Active'}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* Shift 2 */}
                        <td className="py-3 px-3 text-center">
                          {record?.shift2?.entry ? (
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                              {record.shift2.entry} <span className="text-gray-400">→</span> {record.shift2.exit || 'Active'}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* Target Duty */}
                        <td className="py-3 px-3 text-center font-bold text-gray-700 dark:text-gray-300">
                          {record?.dutyHours ? `${record.dutyHours}h` : member.defaultDutyHours ? `${member.defaultDutyHours}h` : '—'}
                        </td>

                        {/* Present Duty */}
                        <td className="py-3 px-3 text-center">
                          {hasRecord ? (
                            <span className="font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded">
                              {formatHoursMinutes(record.totalPresentHours)}
                            </span>
                          ) : (
                            <span className="text-gray-400">0h</span>
                          )}
                        </td>

                        {/* Shortage / Absent */}
                        <td className="py-3 px-3 text-center">
                          {hasRecord ? (
                            hasShortage ? (
                              <span className="font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded text-[11px]">
                                -{formatHoursMinutes(record.absentHours)}
                              </span>
                            ) : (
                              <span className="font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded text-[11px] inline-flex items-center justify-center gap-1">
                                <Check className="w-3 h-3" /> Full Duty
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400 text-[11px]">Not logged</span>
                          )}
                        </td>

                        {/* Daily Salary */}
                        <td className="py-3 px-3 text-right font-medium text-gray-700 dark:text-gray-300">
                          {record?.dailySalary
                            ? formatCurrency(record.dailySalary)
                            : member.dailySalary
                            ? formatCurrency(member.dailySalary)
                            : member.monthlySalary
                            ? `~${formatCurrency(Math.round(member.monthlySalary / 30))}`
                            : '—'}
                        </td>

                        {/* Deduction */}
                        <td className="py-3 px-3 text-right">
                          {hasRecord && ((record?.deductionAmount > 0) || (record?.penaltyAmount > 0)) ? (
                            <div className="flex flex-col items-end">
                              {record?.deductionAmount > 0 && (
                                <span className="font-black text-rose-600 dark:text-rose-400">
                                  -{formatCurrency(record.deductionAmount)}
                                </span>
                              )}
                              {record?.penaltyAmount > 0 && (
                                <span
                                  className="text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded mt-0.5"
                                  title={record.penaltyReason ? `Penalty: ${record.penaltyReason}` : 'Penalty applied'}
                                >
                                  Penalty: -{formatCurrency(record.penaltyAmount)}
                                </span>
                              )}
                            </div>
                          ) : hasRecord ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">₹0</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* Day Net Pay */}
                        <td className="py-3 px-3 text-right font-black text-emerald-700 dark:text-emerald-300">
                          {hasRecord && record?.payableAmount !== undefined ? (
                            formatCurrency(record.payableAmount)
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* Attendance Status */}
                        <td className="py-3 px-3 text-center">
                          {record?.status ? (
                            <span
                              className={cn(
                                'inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-black uppercase shadow-2xs',
                                STATUS_CONFIG[record.status as StatusKey]?.pill || 'bg-gray-100 text-gray-700'
                              )}
                            >
                              {STATUS_CONFIG[record.status as StatusKey]?.text || record.status}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-[11px] italic">Unmarked</span>
                          )}
                        </td>

                        {/* Action */}
                        {canEdit && (
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => openTimeModal(member, record)}
                              className="btn-secondary py-1 px-2.5 text-xs font-bold inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                              title="Log / Edit Duty Times"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>{hasRecord ? 'Edit' : 'Log'}</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Daily Aggregate KPI Bar */}
          {!timeLogsLoading && timeLogs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                <span className="text-[10px] font-black uppercase text-gray-400">Staff Active</span>
                <p className="text-base font-black text-gray-900 dark:text-white mt-0.5">{timeLogs.length}</p>
              </div>

              <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400">Total Present</span>
                <p className="text-base font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
                  {formatHoursMinutes(timeLogs.reduce((sum, l) => sum + (l.record?.totalPresentHours || 0), 0))}
                </p>
              </div>

              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Total Shortage</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {formatHoursMinutes(timeLogs.reduce((sum, l) => sum + (l.record?.absentHours || 0), 0))}
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                <span className="text-[10px] font-black uppercase text-gray-400">Total Daily Gross</span>
                <p className="text-base font-black text-gray-900 dark:text-white mt-0.5">
                  {formatCurrency(timeLogs.reduce((sum, l) => sum + (l.record?.dailySalary || 0), 0))}
                </p>
              </div>

              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Total Deductions</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  -{formatCurrency(timeLogs.reduce((sum, l) => sum + (l.record?.deductionAmount || 0) + (l.record?.penaltyAmount || 0), 0))}
                </p>
              </div>

              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Net Day Payable</span>
                <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {formatCurrency(timeLogs.reduce((sum, l) => sum + (l.record?.payableAmount || 0), 0))}
                </p>
              </div>
            </div>
          )}
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
                disabled={saving}
                className="btn-primary flex-1 font-bold shadow-xs disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                {saving ? 'Saving Attendance...' : 'Save Attendance'}
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="btn-secondary font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Log Staff Duty Time ── */}
      <Modal
        open={timeModalOpen}
        onClose={() => setTimeModalOpen(false)}
        title="Log Staff Shift Timing & Duty"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveTimeLog();
          }}
          className="space-y-4"
        >
          {/* Staff & Date Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label font-bold text-gray-900 dark:text-gray-200">Staff Member *</label>
              <select
                value={timeForm.staffId}
                onChange={(e) => handleStaffChangeInModal(e.target.value)}
                className="input font-semibold"
                required
              >
                {activeStaff.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.position})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label font-bold text-gray-900 dark:text-gray-200">Duty Date *</label>
              <input
                type="date"
                max={formatDateOnly(today)}
                value={timeForm.date}
                onChange={(e) => setTimeForm((prev) => ({ ...prev, date: e.target.value }))}
                className="input font-semibold"
                required
              />
            </div>
          </div>

          {/* Mandatory Duty Hours & Mandatory Daily Salary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
            <div>
              <label className="label font-bold text-indigo-950 dark:text-indigo-200 flex items-center justify-between">
                <span>Target Duty Hours *</span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase font-black">Mandatory</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  required
                  value={timeForm.dutyHours}
                  onChange={(e) => setTimeForm((prev) => ({ ...prev, dutyHours: e.target.value }))}
                  placeholder="e.g. 10"
                  className="input font-black text-base pr-10"
                />
                <span className="absolute right-3 top-2.5 text-xs text-gray-400 font-bold">hours</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Mandatory duty duration threshold (e.g. 10)</p>
            </div>

            <div>
              <label className="label font-bold text-indigo-950 dark:text-indigo-200 flex items-center justify-between">
                <span>Gross Daily Salary (₹) *</span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase font-black">Mandatory</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={timeForm.dailySalary}
                  onChange={(e) => setTimeForm((prev) => ({ ...prev, dailySalary: e.target.value }))}
                  placeholder="e.g. 300"
                  className="input font-black text-base pl-7"
                />
                <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">₹</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Mandatory daily wage for pro-rata deduction</p>
            </div>
          </div>

          {/* Shift 1 Timings */}
          <div className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Shift 1 (Primary Duty)
              </span>
              <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                {timeCalc.shift1Min > 0 ? formatHoursMinutes(timeCalc.shift1Min / 60) : '0 hrs'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400">Entry Time</label>
                <input
                  type="time"
                  value={timeForm.shift1.entry}
                  onChange={(e) =>
                    setTimeForm((prev) => ({
                      ...prev,
                      shift1: { ...prev.shift1, entry: e.target.value },
                    }))
                  }
                  className="input font-bold text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400">Exit Time</label>
                <input
                  type="time"
                  value={timeForm.shift1.exit}
                  onChange={(e) =>
                    setTimeForm((prev) => ({
                      ...prev,
                      shift1: { ...prev.shift1, exit: e.target.value },
                    }))
                  }
                  className="input font-bold text-sm"
                />
              </div>
            </div>
          </div>

          {/* Shift 2 Option (Split Duty) */}
          <div className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={timeForm.hasSecondShift}
                  onChange={(e) =>
                    setTimeForm((prev) => ({
                      ...prev,
                      hasSecondShift: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <span>Enable Shift 2 (for split duty staff)</span>
              </label>
              {timeForm.hasSecondShift && (
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                  {timeCalc.shift2Min > 0 ? formatHoursMinutes(timeCalc.shift2Min / 60) : '0 hrs'}
                </span>
              )}
            </div>

            {timeForm.hasSecondShift && (
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400">Shift 2 Entry</label>
                  <input
                    type="time"
                    value={timeForm.shift2.entry}
                    onChange={(e) =>
                      setTimeForm((prev) => ({
                        ...prev,
                        shift2: { ...prev.shift2, entry: e.target.value },
                      }))
                    }
                    className="input font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400">Shift 2 Exit</label>
                  <input
                    type="time"
                    value={timeForm.shift2.exit}
                    onChange={(e) =>
                      setTimeForm((prev) => ({
                        ...prev,
                        shift2: { ...prev.shift2, exit: e.target.value },
                      }))
                    }
                    className="input font-bold text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Penalty Section */}
          <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-rose-900 dark:text-rose-300">
                  Penalty
                </span>
              </div>
              {timeCalc.penaltyAmount > 0 && (
                <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                  -₹{timeCalc.penaltyAmount}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  Penalty Reason
                </label>
                <input
                  type="text"
                  value={timeForm.penaltyReason}
                  onChange={(e) => setTimeForm((prev) => ({ ...prev, penaltyReason: e.target.value }))}
                  placeholder="e.g. Late arrival, uniform violation, breakage"
                  className="input font-medium text-sm"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 block mb-1">
                  Penalty Amount (₹)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={timeForm.penaltyAmount}
                    onChange={(e) => setTimeForm((prev) => ({ ...prev, penaltyAmount: e.target.value }))}
                    placeholder="0"
                    className="input font-black text-base pl-7"
                  />
                  <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">₹</span>
                </div>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="label font-bold text-gray-900 dark:text-gray-200">Duty Remarks / Note</label>
            <input
              type="text"
              value={timeForm.note}
              onChange={(e) => setTimeForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="e.g. Left early due to emergency, split duty completed"
              className="input font-medium text-sm"
            />
          </div>

          {/* Real-time Calculation Card */}
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/80 border-2 border-indigo-200 dark:border-indigo-900/60 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
              <span className="text-xs font-black uppercase text-gray-500 tracking-wider">Live Calculation Breakdown</span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-black uppercase shadow-2xs',
                  STATUS_CONFIG[timeCalc.autoStatus as StatusKey]?.pill
                )}
              >
                Auto Status: {STATUS_CONFIG[timeCalc.autoStatus as StatusKey]?.text}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-gray-500 font-medium">Target Duty:</span>
                <p className="font-bold text-gray-800 dark:text-gray-200">{timeCalc.dutyHours} hrs</p>
              </div>
              <div>
                <span className="text-gray-500 font-medium">Total Present:</span>
                <p className="font-bold text-indigo-700 dark:text-indigo-300">{formatHoursMinutes(timeCalc.totalPresentHours)}</p>
              </div>
              <div>
                <span className="text-gray-500 font-medium">Duty Shortage:</span>
                <p className={cn('font-bold', timeCalc.absentHours > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                  {timeCalc.absentHours > 0 ? `-${formatHoursMinutes(timeCalc.absentHours)}` : 'None (0h)'}
                </p>
              </div>
              <div>
                <span className="text-gray-500 font-medium">Hourly Rate:</span>
                <p className="font-bold text-gray-800 dark:text-gray-200">{formatCurrency(timeCalc.hourlyRate)}/hr</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 text-sm font-black">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs font-medium">Shortage Deduction:</span>
                  <span className={cn('text-xs font-bold', timeCalc.deductionAmount > 0 ? 'text-rose-600' : 'text-gray-700 dark:text-gray-300')}>
                    {timeCalc.deductionAmount > 0 ? `-${formatCurrency(timeCalc.deductionAmount)}` : '₹0'}
                  </span>
                </div>
                {timeCalc.penaltyAmount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs font-medium">Penalty Fine:</span>
                    <span className="text-xs font-black text-rose-600">
                      -{formatCurrency(timeCalc.penaltyAmount)}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="text-gray-500 text-xs font-medium block">Net Day Payable:</span>
                <span className="text-lg text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(timeCalc.payableAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={timeSaving}
              className="btn-primary flex-1 font-bold py-2.5 flex items-center justify-center gap-2 shadow-xs disabled:opacity-60"
            >
              {timeSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {timeSaving ? 'Saving Duty Time...' : 'Save Duty Timing & Deductions'}
            </button>
            <button
              type="button"
              onClick={() => setTimeModalOpen(false)}
              disabled={timeSaving}
              className="btn-secondary font-bold"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
