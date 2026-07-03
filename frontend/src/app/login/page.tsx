'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-orange-50 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-500 rounded-2xl mb-4 shadow-lg">
            <span className="text-3xl">🍵</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Peyala</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Business Admin Portal</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" placeholder="admin@peyala.com" required />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" placeholder="••••••••" required />
            </div>
            {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full btn-primary py-3 text-base flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in...</> : 'Sign In'}
            </button>
          </form>
          <p className="text-xs text-gray-400 text-center mt-4">Default: admin@peyala.com / peyala123</p>
        </div>
      </div>
    </div>
  );
}
