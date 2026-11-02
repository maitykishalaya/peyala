'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (urlParams.get('printStation') === 'true' || urlParams.get('kiosk') === 'true' || isLocalHost) {
        if (urlParams.get('printStation') === 'true' || urlParams.get('kiosk') === 'true' || localStorage.getItem('peyala_is_print_station') === null) {
          localStorage.setItem('peyala_is_print_station', 'true');
          localStorage.setItem('peyala_pos_print_mode', 'production');
        }
      }
    }
    if (!loading) router.replace(user ? '/dashboard' : '/login');
  }, [user, loading, router]);
  return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
}
