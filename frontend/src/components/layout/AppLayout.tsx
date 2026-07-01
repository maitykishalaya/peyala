'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn, getInitials } from '@/lib/utils';
import Walkthrough from '@/components/ui/Walkthrough';
import {
  LayoutDashboard, Wallet, Package, ShoppingCart, Users, TrendingUp,
  ArrowDownLeft, ArrowUpRight, UserCheck, BarChart3, Settings,
  Menu, X, LogOut, ChevronRight, Moon, Sun, Scale
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { href: '/suppliers', label: 'Suppliers', icon: Users },
  { href: '/sales', label: 'Sales', icon: TrendingUp },
  { href: '/receipts', label: 'Receipts', icon: ArrowDownLeft },
  { href: '/payments', label: 'Payments', icon: ArrowUpRight },
  { href: '/staff', label: 'Staff', icon: UserCheck },
  { href: '/balancesheet', label: 'Balance Sheet', icon: Scale },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading, showWalkthrough, dismissWalkthrough } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {showWalkthrough && <Walkthrough onComplete={dismissWalkthrough} />}
      {/* Sidebar */}
      <aside className={cn(
        'flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex-shrink-0 z-20',
        sidebarOpen ? 'w-60' : 'w-16'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🍵</span>
          </div>
          {sidebarOpen && <div><p className="font-bold text-gray-900 dark:text-white text-sm leading-none">Peyala</p><p className="text-[10px] text-gray-400 mt-0.5">Business Admin</p></div>}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                  active ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                )}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{label}</span>}
                {sidebarOpen && active && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          <div className={cn('flex items-center gap-3', !sidebarOpen && 'justify-center')}>
            <div className="w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
              {getInitials(user.name)}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                <p className="text-[10px] text-gray-400 capitalize">{user.role}</p>
              </div>
            )}
            {sidebarOpen && (
              <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4 px-4 flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h1 className="font-semibold text-gray-800 dark:text-gray-200 text-sm flex-1">
            {NAV.find(n => pathname.startsWith(n.href))?.label || 'Peyala'}
          </h1>
          <button onClick={() => setDark(!dark)} className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
