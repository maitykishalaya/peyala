import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
}

export function formatDateInput(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

export function today(): string {
  return formatDateInput(new Date());
}

export function monthStart(): string {
  const d = new Date();
  return formatDateInput(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export const PAYMENT_CATEGORIES = [
  'Raw Materials', 'Staff Expenses', 'Utilities', 'Rent', 'Serving Materials',
  'Marketing', 'Repairs & Maintenance', 'Sanitation', 'Transport', 'Miscellaneous'
];

export const UNITS = ['kg', 'gram', 'litre', 'ml', 'piece', 'packet', 'box', 'dozen', 'bottle'];
