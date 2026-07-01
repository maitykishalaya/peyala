// ─────────────────────────────────────────────────────────────────
// PaymentModeSelect.tsx
// A reusable dropdown component for selecting payment mode.
// It ONLY shows modes that are allowed for the selected account.
//
// How it works:
//   1. Parent form calls getModesForAccount(accountId) when account changes
//   2. Result is passed as `allowedModes` prop to this component
//   3. This component renders ONLY those modes in the dropdown
//   4. If no account selected yet → shows all modes (graceful fallback)
//
// Used in: Purchases page, Payments page
// ─────────────────────────────────────────────────────────────────

'use client';

import { ALL_PAYMENT_MODES } from '@/lib/paymentModes';

interface PaymentModeSelectProps {
  // Currently selected mode value (controlled component)
  value: string;

  // Callback when user picks a different mode
  onChange: (value: string) => void;

  // Modes allowed for the currently selected account.
  // If undefined or empty → show ALL modes (no account selected yet)
  allowedModes?: { value: string; label: string }[];

  // Optional extra CSS classes
  className?: string;

  // Whether the dropdown should be disabled (e.g. no account selected)
  disabled?: boolean;
}

export default function PaymentModeSelect({
  value,
  onChange,
  allowedModes,
  className = '',
  disabled = false,
}: PaymentModeSelectProps) {

  // Decide which modes to show in the dropdown:
  // - If allowedModes was passed and has items → use those (filtered list)
  // - Otherwise → show all possible modes (fallback when no account selected)
  const modesToShow = (allowedModes && allowedModes.length > 0)
    ? allowedModes
    : ALL_PAYMENT_MODES;

  return (
    <select
      className={`input ${className}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      {/* Render one <option> per allowed mode */}
      {modesToShow.map(mode => (
        <option key={mode.value} value={mode.value}>
          {mode.label}
        </option>
      ))}
    </select>
  );
}
