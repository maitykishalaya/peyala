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
  Clock, Plus, Pencil, CheckCircle2, AlertTriangle, ArrowRight, UserCheck, ShieldAlert, Check, Trash2,
  Download, Printer, FileText, Filter, Calendar, BarChart3
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

function escapeHtml(text?: string | number | null): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const getStaffCacheKey = (role = 'default') => `peyala_attendance_staff_cache_v2_${role}`;
const getAttendanceCacheKey = (y: number, m: number, role = 'default') => `peyala_attendance_${y}_${m}_v2_${role}`;

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

function generateSummaryPdfHtml(params: {
  mode: 'day' | 'month';
  dateStr: string;
  monthName: string;
  year: number;
  dayData: any[];
  monthData: any[];
  isViewer: boolean;
}): string {
  const { mode, dateStr, monthName, year, dayData, monthData, isViewer } = params;
  const isDay = mode === 'day';
  const reportTitle = isDay
    ? 'DAILY ATTENDANCE & DUTY SUMMARY REPORT'
    : 'MONTHLY ATTENDANCE & DUTY SUMMARY REPORT';
  const periodStr = isDay ? dateStr : `${monthName} ${year}`;
  const printTimestamp = `${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;

  const kpisHtml = isDay ? `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Active Staff</div>
        <div class="kpi-value">${dayData.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Present Today</div>
        <div class="kpi-value" style="color: #047857;">${dayData.filter((d) => d.status === 'present').length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Absent / Leave</div>
        <div class="kpi-value" style="color: #b91c1c;">${dayData.filter((d) => ['absent', 'leave'].includes(d.status || '')).length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Shortage Hours</div>
        <div class="kpi-value" style="color: #b91c1c;">${formatHoursMinutes(dayData.reduce((s, d) => s + (d.deficitHours || 0), 0))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Penalties</div>
        <div class="kpi-value" style="color: #c2410c;">${isViewer ? '••••••' : formatCurrency(dayData.reduce((s, d) => s + (d.penaltyAmount || 0), 0))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Deductions</div>
        <div class="kpi-value" style="color: #b91c1c;">${isViewer ? '••••••' : '-' + formatCurrency(dayData.reduce((s, d) => s + (d.totalDeductions || 0), 0))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Day Payable</div>
        <div class="kpi-value" style="color: #047857;">${isViewer ? '••••••' : formatCurrency(dayData.reduce((s, d) => s + (d.payableAmount || 0), 0))}</div>
      </div>
    </div>
  ` : `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Active Staff</div>
        <div class="kpi-value">${monthData.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Present Days</div>
        <div class="kpi-value" style="color: #047857;">${monthData.reduce((s, m) => s + (m.presentCount || 0), 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Absent Days</div>
        <div class="kpi-value" style="color: #b91c1c;">${monthData.reduce((s, m) => s + (m.absentCount || 0), 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Deficit Hours</div>
        <div class="kpi-value" style="color: #b91c1c;">${formatHoursMinutes(monthData.reduce((s, m) => s + (m.totalDeficitHours || 0), 0))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Penalties</div>
        <div class="kpi-value" style="color: #c2410c;">${isViewer ? '••••••' : formatCurrency(monthData.reduce((s, m) => s + (m.totalPenalties || 0), 0))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total Deductions</div>
        <div class="kpi-value" style="color: #b91c1c;">${isViewer ? '••••••' : '-' + formatCurrency(monthData.reduce((s, m) => s + (m.totalDeductions || 0), 0))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Month Payable</div>
        <div class="kpi-value" style="color: #047857;">${isViewer ? '••••••' : formatCurrency(monthData.reduce((s, m) => s + (m.totalPayable || 0), 0))}</div>
      </div>
    </div>
  `;

  let rowsHtml = '';
  if (isDay) {
    rowsHtml = dayData.map((d, idx) => {
      const statusMeta = d.status ? STATUS_CONFIG[d.status as StatusKey] : null;
      const statusLabel = statusMeta ? statusMeta.text : (d.hasRecord ? 'Recorded' : 'Unmarked');
      const statusClass = d.status === 'present' ? 'badge-green' : d.status === 'absent' ? 'badge-red' : d.status === 'leave' ? 'badge-amber' : 'badge-gray';

      const targetStr = d.isLoggable ? `${d.targetDutyHours}h` : '—';
      const presentStr = d.isLoggable ? formatHoursMinutes(d.totalPresentHours) : '—';
      const deficitStr = !d.isLoggable
        ? '—'
        : d.deficitHours > 0
        ? `<span style="color: #dc2626; font-weight: bold;">-${formatHoursMinutes(d.deficitHours)}</span>`
        : `<span style="color: #059669; font-weight: bold;">Full Duty</span>`;

      const noteStr = d.note ? escapeHtml(d.note) : '<span style="color: #9ca3af;">—</span>';
      const penaltyStr = d.penaltyAmount > 0
        ? `<span style="color: #dc2626; font-weight: bold;">${isViewer ? '••••••' : formatCurrency(d.penaltyAmount)}</span>${d.penaltyReason ? `<div style="font-size: 9px; color: #6b7280;">${escapeHtml(d.penaltyReason)}</div>` : ''}`
        : '<span style="color: #9ca3af;">₹0</span>';

      const deductionStr = isViewer
        ? '••••••'
        : d.totalDeductions > 0
        ? `<span style="color: #dc2626; font-weight: bold;">-${formatCurrency(d.totalDeductions)}</span>`
        : '<span style="color: #059669; font-weight: bold;">₹0</span>';

      const payableStr = isViewer
        ? '••••••'
        : `<span style="color: #047857; font-weight: bold;">${formatCurrency(d.payableAmount)}</span>`;

      return `
        <tr>
          <td style="text-align: center; color: #6b7280; font-size: 10px;">${idx + 1}</td>
          <td>
            <div style="font-weight: bold; font-size: 11px;">${escapeHtml(d.member.name)}</div>
            <div style="font-size: 9.5px; color: #6b7280;">${escapeHtml(d.member.position || 'Staff')}${!d.isLoggable ? ' • <span style="color: #d97706;">Attendance Only</span>' : ''}</div>
          </td>
          <td style="text-align: center;"><span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span></td>
          <td style="text-align: center; font-weight: 500;">${targetStr}</td>
          <td style="text-align: center; font-weight: 600;">${presentStr}</td>
          <td style="text-align: center;">${deficitStr}</td>
          <td style="font-size: 10px; max-width: 180px;">${noteStr}</td>
          <td style="text-align: right;">${penaltyStr}</td>
          <td style="text-align: right;">${deductionStr}</td>
          <td style="text-align: right;">${payableStr}</td>
        </tr>
      `;
    }).join('');
  } else {
    rowsHtml = monthData.map((m, idx) => {
      const pCount = m.presentCount || 0;
      const aCount = m.absentCount || 0;
      const hCount = m.halfDayCount || 0;
      const lCount = m.leaveCount || 0;

      const targetStr = m.isLoggable ? `${m.totalTargetHours}h` : '—';
      const presentStr = m.isLoggable ? formatHoursMinutes(m.totalPresentHours) : '—';
      const deficitStr = !m.isLoggable
        ? '—'
        : m.totalDeficitHours > 0
        ? `<span style="color: #dc2626; font-weight: bold;">-${formatHoursMinutes(m.totalDeficitHours)}</span>`
        : `<span style="color: #059669; font-weight: bold;">Full Duty</span>`;

      const notesListStr = m.notesList && m.notesList.length > 0
        ? m.notesList.map((n: any) => `<div><b>${escapeHtml(n.date)}:</b> ${escapeHtml(n.note)}</div>`).join('')
        : '<span style="color: #9ca3af;">—</span>';

      const penaltiesListStr = m.penaltiesList && m.penaltiesList.length > 0
        ? `<div><span style="color: #dc2626; font-weight: bold;">${isViewer ? '••••••' : formatCurrency(m.totalPenalties)}</span></div>` +
          m.penaltiesList.map((p: any) => `<div style="font-size: 9px; color: #6b7280;">${escapeHtml(p.date)}: ${isViewer ? '••••••' : formatCurrency(p.amount)} (${escapeHtml(p.reason)})</div>`).join('')
        : '<span style="color: #9ca3af;">₹0</span>';

      const deductionStr = isViewer
        ? '••••••'
        : m.totalDeductions > 0
        ? `<span style="color: #dc2626; font-weight: bold;">-${formatCurrency(m.totalDeductions)}</span>`
        : '<span style="color: #059669; font-weight: bold;">₹0</span>';

      const payableStr = isViewer
        ? '••••••'
        : `<span style="color: #047857; font-weight: bold;">${formatCurrency(m.totalPayable)}</span>`;

      return `
        <tr>
          <td style="text-align: center; color: #6b7280; font-size: 10px;">${idx + 1}</td>
          <td>
            <div style="font-weight: bold; font-size: 11px;">${escapeHtml(m.member.name)}</div>
            <div style="font-size: 9.5px; color: #6b7280;">${escapeHtml(m.member.position || 'Staff')}${!m.isLoggable ? ' • <span style="color: #d97706;">Attendance Only</span>' : ''}</div>
          </td>
          <td style="text-align: center;">
            <div style="display: inline-flex; gap: 4px; font-size: 10px; font-weight: bold;">
              <span style="color: #047857; background: #ecfdf5; padding: 1px 4px; border-radius: 3px;">P:${pCount}</span>
              <span style="color: #b91c1c; background: #fef2f2; padding: 1px 4px; border-radius: 3px;">A:${aCount}</span>
              <span style="color: #1d4ed8; background: #eff6ff; padding: 1px 4px; border-radius: 3px;">H:${hCount}</span>
              <span style="color: #b45309; background: #fffbeb; padding: 1px 4px; border-radius: 3px;">L:${lCount}</span>
            </div>
          </td>
          <td style="text-align: center; font-weight: 500;">${targetStr}</td>
          <td style="text-align: center; font-weight: 600;">${presentStr}</td>
          <td style="text-align: center;">${deficitStr}</td>
          <td style="font-size: 9.5px; max-width: 220px; line-height: 1.3;">${notesListStr}</td>
          <td style="text-align: right; max-width: 140px;">${penaltiesListStr}</td>
          <td style="text-align: right;">${deductionStr}</td>
          <td style="text-align: right;">${payableStr}</td>
        </tr>
      `;
    }).join('');
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(reportTitle)}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #111827;
            background: #fff;
            padding: 4px;
            font-size: 11px;
            line-height: 1.35;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #111827;
            padding-bottom: 8px;
            margin-bottom: 10px;
          }
          .brand-title {
            font-size: 18px;
            font-weight: 900;
            letter-spacing: 0.5px;
            color: #111827;
          }
          .brand-sub {
            font-size: 10px;
            color: #4b5563;
            margin-top: 2px;
          }
          .report-meta {
            text-align: right;
          }
          .report-badge {
            display: inline-block;
            background: #f3f4f6;
            border: 1px solid #d1d5db;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .report-title {
            font-size: 14px;
            font-weight: 800;
            margin-top: 3px;
            color: #1f2937;
          }
          .report-period {
            font-size: 10.5px;
            color: #4b5563;
            font-weight: 600;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 6px;
            margin-bottom: 12px;
          }
          .kpi-card {
            border: 1px solid #e5e7eb;
            background: #f9fafb;
            padding: 6px 8px;
            border-radius: 6px;
            text-align: center;
          }
          .kpi-label {
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #6b7280;
            letter-spacing: 0.3px;
          }
          .kpi-value {
            font-size: 13px;
            font-weight: 800;
            margin-top: 2px;
            color: #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
          }
          th {
            background: #f3f4f6;
            border-top: 1px solid #d1d5db;
            border-bottom: 2px solid #9ca3af;
            padding: 6px 6px;
            text-align: left;
            font-size: 9.5px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: #374151;
          }
          td {
            padding: 6px 6px;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background-color: #fafafa;
          }
          .badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 9999px;
            font-size: 9px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .badge-green { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
          .badge-red { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
          .badge-amber { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
          .badge-gray { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
          .footer {
            margin-top: 18px;
            padding-top: 8px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 9.5px;
            color: #6b7280;
          }
          .signatures {
            display: flex;
            gap: 40px;
            margin-top: 24px;
          }
          .sign-line {
            border-top: 1px dashed #6b7280;
            width: 140px;
            padding-top: 4px;
            text-align: center;
            font-size: 9px;
            font-weight: 600;
            color: #4b5563;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand-title">PEYALA CAFE &amp; RESTAURANT</div>
            <div class="brand-sub">L-1, Saratpally, Midnapore &bull; Ph: 7749802811 &bull; GSTIN: 19DGOPM1101F1ZL &bull; FSSAI: 22822149000119</div>
          </div>
          <div class="report-meta">
            <span class="report-badge">${isDay ? 'Daily Report' : 'Monthly Report'}</span>
            <div class="report-title">${escapeHtml(reportTitle)}</div>
            <div class="report-period">Period / Date: <b>${escapeHtml(periodStr)}</b></div>
          </div>
        </div>

        ${kpisHtml}

        <table>
          <thead>
            <tr>
              <th style="width: 24px; text-align: center;">#</th>
              <th style="width: 130px;">Staff Member</th>
              <th style="width: ${isDay ? '80px' : '110px'}; text-align: center;">${isDay ? 'Status' : 'Attendance (P/A/H/L)'}</th>
              <th style="width: 65px; text-align: center;">Target</th>
              <th style="width: 70px; text-align: center;">Worked</th>
              <th style="width: 80px; text-align: center;">Deficit Hours</th>
              <th>Notes from Attendance</th>
              <th style="width: 110px; text-align: right;">Penalty &amp; Reason</th>
              <th style="width: 90px; text-align: right;">Total Deductions</th>
              <th style="width: 90px; text-align: right;">Net Payable</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="signatures">
          <div class="sign-line">Prepared By (Shift In-Charge)</div>
          <div class="sign-line">Verified By (Manager)</div>
          <div class="sign-line">Authorized Signatory / Owner</div>
        </div>

        <div class="footer">
          <div>Report generated automatically via Peyala POS &amp; Attendance System</div>
          <div>Printed on: ${escapeHtml(printTimestamp)}</div>
        </div>
      </body>
    </html>
  `;
}

export default function AttendancePage() {
  const { user, isViewer } = useAuth();
  const userRole = user?.role || 'default';
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
  const summarySectionRef = useRef<HTMLDivElement>(null);
  const [summaryMode, setSummaryMode] = useState<'day' | 'month'>('day');
  const [pdfGenerating, setPdfGenerating] = useState(false);

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

  const scrollToReport = () => {
    if (summarySectionRef.current) {
      summarySectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const scrollToStaff = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const activeStaff = useMemo(() => staff.filter((member) => member.status === 'active'), [staff]);
  const loggableStaff = useMemo(
    () => activeStaff.filter((member) => member.logDutyHours !== false),
    [activeStaff]
  );
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
    timeSlots: [{ entry: '', exit: '' }] as Array<{ entry: string; exit: string }>,
    penaltyReason: '',
    penaltyAmount: '',
    note: '',
  });

  const addTimeSlot = () => {
    setTimeForm((prev) => ({
      ...prev,
      timeSlots: [...prev.timeSlots, { entry: '', exit: '' }],
    }));
  };

  const removeTimeSlot = (index: number) => {
    setTimeForm((prev) => {
      if (prev.timeSlots.length <= 1) return prev;
      return {
        ...prev,
        timeSlots: prev.timeSlots.filter((_, i) => i !== index),
      };
    });
  };

  const updateTimeSlot = (index: number, field: 'entry' | 'exit', value: string) => {
    setTimeForm((prev) => {
      const nextSlots = [...prev.timeSlots];
      nextSlots[index] = { ...nextSlots[index], [field]: value };
      return { ...prev, timeSlots: nextSlots };
    });
  };

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
    if (member && member.logDutyHours === false) {
      toast.error(`Duty hours tracking is disabled for ${member.name}. Please mark attendance in the table above.`);
      return;
    }
    const targetMember = member || loggableStaff[0];
    if (!targetMember) {
      toast.error('No staff member with duty hours logging enabled was found');
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

    let initialSlots: Array<{ entry: string; exit: string }> = [];
    if (Array.isArray(existingRecord?.timeSlots) && existingRecord.timeSlots.length > 0) {
      initialSlots = existingRecord.timeSlots.map((s: any) => ({
        entry: s?.entry || '',
        exit: s?.exit || '',
      }));
    } else if (
      existingRecord?.shift1?.entry ||
      existingRecord?.shift1?.exit ||
      existingRecord?.shift2?.entry ||
      existingRecord?.shift2?.exit
    ) {
      if (existingRecord?.shift1?.entry || existingRecord?.shift1?.exit) {
        initialSlots.push({ entry: existingRecord.shift1.entry || '', exit: existingRecord.shift1.exit || '' });
      }
      if (existingRecord?.shift2?.entry || existingRecord?.shift2?.exit) {
        initialSlots.push({ entry: existingRecord.shift2.entry || '', exit: existingRecord.shift2.exit || '' });
      }
    }
    if (initialSlots.length === 0) {
      initialSlots = [{ entry: '', exit: '' }];
    }

    setTimeForm({
      staffId: targetMember._id,
      date: selectedLogDate,
      dutyHours: defaultDuty,
      dailySalary: defaultSalary,
      timeSlots: initialSlots,
      penaltyReason: existingRecord?.penaltyReason || '',
      penaltyAmount: existingRecord?.penaltyAmount ? String(existingRecord.penaltyAmount) : '',
      note: existingRecord?.note || '',
    });
    setTimeModalOpen(true);
  };

  const handleStaffChangeInModal = (staffId: string) => {
    const foundStaff = loggableStaff.find((s) => s._id === staffId);
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

    let initialSlots: Array<{ entry: string; exit: string }> = [];
    if (Array.isArray(existingRecord?.timeSlots) && existingRecord.timeSlots.length > 0) {
      initialSlots = existingRecord.timeSlots.map((s: any) => ({
        entry: s?.entry || '',
        exit: s?.exit || '',
      }));
    } else if (
      existingRecord?.shift1?.entry ||
      existingRecord?.shift1?.exit ||
      existingRecord?.shift2?.entry ||
      existingRecord?.shift2?.exit
    ) {
      if (existingRecord?.shift1?.entry || existingRecord?.shift1?.exit) {
        initialSlots.push({ entry: existingRecord.shift1.entry || '', exit: existingRecord.shift1.exit || '' });
      }
      if (existingRecord?.shift2?.entry || existingRecord?.shift2?.exit) {
        initialSlots.push({ entry: existingRecord.shift2.entry || '', exit: existingRecord.shift2.exit || '' });
      }
    }
    if (initialSlots.length === 0) {
      initialSlots = [{ entry: '', exit: '' }];
    }

    setTimeForm((prev) => ({
      ...prev,
      staffId,
      dutyHours: defaultDuty,
      dailySalary: defaultSalary,
      timeSlots: initialSlots,
      penaltyReason: existingRecord?.penaltyReason || '',
      penaltyAmount: existingRecord?.penaltyAmount ? String(existingRecord.penaltyAmount) : '',
      note: existingRecord?.note || '',
    }));
  };

  // Live real-time calculations inside modal
  const timeCalc = useMemo(() => {
    const slotMinutes = timeForm.timeSlots.map((slot) =>
      calculateShiftMinutes(slot.entry, slot.exit)
    );
    const totalMinutes = slotMinutes.reduce((sum, m) => sum + m, 0);
    const totalPresentHours = +(totalMinutes / 60).toFixed(2);
    const dutyHours = parseFloat(timeForm.dutyHours) || 0;
    const absentHours = Math.max(0, +(dutyHours - totalPresentHours).toFixed(2));
    const dailySalary = parseFloat(timeForm.dailySalary) || 0;
    const hourlyRate = dutyHours > 0 ? +(dailySalary / dutyHours).toFixed(2) : 0;
    const deductionAmount = +(absentHours * hourlyRate).toFixed(2);
    const penaltyAmount = Math.max(0, parseFloat(timeForm.penaltyAmount) || 0);
    const payableAmount = Math.max(0, +(dailySalary - deductionAmount - penaltyAmount).toFixed(2));
    const hasEntry = timeForm.timeSlots.some((slot) => slot.entry && slot.entry.trim() !== '');
    const autoStatus = hasEntry ? 'present' : 'absent';

    return {
      slotMinutes,
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
      const cleanSlots = timeForm.timeSlots.filter(
        (s) => (s.entry && s.entry.trim() !== '') || (s.exit && s.exit.trim() !== '')
      );
      const shift1 = cleanSlots[0] || { entry: '', exit: '' };
      const shift2 = cleanSlots[1] || { entry: '', exit: '' };

      await attendanceApi.logTime({
        staffId: timeForm.staffId,
        date: timeForm.date,
        dutyHours: numDuty,
        dailySalary: numDailySalary,
        timeSlots: cleanSlots.length > 0 ? cleanSlots : [{ entry: '', exit: '' }],
        shift1,
        shift2,
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

  const daySummaryData = useMemo(() => {
    return activeStaff.map((member) => {
      // 1. Check timeLog from timeLogs for selectedLogDate
      const timeLog = timeLogs.find((l) => {
        const sId = l.staff?._id ? l.staff._id.toString() : l.staff.toString();
        return sId === member._id.toString();
      });

      // 2. Check calendar attendance records for selectedLogDate
      const dayRecord = attendance.find((a) => {
        const aStaffId = a.staff?._id ? a.staff._id.toString() : a.staff.toString();
        if (aStaffId !== member._id.toString()) return false;
        const d = new Date(a.date);
        return formatDateOnly(d) === selectedLogDate;
      });

      const rec = timeLog?.record || dayRecord || null;
      const hasRecord = !!rec;
      const isLoggable = member.logDutyHours !== false;
      const status: StatusKey = rec?.status ? normalizeStatusValue(rec.status) : 'absent';

      const targetDutyHours = rec?.dutyHours ?? (isLoggable ? (member.defaultDutyHours || 10) : 0);
      const totalPresentHours = rec?.totalPresentHours ?? (hasRecord && status === 'present' ? targetDutyHours : 0);
      const deficitHours = isLoggable
        ? (rec?.absentHours !== undefined
            ? rec.absentHours
            : (hasRecord && status !== 'present' ? targetDutyHours : Math.max(0, targetDutyHours - totalPresentHours)))
        : 0;

      const dailySalary = rec?.dailySalary ?? member.dailySalary ?? (member.monthlySalary ? Math.round(member.monthlySalary / 30) : 0);
      const hourlyRate = rec?.hourlyRate ?? (targetDutyHours > 0 ? +(dailySalary / targetDutyHours).toFixed(2) : 0);
      const deductionAmount = rec?.deductionAmount ?? 0;
      const penaltyAmount = rec?.penaltyAmount ?? 0;
      const penaltyReason = rec?.penaltyReason ? String(rec.penaltyReason).trim() : '';
      const totalDeductions = deductionAmount + penaltyAmount;
      const payableAmount = rec?.payableAmount !== undefined
        ? rec.payableAmount
        : (hasRecord && status === 'present' ? Math.max(0, +(dailySalary - totalDeductions).toFixed(2)) : 0);

      const note = rec?.note ? String(rec.note).trim() : '';

      return {
        member,
        hasRecord,
        status: hasRecord ? status : null,
        isLoggable,
        targetDutyHours,
        totalPresentHours,
        deficitHours,
        dailySalary,
        hourlyRate,
        deductionAmount,
        penaltyAmount,
        penaltyReason,
        totalDeductions,
        payableAmount,
        note,
      };
    });
  }, [activeStaff, timeLogs, attendance, selectedLogDate]);

  const monthSummaryData = useMemo(() => {
    return activeStaff.map((member) => {
      const memberRecords = attendance.filter((a) => {
        const aStaffId = a.staff?._id ? a.staff._id.toString() : a.staff.toString();
        return aStaffId === member._id.toString();
      });

      const isLoggable = member.logDutyHours !== false;
      const presentCount = memberRecords.filter((r) => r.status === 'present').length;
      const absentCount = memberRecords.filter((r) => r.status === 'absent').length;
      const halfDayCount = memberRecords.filter((r) => ['halfday', 'holiday'].includes(r.status)).length;
      const leaveCount = memberRecords.filter((r) => r.status === 'leave').length;

      const totalTargetHours = memberRecords.reduce((sum, r) => sum + (r.dutyHours || member.defaultDutyHours || 10), 0);
      const totalPresentHours = +(memberRecords.reduce((sum, r) => sum + (r.totalPresentHours || 0), 0)).toFixed(2);
      const totalDeficitHours = isLoggable
        ? +(memberRecords.reduce((sum, r) => sum + (r.absentHours || 0), 0)).toFixed(2)
        : 0;

      const totalShortageDeductions = +(memberRecords.reduce((sum, r) => sum + (r.deductionAmount || 0), 0)).toFixed(2);
      const totalPenalties = +(memberRecords.reduce((sum, r) => sum + (r.penaltyAmount || 0), 0)).toFixed(2);
      const totalDeductions = +(totalShortageDeductions + totalPenalties).toFixed(2);

      const totalPayable = +(memberRecords.reduce((sum, r) => sum + (r.payableAmount || 0), 0)).toFixed(2);
      const monthlySalary = member.monthlySalary || (member.dailySalary ? member.dailySalary * 30 : 0);

      // Collect notes recorded during the month for this staff member
      const notesList = memberRecords
        .filter((r) => r.note && String(r.note).trim() !== '')
        .map((r) => {
          const d = new Date(r.date);
          const dayNum = d.getDate();
          return {
            date: `${MONTHS[month - 1].slice(0, 3)} ${dayNum}`,
            note: String(r.note).trim(),
            status: r.status,
          };
        });

      // Collect penalties recorded during the month
      const penaltiesList = memberRecords
        .filter((r) => (r.penaltyAmount || 0) > 0)
        .map((r) => {
          const d = new Date(r.date);
          const dayNum = d.getDate();
          return {
            date: `${MONTHS[month - 1].slice(0, 3)} ${dayNum}`,
            amount: r.penaltyAmount,
            reason: r.penaltyReason ? String(r.penaltyReason).trim() : 'Penalty',
          };
        });

      return {
        member,
        isLoggable,
        presentCount,
        absentCount,
        halfDayCount,
        leaveCount,
        totalTargetHours,
        totalPresentHours,
        totalDeficitHours,
        totalShortageDeductions,
        totalPenalties,
        totalDeductions,
        totalPayable,
        monthlySalary,
        notesList,
        penaltiesList,
      };
    });
  }, [activeStaff, attendance, month]);

  const downloadPdfReport = () => {
    if (isViewer) {
      toast.error('Viewers are not permitted to download attendance summaries');
      return;
    }
    setPdfGenerating(true);
    try {
      const formattedDateStr = formatDate(new Date(selectedLogDate + 'T00:00:00'));

      const printHtml = generateSummaryPdfHtml({
        mode: summaryMode,
        dateStr: formattedDateStr,
        monthName: MONTHS[month - 1],
        year,
        dayData: daySummaryData,
        monthData: monthSummaryData,
        isViewer,
      });

      let iframe = document.getElementById('attendance-summary-print-frame') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'attendance-summary-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        toast.error('Could not access print window');
        setPdfGenerating(false);
        return;
      }

      doc.open();
      doc.write(printHtml);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.error('Print failed:', err);
          toast.error('Failed to open PDF print dialog');
        } finally {
          setPdfGenerating(false);
        }
      }, 250);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      toast.error('Error generating PDF report');
      setPdfGenerating(false);
    }
  };

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setLoading(true);
    try {
      let currentStaff = staff;
      if (!currentStaff.length || isManual) {
        const staffRes = await staffApi.list();
        currentStaff = staffRes.data || [];
        setStaff(currentStaff);
        writeCache(getStaffCacheKey(userRole), { staff: currentStaff });
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
      writeCache(getAttendanceCacheKey(year, month, userRole), { attendance: attData, summaries: sumMap });
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
      const cachedStaff = readCache(getStaffCacheKey(userRole));
      if (cachedStaff?.staff) {
        currentStaff = cachedStaff.staff;
        setStaff(currentStaff);
      }
    }

    const cacheKey = getAttendanceCacheKey(year, month, userRole);
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
  }, [month, year, userRole]);

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
                localStorage.removeItem(getAttendanceCacheKey(year, month, userRole));
                localStorage.removeItem(getStaffCacheKey(userRole));
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
                <button
                  type="button"
                  onClick={scrollToReport}
                  className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded text-[11px] font-bold shadow-2xs hover:bg-indigo-100"
                >
                  Report 📑
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
                            {member.logDutyHours === false && (
                              <span className="inline-block text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/60 mt-0.5">
                                Attendance Only
                              </span>
                            )}
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
                Log shift entry and exit times with dynamic sessions. Target duty hours is mandatory. The system calculates duty shortage and suggests daily salary deductions based on hours worked.
                {activeStaff.length > loggableStaff.length && (
                  <span className="block text-amber-600 dark:text-amber-400 font-semibold mt-1">
                    Note: {activeStaff.length - loggableStaff.length} staff member{activeStaff.length - loggableStaff.length > 1 ? 's are' : ' is'} set to standard attendance only and excluded from shift logging.
                  </span>
                )}
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
                  disabled={loggableStaff.length === 0}
                  className="btn-primary text-xs font-bold py-2 px-3.5 flex items-center gap-1.5 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  title={loggableStaff.length === 0 ? 'No staff eligible for duty hours logging' : 'Log Staff Duty'}
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
                  <th className="py-3 px-3 text-center">Timings (Entry → Exit)</th>
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
                    <td colSpan={canEdit ? 10 : 9} className="py-8 text-center text-gray-400 font-bold">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                      Loading shift time records for {selectedLogDate}...
                    </td>
                  </tr>
                ) : timeLogs.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 10 : 9} className="py-8 text-center text-gray-400 font-medium">
                      No active staff found.
                    </td>
                  </tr>
                ) : (
                  timeLogs.map(({ staff: member, record }: any) => {
                    const hasRecord = Boolean(record && (record.dutyHours || record.shift1?.entry || (record.timeSlots && record.timeSlots.length > 0)));
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

                        {/* Timings (Entry → Exit) */}
                        <td className="py-3 px-3 text-center">
                          {(() => {
                            const slots: Array<{ entry?: string; exit?: string }> =
                              Array.isArray(record?.timeSlots) && record.timeSlots.length > 0
                                ? record.timeSlots
                                : [record?.shift1, record?.shift2].filter(
                                    (s) => (s?.entry && s.entry.trim() !== '') || (s?.exit && s.exit.trim() !== '')
                                  );

                            if (slots.length === 0) {
                              return <span className="text-gray-400">—</span>;
                            }

                            return (
                              <div className="inline-flex flex-wrap items-center justify-center gap-1.5 max-w-xs mx-auto">
                                {slots.map((s, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-[11px]"
                                  >
                                    <span>{s.entry || '--:--'}</span>
                                    <span className="text-gray-400">→</span>
                                    <span>{s.exit || 'Active'}</span>
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
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
                          {isViewer
                            ? '••••••'
                            : record?.dailySalary
                            ? formatCurrency(record.dailySalary)
                            : member.dailySalary
                            ? formatCurrency(member.dailySalary)
                            : member.monthlySalary
                            ? `~${formatCurrency(Math.round(member.monthlySalary / 30))}`
                            : '—'}
                        </td>

                        {/* Deduction */}
                        <td className="py-3 px-3 text-right">
                          {isViewer ? (
                            <span className="text-gray-400">••••••</span>
                          ) : hasRecord && ((record?.deductionAmount > 0) || (record?.penaltyAmount > 0)) ? (
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
                          {isViewer ? (
                            <span className="text-gray-400 font-semibold">••••••</span>
                          ) : hasRecord && record?.payableAmount !== undefined ? (
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
                  {isViewer ? '••••••' : formatCurrency(timeLogs.reduce((sum, l) => sum + (l.record?.dailySalary || 0), 0))}
                </p>
              </div>

              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Total Deductions</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {isViewer
                    ? '••••••'
                    : `-${formatCurrency(
                        timeLogs.reduce(
                          (sum, l) => sum + (l.record?.deductionAmount || 0) + (l.record?.penaltyAmount || 0),
                          0
                        )
                      )}`}
                </p>
              </div>

              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Net Day Payable</span>
                <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {isViewer ? '••••••' : formatCurrency(timeLogs.reduce((sum, l) => sum + (l.record?.payableAmount || 0), 0))}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Section: Comprehensive Attendance & Duty Summary (Day / Month Toggle & PDF Export) ── */}
        <div
          ref={summarySectionRef}
          className="card p-4 sm:p-6 border-2 border-indigo-200 dark:border-indigo-900 bg-white dark:bg-gray-900 shadow-md space-y-5"
        >
          {/* Header & Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b-2 border-gray-200 dark:border-gray-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shadow-xs">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-black text-lg text-gray-900 dark:text-white">
                    Attendance &amp; Duty Summary
                  </h2>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    {summaryMode === 'day' ? formatDate(new Date(selectedLogDate + 'T00:00:00')) : `${MONTHS[month - 1]} ${year}`}
                  </span>
                </div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                  Duty hours deficit, attendance notes, penalties &amp; total deductions per staff
                </p>
              </div>
            </div>

            {/* Toggle Tabs & PDF Action */}
            <div className="flex items-center flex-wrap gap-2.5">
              {/* Day / Month Toggle */}
              <div className="inline-flex rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-0.5 text-xs font-bold shadow-2xs">
                <button
                  type="button"
                  onClick={() => setSummaryMode('day')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all',
                    summaryMode === 'day'
                      ? 'bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Day View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryMode('month')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all',
                    summaryMode === 'month'
                      ? 'bg-white dark:bg-gray-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Month View</span>
                </button>
              </div>

              {/* Download PDF Button (hidden for viewers) */}
              {!isViewer && (
                <button
                  type="button"
                  onClick={downloadPdfReport}
                  disabled={pdfGenerating}
                  className="btn-primary py-1.5 px-3 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                  title="Download styled PDF summary report"
                >
                  <Printer className={cn("w-3.5 h-3.5", pdfGenerating && "animate-spin")} />
                  <span>{pdfGenerating ? 'Preparing PDF...' : 'Download PDF'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Aggregate KPI Summary Row */}
          {summaryMode === 'day' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                <span className="text-[10px] font-black uppercase text-gray-400">Total Staff</span>
                <p className="text-base font-black text-gray-900 dark:text-white mt-0.5">{daySummaryData.length}</p>
              </div>
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Present</span>
                <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {daySummaryData.filter((d) => d.status === 'present').length}
                </p>
              </div>
              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Absent / Leave</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {daySummaryData.filter((d) => ['absent', 'leave'].includes(d.status || '')).length}
                </p>
              </div>
              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Duty Shortage</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {formatHoursMinutes(daySummaryData.reduce((s, d) => s + d.deficitHours, 0))}
                </p>
              </div>
              <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">Penalties</span>
                <p className="text-base font-black text-amber-700 dark:text-amber-300 mt-0.5">
                  {isViewer ? '••••••' : formatCurrency(daySummaryData.reduce((s, d) => s + d.penaltyAmount, 0))}
                </p>
              </div>
              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Total Deductions</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {isViewer ? '••••••' : `-${formatCurrency(daySummaryData.reduce((s, d) => s + d.totalDeductions, 0))}`}
                </p>
              </div>
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Net Day Payable</span>
                <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {isViewer ? '••••••' : formatCurrency(daySummaryData.reduce((s, d) => s + d.payableAmount, 0))}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                <span className="text-[10px] font-black uppercase text-gray-400">Total Staff</span>
                <p className="text-base font-black text-gray-900 dark:text-white mt-0.5">{monthSummaryData.length}</p>
              </div>
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Total Present Days</span>
                <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {monthSummaryData.reduce((s, m) => s + m.presentCount, 0)}
                </p>
              </div>
              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Total Absent Days</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {monthSummaryData.reduce((s, m) => s + m.absentCount, 0)}
                </p>
              </div>
              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Month Deficit Hours</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {formatHoursMinutes(monthSummaryData.reduce((s, m) => s + m.totalDeficitHours, 0))}
                </p>
              </div>
              <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">Month Penalties</span>
                <p className="text-base font-black text-amber-700 dark:text-amber-300 mt-0.5">
                  {isViewer ? '••••••' : formatCurrency(monthSummaryData.reduce((s, m) => s + m.totalPenalties, 0))}
                </p>
              </div>
              <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">Total Deductions</span>
                <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {isViewer ? '••••••' : `-${formatCurrency(monthSummaryData.reduce((s, m) => s + m.totalDeductions, 0))}`}
                </p>
              </div>
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-center">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Net Month Payable</span>
                <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {isViewer ? '••••••' : formatCurrency(monthSummaryData.reduce((s, m) => s + m.totalPayable, 0))}
                </p>
              </div>
            </div>
          )}

          {/* Detailed Summary Table */}
          <div className="overflow-x-auto rounded-xl border-2 border-gray-200 dark:border-gray-800">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800/90 text-gray-700 dark:text-gray-300 uppercase tracking-wider text-[11px] font-black border-b-2 border-gray-300 dark:border-gray-700">
                  <th className="py-3 px-3">Staff Member</th>
                  <th className="py-3 px-3 text-center">{summaryMode === 'day' ? 'Status' : 'Attendance (P/A/H/L)'}</th>
                  <th className="py-3 px-3 text-center">Target</th>
                  <th className="py-3 px-3 text-center">Worked</th>
                  <th className="py-3 px-3 text-center">Deficit Hours</th>
                  <th className="py-3 px-3">Notes from Attendance</th>
                  <th className="py-3 px-3 text-right">Penalty &amp; Reason</th>
                  <th className="py-3 px-3 text-right">Total Deductions</th>
                  <th className="py-3 px-3 text-right">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {summaryMode === 'day' ? (
                  daySummaryData.map((row) => (
                    <tr key={row.member._id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-gray-900 dark:text-white text-xs">{row.member.name}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <span>{row.member.position || 'Staff'}</span>
                          {!row.isLoggable && (
                            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1 rounded border border-amber-200 dark:border-amber-800/50">
                              Attendance Only
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {row.status ? (
                          <span className={cn('px-2 py-0.5 rounded text-[11px] font-black uppercase shadow-2xs', STATUS_CONFIG[row.status]?.pill || 'bg-gray-100')}>
                            {STATUS_CONFIG[row.status]?.text || row.status}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px] italic">Unmarked</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-gray-700 dark:text-gray-300">
                        {row.isLoggable ? `${row.targetDutyHours}h` : '—'}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-indigo-700 dark:text-indigo-300">
                        {row.isLoggable ? formatHoursMinutes(row.totalPresentHours) : '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {!row.isLoggable ? (
                          <span className="text-gray-400 font-medium">—</span>
                        ) : row.deficitHours > 0 ? (
                          <span className="font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded text-[11px]">
                            -{formatHoursMinutes(row.deficitHours)}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1">
                            <Check className="w-3 h-3" /> Full Duty
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        {row.note ? (
                          <span className="inline-block p-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-[11px] font-medium border border-gray-200 dark:border-gray-700">
                            {row.note}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {row.penaltyAmount > 0 ? (
                          <div>
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {isViewer ? '••••••' : formatCurrency(row.penaltyAmount)}
                            </span>
                            {row.penaltyReason && (
                              <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[120px] ml-auto">
                                {row.penaltyReason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">₹0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isViewer ? (
                          <span className="text-gray-400">••••••</span>
                        ) : row.totalDeductions > 0 ? (
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            -{formatCurrency(row.totalDeductions)}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">₹0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-emerald-700 dark:text-emerald-300">
                        {isViewer ? '••••••' : formatCurrency(row.payableAmount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  monthSummaryData.map((row) => (
                    <tr key={row.member._id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-gray-900 dark:text-white text-xs">{row.member.name}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <span>{row.member.position || 'Staff'}</span>
                          {!row.isLoggable && (
                            <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1 rounded border border-amber-200 dark:border-amber-800/50">
                              Attendance Only
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center gap-1 font-bold text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            P:{row.presentCount}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                            A:{row.absentCount}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                            H:{row.halfDayCount}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            L:{row.leaveCount}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-gray-700 dark:text-gray-300">
                        {row.isLoggable ? `${row.totalTargetHours}h` : '—'}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-indigo-700 dark:text-indigo-300">
                        {row.isLoggable ? formatHoursMinutes(row.totalPresentHours) : '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {!row.isLoggable ? (
                          <span className="text-gray-400 font-medium">—</span>
                        ) : row.totalDeficitHours > 0 ? (
                          <span className="font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded text-[11px]">
                            -{formatHoursMinutes(row.totalDeficitHours)}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1">
                            <Check className="w-3 h-3" /> Full Duty
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 max-w-xs">
                        {row.notesList && row.notesList.length > 0 ? (
                          <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                            {row.notesList.map((n, idx) => (
                              <div key={idx} className="text-[11px] bg-gray-50 dark:bg-gray-800/80 p-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                                <span className="font-bold text-gray-500 dark:text-gray-400 mr-1">{n.date}:</span>
                                <span>{n.note}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {row.totalPenalties > 0 ? (
                          <div>
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {isViewer ? '••••••' : formatCurrency(row.totalPenalties)}
                            </span>
                            {row.penaltiesList && row.penaltiesList.length > 0 && (
                              <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[130px] ml-auto">
                                {row.penaltiesList.map((p) => `${p.date}: ${p.reason}`).join(', ')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">₹0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isViewer ? (
                          <span className="text-gray-400">••••••</span>
                        ) : row.totalDeductions > 0 ? (
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            -{formatCurrency(row.totalDeductions)}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">₹0</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-emerald-700 dark:text-emerald-300">
                        {isViewer ? '••••••' : formatCurrency(row.totalPayable)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
                {loggableStaff.map((s) => (
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

          {/* Duty Timings (Entry & Exit Rows) */}
          <div className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                  Duty Timings (Entry & Exit)
                </span>
              </div>
              <button
                type="button"
                onClick={addTimeSlot}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg border border-indigo-200 dark:border-indigo-800/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {timeForm.timeSlots.map((slot, index) => {
                const slotMin = timeCalc.slotMinutes?.[index] || 0;
                return (
                  <div
                    key={index}
                    className="p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-gray-500 dark:text-gray-400">
                        Session #{index + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        {slotMin > 0 && (
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">
                            {formatHoursMinutes(slotMin / 60)}
                          </span>
                        )}
                        {timeForm.timeSlots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTimeSlot(index)}
                            className="text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 p-0.5 rounded transition-colors"
                            title="Delete row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                          Entry Time
                        </label>
                        <input
                          type="time"
                          value={slot.entry}
                          onChange={(e) => updateTimeSlot(index, 'entry', e.target.value)}
                          className="input font-bold text-sm h-9"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 block mb-1">
                          Exit Time
                        </label>
                        <input
                          type="time"
                          value={slot.exit}
                          onChange={(e) => updateTimeSlot(index, 'exit', e.target.value)}
                          className="input font-bold text-sm h-9"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
