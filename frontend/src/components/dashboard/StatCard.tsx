import { cn, formatCurrency } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  trend?: number;
  isCurrency?: boolean;
  accent?: 'green' | 'red' | 'blue' | 'purple' | 'orange';
}

const accents = {
  green: 'from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border-green-100 dark:border-green-900/30',
  red: 'from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10 border-red-100 dark:border-red-900/30',
  blue: 'from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border-blue-100 dark:border-blue-900/30',
  purple: 'from-purple-50 to-violet-50 dark:from-purple-900/10 dark:to-violet-900/10 border-purple-100 dark:border-purple-900/30',
  orange: 'from-orange-50 to-amber-50 dark:from-orange-900/10 dark:to-amber-900/10 border-orange-100 dark:border-orange-900/30',
};

const iconColors = {
  green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
};

export default function StatCard({ title, value, subtitle, icon: Icon, trend, isCurrency = true, accent = 'blue' }: StatCardProps) {
  const displayValue = isCurrency ? formatCurrency(Number(value)) : value;
  return (
    <div className={cn('card p-5 bg-gradient-to-br border', accents[accent])}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 truncate">{displayValue}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
          {trend !== undefined && (
            <div className={cn('flex items-center gap-1 mt-2 text-xs font-medium', trend >= 0 ? 'text-green-600' : 'text-red-600')}>
              {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend)}% vs last month
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-3', iconColors[accent])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
