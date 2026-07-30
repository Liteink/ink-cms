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
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <Link href="/" className="mb-10 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[8px]" style={{ background: 'linear-gradient(135deg, #FF7A30, #FF4D00)' }}>
            <svg width="18" height="18" viewBox="0 0 120 120" fill="none">
              <path fillRule="evenodd" clipRule="evenodd" d="M60 12 C60 12, 92 48, 92 70 C92 88, 78 100, 60 100 C42 100, 28 88, 28 70 C28 48, 60 12, 60 12 Z M58 30 L46 62 L56 62 L50 84 L66 50 L56 50 Z" fill="white"/>
            </svg>
          </span>
          <span className="text-[19px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Ink CMS</span>
        </Link>

        <div className="card-premium p-7">
          <h1 className="mb-1 text-[20px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="mb-6 text-[13px]" style={{ color: 'var(--muted)' }}>
            {mode === 'login' ? 'Sign in to your dashboard' : 'First account becomes admin'}
          </p>

          {/* Mode tabs */}
          <div className="mb-6 flex gap-1 rounded-[999px] p-1" style={{ background: 'var(--surface-2)' }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                className="btn-pill flex-1 justify-center"
                style={
                  mode === m
                    ? { background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
                    : { background: 'transparent', color: 'var(--muted)', borderColor: 'transparent' }
                }
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <div>
                <label className="mb-2 block text-[12px] font-medium" style={{ color: 'var(--muted)' }}>Name</label>
                <input className="input-line" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label className="mb-2 block text-[12px] font-medium" style={{ color: 'var(--muted)' }}>Email</label>
              <input type="email" className="input-line" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="mb-2 block text-[12px] font-medium" style={{ color: 'var(--muted)' }}>Password</label>
              <input type="password" className="input-line" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            {error && <div className="rounded-[8px] px-3 py-2.5 text-[12px]" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>{error}</div>}

            <button type="submit" disabled={loading} className="btn-pill btn-brand mt-3 justify-center" style={{ padding: '10px 16px', fontSize: '13px' }}>
              {loading ? <span className="spinner" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-[11px]" style={{ color: 'var(--faint)' }}>
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/auth/visitor', { method: 'POST' });
                const data = await res.json();
                if (data.token) {
                  localStorage.setItem('ink-cms-token', data.token);
                  localStorage.setItem('ink-cms-visitor', 'true');
                  router.push('/admin');
                }
              } catch { /* ignore */ }
            }}
            className="hover:opacity-70 transition-opacity"
            style={{ color: 'var(--muted)' }}
          >
            Just looking? Explore the demo →
          </button>
          <div className="mt-3">
            Open source · <a href="https://github.com/Liteink/ink-cms" target="_blank" rel="noopener" className="hover:opacity-70">GitHub</a> · <a href="https://liteink.co" className="hover:opacity-70">LiteInk</a>
          </div>
        </div>
      </div>
    </div>
  );
}
