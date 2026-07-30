const API_BASE = '/api';

export function getAuthHeaders() {
  const token = typeof localStorage !== 'undefined'
    ? localStorage.getItem('ink-cms-token') || ''
    : '';
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  description: string;
  body: string;
  pub_date: string;
  author: string;
  category: string;
  tags: string;
  series: string | null;
  series_order: number | null;
  featured: number;
  draft: number;
  cover_url: string | null;
  cover_alt: string | null;
  reading_time: number;
  created_at: string;
  updated_at: string;
}

export async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(`${API_BASE}/admin/posts`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch posts');
  const data = await res.json();
  return data.posts || [];
}

export async function fetchPost(id: string): Promise<Post | null> {
  const res = await fetch(`${API_BASE}/admin/posts/${id}`, { headers: getAuthHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.post || null;
}

export async function createPost(data: Partial<Post>): Promise<Post> {
  const res = await fetch(`${API_BASE}/admin/posts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create post');
  return res.json().then(d => d.post);
}

export async function updatePost(id: string, data: Partial<Post>): Promise<Post> {
  const res = await fetch(`${API_BASE}/admin/posts/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update post');
  return res.json().then(d => d.post);
}

export async function deletePost(id: string): Promise<void> {
  await fetch(`${API_BASE}/admin/posts/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
}

export async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/admin/settings`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch settings');
  const data = await res.json();
  return data.settings || {};
}

export async function saveSettings(settings: Record<string, string>): Promise<void> {
  await fetch(`${API_BASE}/admin/settings`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  });
}

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function estimateReadingTime(content: string): number {
  const text = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '').replace(/[#>*_~-]/g, '').replace(/\n+/g, ' ').trim();
  const latinWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return Math.max(1, Math.round((latinWords / 220) + (cjkChars / 500)));
}

export function formatDate(d: string): string {
  const date = new Date(d);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Relative time for activity feed (e.g. "2h ago")
export function timeAgo(d: string): string {
  const date = new Date(d);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Version history ───────────────────────────────
export interface Revision { id: string; post_id: string; title: string; body?: string; created_at: string; }
export async function fetchRevisions(postId: string): Promise<Revision[]> {
  const res = await fetch(`${API_BASE}/admin/posts/${postId}/revisions`, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.revisions || [];
}
export async function restoreRevision(postId: string, revId: string): Promise<Post | null> {
  const res = await fetch(`${API_BASE}/admin/posts/${postId}/revisions/${revId}/restore`, {
    method: 'POST', headers: getAuthHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.post || null;
}

// ── Schedule ──────────────────────────────────────
export async function fetchSchedule(postId: string): Promise<{ post_id: string; publish_at: string; status: string } | null> {
  const res = await fetch(`${API_BASE}/admin/posts/${postId}/schedule`, { headers: getAuthHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.scheduled || null;
}

// ── Markdown export / import ──────────────────────
export function exportPostUrl(id: string): string { return `${API_BASE}/admin/posts/${id}/export`; }

export async function importMarkdown(content: string): Promise<Post> {
  const res = await fetch(`${API_BASE}/admin/import`, {
    method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Import failed');
  }
  const data = await res.json();
  return data.post;
}

// ── Activity feed ─────────────────────────────────
export interface Activity {
  id: string; action: string; entity_type: string | null;
  entity_id: string | null; summary: string | null; created_at: string;
}
export async function fetchActivity(): Promise<Activity[]> {
  const res = await fetch(`${API_BASE}/admin/activity`, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.activity || [];
}

// ── Media library (R2) ────────────────────────────
export interface MediaFile { key: string; name: string; url: string; size: number; uploaded: number | string; }
export async function fetchMedia(): Promise<MediaFile[]> {
  const res = await fetch(`${API_BASE}/admin/media`, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.files || [];
}
export async function uploadMedia(file: File): Promise<MediaFile> {
  const fd = new FormData();
  fd.append('file', file);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ink-cms-token') || '' : '';
  const res = await fetch(`${API_BASE}/admin/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Upload failed');
  }
  return res.json();
}
export async function deleteMedia(key: string): Promise<void> {
  await fetch(`${API_BASE}/admin/media/${encodeURIComponent(key)}`, {
    method: 'DELETE', headers: getAuthHeaders(),
  });
}

// ── Webhooks ──────────────────────────────────────
export interface Webhook { id: string; url: string; label: string; events: string; created_at: string; }
export async function fetchWebhooks(): Promise<Webhook[]> {
  const res = await fetch(`${API_BASE}/admin/webhooks`, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.webhooks || [];
}
export async function createWebhook(url: string, label: string, events: string[]): Promise<Webhook> {
  const res = await fetch(`${API_BASE}/admin/webhooks`, {
    method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ url, label, events }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Failed to create webhook');
  }
  const data = await res.json();
  return data.webhook;
}
export async function deleteWebhook(id: string): Promise<void> {
  await fetch(`${API_BASE}/admin/webhooks/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
}

// Is a YYYY-MM-DD date in the future?
export function isFutureDate(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z');
  return !isNaN(d.getTime()) && d.getTime() > Date.now();
}
