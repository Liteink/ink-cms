'use client';

import AdminShell from '@/components/AdminShell';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

const ROLE_META: Record<string, { label: string; pillClass: string; dot: string; desc: string }> = {
  admin:   { label: 'Admin',   pillClass: 'pill-admin',   dot: '#ef4444', desc: 'Full access — users, keys, webhooks, settings' },
  user:    { label: 'User',    pillClass: 'pill-user',    dot: '#22c55e', desc: 'Read & write posts, media. No system config.' },
  visitor: { label: 'Visitor', pillClass: 'pill-visitor', dot: 'var(--muted)', desc: 'Read-only access' },
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', name: '', password: '', role: 'user' });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(data.users || []);
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const changeRole = async (id: string, role: string) => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
      setEditingId(null);
    }
  };

  const deleteUser = async (id: string, email: string) => {
    if (!confirm(`Delete user "${email}"? This will revoke all their sessions.`)) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!addForm.email || !addForm.password) { setAddError('Email and password required'); return; }
    if (addForm.password.length < 6) { setAddError('Password must be at least 6 characters'); return; }
    setAddLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setUsers(prev => [{ ...data.user, created_at: new Date().toISOString() }, ...prev]);
      setAddForm({ email: '', name: '', password: '', role: 'user' });
      setShowAdd(false);
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <AdminShell breadcrumb="Overview / Users">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Users</h1>
        {!showAdd && !loading && !error && (
          <button onClick={() => setShowAdd(true)} className="btn-pill btn-solid btn-xs">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Add User
          </button>
        )}
      </div>
      <p className="mb-6 text-[12px]" style={{ color: 'var(--muted)' }}>Manage team members and their roles.</p>

      {/* Add user inline form */}
      {showAdd && (
        <div className="card-glass mb-4 p-4">
          <form onSubmit={addUser} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Email</label>
                <input type="email" className="input-box" placeholder="you@example.com" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} required />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Name</label>
                <input className="input-box" placeholder="Name (optional)" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} />
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Password</label>
                <input type="password" className="input-box" placeholder="••••••••" value={addForm.password} onChange={e => setAddForm({ ...addForm, password: e.target.value })} required />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Role</label>
                <div className="flex gap-1 rounded-[999px] p-0.5" style={{ background: 'var(--surface-2)' }}>
                  {Object.entries(ROLE_META).map(([key, r]) => (
                    <button
                      key={key} type="button"
                      onClick={() => setAddForm({ ...addForm, role: key })}
                      className="btn-pill btn-xs"
                      style={addForm.role === key ? { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' } : { background: 'transparent', color: 'var(--muted)', borderColor: 'transparent' }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {addError && <div className="rounded-[4px] px-3 py-2 text-[12px]" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{addError}</div>}
            <div className="flex items-center gap-2">
              <button type="submit" disabled={addLoading} className="btn-pill btn-solid btn-xs">
                {addLoading ? 'Creating...' : 'Create User'}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setAddError(''); }} className="btn-pill btn-xs btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Role legend */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(ROLE_META).map(([key, r]) => (
          <div key={key} className="flex items-center gap-2 rounded-[6px] border px-2.5 py-1.5" style={{ borderColor: 'var(--border)' }}>
            <span className="h-2 w-2 rounded-full" style={{ background: r.dot }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--ink)' }}>{r.label}</span>
            <span className="text-[10px]" style={{ color: 'var(--faint)' }}>— {r.desc}</span>
          </div>
        ))}
      </div>

      {error ? (
        <div className="card-glass p-6 text-center text-[13px]" style={{ color: '#ef4444' }}>
          Access denied. Admin role required.
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : users.length === 0 ? (
        <div className="card-glass p-8 text-center">
          <p className="mb-2 text-[13px]" style={{ color: 'var(--body)' }}>No users yet.</p>
          <a href="/login" className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>Register the first admin account →</a>
        </div>
      ) : (
        <div className="card-glass overflow-hidden">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 border-b px-4 py-3.5 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{u.name || u.email}</span>
                  {u.name && <span className="truncate text-[11px]" style={{ color: 'var(--faint)' }}>· {u.email}</span>}
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: 'var(--faint)' }}>
                  {new Date(u.created_at + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {editingId === u.id ? (
                  <div className="flex items-center gap-1">
                    {Object.entries(ROLE_META).map(([key, r]) => (
                      <button
                        key={key}
                        onClick={() => changeRole(u.id, key)}
                        className="btn-pill btn-xs"
                        style={u.role === key ? { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' } : { background: 'transparent', color: 'var(--body)', borderColor: 'var(--border-2)' }}
                      >
                        {r.label}
                      </button>
                    ))}
                    <button onClick={() => setEditingId(null)} className="btn-pill btn-xs btn-ghost">Cancel</button>
                  </div>
                ) : (
                  <>
                    <span className={`pill ${ROLE_META[u.role]?.pillClass || 'pill-visitor'}`}>
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: ROLE_META[u.role]?.dot }} />
                      {ROLE_META[u.role]?.label || u.role}
                    </span>
                    <button onClick={() => setEditingId(u.id)} className="btn-pill btn-xs btn-ghost">Edit</button>
                    <button onClick={() => deleteUser(u.id, u.email)} className="btn-pill btn-xs btn-danger">Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
