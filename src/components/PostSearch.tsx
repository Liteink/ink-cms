'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function PostSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined as any);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('ink-cms-token') || '';
        const res = await fetch(`/api/admin/posts?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setResults((data.posts || []).slice(0, 8));
        }
      } catch {}
      finally { setLoading(false); }
    }, 200);
  }, [q]);

  const goTo = (id: string) => {
    setOpen(false);
    setQ('');
    router.push(`/admin/posts/${id}/edit`);
  };

  return (
    <div ref={ref} className="relative" style={{ width: '100%', maxWidth: '320px' }}>
      <div className="flex items-center gap-2 rounded-[999px] border px-3 py-1.5" style={{ borderColor: 'var(--border-2)', background: 'var(--surface)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--faint)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search posts..."
          className="w-full border-none bg-transparent text-[12px] outline-none"
          style={{ color: 'var(--ink)' }}
        />
        {loading && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
      </div>

      {open && results.length > 0 && (
        <div className="card-glass absolute top-full left-0 right-0 z-50 mt-1 max-h-[360px] overflow-y-auto p-1" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {results.map((p: any) => (
            <button key={p.id} onClick={() => goTo(p.id)}
              className="flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
              style={{ border: 'none', cursor: 'pointer', background: 'none' }}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.draft ? 'var(--faint)' : '#22c55e' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium" style={{ color: 'var(--ink)' }}>{p.title}</div>
                <div className="truncate text-[10px]" style={{ color: 'var(--faint)' }}>{p.category} · /{p.slug}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
