'use client';

import AdminShell from '@/components/AdminShell';
import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchPosts, deletePost, updatePost, importMarkdown, formatDate, type Post } from '@/lib/api';
import Link from 'next/link';

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'published' | 'drafts'>('all');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setPosts(await fetchPosts()); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    await deletePost(id);
    reload();
  };

  const handleToggle = async (post: Post) => {
    await updatePost(post.id, { draft: post.draft ? 0 : 1 });
    reload();
  };

  const handleImport = async (fileList: FileList | File[]) => {
    setImporting(true);
    setImportMsg('');
    let ok = 0, fail = 0;
    try {
      for (const file of Array.from(fileList)) {
        const content = await file.text();
        try { await importMarkdown(content); ok++; }
        catch { fail++; }
      }
      await reload();
      setImportMsg(ok ? `Imported ${ok} post${ok === 1 ? '' : 's'}${fail ? `, ${fail} failed` : ''}` : 'Import failed');
      setTimeout(() => setImportMsg(''), 4000);
    } finally { setImporting(false); }
  };

  const filtered = posts.filter(p => {
    if (filter === 'published' && p.draft) return false;
    if (filter === 'drafts' && !p.draft) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.category.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <AdminShell breadcrumb="Overview / Posts">
      <h1 className="mb-1 text-[18px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Posts</h1>
      <p className="mb-5 text-[12px]" style={{ color: 'var(--muted)' }}>Manage all of your articles.</p>

      {/* Toolbar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-[300px]">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--faint)' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text" placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-[5px] border py-1.5 pl-8 pr-3 text-[13px]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border-2)', color: 'var(--ink)' }}
          />
        </div>
        <div className="flex rounded-[5px] border p-0.5" style={{ borderColor: 'var(--border-2)', background: 'var(--surface)' }}>
          {(['all', 'published', 'drafts'] as const).map(f => (
            <button
              key={f} onClick={() => setFilter(f)}
              className="rounded-[4px] px-3 py-1 text-[12px] font-medium capitalize transition-colors"
              style={{
                background: filter === f ? 'var(--ink)' : 'transparent',
                color: filter === f ? 'var(--surface)' : 'var(--muted)',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {f}
              {f === 'all' && posts.length > 0 && <span className="ml-1 opacity-60">{posts.length}</span>}
            </button>
          ))}
        </div>
        <button
          onClick={() => importRef.current?.click()}
          disabled={importing}
          className="btn-pill btn-ghost"
        >
          {importing ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          )}
          <span className="hidden sm:inline">{importing ? 'Importing...' : 'Import'}</span>
        </button>
        <input
          ref={importRef} type="file" accept=".md,.markdown,text/markdown,text/plain" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) handleImport(e.target.files); e.target.value = ''; }}
        />
        <Link href="/admin/posts/new" className="btn-pill btn-solid sm:hidden">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          New
        </Link>
      </div>

      {importMsg && <div className="mb-3 rounded-[6px] border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--border-2)', color: 'var(--body)', background: 'var(--surface)' }}>{importMsg}</div>}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border p-12 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <p className="mb-2.5 text-[13px]" style={{ color: 'var(--body)' }}>No posts found.</p>
          <Link href="/admin/posts/new" className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>Create your first post →</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          {filtered.map((post, i) => (
            <div
              key={post.id}
              className="flex items-center gap-3 border-b px-3.5 py-2.5 transition-colors hover:bg-[var(--surface-2)] last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: post.draft ? 'var(--faint)' : '#22c55e' }} />
              <Link href={`/admin/posts/${post.id}/edit`} className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{post.featured ? '★ ' : ''}{post.title}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                  <span className="font-mono">/{post.slug}</span><span style={{ color: 'var(--faint)' }}>·</span>
                  <span>{post.category}</span><span style={{ color: 'var(--faint)' }}>·</span>
                  <span>{formatDate(post.pub_date)}</span><span style={{ color: 'var(--faint)' }}>·</span>
                  <span>{post.reading_time}m</span>
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => handleToggle(post)}
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
                  style={{
                    background: post.draft ? 'var(--surface-3)' : 'rgba(34,197,94,0.12)',
                    color: post.draft ? 'var(--muted)' : '#22c55e',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{post.draft ? 'Draft' : 'Live'}</button>
                <button onClick={() => handleDelete(post.id, post.title)}
                  className="flex items-center rounded-[5px] p-1 transition-colors"
                  style={{ color: 'var(--faint)', border: 'none', cursor: 'pointer', background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--faint)'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 font-mono text-[11px]" style={{ color: 'var(--faint)' }}>{filtered.length} / {posts.length} posts</div>
    </AdminShell>
  );
}
