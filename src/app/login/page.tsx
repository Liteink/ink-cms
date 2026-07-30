'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('ink-cms-token');
    if (token && token.startsWith('ink_sess_')) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (d.user) router.push('/admin'); })
        .catch(() => {});
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register' ? { email, password, name } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      localStorage.setItem('ink-cms-token', data.token);
      router.push('/admin');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-[340px]">
        {/* Logo */}
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-[6px]" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /></svg>
          </span>
          <span className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Ink CMS</span>
        </Link>

        <div className="card-glass p-6">
          {/* Mode tabs */}
          <div className="mb-5 flex gap-1 rounded-[999px] p-0.5" style={{ background: 'var(--surface-2)' }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className="btn-pill flex-1"
                style={
                  mode === m
                    ? { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' }
                    : { background: 'transparent', color: 'var(--muted)', borderColor: 'transparent' }
                }
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            {mode === 'register' && (
              <div>
                <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Name</label>
                <input className="input-line" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Email</label>
              <input type="email" className="input-line" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Password</label>
              <input type="password" className="input-line" placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            {error && <div className="rounded-[4px] px-3 py-2 text-[12px]" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>}

            <button type="submit" disabled={loading} className="btn-pill btn-solid mt-2 justify-center">
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-4 border-t pt-3 text-center" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[10px]" style={{ color: 'var(--faint)' }}>
              The first registered account becomes admin.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
