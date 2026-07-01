'use client';
import { useState } from 'react';
import { authApi } from '@/lib/api';
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Package,
  Users, Wallet, UserCheck, BarChart3, ArrowRight, CheckCircle2, X
} from 'lucide-react';

const STEPS = [
  {
    icon: '🍵',
    title: 'Welcome to Peyala Business Admin',
    description: 'Your all-in-one café management system. Let\'s take a quick tour of what you can do.',
    highlight: null,
    tip: null,
  },
  {
    icon: <LayoutDashboard className="w-10 h-10 text-brand-500" />,
    title: 'Dashboard',
    description: 'Your command centre. See today\'s sales across Outlet, Zomato, and Swiggy at a glance. Account balances, inventory value, and 30-day revenue trends are always visible here.',
    highlight: 'Start here every day.',
    tip: 'The orange banner at the top will prompt you if today\'s sales haven\'t been entered yet.',
  },
  {
    icon: <ShoppingCart className="w-10 h-10 text-green-500" />,
    title: 'Purchases',
    description: 'Log every raw material purchase from your suppliers. Select items, enter quantities and prices — inventory updates automatically and the account balance is deducted.',
    highlight: 'Most important module.',
    tip: 'You can enter multiple items in a single purchase entry (e.g. entire Gate Bazaar trip in one go).',
  },
  {
    icon: <TrendingUp className="w-10 h-10 text-blue-500" />,
    title: 'Sales',
    description: 'Enter daily sales for Outlet, Zomato, and Swiggy. For Zomato/Swiggy, enter the full breakdown — gross sales, commission, discount, GST — and the net settlement is calculated automatically.',
    highlight: 'Enter sales every evening before closing.',
    tip: 'Mark Zomato/Swiggy as "Settlement Received" when the payout hits your account.',
  },
  {
    icon: <Package className="w-10 h-10 text-yellow-500" />,
    title: 'Inventory',
    description: 'Track all raw materials. Stock levels update automatically when you add purchases. Set minimum stock levels to get low-stock alerts on the dashboard.',
    highlight: 'Stock updates automatically from Purchases.',
    tip: 'Use the Low Stock filter to quickly see what needs restocking before tomorrow.',
  },
  {
    icon: <Wallet className="w-10 h-10 text-purple-500" />,
    title: 'Accounts & Payments',
    description: 'Track Cash Counter, Current Account, Petty Cash, and UPI. Every purchase and payment automatically deducts from the chosen account. Receipts add to it.',
    highlight: 'Balances always stay accurate.',
    tip: 'Use Transfers to move money between accounts (e.g. deposit cash into bank).',
  },
  {
    icon: <UserCheck className="w-10 h-10 text-indigo-500" />,
    title: 'Staff',
    description: 'Manage your team. Pay salaries with one click — it creates a payment record and deducts from the account automatically.',
    highlight: 'Salary payments are fully tracked.',
    tip: 'Use the History button on each staff card to see full payment history.',
  },
  {
    icon: <BarChart3 className="w-10 h-10 text-brand-500" />,
    title: 'Reports',
    description: 'Generate P&L statements for any date range. See income by channel, expenses by category, gross profit, net profit, and margins — all in one place.',
    highlight: 'Run a monthly P&L at the end of each month.',
    tip: 'Use "This Month" quick preset for instant current month report.',
  },
  {
    icon: <CheckCircle2 className="w-10 h-10 text-green-500" />,
    title: 'You\'re all set!',
    description: 'Start by updating your real account balances in Accounts, then log today\'s purchases and sales. The dashboard comes alive once data flows in.',
    highlight: null,
    tip: null,
  },
];

interface WalkthroughProps {
  onComplete: () => void;
}

export default function Walkthrough({ onComplete }: WalkthroughProps) {
  const [step, setStep] = useState(0);
  const [completing, setCompleting] = useState(false);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const complete = async () => {
    setCompleting(true);
    try { await authApi.completeWalkthrough(); } catch {}
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800">
          <div
            className="h-1 bg-brand-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Skip button */}
        <button
          onClick={complete}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-8">
          {/* Step counter */}
          <p className="text-xs text-gray-400 font-medium mb-6 uppercase tracking-wider">
            Step {step + 1} of {STEPS.length}
          </p>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
              {typeof current.icon === 'string'
                ? <span className="text-4xl">{current.icon}</span>
                : current.icon
              }
            </div>
          </div>

          {/* Content */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-3">
            {current.title}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-center text-sm leading-relaxed mb-5">
            {current.description}
          </p>

          {current.highlight && (
            <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800 rounded-lg px-4 py-3 mb-3">
              <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 text-center">
                ⭐ {current.highlight}
              </p>
            </div>
          )}

          {current.tip && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg px-4 py-3 mb-5">
              <p className="text-xs text-blue-600 dark:text-blue-400 text-center">
                💡 {current.tip}
              </p>
            </div>
          )}

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${
                  i === step
                    ? 'w-6 h-2 bg-brand-500'
                    : i < step
                    ? 'w-2 h-2 bg-brand-300'
                    : 'w-2 h-2 bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            {!isFirst && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="btn-secondary flex-1"
              >
                Back
              </button>
            )}
            {isLast ? (
              <button
                onClick={complete}
                disabled={completing}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {completing ? 'Starting...' : 'Get Started'}
              </button>
            ) : (
              <button
                onClick={() => setStep(s => s + 1)}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
