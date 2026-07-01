'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi } from '@/lib/api';

interface User { id: string; name: string; email: string; role: string; }
interface AuthCtx {
  user: User | null;
  token: string | null;
  showWalkthrough: boolean;
  dismissWalkthrough: () => void;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('peyala_token');
    const u = localStorage.getItem('peyala_user');
    if (t && u) { setToken(t); setUser(JSON.parse(u)); }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const { token, user } = res.data;
    localStorage.setItem('peyala_token', token);
    localStorage.setItem('peyala_user', JSON.stringify(user));
    setToken(token);
    setUser(user);
    // Show walkthrough on every login
    setShowWalkthrough(true);
  };

  const dismissWalkthrough = () => {
    setShowWalkthrough(false);
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem('peyala_token');
    localStorage.removeItem('peyala_user');
    setToken(null);
    setUser(null);
    setShowWalkthrough(false);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, showWalkthrough, dismissWalkthrough, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
