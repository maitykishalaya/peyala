'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Trash2,
  UtensilsCrossed,
  Clock,
  CheckCircle2,
  Printer,
  Package,
  Users,
  BarChart3,
  Lock,
  Layers,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  Receipt,
  Wallet,
  Timer,
  ChevronDown,
  ShoppingBag,
  Flame,
  ShieldCheck,
} from 'lucide-react';

interface Slide {
  id: string;
  category: string;
  badge: string;
  title: string;
  subtitle: string;
  problem: string;
  solution: string;
  metrics: { label: string; value: string; trend?: string }[];
  highlights: string[];
  mockupType:
    | 'pos'
    | 'pos-engine'
    | 'kds'
    | 'leak'
    | 'wastage'
    | 'pnl'
    | 'attendance'
    | 'inventory'
    | 'treasury'
    | 'printing'
    | 'security'
    | 'overview';
}

const PITCH_SLIDES: Slide[] = [
  {
    id: 'overview',
    category: '01 · EXECUTIVE SUMMARY',
    badge: 'The Peyala Vision',
    title: 'The All-In-One Autonomous Restaurant Operating System',
    subtitle: 'Consolidating 5 fragmented tools into a single high-margin platform for modern dining establishments.',
    problem: 'Restaurants bleed 12–18% of operating profit across disconnected POS terminals, paper KOTs, unrecorded food wastage, and undetected supplier price creep.',
    solution: 'Peyala v8 replaces fragmented point solutions with an end-to-end ecosystem combining live dine-in POS, kitchen display routing, double-entry financial accounting, and an autonomous expense leak detector.',
    metrics: [
      { label: 'Unification', value: '100%', trend: 'Single Platform' },
      { label: 'Margin Recovery', value: '+14.2%', trend: 'Avg. Profit Lift' },
      { label: 'Time Saved / Day', value: '2.5 hrs', trend: 'Automated EOD' },
    ],
    highlights: [
      'Self-hosted, cloud-synchronized multi-terminal architecture',
      'Unified floor operations, kitchen display, and bank-grade treasury',
      'Zero monthly SaaS subscription bloat with complete data ownership',
    ],
    mockupType: 'overview',
  },
  {
    id: 'tables',
    category: '02 · FLOOR OPERATIONS',
    badge: 'Real-Time Floor Plan',
    title: '5-Stage Live Dining Room Lifecycle & Table Management',
    subtitle: 'Zero-friction table turnover with live status tracking and Petpooja-style table transfers.',
    problem: 'Waitstaff lose track of dining states during rush hours, leading to delayed billing, customer frustration, and unoccupied tables sitting idle.',
    solution: 'Dynamic floor plan with 5 differentiated status phases: Blank Table (Grey) → Running KOT (Yellow with live elapsed timer) → Food Served (Blue) → Bill Given (Emerald Green) → Payment Settlement.',
    metrics: [
      { label: 'Table Turnover', value: '+22%', trend: 'Faster Turns' },
      { label: 'Lost Orders', value: '0', trend: 'Full Auditability' },
      { label: 'Status Latency', value: '< 1 sec', trend: 'Real-Time Sync' },
    ],
    highlights: [
      'Non-blocking workflow: transition smoothly between KOT, Served, and Billing',
      '1-tap Petpooja-style Table Move, Round Transfer, and Table Merge',
      'Context-aware card interactions tailored for touch terminals and mobile',
    ],
    mockupType: 'pos',
  },
  {
    id: 'pos-engine',
    category: '03 · HIGH-SPEED ORDERING',
    badge: 'Ultra-Fast POS Engine',
    title: 'High-Velocity Ordering with Zero-Scroll Mobile Cart',
    subtitle: 'Engineered for high-pressure peak hours on both desktop counters and waitstaff smartphones.',
    problem: 'Mobile POS systems force waitstaff to scroll past 50+ catalog items to check cart subtotals and fire tickets, slowing down table service.',
    solution: '3-column desktop ordering terminal paired with a mobile-first sticky floating cart and slide-up review drawer, dispatching tickets in under 5 seconds.',
    metrics: [
      { label: 'Order Dispatch', value: '3.8s', trend: 'Average Order Time' },
      { label: 'Cart Scrolling', value: '0px', trend: 'Zero-Scroll Mobile' },
      { label: 'Variant Modifiers', value: '100%', trend: 'Customizable' },
    ],
    highlights: [
      'Visual Veg/Non-Veg indicator stripes and instant category navigation',
      'Multi-round incremental KOTs: Initial Order, Round 2 Add-ons, and Special Requests',
      'Soft item cancellation with transparent management audit logs',
    ],
    mockupType: 'pos-engine',
  },
  {
    id: 'kds',
    category: '04 · KITCHEN AUTOMATION',
    badge: 'Smart Kitchen Routing',
    title: 'Kitchen Display System (KDS) & Prep Next Batching Engine',
    subtitle: 'Proprietary item-wise aggregation that consolidates identical pending orders across all open tables.',
    problem: 'Cooks drown in messy paper ticket spikes, cooking dishes one by one rather than batching identical orders together.',
    solution: 'Smart "Prep Next" station aggregates matching dishes (e.g. 5x Momo, 3x Coffee) across all dining tables, sorted by oldest wait time (FIFO) or highest volume for maximum kitchen throughput.',
    metrics: [
      { label: 'Ticket Delay', value: '-35%', trend: 'Reduced Wait Time' },
      { label: 'Batch Prep Efficiency', value: '+40%', trend: 'Cook Output' },
      { label: 'Paper Ticket Cost', value: '₹0', trend: '100% Paperless' },
    ],
    highlights: [
      'Color-coded urgency thresholds: Green (≤10m), Amber (10-20m), Red (>20m Overdue)',
      'Dual-tone Web Audio API kitchen bell chime with zero external audio assets',
      '1-tap batch completion and instant accidental bump recall',
    ],
    mockupType: 'kds',
  },
  {
    id: 'leak-detector',
    category: '05 · AI & ALGORITHMIC AUDITING',
    badge: 'Autonomous Leak Detection',
    title: 'Autonomous Expense Leak Detector: Stopping Profit Bleed',
    subtitle: '8 deterministic statistical detectors continuously analyzing procurement, sales, and operating expenses.',
    problem: 'Restaurants invisibly lose 3–7% of gross revenue to vendor price creep, recipe consumption surges, duplicate payments, and small recurring petty cash leaks.',
    solution: 'Proprietary anomaly detection engine with anti-double-counting clustering, sales-adjusted growth justification, and 30-day adaptive learning feedback.',
    metrics: [
      { label: 'Monthly Leak Impact', value: '₹45k-80k', trend: 'Detected & Stopped' },
      { label: 'Statistical Detectors', value: '8 Engines', trend: 'Algorithmic' },
      { label: 'False Alarm Rate', value: '< 2%', trend: 'Sales-Adjusted' },
    ],
    highlights: [
      'Raw material unit price jump detection (≥15% variance over historical median)',
      'Consumption vs Revenue decoupling: flags usage spikes when sales are flat',
      'Anti-double-counting clusters group item and category anomalies under root causes',
    ],
    mockupType: 'leak',
  },
  {
    id: 'wastage',
    category: '06 · LOSS PREVENTION',
    badge: 'Closing Check Enforcement',
    title: 'Disciplined Wastage Control with 10:00 PM Closing Check',
    subtitle: 'Frictionless wastage logging paired with mandatory closing shift audit verification.',
    problem: 'Kitchen food waste, expired raw materials, and burnt dishes go unlogged, corrupting food cost margins and recipe planning.',
    solution: 'Frictionless 3-field wastage tracking (Item Name, Qty, Approx Value ₹) backed by a non-bypassable global banner appearing after 10:00 PM IST until wastage or verified Zero Wastage is signed.',
    metrics: [
      { label: 'Daily Compliance', value: '100%', trend: 'Closing Routine' },
      { label: 'Entry Friction', value: '3 Fields', trend: 'Fast-Log' },
      { label: 'P&L Integrity', value: 'Guaranteed', trend: 'Informational Only' },
    ],
    highlights: [
      'Autocomplete from active menu item catalog with unit conversions',
      'Double-confirmation Zero Wastage verification for clean closing sign-offs',
      'Period wastage aggregated on P&L statement strictly without distorting net profit',
    ],
    mockupType: 'wastage',
  },
  {
    id: 'pnl-reports',
    category: '07 · FINANCIAL INTEGRITY',
    badge: 'Double-Entry Financials',
    title: 'Real-Time P&L Statements with Indian Standard Time Per-Day Sales',
    subtitle: 'Institutional-grade financial reporting linking counter sales, delivery aggregators, and expenses.',
    problem: 'Restaurant owners wait weeks for accountants to reconcile POS sales with aggregator statements, leading to blind cash flow decisions.',
    solution: 'Live Profit & Loss statement featuring IST-aggregated daily sales bar charts, 0-filled calendar timelines, and automated GST output liability calculations.',
    metrics: [
      { label: 'Financial Latency', value: '0 Days', trend: 'Real-Time P&L' },
      { label: 'GST Accuracy', value: '100%', trend: 'Auto-Reconciled' },
      { label: 'Multi-Channel Payouts', value: 'Consolidated', trend: 'Counter + Swiggy/Zomato' },
    ],
    highlights: [
      'Visual per-day sales bar graph matching total period revenue to the exact rupee',
      'Admin-only settled bill editing with automatic balance sheet and account reversals',
      'One-click audit trail CSV export for tax consultants and chartered accountants',
    ],
    mockupType: 'pnl',
  },
  {
    id: 'inventory-wac',
    category: '08 · SUPPLY CHAIN',
    badge: 'Smart Inventory & WAC',
    title: 'Weighted Average Unit Costing & Procurement Intelligence',
    subtitle: 'Automated cost re-averaging on every purchase entry with minimum threshold alerts.',
    problem: 'Volatile raw material prices make static recipe costing inaccurate, leading to mispriced menu items and margin erosion.',
    solution: 'Automated Weighted Average Unit Cost (WAC) recalculation upon every supplier invoice entry, linking procurement directly to recipe food costs.',
    metrics: [
      { label: 'Costing Accuracy', value: '100% WAC', trend: 'Dynamic Pricing' },
      { label: 'Stockout Incidents', value: '-80%', trend: 'Threshold Alerts' },
      { label: 'Vendor Credit Audit', value: 'Real-Time', trend: 'Dues Ledger' },
    ],
    highlights: [
      'Supplier ledger tracking total purchases, settlements, and outstanding dues',
      'Purchase GST input tax credit calculation matching vendor invoices',
      'Multi-unit support across kilograms, grams, litres, packets, and pieces',
    ],
    mockupType: 'inventory',
  },
  {
    id: 'treasury',
    category: '09 · TREASURY & LIQUIDITY',
    badge: 'Multi-Account Treasury',
    title: 'Multi-Account Vaults & Instant Internal Fund Transfers',
    subtitle: 'Full visibility over cash drawers, bank current accounts, petty cash, and digital UPI pools.',
    problem: 'Cash in the physical register gets mixed with UPI QR payments, creating discrepancies and unverified petty cash withdrawals.',
    solution: 'Segmented liquidity accounts with balance-guarded internal transfers, expense categorization, and dynamic Balance Sheet (Assets, Liabilities, Net Equity).',
    metrics: [
      { label: 'Cash Drawer Variance', value: '₹0', trend: 'Daily Reconciliation' },
      { label: 'Account Types', value: '4 Vaults', trend: 'Cash/Bank/UPI/Petty' },
      { label: 'Net Equity Visibility', value: 'Live', trend: 'Balance Sheet' },
    ],
    highlights: [
      'Cash Counter, Current Account, Petty Cash, and UPI QR real-time tracking',
      'Zero-leak internal fund transfers with double-entry balance verification',
      'Comprehensive outgoing expense classification (Vendor, Utilities, Staff, Repairs)',
    ],
    mockupType: 'treasury',
  },
  {
    id: 'attendance',
    category: '10 · WORKFORCE & PAYROLL',
    badge: 'Attendance & Split Duty',
    title: '2-Shift Duty Tracking, Pro-Rata Deductions & Penalty Fines',
    subtitle: 'Manager-governed staff timekeeping with split-duty support and transparent disciplinary fine tracking.',
    problem: 'Buddy punching, unmonitored split shifts, and arbitrary wage deductions cause staff friction and payroll disputes.',
    solution: 'Daily duty hour tracker with Shift 1 & Shift 2 entry/exit timings, mandatory target duty thresholds, automated pro-rata shortage deductions, and a dedicated Penalty section (Reason & Fine ₹).',
    metrics: [
      { label: 'Leave Cap Policy', value: 'Max 4/mo', trend: 'Auto-Enforced' },
      { label: 'Wage Calculation', value: 'Pro-Rata', trend: 'By Worked Hours' },
      { label: 'Disciplinary Fines', value: 'Audited', trend: 'With Reason Logs' },
    ],
    highlights: [
      'Monthly high-contrast attendance calendar with 4-day paid leave limit enforcement',
      'Automatic presence synchronization: logging entry sets status to Present (P)',
      'Transparent daily net payable calculation: Daily Wage - Shortage - Penalties',
    ],
    mockupType: 'attendance',
  },
  {
    id: 'printing',
    category: '11 · HARDWARE INTEGRATION',
    badge: 'Thermal Print Engine',
    title: 'Dual-Mode 80mm ESC/POS Thermal Printing Architecture',
    subtitle: 'Hardware-agnostic printing supporting instant canvas previews and silent production output.',
    problem: 'Proprietary printer drivers crash or require expensive proprietary hardware hubs to print bills and KOT slips.',
    solution: 'Universal thermal engine supporting standard 80mm ESC/POS counter printers, featuring a dual-mode switch between interactive browser Canvas/PDF preview and silent hardware dispatch.',
    metrics: [
      { label: 'Print Latency', value: '< 400ms', trend: 'Instant Output' },
      { label: 'Printer Compatibility', value: 'Universal', trend: 'Standard ESC/POS' },
      { label: 'Mobile Dispatch', value: '1-Tap', trend: 'Print from Phone' },
    ],
    highlights: [
      'Itemized KOT slips with round numbers, portion modifiers, and kitchen instructions',
      'Customer tax bills featuring GST breakdown, payment modes, and brand headers',
      'Remote mobile printing queue allowing floor staff to trigger counter prints',
    ],
    mockupType: 'printing',
  },
  {
    id: 'security',
    category: '12 · ENTERPRISE SECURITY',
    badge: 'Security & Scalability',
    title: 'Role-Based Access Control, Tamper-Proof Audit & 1-Click Backup',
    subtitle: 'Enterprise-grade safeguards ensuring data sovereignty, compliance, and disaster recovery.',
    problem: 'Unauthorized staff modifying bill totals, deleting records, or system crashes resulting in irrecoverable sales loss.',
    solution: 'Strict RBAC security hierarchy (Admin, Manager, Staff), comprehensive immutable audit logs with IP tracking, and one-click JSON database backup and restore.',
    metrics: [
      { label: 'Audit Trail', value: '100%', trend: 'Every Mutation Logged' },
      { label: 'Backup Time', value: '1-Click', trend: 'JSON Full Dump' },
      { label: 'Security Roles', value: '3 Tiers', trend: 'Admin/Manager/Staff' },
    ],
    highlights: [
      'Settled bill edits and structural table modifications strictly restricted to Administrators',
      'Full audit log recording timestamps, user IDs, old vs new state values, and IPs',
      'Offline-tolerant design with client cache resilience and dark/light mode support',
    ],
    mockupType: 'security',
  },
];

