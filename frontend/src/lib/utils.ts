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
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
}

export function formatDateInput(date: Date = new Date()): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
