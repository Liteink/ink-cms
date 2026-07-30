'use client';

import AdminShell from '@/components/AdminShell';
import MediaPicker from '@/components/MediaPicker';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  createPost, updatePost, fetchPost, slugify,
  fetchRevisions, restoreRevision, fetchSchedule, exportPostUrl,
  isFutureDate, timeAgo, type Post, type Revision,
} from '@/lib/api';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Sanitize marked output — strip all event handlers, dangerous protocols
function safeMarkdown(md: string): string {
  try {
    const raw = marked.parse(md || '') as string;
    return DOMPurify.sanitize(raw, {
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });
  } catch { return ''; }
}
import { useRouter } from 'next/navigation';
import Link from 'next/link';

marked.setOptions({ breaks: false, gfm: true });

type ViewMode = 'edit' | 'split' | 'preview';

function normalizePost(p: any) {
  return {
    ...p,
    tags: typeof p.tags === 'string' ? p.tags : JSON.stringify(p.tags || []),
    featured: !!p.featured,
    draft: !!p.draft,
    series_order: p.series_order ?? null,
  };
}

export default function PostEditor({ mode, postId }: { mode: 'create' | 'edit'; postId?: string }) {
  const router = useRouter();
  const [post, setPost] = useState<Record<string, any>>({
    title: '', slug: '', description: '', body: '',
    author: 'Admin', category: 'Uncategorized', tags: '',
    series: '', series_order: null, featured: false, draft: true,
    type: 'post',
    pub_date: new Date().toISOString().split('T')[0],
    cover_url: '',
  });
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiError, setAiError] = useState('');

  // New feature state
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revLoading, setRevLoading] = useState(false);
  const [selectedRev, setSelectedRev] = useState<Revision | null>(null);
  const [schedule, setSchedule] = useState<{ publish_at: string; status: string } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const callAI = async (action: string) => {
    setAiLoading(action);
    setAiError('');
    try {
      const token = localStorage.getItem('ink-cms-token') || '';
      const res = await fetch('/api/admin/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, content: post.body || post.title || '' }),
      });
      const data = await res.json();
      if (!res.ok) { setAiError(data.error || 'AI request failed'); return; }
      const result = data.result;
      if (action === 'description') set('description', result);
      else if (action === 'tags') set('tags', result);
      else if (action === 'improve') set('body', result);
      else if (action === 'title') { const first = result.split('\n')[0].trim(); set('title', first); }
    } catch (e: any) { setAiError(e.message || 'AI error'); }
    finally { setAiLoading(null); }
  };

  useEffect(() => {
    if (mode !== 'edit' || !postId) return;
    fetchPost(postId).then(p => {
      if (p) setPost(normalizePost(p));
      setLoading(false);
    }).catch(() => setLoading(false));
    // version history + schedule
    setRevLoading(true);
    fetchRevisions(postId).then(setRevisions).finally(() => setRevLoading(false));
    fetchSchedule(postId).then(setSchedule).catch(() => {});
  }, [mode, postId]);

  useEffect(() => {
    if (mode === 'create' && post.title && !post.slug) {
      setPost(p => ({ ...p, slug: slugify(p.title || '') }));
    }
  }, [post.title, mode]);

  const previewHtml = useMemo(() => {
    return safeMarkdown(post.body || '');
  }, [post.body]);

  const insertAtCursor = (text: string) => {
    const ta = taRef.current;
    if (!ta) { set('body', (post.body || '') + text); return; }
    const start = ta.selectionStart ?? (post.body || '').length;
    const end = ta.selectionEnd ?? start;
    const next = (post.body || '').slice(0, start) + text + (post.body || '').slice(end);
    set('body', next);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length; });
  };

  const insertImage = (url: string, file?: any) => {
    const alt = (file?.name || 'image').replace(/\.[^.]+$/, '');
    insertAtCursor(`\n![${alt}](${url})\n`);
  };

  const exportMd = async () => {
    if (!postId) return;
    const token = localStorage.getItem('ink-cms-token') || '';
    try {
      const res = await fetch(exportPostUrl(postId), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${post.slug || 'post'}.md`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const restore = async (rev: Revision) => {
    if (!postId || !confirm(`Restore "${rev.title}"? The current version is saved to history first.`)) return;
    const updated = await restoreRevision(postId, rev.id);
    if (updated) {
      setPost(normalizePost(updated));
      setSelectedRev(null);
      fetchRevisions(postId).then(setRevisions);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    }
  };

  const save = async (publish = false) => {
    setSaving(true);
    const payload = { ...post, draft: publish ? 0 : 1 } as any;
    try {
      if (mode === 'create') {
        const created = await createPost(payload);
        if (created?.id) router.push(`/admin/posts/${created.id}/edit`);
      } else if (postId) {
        const updated = await updatePost(postId, payload);
        if (updated) setPost(p => ({ ...p, ...normalizePost(updated) }));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        fetchRevisions(postId).then(setRevisions);
        fetchSchedule(postId).then(setSchedule).catch(() => {});
      }
    } finally { setSaving(false); }
  };

  const wordCount = String(post.body || '').split(/\s+/).filter(Boolean).length;
  const set = (key: string, value: any) => setPost(p => ({ ...p, [key]: value }));

  if (loading) return <AdminShell breadcrumb="Loading"><div className="flex justify-center py-12"><div className="spinner" /></div></AdminShell>;

  const inputCls = "w-full rounded-[5px] border px-2.5 py-1.5 text-[13px] transition-colors focus:border-[var(--ink)]";
  const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border-2)', color: 'var(--ink)' };
  const labelCls = "mb-1 block text-[11px] font-medium";
  const labelStyle = { color: 'var(--muted)' };

  const isScheduled = mode === 'edit' && (!!schedule || (isFutureDate(post.pub_date) && post.draft));
  const publishLabel = isFutureDate(post.pub_date)
    ? `Schedule for ${post.pub_date}`
    : (post.draft ? 'Publish' : 'Update');

  return (
    <AdminShell breadcrumb={mode === 'create' ? 'Overview / Posts / New' : 'Overview / Posts / Edit'}>
      <Link href="/admin/posts" className="mb-3 inline-flex items-center gap-1.5 text-[12px] transition-colors hover:text-[var(--ink)]" style={{ color: 'var(--muted)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Posts
      </Link>

      <div className="flex flex-col items-start gap-6 md:flex-row md:gap-8">
        {/* Editor */}
        <div className="min-w-0 flex-1">
          <input
            type="text" placeholder="Untitled" value={post.title || ''}
            onChange={e => set('title', e.target.value)}
            className="mb-1 w-full border-none bg-transparent text-[24px] font-bold tracking-tight outline-none"
            style={{ color: 'var(--ink)' }}
          />
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[12px]" style={{ color: 'var(--faint)' }}>/posts/</span>
            <input
              type="text" placeholder="slug" value={post.slug || ''}
              onChange={e => set('slug', e.target.value)}
              className="rounded border px-2 py-0.5 font-mono text-[12px]"
              style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--body)', width: '200px' }}
            />

            {/* Editor / Preview toggle */}
            <div className="ml-auto flex rounded-[5px] border p-0.5" style={{ borderColor: 'var(--border-2)', background: 'var(--surface)' }}>
              {(['edit', 'split', 'preview'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)}
                  className="rounded-[4px] px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors"
                  style={{ background: viewMode === v ? 'var(--ink)' : 'transparent', color: viewMode === v ? 'var(--surface)' : 'var(--muted)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {v === 'split' ? 'Split' : v}
                </button>
              ))}
            </div>
          </div>

          <div className={viewMode === 'split' ? 'grid gap-3 md:grid-cols-2' : ''}>
            {viewMode !== 'preview' && (
              <div className="relative">
                <textarea
                  ref={taRef}
                  placeholder="Write in Markdown..."
                  value={post.body || ''}
                  onChange={e => set('body', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const ta = e.currentTarget;
                      const s = ta.selectionStart, end = ta.selectionEnd;
                      set('body', (post.body || '').slice(0, s) + '  ' + (post.body || '').slice(end));
                      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
                    }
                  }}
                  className="min-h-[420px] w-full resize-y rounded-lg border p-4 font-mono text-[13px] leading-[1.7]"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border-2)', color: 'var(--ink)' }}
                />
                <span className="pointer-events-none absolute right-3 top-2 font-mono text-[10px]" style={{ color: 'var(--faint)' }}>{wordCount} words</span>
              </div>
            )}

            {viewMode !== 'edit' && (
              <div className="min-h-[420px] resize-y overflow-auto rounded-lg border p-5"
                style={{ background: 'var(--surface)', borderColor: 'var(--border-2)' }}>
                <div className="prose-ink" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            )}
          </div>

          {/* AI Toolbar + media insert */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMediaOpen(true)}
              className="rounded-[5px] border px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{ borderColor: 'var(--border-2)', background: 'transparent', color: 'var(--body)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--body)'; }}
            >
              <span className="inline-flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                Image
              </span>
            </button>
            <span className="text-[11px] font-medium" style={{ color: 'var(--faint)' }}>·</span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>AI:</span>
            {([['title', 'Title'], ['description', 'Description'], ['tags', 'Tags'], ['improve', 'Improve']] as const).map(([action, label]) => (
              <button
                key={action}
                onClick={() => callAI(action)}
                disabled={aiLoading !== null || !post.body}
                className="rounded-[5px] border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40"
                style={{ borderColor: 'var(--border-2)', background: 'transparent', color: 'var(--body)', cursor: aiLoading ? 'wait' : 'pointer' }}
                onMouseEnter={e => { if (!aiLoading) { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.color = 'var(--ink)'; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--body)'; }}
              >
                {aiLoading === action ? '...' : label}
              </button>
            ))}
          </div>
          {aiError && <div className="mt-2 text-[11px]" style={{ color: '#ef4444' }}>{aiError}</div>}

          <input
            type="text" placeholder="Short description for SEO..."
            value={post.description || ''}
            onChange={e => set('description', e.target.value)}
            className="mt-3.5 w-full rounded-[5px] border px-3 py-2 text-[13px]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border-2)', color: 'var(--ink)' }}
          />
        </div>

        {/* Sidebar */}
        <div className="w-full shrink-0 md:sticky md:top-0 md:w-[240px]">
          <button
            onClick={() => save(false)} disabled={saving}
            className="mb-1.5 w-full rounded-[5px] border px-3.5 py-2 text-[13px] font-medium transition-colors"
            style={{ borderColor: 'var(--border-2)', background: 'transparent', color: saved ? '#22c55e' : 'var(--body)', cursor: saving ? 'wait' : 'pointer' }}
          >{saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Draft'}</button>
          <button
            onClick={() => save(true)} disabled={saving}
            className="mb-1.5 w-full rounded-[5px] px-3.5 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
            style={{ border: 'none', background: 'var(--ink)', color: 'var(--bg)', cursor: saving ? 'wait' : 'pointer' }}
          >{saving ? 'Saving...' : publishLabel}</button>

          {mode === 'edit' && (
            <button
              onClick={exportMd}
              className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-[5px] border px-3.5 py-1.5 text-[11px] font-medium transition-colors"
              style={{ borderColor: 'var(--border-2)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--muted)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Export .md
            </button>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: isScheduled ? 'rgba(245,158,11,0.12)' : post.draft ? 'var(--surface-3)' : 'rgba(34,197,94,0.12)', color: isScheduled ? '#f59e0b' : post.draft ? 'var(--muted)' : '#22c55e' }}>
              {isScheduled ? 'SCHEDULED' : post.draft ? 'DRAFT' : 'PUBLISHED'}
            </span>
            {isScheduled && schedule?.publish_at && (
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>on {schedule.publish_at}</span>
            )}
          </div>

          <details open className="mb-3.5 border-b pb-3.5" style={{ borderColor: 'var(--border)' }}>
            <summary className="mb-2.5 cursor-pointer text-[12px] font-medium" style={{ color: 'var(--muted)' }}>Post</summary>
            <div className="flex flex-col gap-3">
              <div>
                <label className={labelCls} style={labelStyle}>Content Type</label>
                <select
                  className={inputCls} style={inputStyle}
                  value={post.type || 'post'}
                  onChange={e => set('type', e.target.value)}
                >
                  <option value="post">Post (blog article)</option>
                  <option value="page">Page (about, contact, etc.)</option>
                </select>
              </div>
              <div><label className={labelCls} style={labelStyle}>Author</label><input className={inputCls} style={inputStyle} value={post.author || ''} onChange={e => set('author', e.target.value)} /></div>
              <div><label className={labelCls} style={labelStyle}>Category</label><input className={inputCls} style={inputStyle} value={post.category || ''} onChange={e => set('category', e.target.value)} /></div>
              <div><label className={labelCls} style={labelStyle}>Tags</label><input className={inputCls} style={inputStyle} placeholder="design, tutorial" value={post.tags || ''} onChange={e => set('tags', e.target.value)} /></div>
              <div><label className={labelCls} style={labelStyle}>Date</label><input type="date" className={inputCls} style={inputStyle} value={post.pub_date || ''} onChange={e => set('pub_date', e.target.value)} /></div>
              {isFutureDate(post.pub_date) && (
                <div className="text-[10px]" style={{ color: '#f59e0b' }}>Future date — publishing will schedule it.</div>
              )}
            </div>
          </details>

          <details className="mb-3.5 border-b pb-3.5" style={{ borderColor: 'var(--border)' }}>
            <summary className="mb-2.5 cursor-pointer text-[12px] font-medium" style={{ color: 'var(--muted)' }}>Cover</summary>
            <div className="flex flex-col gap-2.5">
              <div className="flex gap-1.5">
                <input className={inputCls} style={inputStyle} placeholder="https://..." value={post.cover_url || ''} onChange={e => set('cover_url', e.target.value)} />
                <button onClick={() => setMediaOpen(true)} className="shrink-0 rounded-[5px] border px-2 text-[11px]" style={{ borderColor: 'var(--border-2)', color: 'var(--muted)', cursor: 'pointer', background: 'var(--surface)' }}>Pick</button>
              </div>
              {post.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.cover_url} alt="cover" className="h-20 w-full rounded border object-cover" style={{ borderColor: 'var(--border-2)' }} />
              )}
              {post.cover_url && (
                <button onClick={() => set('cover_url', '')} className="self-start text-[10px]" style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove cover</button>
              )}
            </div>
          </details>

          <details className="mb-3.5 border-b pb-3.5" style={{ borderColor: 'var(--border)' }}>
            <summary className="mb-2.5 cursor-pointer text-[12px] font-medium" style={{ color: 'var(--muted)' }}>Series</summary>
            <div className="flex flex-col gap-3">
              <div><label className={labelCls} style={labelStyle}>Name</label><input className={inputCls} style={inputStyle} placeholder="Series name" value={post.series || ''} onChange={e => set('series', e.target.value)} /></div>
              <div><label className={labelCls} style={labelStyle}>Order</label><input type="number" className={inputCls} style={inputStyle} placeholder="1" value={post.series_order ?? ''} onChange={e => set('series_order', e.target.value ? parseInt(e.target.value) : null)} /></div>
            </div>
          </details>

          {/* Version history */}
          {mode === 'edit' && (
            <details className="mb-3.5 border-b pb-3.5" style={{ borderColor: 'var(--border)' }}>
              <summary className="mb-2.5 flex cursor-pointer items-center justify-between text-[12px] font-medium" style={{ color: 'var(--muted)' }}>
                <span>History</span>
                {revisions.length > 0 && <span className="text-[10px]" style={{ color: 'var(--faint)' }}>{revisions.length}</span>}
              </summary>
              {revLoading ? (
                <div className="flex justify-center py-3"><div className="spinner" /></div>
              ) : revisions.length === 0 ? (
                <div className="py-2 text-[11px]" style={{ color: 'var(--faint)' }}>No saved versions yet.</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {revisions.map(rev => (
                    <button key={rev.id} onClick={() => setSelectedRev(rev)}
                      className="flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-left transition-colors"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: 'var(--faint)' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium" style={{ color: 'var(--ink)' }}>{rev.title}</span>
                        <span className="text-[10px]" style={{ color: 'var(--faint)' }}>{timeAgo(rev.created_at)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </details>
          )}

          <label className="flex cursor-pointer items-center gap-2 py-1 text-[13px]" style={{ color: 'var(--body)' }}>
            <input type="checkbox" checked={!!post.featured} onChange={e => set('featured', e.target.checked)} style={{ accentColor: 'var(--ink)' }} />
            Featured
          </label>
        </div>
      </div>

      <MediaPicker open={mediaOpen} onClose={() => setMediaOpen(false)} onPick={insertImage} />

      {/* Revision preview modal */}
      {selectedRev && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setSelectedRev(null)}>
          <div className="flex max-h-[82vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[12px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border-2)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{selectedRev.title}</div>
                <div className="text-[10px]" style={{ color: 'var(--faint)' }}>Revision · {timeAgo(selectedRev.created_at)}</div>
              </div>
              <button onClick={() => setSelectedRev(null)} className="flex shrink-0 items-center rounded p-1" style={{ color: 'var(--muted)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <div className="prose-ink" dangerouslySetInnerHTML={{ __html: safeMarkdown(selectedRev.body || '') }} />
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setSelectedRev(null)} className="btn-pill btn-ghost">Cancel</button>
              <button onClick={() => restore(selectedRev)} className="btn-pill btn-solid">Restore this version</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
