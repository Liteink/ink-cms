'use client';

import AdminShell from '@/components/AdminShell';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Category { name: string; slug: string; postCount: number; }

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/categories.json').then(r => r.json()).then(d => { setCats(d.categories || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <AdminShell breadcrumb="Overview / Categories">
      <h1 className="mb-1 text-[18px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Categories</h1>
      <p className="mb-5 text-[12px]" style={{ color: 'var(--muted)' }}>Auto-created from posts. Assign a category to a post and it appears here.</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : cats.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border p-12 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div style={{ color: 'var(--faint)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          </div>
          <p className="text-[13px]" style={{ color: 'var(--body)' }}>No categories yet</p>
          <Link href="/admin/posts/new" className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>Create a post to get started →</Link>
        </div>
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {cats.map(c => (
            <Link key={c.slug} href="/admin/posts"
              className="block rounded-lg border p-3.5 transition-colors hover:border-[var(--border-2)] hover:bg-[var(--surface-2)]"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-7 w-7 items-center justify-center rounded-[6px]" style={{ background: 'var(--surface-3)', color: 'var(--body)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
                </span>
                <span className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>{c.postCount}</span>
              </div>
              <div className="mb-0.5 truncate text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{c.name}</div>
              <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{c.postCount} {c.postCount === 1 ? 'post' : 'posts'}</div>
            </Link>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
