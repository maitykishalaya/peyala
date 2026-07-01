// ─────────────────────────────────────────────────────────────────
// paymentModes.ts
// Central file that defines all payment mode labels and helpers.
// Both the Purchases page and Payments page import from here
// so the logic lives in ONE place — change here, updates everywhere.
// ─────────────────────────────────────────────────────────────────

import api, { accountsApi } from './api';

// ── All possible payment modes in the system ─────────────────────
// 'value' = what gets stored in MongoDB
// 'label' = what the user sees in the dropdown
export const ALL_PAYMENT_MODES = [
  { value: 'cash',          label: '💵 Cash' },
  { value: 'upi',           label: '📱 UPI' },
  { value: 'card',          label: '💳 Card' },
  { value: 'bank_transfer', label: '🏦 Bank Transfer' },
  { value: 'cheque',        label: '📝 Cheque' },
] as const;

// Type for a single payment mode value string
export type PaymentModeValue = typeof ALL_PAYMENT_MODES[number]['value'];

// ── getModesForAccount ────────────────────────────────────────────
// Called whenever the user selects an account in a form.
// Fetches that account's allowed modes from the backend
// and returns them so the dropdown can be filtered.
//
// Returns:
//   { modes: [...], defaultMode: 'cash' }
//   modes = array of { value, label } objects the dropdown should show
//   defaultMode = which one should be pre-selected
//
// Example:
//   User selects "Cash Counter" →
//   backend says allowedModes: ['cash'], default: 'cash'
//   → dropdown shows only "💵 Cash", pre-selected
//
//   User selects "Current Account" →
//   backend says allowedModes: ['bank_transfer','cheque','upi'], default: 'bank_transfer'
//   → dropdown shows 3 options, Bank Transfer pre-selected
//
export async function getModesForAccount(accountId: string): Promise<{
  modes: { value: string; label: string }[];
  defaultMode: string;
}> {
  try {
    // Call GET /api/accounts/:id/payment-modes
    const res = await api.get(`/accounts/${accountId}/payment-modes`);
    const { allowedPaymentModes, defaultPaymentMode } = res.data;

    // Filter the full ALL_PAYMENT_MODES list down to only the allowed ones
    // This preserves the display order defined above
    const modes = ALL_PAYMENT_MODES.filter(m =>
      allowedPaymentModes.includes(m.value)
    );

    // If no modes came back (misconfigured account), return all modes as fallback
    if (modes.length === 0) {
      return { modes: [...ALL_PAYMENT_MODES], defaultMode: 'cash' };
    }

    return {
      modes,
      defaultMode: defaultPaymentMode || modes[0].value  // fall back to first allowed mode
    };

  } catch (err) {
    // If the API call fails for any reason, return all modes so the form still works
    console.error('Failed to fetch payment modes for account:', err);
    return { modes: [...ALL_PAYMENT_MODES], defaultMode: 'cash' };
  }
}

// ── getLabelForMode ───────────────────────────────────────────────
// Helper to convert a stored mode value back to a human-readable label
// Used in tables to display "💳 Card" instead of "card"
export function getLabelForMode(value: string): string {
  const found = ALL_PAYMENT_MODES.find(m => m.value === value);
  return found ? found.label : value; // fallback to raw value if not found
}
