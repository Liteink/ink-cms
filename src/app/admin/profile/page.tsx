'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { getAuthHeaders } from '@/lib/api';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('ink-cms-token');
    if (!token || !token.startsWith('ink_sess_')) { router.replace('/login'); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (!d.user) { router.replace('/login'); return; }
        setUser(d.user);
        setName(d.user.name || '');
        setEmail(d.user.email || '');
        setLoading(false);
      })
      .catch(() => { router.replace('/login'); });
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed');
      }
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    setSavingPw(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed');
      }
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e: any) {
      setPwError(e.message);
    } finally {
      setSavingPw(false);
    }
  };

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST', headers: getAuthHeaders() }).catch(() => {});
    localStorage.removeItem('ink-cms-token');
    router.push('/login');
  };

  if (loading) return <AdminShell breadcrumb="Profile"><div className="flex justify-center py-12"><div className="spinner" /></div></AdminShell>;

  return (
    <AdminShell breadcrumb={`Overview / Profile`}>
      <h1 className="mb-1 text-[18px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>{user.name || user.email}</h1>
      <p className="mb-6 text-[12px]" style={{ color: 'var(--muted)' }}>Manage your account.</p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Profile section */}
        <div className="card-glass p-5">
          <h2 className="mb-4 text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>Profile</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Name</label>
              <input className="input-line" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Email</label>
              <input type="email" className="input-line" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Role</label>
              <div className="text-[12px]" style={{ color: 'var(--faint)' }}>{user.role}</div>
            </div>
            <button onClick={saveProfile} disabled={savingProfile} className="btn-pill btn-solid btn-xs" style={{ alignSelf: 'flex-start' }}>
              {savingProfile ? 'Saving...' : profileSaved ? '✓ Saved' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Password + Danger */}
        <div className="flex flex-col gap-5">
          <div className="card-glass p-5">
            <h2 className="mb-4 text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>Change Password</h2>
            <form onSubmit={changePassword} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Current Password</label>
                <input type="password" className="input-line" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>New Password</label>
                <input type="password" className="input-line" value={newPw} onChange={e => setNewPw(e.target.value)} required />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Confirm New Password</label>
                <input type="password" className="input-line" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
              </div>
              {pwError && <div className="rounded-[4px] px-3 py-2 text-[12px]" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{pwError}</div>}
              {pwSuccess && <div className="rounded-[4px] px-3 py-2 text-[12px]" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>Password changed. Other sessions have been logged out.</div>}
              <button type="submit" disabled={savingPw} className="btn-pill btn-solid btn-xs" style={{ alignSelf: 'flex-start' }}>
                {savingPw ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          <div className="card-glass p-5">
            <h2 className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>Session</h2>
            <p className="mb-3 text-[11px]" style={{ color: 'var(--muted)' }}>Sign out from this device.</p>
            <button onClick={logout} className="btn-pill btn-xs btn-danger">Sign Out</button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
