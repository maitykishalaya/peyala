import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '••••••';
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount));
}

export function formatDate(date: string | Date): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

export function formatDateInput(date: Date | string = new Date()): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function today(): string {
  return formatDateInput(new Date());
}

export function monthStart(): string {
  const istStr = formatDateInput(new Date());
  const [y, m] = istStr.split('-');
  return `${y}-${m}-01`;
}

export function clearFinancialCaches() {
  const prefixes = [
    'peyala_sales_list_cache',
    'peyala_sales_accounts_cache',
    'peyala_reports_sales_cache',
    'peyala_reports_daily_cache',
    'peyala_reports_pnl_cache',
    'peyala_balancesheet_cache',
    'peyala_accounts_cache',
    'peyala_dashboard_cache',
  ];
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && prefixes.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('peyala_sales_updated'));
  }
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export const PAYMENT_CATEGORIES = [
  'Raw Materials', 'Staff Expenses', 'Utilities', 'Rent', 'Serving Materials',
  'Marketing', 'Repairs & Maintenance', 'Sanitation', 'Transport', 'Miscellaneous'
];

export const UNITS = ['kg', 'gram', 'litre', 'ml', 'piece', 'packet', 'box', 'dozen', 'bottle'];

export const BEVERAGE_CATEGORY_REGEX =
  /\b(drink|drinks|beverage|beverages|coffee|coffees|tea|teas|chai|shake|shakes|juice|juices|mocktail|mocktails|cocktail|cocktails|soda|sodas|smoothie|smoothies|cooler|coolers|cold\s*drinks?|soft\s*drinks?)\b/i;

export const BEVERAGE_ITEM_REGEX =
  /\b(thums\s*up|thumsup|coca\s*cola|coke|pepsi|sprite|fanta|limca|mirinda|mountain\s*dew|dew|7\s*up|seven\s*up|soda|sodas|mojito|mojitos|blue\s*lagoon|pina\s*colada|iced?\s*tea|tea|teas|chai|coffee|coffees|shake|shakes|juice|juices|smoothie|smoothies|mocktail|mocktails|cocktail|cocktails|lassi|water|beverage|beverages|drink|drinks|frappe|latte|cappuccino|espresso|lemonade|red\s*bull|sting|appy)\b/i;

export function isBeverageItem(item: any): boolean {
  if (!item) return false;
  const cat = (item.menuItem as any)?.category || (item as any)?.category;
  const catName =
    typeof cat === 'object' && cat !== null
      ? String(cat.name || '')
      : String(cat || '');

  if (catName && BEVERAGE_CATEGORY_REGEX.test(catName)) {
    return true;
  }

  const name = String(item.name || '').trim();
  return BEVERAGE_ITEM_REGEX.test(name);
}
