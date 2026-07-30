'use client';

import AdminShell from '@/components/AdminShell';
import { useEffect, useState } from 'react';
import { fetchPosts, fetchActivity, formatDate, timeAgo, type Post, type Activity } from '@/lib/api';
import Link from 'next/link';

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchPosts().then(p => { setPosts(p); setLoading(false); }).catch(() => { setError(true); setLoading(false); });
    fetchActivity().then(setActivity).catch(() => {});
  }, []);

  const published = posts.filter(p => !p.draft);
  const drafts = posts.filter(p => p.draft);
  const cats = [...new Set(posts.map(p => p.category))];

  return (
    <AdminShell breadcrumb="Overview">
      {/* Stats row */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total" value={loading ? '—' : posts.length} />
        <StatCard label="Published" value={loading ? '—' : published.length} accent="#22c55e" />
        <StatCard label="Drafts" value={loading ? '—' : drafts.length} accent="#f59e0b" />
        <StatCard label="Categories" value={loading ? '—' : cats.length} accent="#3b82f6" />
      </div>

      {/* Main grid — wider recent list */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        {/* Recent posts — taller, more content */}
        <div className="card-glass">
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>Recent Posts</span>
            <Link href="/admin/posts" className="text-[11px] transition-opacity hover:opacity-70" style={{ color: 'var(--muted)' }}>View all →</Link>
          </div>
          {error ? (
            <div className="p-8 text-center text-[12px]" style={{ color: 'var(--muted)' }}>Could not load posts. Make sure D1 is bound.</div>
          ) : loading ? (
            <div className="flex justify-center p-12"><div className="spinner" /></div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--surface-3)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--muted)' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
              </div>
              <p className="text-[13px]" style={{ color: 'var(--body)' }}>No posts yet</p>
              <Link href="/admin/posts/new" className="btn-pill btn-brand">Create your first post</Link>
            </div>
          ) : (
            posts.slice(0, 8).map(post => (
              <Link key={post.id} href={`/admin/posts/${post.id}/edit`}
                className="group flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-[var(--surface-2)] last:border-b-0"
                style={{ borderColor: 'var(--border)' }}>
                <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: post.draft ? 'var(--faint)' : '#22c55e' }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{post.featured ? '★ ' : ''}{post.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    <span className="font-mono">/{post.slug}</span><span style={{ color: 'var(--faint)' }}>·</span>
                    <span>{post.category}</span><span style={{ color: 'var(--faint)' }}>·</span>
                    <span>{formatDate(post.pub_date)}</span><span style={{ color: 'var(--faint)' }}>·</span>
                    <span>{post.reading_time}m read</span>
                  </div>
                </div>
                <span className="pill" style={{ background: post.draft ? 'var(--surface-3)' : 'rgba(34,197,94,0.1)', color: post.draft ? 'var(--muted)' : '#22c55e' }}>{post.draft ? 'Draft' : 'Live'}</span>
              </Link>
            ))
          )}
        </div>

        {/* Right column — quick actions + tips */}
        <div className="flex flex-col gap-4">
          <div className="card-glass">
            <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>Quick Actions</span>
            </div>
            <div className="p-2">
              <QuickAction href="/admin/posts/new" icon="M12 5v14M5 12h14" title="New Post" desc="Write a new article" />
              <QuickAction href="/admin/settings" icon="M12 2v20M2 12h20" title="Site Settings" desc="Title, description, URL" />
              <QuickAction href="/api/posts.json" external icon="M16 18l6-6-6-6M8 6l-6 6 6 6" title="Content API" desc="View JSON output" />
            </div>
          </div>

          {/* Activity card */}
          <div className="card-glass">
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>Activity</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--faint)' }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
            {activity.length === 0 ? (
              <div className="p-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>No recent activity.</div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto">
                {activity.map(a => (
                  <div key={a.id} className="flex items-start gap-2.5 border-b px-4 py-2.5 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: actionColor(a.action) }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px]" style={{ color: 'var(--body)' }}>
                        <span className="font-medium capitalize" style={{ color: 'var(--ink)' }}>{a.action}</span>
                        {a.summary ? <span style={{ color: 'var(--muted)' }}>: {a.summary}</span> : null}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--faint)' }}>{timeAgo(a.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function actionColor(action: string): string {
  switch (action) {
    case 'published': return '#22c55e';
    case 'scheduled': return '#f59e0b';
    case 'deleted': return '#ef4444';
    case 'created': return '#22c55e';
    case 'imported': return '#3b82f6';
    default: return 'var(--faint)';
  }
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card-glass p-4" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%', background: accent ? `linear-gradient(135deg, ${accent}08, transparent)` : undefined, pointerEvents: 'none' }} />
      <div className="mb-2 text-[11px] font-medium" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-[28px] font-light tracking-tight" style={{ color: accent || 'var(--ink)' }}>{value}</div>
      {accent && <div className="mt-2.5 h-[2px] rounded-full" style={{ background: accent, opacity: 0.4 }} />}
    </div>
  );
}

function QuickAction({ href, icon, title, desc, external }: { href: string; icon: string; title: string; desc: string; external?: boolean }) {
  const content = (
    <div className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-[var(--surface-2)]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px]" style={{ background: 'var(--surface-3)', color: 'var(--body)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={icon} /></svg>
      </span>
      <div>
        <div className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{title}</div>
        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{desc}</div>
      </div>
    </div>
  );
  return external ? <a href={href} target="_blank" rel="noopener">{content}</a> : <Link href={href}>{content}</Link>;
}
