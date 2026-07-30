import type { NextRequest } from 'next/server';

interface Env {
  DB: any;
  ADMIN_PASSWORD: string;
}

export function getEnv(req: NextRequest): Env {
  return req as unknown as Env;
}

export function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const password = process.env.ADMIN_PASSWORD || 'changeme';
  return auth === `Bearer ${password}`;
}

// ── DB helpers ────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID();
}

export async function getAllPosts(db: any, includeDrafts = true) {
  const sql = includeDrafts
    ? 'SELECT * FROM posts ORDER BY pub_date DESC, created_at DESC'
    : 'SELECT * FROM posts WHERE draft = 0 ORDER BY pub_date DESC, created_at DESC';
  const result = await db.prepare(sql).all();
  return (result as any).results || [];
}

export async function getPostById(db: any, id: string) {
  return db.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
}

export async function createPostDb(db: any, data: Record<string, any>) {
  const id = data.id || generateId();
  const now = new Date().toISOString();
  const post = {
    id,
    slug: data.slug || slugify(data.title || 'untitled'),
    title: data.title || 'Untitled',
    description: data.description || '',
    body: data.body || '',
    pub_date: data.pub_date || now.split('T')[0],
    author: data.author || 'Admin',
    category: data.category || 'Uncategorized',
    tags: data.tags || '[]',
    series: data.series || null,
    series_order: data.series_order || null,
    featured: data.featured ? 1 : 0,
    draft: data.draft !== undefined ? (data.draft ? 1 : 0) : 1,
    cover_url: data.cover_url || null,
    cover_alt: data.cover_alt || null,
    type: data.type || 'post',
    lang: data.lang || '',
    custom_fields: data.custom_fields ? (typeof data.custom_fields === 'string' ? data.custom_fields : JSON.stringify(data.custom_fields)) : '{}',
    reading_time: estimateReadingTime(data.body || ''),
    created_at: now,
    updated_at: now,
  };

  await db.prepare(`
    INSERT INTO posts (id, slug, title, description, body, pub_date, author, category, tags, series, series_order, featured, draft, cover_url, cover_alt, type, lang, custom_fields, reading_time, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    post.id, post.slug, post.title, post.description, post.body, post.pub_date,
    post.author, post.category, post.tags, post.series, post.series_order,
    post.featured, post.draft, post.cover_url, post.cover_alt, post.type, post.lang, post.custom_fields,
    post.reading_time, post.created_at, post.updated_at
  ).run();

  return post;
}

export async function updatePostDb(db: any, id: string, data: Record<string, any>) {
  const existing = await getPostById(db, id);
  if (!existing) return null;

  const merged: Record<string, any> = { ...existing, ...data };
  merged.reading_time = estimateReadingTime(merged.body || '');
  merged.updated_at = new Date().toISOString();
  if (data.featured !== undefined) merged.featured = data.featured ? 1 : 0;
  if (data.draft !== undefined) merged.draft = data.draft ? 1 : 0;

  if (data.custom_fields !== undefined) merged.custom_fields = typeof data.custom_fields === 'string' ? data.custom_fields : JSON.stringify(data.custom_fields || {});

  if (data.type !== undefined) merged.type = data.type;

  await db.prepare(`
    UPDATE posts SET slug=?, title=?, description=?, body=?, pub_date=?, author=?, category=?, tags=?, series=?, series_order=?, featured=?, draft=?, cover_url=?, cover_alt=?, type=?, lang=?, custom_fields=?, reading_time=?, updated_at=? WHERE id=?
  `).bind(
    merged.slug, merged.title, merged.description, merged.body, merged.pub_date,
    merged.author, merged.category, merged.tags, merged.series, merged.series_order,
    merged.featured, merged.draft, merged.cover_url, merged.cover_alt,
    merged.type || 'post', merged.lang || '', merged.custom_fields || '{}',
    merged.reading_time, merged.updated_at, id
  ).run();

  return merged;
}

export async function deletePostDb(db: any, id: string) {
  const r = await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return r.meta.changes > 0;
}

export async function getAllSettings(db: any): Promise<Record<string, string>> {
  const results = await db.prepare('SELECT key, value FROM settings').all();
  const settings: Record<string, string> = {};
  for (const row of results.results || []) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function updateSettingDb(db: any, key: string, value: string) {
  await db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=?, updated_at=datetime('now')
  `).bind(key, value, value).run();
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