function renderMockup(type: Slide['mockupType']) {
  switch (type) {
    case 'overview':
      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
          <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
            <span className="text-brand-400 font-black text-base block">100%</span>
            <span className="text-gray-400 text-[10px] uppercase font-bold">Data Sovereignty</span>
          </div>
          <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
            <span className="text-emerald-400 font-black text-base block">₹0</span>
            <span className="text-gray-400 text-[10px] uppercase font-bold">Monthly SaaS Rent</span>
          </div>
          <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
            <span className="text-blue-400 font-black text-base block">12+</span>
            <span className="text-gray-400 text-[10px] uppercase font-bold">Unified Modules</span>
          </div>
          <div className="p-3 rounded-lg bg-gray-900 border border-gray-800">
            <span className="text-amber-400 font-black text-base block">Real-Time</span>
            <span className="text-gray-400 text-[10px] uppercase font-bold">IST Accounting</span>
          </div>
        </div>
      );

    case 'pos':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-gray-300">
              <UtensilsCrossed className="w-3.5 h-3.5 text-brand-400" /> Live Dining Floor Plan (17 Tables)
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/60">
              ● Floor Plan Live
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg border-2 border-dashed border-gray-700 bg-gray-900/60 text-center">
              <span className="font-bold text-gray-300">Table In 1</span>
              <p className="text-[10px] text-gray-400 mt-0.5">Available (Blank)</p>
            </div>
            <div className="p-2.5 rounded-lg border-2 border-amber-500/80 bg-amber-950/30 text-center">
              <span className="font-bold text-amber-300">Table In 3</span>
              <p className="text-[10px] text-amber-400 mt-0.5 font-bold animate-pulse">Running KOT (14m)</p>
            </div>
            <div className="p-2.5 rounded-lg border-2 border-blue-500/80 bg-blue-950/30 text-center">
              <span className="font-bold text-blue-300">Table Out 2</span>
              <p className="text-[10px] text-blue-400 mt-0.5 font-bold">Food Served (Dining)</p>
            </div>
            <div className="p-2.5 rounded-lg border-2 border-emerald-500 bg-emerald-950/40 text-center">
              <span className="font-bold text-emerald-300">Table In 4</span>
              <p className="text-[10px] text-emerald-400 mt-0.5 font-black">Bill Given (₹840)</p>
            </div>
          </div>
        </div>
      );

    case 'pos-engine':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-gray-300">
              <ShoppingBag className="w-3.5 h-3.5 text-brand-400" /> High-Velocity Ordering Terminal & Cart
            </span>
            <span className="text-[10px] font-mono text-brand-400 font-bold bg-brand-950/40 px-2 py-0.5 rounded border border-brand-800">
              Avg Punch: 3.8s
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-gray-900 border border-gray-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Chicken Steamed Momo (6 pcs)
                </span>
                <span className="text-[10px] text-gray-400 block mt-0.5">Round 1 · ₹180 / plate</span>
              </div>
              <span className="px-2 py-1 rounded bg-brand-500/20 text-brand-400 font-black text-xs">2x (₹360)</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Kulhad Masala Chai (Pot)
                </span>
                <span className="text-[10px] text-gray-400 block mt-0.5">Round 1 · ₹60 / pot</span>
              </div>
              <span className="px-2 py-1 rounded bg-brand-500/20 text-brand-400 font-black text-xs">1x (₹60)</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-brand-500 text-white font-black text-[10px]">Active Cart</span>
              <span className="text-gray-300 font-semibold">
                3 Items · Subtotal: <strong className="text-brand-400">₹420.00</strong>
              </span>
            </div>
            <span className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-default">
              <Flame className="w-3 h-3" /> Fire KOT Ticket
            </span>
          </div>
        </div>
      );

    case 'kds':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-gray-300">
              <Timer className="w-3.5 h-3.5 text-amber-400" /> Prep Next Smart Aggregator Queue
            </span>
            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800">
              Chime Active 🔔
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-gray-900 border border-gray-700 flex justify-between items-center">
              <div>
                <span className="font-black text-amber-400 text-sm">5x</span>{' '}
                <span className="font-bold text-white">Chicken Steamed Momo</span>
                <p className="text-[10px] text-gray-400">Tables: In 1 (x2), Out 3 (x3) · 6m wait</p>
              </div>
              <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase">
                Batch Prep
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-900 border border-gray-700 flex justify-between items-center">
              <div>
                <span className="font-black text-indigo-400 text-sm">3x</span>{' '}
                <span className="font-bold text-white">Cold Coffee with Ice Cream</span>
                <p className="text-[10px] text-gray-400">Tables: In 2 (x1), Takeaway (x2) · 2m wait</p>
              </div>
              <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase">
                Batch Ready
              </span>
            </div>
          </div>
        </div>
      );

    case 'leak':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-rose-300">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Active Expense Leak Alert Cluster
            </span>
            <span className="text-[10px] font-mono text-rose-400 font-bold bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800">
              Potential Impact: ₹59,000
            </span>
          </div>
          <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/60 text-xs flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-black text-[10px] uppercase">
                  Price Spike
                </span>
                <span className="font-bold text-white">Raw Chicken Procurement Unit Cost</span>
              </div>
              <p className="text-[11px] text-gray-300 mt-1">
                Supplier rate surged from ₹160/kg → ₹210/kg (+31.2% over median) across last 4 purchases.
              </p>
            </div>
            <span className="text-sm font-black text-rose-400 shrink-0">+₹18,000/mo</span>
          </div>
        </div>
      );

    case 'wastage':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-amber-300">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> 10:00 PM End-of-Day Closing Routine
            </span>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800">
              Closing Check Enforced
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/80 text-xs flex items-center justify-between">
            <div>
              <span className="font-bold text-white">Daily Wastage Status Pending</span>
              <p className="text-[11px] text-gray-300 mt-0.5">
                Please record today&apos;s food & material wastage or execute verified Zero Wastage sign-off.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <span className="px-2 py-1 rounded bg-brand-500 text-white text-[10px] font-bold">
                Record Wastage
              </span>
              <span className="px-2 py-1 rounded bg-gray-800 text-gray-300 text-[10px] font-bold">
                Sign Zero
              </span>
            </div>
          </div>
        </div>
      );

    case 'pnl':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-emerald-300">
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" /> P&L Statement Daily Sales Bar Breakdown (IST)
            </span>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800">
              Net Profit: +₹1,42,800
            </span>
          </div>
          <div className="flex items-end gap-1.5 h-16 pt-2">
            {[45, 62, 58, 80, 75, 90, 85, 95, 70, 88, 100, 92, 85, 98].map((val, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div
                  className="w-full bg-brand-500 hover:bg-brand-400 rounded-t transition-all"
                  style={{ height: `${val}%` }}
                  title={`Day ${i + 1}: ₹${val * 240}`}
                />
              </div>
            ))}
          </div>
        </div>
      );

    case 'inventory':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-amber-300">
              <Package className="w-3.5 h-3.5 text-amber-400" /> Automated WAC (Weighted Average Cost)
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800">
              Stock Healthy
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">Basmati Rice</span>
              <span className="font-bold text-white">45 kg (WAC: ₹82/kg)</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">Mozzarella Cheese</span>
              <span className="font-bold text-amber-300">8.5 kg (Low Stock)</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">Supplier Dues</span>
              <span className="font-bold text-rose-400">₹14,200 Outstanding</span>
            </div>
          </div>
        </div>
      );

    case 'treasury':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-blue-300">
              <Wallet className="w-3.5 h-3.5 text-blue-400" /> Multi-Account Cash & Bank Balances
            </span>
            <span className="text-[10px] font-bold text-blue-400 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-800">
              Total Assets: ₹4,85,200
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">Cash Counter</span>
              <span className="font-bold text-emerald-400">₹24,500</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">Current Account</span>
              <span className="font-bold text-blue-400">₹3,40,000</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">UPI QR Pool</span>
              <span className="font-bold text-indigo-400">₹1,12,000</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">Petty Cash</span>
              <span className="font-bold text-amber-400">₹8,700</span>
            </div>
          </div>
        </div>
      );

    case 'attendance':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-indigo-300">
              <Users className="w-3.5 h-3.5 text-indigo-400" /> 2-Shift Duty Tracking & Penalty Engine
            </span>
            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800">
              Pro-Rata Formula
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">Target Duty</span>
              <span className="font-bold text-white">10.0 hrs</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-gray-400 text-[10px] block">Worked (2 Shifts)</span>
              <span className="font-bold text-indigo-300">8.0 hrs (-2h)</span>
            </div>
            <div className="p-2 rounded bg-rose-950/20 border border-rose-900/40">
              <span className="text-rose-400 text-[10px] block">Penalty Fine</span>
              <span className="font-bold text-rose-300">-₹50 (Breakage)</span>
            </div>
            <div className="p-2 rounded bg-emerald-950/20 border border-emerald-900/40">
              <span className="text-emerald-400 text-[10px] block">Net Day Pay</span>
              <span className="font-bold text-emerald-300">₹190 / ₹300</span>
            </div>
          </div>
        </div>
      );

    case 'printing':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-gray-300">
              <Receipt className="w-3.5 h-3.5 text-brand-400" /> 80mm ESC/POS Thermal Output
            </span>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800">
              Silent Production Mode
            </span>
          </div>
          <div className="p-2.5 rounded bg-gray-900 border border-gray-800 text-xs font-mono space-y-1 text-gray-300">
            <div className="flex justify-between border-b border-gray-800 pb-1">
              <span>PEYALA CAFE · TABLE #4</span>
              <span>16-SEP-2026 22:15</span>
            </div>
            <div className="flex justify-between text-gray-400 text-[11px]">
              <span>2x Chicken Steamed Momo</span>
              <span>₹360.00</span>
            </div>
            <div className="flex justify-between text-gray-400 text-[11px]">
              <span>1x Masala Chai (Pot)</span>
              <span>₹120.00</span>
            </div>
            <div className="flex justify-between font-bold text-white pt-1 border-t border-gray-800">
              <span>GRAND TOTAL (INCL. GST)</span>
              <span className="text-brand-400">₹480.00</span>
            </div>
          </div>
        </div>
      );

    case 'security':
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
            <span className="font-bold flex items-center gap-1.5 text-indigo-300">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Enterprise RBAC & Tamper-Proof Audit
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800">
              1-Click Backup Ready
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-brand-400 font-bold block text-[11px]">👑 Admin</span>
              <span className="text-gray-400 text-[10px]">Unrestricted P&L, bill edits & user roles</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-blue-400 font-bold block text-[11px]">💼 Manager</span>
              <span className="text-gray-400 text-[10px]">Floor operations, stock inward & attendance</span>
            </div>
            <div className="p-2 rounded bg-gray-900 border border-gray-800">
              <span className="text-emerald-400 font-bold block text-[11px]">🍽️ Staff</span>
              <span className="text-gray-400 text-[10px]">Order punch, KDS bump station, zero bill edits</span>
            </div>
          </div>
          <div className="p-2 rounded-lg bg-gray-900/80 border border-gray-800 text-[11px] font-mono text-gray-400 flex items-center justify-between">
            <span className="truncate">
              16-SEP 22:42 · Admin modified Table 4 bill #1042 · Status: VERIFIED · IP: 192.168.1.10
            </span>
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-sans font-bold text-[10px] shrink-0 ml-2">
              Audit Verified
            </span>
          </div>
        </div>
      );

    default:
      return null;
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pitch Deck State
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'pitch' | 'login'>('pitch');
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const { login } = useAuth();
  const router = useRouter();

  const scrollToSlide = (index: number) => {
    setIsPlaying(false);
    setCurrentSlideIndex(index);
    slideRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrev = () => {
    setIsPlaying(false);
    const prevIdx = (currentSlideIndex - 1 + PITCH_SLIDES.length) % PITCH_SLIDES.length;
    setCurrentSlideIndex(prevIdx);
    slideRefs.current[prevIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleNext = () => {
    setIsPlaying(false);
    const nextIdx = (currentSlideIndex + 1) % PITCH_SLIDES.length;
    setCurrentSlideIndex(nextIdx);
    slideRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Keyboard navigation (Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlideIndex]);

  // Auto-play slideshow (every 8 seconds if enabled)
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentSlideIndex((prev) => {
        const next = (prev + 1) % PITCH_SLIDES.length;
        slideRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // IntersectionObserver to sync slide counter & active pill when user scrolls naturally
  useEffect(() => {
    const container = slideContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-slide-index'));
            if (!isNaN(idx)) {
              setCurrentSlideIndex(idx);
            }
          }
        });
      },
      {
        root: container,
        threshold: 0.5,
      }
    );

    slideRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Smoothly center active category pill
  useEffect(() => {
    pillRefs.current[currentSlideIndex]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [currentSlideIndex]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const redirectTarget = params?.get('redirect') || '/dashboard';
      router.push(redirectTarget);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('peyala123');
    setError('');
  };

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col lg:flex-row overflow-hidden selection:bg-brand-500 selection:text-white">
      {/* Mobile Top Navigation Switcher */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-gray-900/90 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-lg shadow-md">
            🍵
          </div>
          <div>
            <span className="font-black text-lg text-white tracking-tight">Peyala</span>
            <span className="text-[10px] text-brand-400 font-bold ml-1.5 uppercase tracking-wider">v8.0</span>
          </div>
        </div>

        <div className="flex bg-gray-800 p-1 rounded-lg text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('pitch')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'pitch' ? 'bg-brand-500 text-white shadow-xs' : 'text-gray-400'
            }`}
          >
            Investor Deck
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('login')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeTab === 'login' ? 'bg-brand-500 text-white shadow-xs' : 'text-gray-400'
            }`}
          >
            Sign In
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LEFT COLUMN: SCROLLABLE INVESTOR PITCH DECK & FEATURE SHOWCASE SLIDES     */}
      {/* ========================================================================= */}
      <div
        className={`flex-1 flex flex-col h-full overflow-hidden ${
          activeTab === 'pitch' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* Top Pitch Header Bar (Pinned) */}
        <div className="p-4 sm:p-5 lg:px-8 lg:py-4 border-b border-gray-800/80 shrink-0 bg-gray-950/90 backdrop-blur-md flex items-center justify-between gap-4 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 flex items-center justify-center text-xl shadow-lg shadow-brand-500/20">
              🍵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-xl text-white tracking-tight">Peyala Business OS</h2>
                <span className="bg-brand-500/20 text-brand-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-brand-500/30 uppercase">
                  Investor Pitch Deck
                </span>
              </div>
              <p className="text-xs text-gray-400 hidden sm:block">Next-Gen Autonomous Restaurant Operations & ERP</p>
            </div>
          </div>

          {/* Slide Navigation Controls */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-mono font-bold text-gray-400 bg-gray-900 border border-gray-800 px-2.5 py-1 rounded-md">
              <span className="text-brand-400 font-black">{String(currentSlideIndex + 1).padStart(2, '0')}</span> /{' '}
              {String(PITCH_SLIDES.length).padStart(2, '0')}
            </span>

            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Previous Slide (↑ / ←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title={isPlaying ? 'Pause Slideshow' : 'Auto-Play Slideshow'}
            >
              {isPlaying ? <Pause className="w-4 h-4 text-brand-400" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Next Slide (↓ / →)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category Pills Scroller (Pinned) */}
        <div className="px-4 sm:px-5 lg:px-8 py-2.5 border-b border-gray-800/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 bg-gray-950/60 z-10">
          {PITCH_SLIDES.map((slide, idx) => {
            const isActive = idx === currentSlideIndex;
            return (
              <button
                key={slide.id}
                ref={(el) => {
                  pillRefs.current[idx] = el;
                }}
                onClick={() => scrollToSlide(idx)}
                className={`text-[11px] font-bold px-3 py-1 rounded-full whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-xs ring-2 ring-brand-400/40'
                    : 'bg-gray-900/80 hover:bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-800'
                }`}
              >
                {slide.badge}
              </button>
            );
          })}
        </div>

        {/* Scrollable Slide Cards Track */}
        <div
          ref={slideContainerRef}
          className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-smooth p-4 sm:p-6 lg:p-8 space-y-8"
        >
          {PITCH_SLIDES.map((slide, idx) => (
            <div
              key={slide.id}
              ref={(el) => {
                slideRefs.current[idx] = el;
              }}
              data-slide-index={idx}
              className="snap-start snap-always bg-gradient-to-b from-gray-900/95 to-gray-900/60 border border-gray-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[580px]"
            >
              {/* Ambient Glows */}
              <div className="absolute -right-20 -top-20 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-20 -bottom-20 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

              <div>
                {/* Slide Category Header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-black uppercase tracking-widest text-brand-400">
                    {slide.category}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                  <span className="text-xs font-semibold text-gray-400">
                    Slide {idx + 1} of {PITCH_SLIDES.length}
                  </span>
                </div>

                {/* Big Investor Headline */}
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight mb-2">
                  {slide.title}
                </h1>
                <p className="text-sm sm:text-base text-gray-300 font-medium mb-6">{slide.subtitle}</p>

                {/* Problem vs Solution Split Box */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> The Industry Pain Point
                    </span>
                    <p className="text-xs sm:text-sm text-rose-200/90 leading-relaxed">{slide.problem}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/40 space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> The Peyala Innovation
                    </span>
                    <p className="text-xs sm:text-sm text-emerald-200/90 leading-relaxed">{slide.solution}</p>
                  </div>
                </div>

                {/* Interactive Feature Visual Mockup Widget */}
                <div className="p-4 rounded-xl bg-gray-950/80 border border-gray-800 mb-6">
                  {renderMockup(slide.mockupType)}
                </div>

                {/* Key Investment Metrics Cards */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {slide.metrics.map((m, mIdx) => (
                    <div key={mIdx} className="p-3 rounded-xl bg-gray-950/70 border border-gray-800 text-center">
                      <span className="text-[10px] font-bold uppercase text-gray-400 block mb-0.5">{m.label}</span>
                      <span className="text-lg sm:text-xl font-black text-brand-400 block">{m.value}</span>
                      {m.trend && <span className="text-[10px] font-semibold text-emerald-400">{m.trend}</span>}
                    </div>
                  ))}
                </div>

                {/* Strategic Feature Highlights */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                    Competitive Moats & Architecture
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {slide.highlights.map((h, hIdx) => (
                      <div key={hIdx} className="flex items-start gap-2 text-gray-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Slide Indicators Bar (Pinned) */}
        <div className="p-3 sm:p-4 lg:px-8 lg:py-3 border-t border-gray-800/80 flex items-center justify-between shrink-0 bg-gray-950/90 backdrop-blur-md z-10 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            {PITCH_SLIDES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => scrollToSlide(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === currentSlideIndex ? 'w-8 bg-brand-500' : 'w-2 bg-gray-800 hover:bg-gray-700'
                }`}
                title={`Jump to slide ${idx + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[11px] text-gray-400">
              Scroll or use <kbd className="px-1 py-0.5 bg-gray-800 rounded text-[10px] text-gray-300">↑</kbd>{' '}
              <kbd className="px-1 py-0.5 bg-gray-800 rounded text-[10px] text-gray-300">↓</kbd> to explore
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className="lg:hidden text-xs font-bold text-brand-400 hover:text-brand-300 flex items-center gap-1 cursor-pointer"
            >
              Ready to Sign In <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT COLUMN: POLISHED, SECURE BUSINESS LOGIN PORTAL                      */}
      {/* ========================================================================= */}
      <div
        className={`w-full lg:w-[440px] xl:w-[480px] p-6 sm:p-10 lg:p-12 flex flex-col justify-center bg-gray-900/95 border-l border-gray-800/80 backdrop-blur-2xl shrink-0 h-full overflow-y-auto ${
          activeTab === 'login' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        <div className="w-full max-w-sm mx-auto space-y-6">
          {/* Brand Header */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-brand-600 to-brand-500 rounded-2xl mb-4 shadow-xl shadow-brand-500/25 ring-4 ring-brand-500/10">
              <span className="text-3xl">🍵</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Peyala Business</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1 font-medium">Enterprise Restaurant Admin & POS Portal</p>
          </div>

          {/* Quick Demo Access Pills */}
          <div className="p-3.5 rounded-xl bg-gray-950/80 border border-gray-800 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
              <span>Quick Demo Autofill:</span>
              <span className="text-[10px] text-brand-400">1-Tap Fill</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => fillCredentials('admin@peyala.com')}
                className="py-1.5 px-2 rounded-lg bg-gray-800/90 hover:bg-brand-500/20 hover:border-brand-500/40 border border-gray-700/80 text-[11px] font-bold text-gray-200 transition-colors text-center cursor-pointer"
              >
                👑 Admin
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('manager@peyala.com')}
                className="py-1.5 px-2 rounded-lg bg-gray-800/90 hover:bg-brand-500/20 hover:border-brand-500/40 border border-gray-700/80 text-[11px] font-bold text-gray-200 transition-colors text-center cursor-pointer"
              >
                💼 Manager
              </button>
              <button
                type="button"
                onClick={() => fillCredentials('staff@peyala.com')}
                className="py-1.5 px-2 rounded-lg bg-gray-800/90 hover:bg-brand-500/20 hover:border-brand-500/40 border border-gray-700/80 text-[11px] font-bold text-gray-200 transition-colors text-center cursor-pointer"
              >
                🍽️ Staff
              </button>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-sm font-medium text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                  placeholder="admin@peyala.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Password</span>
                <span className="text-[10px] text-gray-400 font-normal">Default: peyala123</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-950 border border-gray-800 rounded-xl text-sm font-medium text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl shadow-lg shadow-brand-500/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* System Status Footer */}
          <div className="pt-2 text-center border-t border-gray-800/60 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>System Operational · v8.0 Production Ready</span>
            </div>
            <p className="text-[11px] text-gray-400">
              Peyala Café & Restaurant Operations Engine · Howrah, WB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

