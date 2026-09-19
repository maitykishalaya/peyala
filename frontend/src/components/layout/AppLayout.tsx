'use client';
import { useState, useEffect, useLayoutEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn, getInitials } from '@/lib/utils';
import Walkthrough from '@/components/ui/Walkthrough';
import ThermalPreviewModal from '@/components/ui/ThermalPreviewModal';
import WastagePromptBanner from '@/components/ui/WastagePromptBanner';
import {
  LayoutDashboard, Wallet, Package, ShoppingCart, Users, TrendingUp,
  ArrowUpRight, UserCheck, BarChart3, Settings,
  Menu, X, LogOut, ChevronRight, Moon, Sun, Scale, CalendarCheck,
  UtensilsCrossed, ChefHat, ShieldAlert, Trash2, BookOpen
} from 'lucide-react';
import DiningTableIcon from '@/components/ui/DiningTableIcon';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tables', label: 'Tables', icon: DiningTableIcon },
  { href: '/kds', label: 'Kitchen KDS', icon: ChefHat },
  { href: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { href: '/suppliers', label: 'Suppliers', icon: Users },
  { href: '/sales', label: 'Sales', icon: TrendingUp },
  { href: '/dues', label: 'Customer Dues', icon: BookOpen },
  { href: '/payments', label: 'Payments', icon: ArrowUpRight },
  { href: '/wastage', label: 'Wastage', icon: Trash2 },
  { href: '/expense-leak-detector', label: 'Leak Detector', icon: ShieldAlert },
  { href: '/staff', label: 'Staff', icon: UserCheck },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { href: '/balancesheet', label: 'Balance Sheet', icon: Scale },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading, showWalkthrough, dismissWalkthrough } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useLayoutEffect(() => {
    const storedTheme = localStorage.getItem('peyala_dark_mode');
    const initialDark = storedTheme !== null
      ? storedTheme === 'true'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;

    setDark(initialDark);
    document.documentElement.classList.toggle('dark', initialDark);

    // Initialize sidebar state with persistence for desktop/laptop
    const isDesktop = window.innerWidth >= 768;
    if (isDesktop) {
      if (window.location.pathname.startsWith('/tables')) {
        setSidebarOpen(false);
        try {
          localStorage.setItem('peyala_sidebar_open', 'false');
        } catch {
          // ignore
        }
      } else {
        const storedSidebar = localStorage.getItem('peyala_sidebar_open');
        if (storedSidebar !== null) {
          setSidebarOpen(storedSidebar === 'true');
        } else {
          // Default on laptop/desktop: minimized (w-16 rail) to maximize screen space
          setSidebarOpen(false);
          try {
            localStorage.setItem('peyala_sidebar_open', 'false');
          } catch {
            // ignore
          }
        }
      }
    } else {
      setSidebarOpen(false);
    }

    setMounted(true);

    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        const storedSidebar = localStorage.getItem('peyala_sidebar_open');
        if (storedSidebar !== null) {
          setSidebarOpen(storedSidebar === 'true');
        } else {
          setSidebarOpen(false);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // When navigating to /tables, always ensure the drawer is auto-minimised on laptops
  useEffect(() => {
    if (pathname.startsWith('/tables')) {
      setSidebarOpen(false);
      try {
        localStorage.setItem('peyala_sidebar_open', 'false');
      } catch {
        // ignore
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('peyala_dark_mode', dark.toString());
      document.documentElement.classList.toggle('dark', dark);
    }
  }, [dark, mounted]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('peyala_sidebar_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleNavClick = () => {
    // Auto-minimise drawer on laptops and mobile when clicking on a page
    setSidebarOpen(false);
    try {
      localStorage.setItem('peyala_sidebar_open', 'false');
    } catch {
      // ignore
    }
  };

  const handleContentClick = () => {
    // Auto-minimise drawer on laptops when clicking outside the drawer
    if (sidebarOpen) {
      setSidebarOpen(false);
      try {
        localStorage.setItem('peyala_sidebar_open', 'false');
      } catch {
        // ignore
      }
    }
  };

  if (loading || !user || !mounted) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex h-screen h-[100dvh] max-h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {showWalkthrough && <Walkthrough onComplete={dismissWalkthrough} />}
      <ThermalPreviewModal />
      {/* Sidebar - Desktop and Laptop ONLY */}
      <aside className={cn(
        'hidden md:flex md:flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex-shrink-0 h-full relative z-30',
        sidebarOpen ? 'w-60' : 'w-16'
      )}>
        {/* Logo */}
        <div className={cn(
          'flex items-center py-5 border-b border-gray-100 dark:border-gray-800 transition-all',
          sidebarOpen ? 'gap-3 px-4' : 'justify-center px-0'
        )}>
          <div className={cn('rounded-lg flex-shrink-0 overflow-hidden transition-all', sidebarOpen ? 'w-10 h-10' : 'w-8 h-8')}>
            <img src="/icon.png" alt="Peyala" className="w-full h-full object-contain" />
          </div>
          {sidebarOpen && <div><p className="font-bold text-gray-900 dark:text-white text-sm leading-none">Peyala</p><p className="text-[10px] text-gray-400 mt-0.5">Business Admin</p></div>}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={handleNavClick}
                title={!sidebarOpen ? label : undefined}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-all group',
                  sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center py-2.5 px-0',
                  active
                    ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                <Icon className={cn('flex-shrink-0', sidebarOpen ? 'w-4 h-4' : 'w-5 h-5')} />
                {sidebarOpen && <span className="truncate">{label}</span>}
                {sidebarOpen && active && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          <div className={cn('flex items-center gap-3', !sidebarOpen && 'justify-center')}>
            <div
              className="w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
              title={!sidebarOpen ? `${user.name} (${user.role === 'viewer' ? 'Viewer (Demo)' : user.role})` : undefined}
            >
              {getInitials(user.name)}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{user.name}</p>
                <p className="text-[10px] text-gray-400 capitalize">{user.role === 'viewer' ? 'Viewer (Demo)' : user.role}</p>
              </div>
            )}
            {sidebarOpen && (
              <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Log out">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
        {/* End of Day Wastage Prompt (Active after 10 PM until logged) */}
        <WastagePromptBanner />

        {/* Topbar */}
        <header className="sticky top-0 z-20 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3 sm:gap-4 px-3 sm:px-4 flex-shrink-0">
          {/* Mobile brand icon */}
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 md:hidden">
            <img src="/icon.png" alt="Peyala" className="w-full h-full object-contain" />
          </div>

          {/* Desktop hamburger toggle */}
          <button
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="hidden md:flex p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">
              {NAV.find(n => pathname.startsWith(n.href))?.label || 'Peyala'}
            </h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">Mobile friendly business dashboard</p>
          </div>

          {/* Dark Mode Toggle */}
          <button onClick={() => setDark(!dark)} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Toggle theme">
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Mobile Logout Button */}
          <button onClick={logout} className="md:hidden p-2 text-gray-400 hover:text-red-500 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Log out">
            <LogOut className="w-4 h-4" />
          </button>
        </header>

        {/* Viewer Demo Mode Read-Only Banner */}
        {user?.role === 'viewer' && (
          <div className="bg-amber-500 text-white px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium flex items-center justify-between shadow-xs z-10 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">👀</span>
              <span>
                <strong>Viewer Demo Mode:</strong> You have read-only access. Creating, editing, or deleting business data is disabled.
              </span>
            </div>
            <span className="hidden sm:inline-block bg-amber-700/60 px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-black">
              Read-Only Demo
            </span>
          </div>
        )}

        {/* Content */}
        <main
          onClick={handleContentClick}
          className="flex-1 min-h-0 h-full overflow-y-auto p-3.5 sm:p-6 pb-36 md:pb-24"
        >
          {children}
        </main>

        {/* Bottom mobile nav */}
        <footer className="md:hidden fixed inset-x-0 bottom-0 z-20 bg-white/95 dark:bg-gray-950/95 border-t border-gray-200 dark:border-gray-800 shadow-xl backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center gap-1.5 overflow-x-auto px-3 py-2 scrollbar-none">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <button
                  key={href}
                  type="button"
                  onClick={() => router.push(href)}
                  className={cn(
                    'min-w-[60px] rounded-2xl px-2.5 py-1.5 text-xs font-medium flex flex-col items-center justify-center gap-1 transition-all flex-shrink-0',
                    active ? 'bg-brand-100 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-bold' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="truncate w-full text-[10px]">{label}</span>
                </button>
              );
            })}
          </div>
        </footer>
      </div>
    </div>
  );
}
