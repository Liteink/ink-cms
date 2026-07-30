import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  getAllPosts, getPostById, createPostDb, updatePostDb, deletePostDb,
  getAllSettings, updateSettingDb,
} from '@/lib/db';

// ── Crypto helpers ────────────────────────────────
async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function genId(): string { return crypto.randomUUID(); }

function genApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'ink_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Bindings ──────────────────────────────────────
async function getDB(): Promise<any> {
  try {
    const { env } = await getCloudflareContext();
    return (env as any).DB;
  } catch { return null; }
}

async function getMEDIA(): Promise<any> {
  try {
    const { env } = await getCloudflareContext();
    return (env as any).MEDIA;
  } catch { return null; }
}

async function getKV(): Promise<any> {
  try {
    const { env } = await getCloudflareContext();
    return (env as any).RATE_LIMIT;
  } catch { return null; }
}

// ── Rate limiting (KV-based) ──────────────────────
async function checkRateLimit(ip: string, action: string, max: number = 5, windowSec: number = 60): Promise<boolean> {
  const kv = await getKV();
  if (!kv) return true; // No KV → allow
  const key = `rl:${action}:${ip}`;
  const now = Date.now();
  const raw = await kv.get(key).catch(() => null);
  let count = 0;
  if (raw) { try { const d = JSON.parse(raw); if (now < d.resetAt) count = d.count; } catch {} }
  if (count >= max) return false;
  await kv.put(key, JSON.stringify({ count: count + 1, resetAt: now + windowSec * 1000 }), { expirationTtl: windowSec }).catch(() => {});
  return true;
}

function getClientIP(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// ── SSRF protection ───────────────────────────────
function isPrivateIP(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (h.startsWith('10.') || h.startsWith('192.168.')) return true;
  if (h.startsWith('172.')) { const o2 = parseInt(h.split('.')[1]); if (o2 >= 16 && o2 <= 31) return true; }
  if (h.startsWith('169.254.')) return true; // cloud metadata
  if (h === '0.0.0.0' || h === 'metadata.google.internal') return true;
  // Block .local, .internal, .localhost TLDs
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  return false;
}

async function safeFetch(url: string, opts?: RequestInit): Promise<Response> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http(s) URLs allowed');
  if (isPrivateIP(parsed.hostname)) throw new Error('Internal URLs not allowed');
  return fetch(url, opts);
}

// ── Permission scopes & roles ─────────────────────
const ALL_SCOPES = [
  'posts.read', 'posts.write', 'posts.delete',
  'settings.read', 'settings.write',
  'media.read', 'media.write',
] as const;
type Scope = typeof ALL_SCOPES[number];

// Role → scope mapping
const ROLE_SCOPES: Record<string, string[]> = {
  admin: ['*'],
  user: ['posts.read', 'posts.write', 'posts.delete', 'media.read', 'media.write', 'settings.read'],
  visitor: ['posts.read', 'media.read'],
};

// ── Password hashing (PBKDF2 via Web Crypto) ──────
function genSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const h = await hashPassword(password, salt);
  // Constant-time comparison to prevent timing attacks
  if (h.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

function genSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'ink_sess_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return ['*'];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : ['*']; }
  catch { return ['*']; }
}

function hasPermission(scopes: string[], required: string): boolean {
  if (scopes.includes('*')) return true;
  // wildcard resource: posts.* matches posts.read, posts.write, etc.
  const [res, act] = required.split('.');
  return scopes.includes(required) || scopes.includes(`${res}.*`);
}

interface AuthResult {
  ok: boolean;
  scopes: string[]; // ['*'] for admin password, or specific scopes for API key
}

async function authenticate(req: NextRequest, db: any): Promise<AuthResult> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return { ok: false, scopes: [] };
  const token = auth.slice(7);
  // 1. Admin password = full access
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminPw || adminPw === 'changeme') {
    // Refuse default admin password — must be configured
  } else {
    // Constant-time comparison
    const a = token, b = adminPw;
    if (a.length === b.length) {
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
      if (diff === 0) return { ok: true, scopes: ['*'] };
    }
  }
  // 2. Session token (ink_sess_*)
  if (token.startsWith('ink_sess_')) {
    const tokHash = await sha256(token);
    const session = await db.prepare(
      `SELECT s.user_id, u.role FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
    ).bind(tokHash).first() as any;
    if (!session) return { ok: false, scopes: [] };
    return { ok: true, scopes: ROLE_SCOPES[session.role] || ['posts.read'] };
  }
  // 3. API key (SHA-256 compare)
  const hash = await sha256(token);
  const r = await db.prepare('SELECT id, permissions FROM api_keys WHERE key_hash = ?').bind(hash).first() as any;
  if (!r) return { ok: false, scopes: [] };
  return { ok: true, scopes: parseScopes(r.permissions) };
}

// Legacy boolean auth (for routes that don't need per-permission checks)
async function checkAuth(req: NextRequest, db: any): Promise<boolean> {
  return (await authenticate(req, db)).ok;
}

// Auth + permission check — returns null on success, or a NextResponse on failure
async function requirePermission(req: NextRequest, db: any, scope: string): Promise<AuthResult | null> {
  const auth = await authenticate(req, db);
  if (!auth.ok) return null;
  if (!hasPermission(auth.scopes, scope)) return null;
  return auth;
}

// ── Frontmatter helpers (import / export) ─────────
function parseFrontmatter(raw: string): { data: Record<string, any>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, any> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    let value: any = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      try { value = JSON.parse(value); } catch { /* keep string */ }
    } else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    data[m[1]] = value;
  }
  return { data, body: match[2] };
}

function buildFrontmatter(post: any): string {
  const lines = ['---'];
  lines.push(`title: ${JSON.stringify(post.title || '')}`);
  if (post.slug) lines.push(`slug: ${JSON.stringify(post.slug)}`);
  if (post.description) lines.push(`description: ${JSON.stringify(post.description)}`);
  if (post.pub_date) lines.push(`pub_date: ${String(post.pub_date).slice(0, 10)}`);
  if (post.author) lines.push(`author: ${JSON.stringify(post.author)}`);
  if (post.category) lines.push(`category: ${JSON.stringify(post.category)}`);
  let tags = post.tags;
  if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch { tags = []; } }
  if (Array.isArray(tags) && tags.length) lines.push(`tags: ${JSON.stringify(tags)}`);
  if (post.series) lines.push(`series: ${JSON.stringify(post.series)}`);
  if (post.series_order) lines.push(`series_order: ${Number(post.series_order)}`);
  if (post.cover_url) lines.push(`cover_url: ${JSON.stringify(post.cover_url)}`);
  lines.push(`draft: ${post.draft == 1 || post.draft === true ? 'true' : 'false'}`);
  lines.push(`featured: ${post.featured == 1 || post.featured === true ? 'true' : 'false'}`);
  lines.push('---', '');
  return lines.join('\n') + (post.body || '');
}

// ── Side-effect helpers ───────────────────────────
function serializePost(p: any) {
  return {
    id: p.id, title: p.title, slug: p.slug, description: p.description,
    body: p.body, pub_date: p.pub_date, author: p.author, category: p.category,
    tags: typeof p.tags === 'string' ? safeJson(p.tags) : p.tags, series: p.series,
    series_order: p.series_order, featured: p.featured == 1 || p.featured === true,
    draft: p.draft == 1 || p.draft === true, cover_url: p.cover_url, reading_time: p.reading_time,
    created_at: p.created_at, updated_at: p.updated_at,
  };
}
function safeJson(s: string) { try { return JSON.parse(s); } catch { return []; } }

async function logActivity(db: any, action: string, entityType: string | null, entityId: string | null, summary: string | null, userId: string | null = null) {
  try {
    await db.prepare('INSERT INTO activity_logs (id, action, entity_type, entity_id, summary, user_id) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(genId(), action, entityType, entityId, summary, userId).run();
  } catch { /* never break the main operation */ }
}

async function fireWebhooks(db: any, post: any, event: string) {
  try {
    const res = await db.prepare('SELECT url, events FROM webhooks').all();
    const payload = JSON.stringify({ event, post: serializePost(post), at: new Date().toISOString() });
    await Promise.all((res.results || []).map(async (h: any) => {
      let events: string[] = [];
      try { events = JSON.parse(h.events || '["post.published"]'); } catch { events = (h.events || '').split(',').map((x: string) => x.trim()).filter(Boolean); }
      if (!events.includes(event) && !events.includes('*')) return;
      try { await safeFetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }); } catch { /* ignore */ }
    }));
  } catch { /* ignore */ }
}

// Is the given pub_date in the future? (date-only compare)
function isFutureDate(dateStr: string | undefined | null): boolean {
  if (!dateStr) return false;
  const d = new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z');
  return !isNaN(d.getTime()) && d.getTime() > Date.now();
}

// Centralised post update: revision snapshot + scheduling + activity + webhooks
async function persistPostUpdate(db: any, id: string, data: Record<string, any>): Promise<any> {
  const existing = await getPostById(db, id);
  if (!existing) return null;

  // Snapshot the pre-update version into revisions
  try {
    await db.prepare('INSERT INTO revisions (id, post_id, title, body) VALUES (?, ?, ?, ?)')
      .bind(genId(), id, existing.title, existing.body).run();
  } catch { /* ignore */ }

  const wasDraft = existing.draft == 1 || existing.draft === true;

  // Scheduling intent: publishing + future date → keep hidden, mark scheduled
  let scheduling = false;
  if (data.draft !== undefined && (data.draft === false || data.draft === 0)) {
    const dateStr = data.pub_date ?? existing.pub_date;
    if (isFutureDate(dateStr)) { scheduling = true; data.draft = 1; }
  }

  const post = await updatePostDb(db, id, data);
  if (!post) return null;

  if (scheduling) {
    try {
      await db.prepare('INSERT INTO scheduled (post_id, publish_at, status) VALUES (?, ?, ?) ON CONFLICT(post_id) DO UPDATE SET publish_at=excluded.publish_at, status=excluded.status')
        .bind(id, String(post.pub_date).slice(0, 10), 'pending').run();
    } catch { /* ignore */ }
    await logActivity(db, 'scheduled', 'post', id, post.title);
    post.scheduled = true;
  } else {
    const isPublished = post.draft == 0 || post.draft === false;
    if (isPublished) {
      try { await db.prepare('DELETE FROM scheduled WHERE post_id = ?').bind(id).run(); } catch { /* ignore */ }
    }
    await logActivity(db, 'updated', 'post', id, post.title);
    // Fire webhooks only when draft transitions 1 → 0 (a real publish)
    if (wasDraft && isPublished) await fireWebhooks(db, post, 'post.published');
  }
  return post;
}

// Lazy-publish: any pending scheduled post whose time has come goes live
async function processScheduledPosts(db: any) {
  let due: any[] = [];
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await db.prepare("SELECT post_id, publish_at FROM scheduled WHERE status = 'pending' AND publish_at <= ?").bind(today).all();
    due = res.results || [];
  } catch { return; }

  for (const row of due) {
    const post = await getPostById(db, row.post_id).catch(() => null);
    try { await db.prepare('UPDATE posts SET draft = 0 WHERE id = ?').bind(row.post_id).run(); } catch { /* ignore */ }
    try { await db.prepare("UPDATE scheduled SET status = 'published' WHERE post_id = ?").bind(row.post_id).run(); } catch { /* ignore */ }
    await logActivity(db, 'published', 'post', row.post_id, post?.title || '');
    if (post) await fireWebhooks(db, { ...post, draft: 0 }, 'post.published');
  }
}

// ── GET ───────────────────────────────────────────
export async function GET(req: NextRequest) {
  const path = new URL(req.url).pathname.replace(/^\/api/, '');
  const db = await getDB();

  // ── Public: media streaming from R2 (no auth) ─
  const mediaServe = path.match(/^\/media\/(.+)$/);
  if (mediaServe) {
    const MEDIA = await getMEDIA();
    if (!MEDIA) return NextResponse.json({ error: 'MEDIA not configured' }, { status: 500 });
    const key = decodeURIComponent(mediaServe[1]);
    const object = await MEDIA.get(key).catch(() => null);
    if (!object) return new NextResponse('Not found', { status: 404 });
    const headers: Record<string, string> = {
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    if (object.httpMetadata?.contentType) headers['Content-Type'] = object.httpMetadata.contentType;
    if (object.size != null) headers['Content-Length'] = String(object.size);
    return new NextResponse(object.body, { status: 200, headers });
  }

  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // ── Public ────────────────────────────────────
  if (path === '/posts.json') {
    await processScheduledPosts(db);
    const posts = await getAllPosts(db, false);
    const settings = await getAllSettings(db);
    return NextResponse.json({
      site: { title: settings.site_title || 'Blog', description: settings.site_description || '', url: settings.site_url || '' },
      generated: new Date().toISOString(), count: posts.length,
      posts: posts.filter((p: any) => (p.type || 'post') === 'post').map((p: any) => ({
        title: p.title, slug: p.slug, description: p.description,
        excerpt: String(p.body || '').replace(/^---[\s\S]*?---/, '').replace(/```[\s\S]*?```/g, '').replace(/[#>*_~-]/g, '').replace(/\n+/g, ' ').trim().slice(0, 300),
        pubDate: p.pub_date, author: p.author, category: p.category,
        tags: JSON.parse(p.tags || '[]'), series: p.series, seriesOrder: p.series_order,
        featured: p.featured === 1, readingTime: p.reading_time,
      })),
    });
  }

  if (path === '/categories.json') {
    const posts = await getAllPosts(db, false);
    const catMap = new Map<string, number>();
    posts.forEach((p: any) => catMap.set(p.category, (catMap.get(p.category) || 0) + 1));
    return NextResponse.json({ count: catMap.size, categories: Array.from(catMap.entries()).map(([name, count]) => ({ name, slug: name.toLowerCase(), postCount: count })) });
  }

  // ── AI discovery (no auth) ────────────────────
  if (path === '/v1') {
    return NextResponse.json({
      name: 'Ink CMS API',
      version: '1.0',
        description: 'Headless CMS API for managing blog content. Use an API key with scoped permissions to authenticate.',
        auth: 'Bearer token (API key or admin password). API keys can be scoped to specific permissions.',
        scopes: ALL_SCOPES,
      endpoints: {
        'GET /api/v1/posts': 'List all posts',
        'GET /api/v1/posts/:slug': 'Get a single post by slug',
        'POST /api/v1/posts': 'Create a new post',
        'PUT /api/v1/posts/:id': 'Update a post',
        'DELETE /api/v1/posts/:id': 'Delete a post',
        'GET /api/v1/settings': 'Get site settings',
        'PUT /api/v1/settings': 'Update site settings',
      },
      example: {
        create_post: 'curl -X POST https://your-cms.workers.dev/api/v1/posts -H "Authorization: Bearer ink_xxx" -H "Content-Type: application/json" -d \'{"title":"Hello","body":"# Hi","category":"Tech"}\'',
      },
    });
  }

  // ── Auth routes (no auth required) ──────────────
  // GET /api/auth/me — current user info (needs token but not blocked by 401)
  if (path === '/auth/me') {
    const auth = await authenticate(req, db);
    if (!auth.ok) return NextResponse.json({ user: null });
    // For admin password, return synthetic admin user
    if (auth.scopes.includes('*') && !req.headers.get('authorization')?.slice(7).startsWith('ink_sess_')) {
      return NextResponse.json({ user: { id: 'admin', email: 'admin', name: 'Admin (password)', role: 'admin' } });
    }
    // For session token, look up user
    const token = req.headers.get('authorization')!.slice(7);
    if (token.startsWith('ink_sess_')) {
      const tokHash = await sha256(token);
      const session = await db.prepare(
        'SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ?'
      ).bind(tokHash).first() as any;
      if (session) return NextResponse.json({ user: session });
    }
    return NextResponse.json({ user: null });
  }

  // ── Auth required below ───────────────────────
  const auth = await authenticate(req, db);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // v1 API (for external AI / tools) — posts.read scope
  if (path === '/v1/posts' || path === '/admin/posts') {
    if (!hasPermission(auth.scopes, 'posts.read')) return NextResponse.json({ error: 'Forbidden: posts.read required' }, { status: 403 });
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const type = url.searchParams.get('type'); // 'post' | 'page' | undefined (all)
    let posts = await getAllPosts(db);
    if (type) posts = posts.filter((p: any) => (p.type || 'post') === type);
    if (q) {
      const ql = q.toLowerCase();
      posts = posts.filter((p: any) =>
        (p.title || '').toLowerCase().includes(ql) ||
        (p.body || '').toLowerCase().includes(ql) ||
        (p.category || '').toLowerCase().includes(ql) ||
        (p.tags || '').toLowerCase().includes(ql)
      );
    }
    return NextResponse.json({ posts });
  }

  // Pages endpoint — convenience alias for type=page
  if (path === '/admin/pages' || path === '/v1/pages') {
    if (!hasPermission(auth.scopes, 'posts.read')) return NextResponse.json({ error: 'Forbidden: posts.read required' }, { status: 403 });
    const posts = await getAllPosts(db);
    const pages = posts.filter((p: any) => (p.type || 'post') === 'page');
    return NextResponse.json({ pages });
  }

  // Single page by slug
  const pageMatch = path.match(/^\/(?:admin|v1)\/pages\/([^/]+)$/);
  if (pageMatch) {
    if (!hasPermission(auth.scopes, 'posts.read')) return NextResponse.json({ error: 'Forbidden: posts.read required' }, { status: 403 });
    const slug = pageMatch[1];
    const posts = await getAllPosts(db);
    const page = posts.find((p: any) => (p.type === 'page') && (p.slug === slug || p.id === slug));
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ page });
  }

  const v1PostMatch = path.match(/^\/v1\/posts\/([^/]+)$/);
  if (v1PostMatch) {
    if (!hasPermission(auth.scopes, 'posts.read')) return NextResponse.json({ error: 'Forbidden: posts.read required' }, { status: 403 });
    const slug = v1PostMatch[1];
    const posts = await getAllPosts(db);
    const post = posts.find((p: any) => p.slug === slug || p.id === slug);
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ post });
  }

  if (path === '/v1/settings' || path === '/admin/settings') {
    if (!hasPermission(auth.scopes, 'settings.read')) return NextResponse.json({ error: 'Forbidden: settings.read required' }, { status: 403 });
    const settings = await getAllSettings(db);
    const { ai_api_key, ...safe } = settings;
    return NextResponse.json({ settings: safe });
  }

  // ── Version history (posts.read) ───────────────
  const revisionsMatch = path.match(/^\/admin\/posts\/([^/]+)\/revisions$/);
  if (revisionsMatch) {
    if (!hasPermission(auth.scopes, 'posts.read')) return NextResponse.json({ error: 'Forbidden: posts.read required' }, { status: 403 });
    const r = await db.prepare('SELECT id, post_id, title, body, created_at FROM revisions WHERE post_id = ? ORDER BY created_at DESC LIMIT 20').bind(revisionsMatch[1]).all();
    return NextResponse.json({ revisions: r.results || [] });
  }

  // ── Schedule status (posts.read) ───────────────
  const scheduleMatch = path.match(/^\/admin\/posts\/([^/]+)\/schedule$/);
  if (scheduleMatch) {
    if (!hasPermission(auth.scopes, 'posts.read')) return NextResponse.json({ error: 'Forbidden: posts.read required' }, { status: 403 });
    const row = await db.prepare('SELECT post_id, publish_at, status FROM scheduled WHERE post_id = ?').bind(scheduleMatch[1]).first();
    return NextResponse.json({ scheduled: row || null });
  }

  // ── Markdown export (posts.read) ──────────────
  const exportMatch = path.match(/^\/admin\/posts\/([^/]+)\/export$/);
  if (exportMatch) {
    if (!hasPermission(auth.scopes, 'posts.read')) return NextResponse.json({ error: 'Forbidden: posts.read required' }, { status: 403 });
    const post = await getPostById(db, exportMatch[1]);
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const md = buildFrontmatter(post);
    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${post.slug || 'post'}.md"`,
      },
    });
  }

  const adminPostMatch = path.match(/^\/admin\/posts\/([^/]+)$/);
  if (adminPostMatch) {
    if (!hasPermission(auth.scopes, 'posts.read')) return NextResponse.json({ error: 'Forbidden: posts.read required' }, { status: 403 });
    const post = await getPostById(db, adminPostMatch[1]);
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ post });
  }

  if (path === '/admin/settings') {
    if (!hasPermission(auth.scopes, 'settings.read')) return NextResponse.json({ error: 'Forbidden: settings.read required' }, { status: 403 });
    const settings = await getAllSettings(db);
    const { ai_api_key, ...safe } = settings;
    return NextResponse.json({ settings: safe });
  }

  // Keys management: admin-only (require '*' = admin password, not API key)
  if (path === '/admin/keys') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const keys = await db.prepare('SELECT id, label, permissions, created_at FROM api_keys ORDER BY created_at DESC').all();
    return NextResponse.json({ keys: keys.results || [] });
  }

  // ── Activity feed (admin-only) ─────────────────
  if (path === '/admin/activity') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const r = await db.prepare('SELECT id, action, entity_type, entity_id, summary, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 20').all();
    return NextResponse.json({ activity: r.results || [] });
  }

  // ── Webhooks (admin-only) ──────────────────────
  if (path === '/admin/webhooks') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const r = await db.prepare('SELECT id, url, label, events, created_at FROM webhooks ORDER BY created_at DESC').all();
    return NextResponse.json({ webhooks: r.results || [] });
  }

  // ── Media library (list, requires media.read) ──
  if (path === '/admin/media') {
    if (!hasPermission(auth.scopes, 'media.read')) return NextResponse.json({ error: 'Forbidden: media.read required' }, { status: 403 });
    const MEDIA = await getMEDIA();
    if (!MEDIA) return NextResponse.json({ error: 'MEDIA (R2) not configured' }, { status: 500 });
    const listed = await MEDIA.list({ prefix: 'media/', limit: 1000 }).catch(() => ({ objects: [] }));
    const files = (listed.objects || []).map((o: any) => ({
      key: o.key,
      name: String(o.key).split('/').pop(),
      url: `/api/media/${encodeURIComponent(o.key)}`,
      size: o.size,
      uploaded: o.uploaded,
    })).sort((a: any, b: any) => (b.uploaded || 0) - (a.uploaded || 0));
    return NextResponse.json({ files });
  }

  // AI assist (admin-only — exposes AI API key)
  if (path === '/admin/ai') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const settings = await getAllSettings(db);
    const aiKey = settings.ai_api_key;
    const baseUrl = settings.ai_base_url || 'https://api.deepseek.com';
    const model = settings.ai_model || 'deepseek-chat';
    if (!aiKey) return NextResponse.json({ error: 'AI API key not configured.' }, { status: 400 });

    const prompts: Record<string, string> = {
      description: `Write a concise SEO meta description (max 150 chars) for this post. Return ONLY the text:\n\n${(body.content || '').slice(0, 4000)}`,
      title: `Suggest 3 catchy titles for this post, one per line:\n\n${(body.content || '').slice(0, 4000)}`,
      improve: `Improve this text's clarity and engagement. Return ONLY the improved text:\n\n${(body.content || '').slice(0, 4000)}`,
      tags: `Suggest 3-5 tags (comma-separated) for this post. Return ONLY tags:\n\n${(body.content || '').slice(0, 4000)}`,
    };
    const prompt = prompts[body.action];
    if (!prompt) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    try {
      const aiRes = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 500, temperature: 0.7 }),
      });
      if (!aiRes.ok) return NextResponse.json({ error: `AI failed: ${aiRes.status}` }, { status: 502 });
      const data = await aiRes.json();
      return NextResponse.json({ result: data.choices?.[0]?.message?.content?.trim() || '' });
    } catch (e: any) {
      return NextResponse.json({ error: `AI error: ${e.message}` }, { status: 500 });
    }
  }

  // ── User management (admin-only) ───────────────
  if (path === '/admin/users') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const users = await db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();
    return NextResponse.json({ users: users.results || [] });
  }

  // ── Full backup export (admin-only) ─────────────
  if (path === '/admin/backup') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const posts = await getAllPosts(db);
    const settings = await getAllSettings(db);
    const users = (await db.prepare('SELECT id, email, name, role, created_at FROM users').all()).results || [];
    const cats = (await db.prepare('SELECT DISTINCT category FROM posts').all()).results || [];
    return NextResponse.json({
      exported_at: new Date().toISOString(),
      version: '1.0',
      posts: posts.map((p: any) => ({ ...p, custom_fields: safeJson(p.custom_fields || '{}'), tags: safeJson(p.tags || '[]') })),
      settings,
      users,
      categories: cats.map((c: any) => c.category).filter(Boolean),
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ── POST ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const db = await getDB();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  const path = new URL(req.url).pathname.replace(/^\/api/, '');

  // ── Auth routes (no auth required) ──────────────
  if (path === '/auth/register') {
    const ip = getClientIP(req);
    const allowed = await checkRateLimit(ip, 'register', 3, 3600); // 3 per hour
    if (!allowed) return NextResponse.json({ error: 'Too many registrations. Try again later.' }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

    const salt = genSalt();
    const passwordHash = await hashPassword(password, salt);
    const id = genId();
    const userCount = (await db.prepare('SELECT COUNT(*) as c FROM users').first() as any)?.c || 0;
    const role = userCount === 0 ? 'admin' : 'user';

    try {
      await db.prepare('INSERT INTO users (id, email, name, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, email, name, passwordHash, salt, role).run();
    } catch {
      // Race condition: another registration beat us — re-check and assign 'user'
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const token = genSessionToken();
    const tokHash = await sha256(token);
    const expires = new Date(Date.now() + 30 * 86400000).toISOString();
    await db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .bind(genId(), id, tokHash, expires).run();

    await logActivity(db, 'registered', 'user', id, email);
    return NextResponse.json({ token, user: { id, email, name, role } }, { status: 201 });
  }

  if (path === '/auth/login') {
    const ip = getClientIP(req);
    const allowed = await checkRateLimit(ip, 'login', 10, 60); // 10 per minute
    if (!allowed) return NextResponse.json({ error: 'Too many login attempts. Try again in a minute.' }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });

    const user = await db.prepare('SELECT id, email, name, password_hash, password_salt, role FROM users WHERE email = ?').bind(email).first() as any;
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const valid = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const token = genSessionToken();
    const tokHash = await sha256(token);
    const expires = new Date(Date.now() + 30 * 86400000).toISOString();
    await db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .bind(genId(), user.id, tokHash, expires).run();

    await logActivity(db, 'login', 'user', user.id, email);
    return NextResponse.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }

  if (path === '/auth/logout') {
    const token = req.headers.get('authorization')?.slice(7) || '';
    if (token.startsWith('ink_sess_')) {
      const tokHash = await sha256(token);
      await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokHash).run().catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // ── Visitor session (no registration required) ───
  if (path === '/auth/visitor') {
    const token = genSessionToken();
    const tokHash = await sha256(token);
    const expires = new Date(Date.now() + 2 * 3600 * 1000).toISOString(); // 2h visitor session

    // Find or create a shared visitor user
    let visitorUser = await db.prepare("SELECT id FROM users WHERE email = 'visitor@demo'").first() as any;
    if (!visitorUser) {
      visitorUser = { id: genId() };
      await db.prepare('INSERT INTO users (id, email, name, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(visitorUser.id, 'visitor@demo', 'Visitor', 'noop', 'noop', 'visitor').run()
        .catch(() => {});
    }

    await db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .bind(genId(), visitorUser.id, tokHash, expires).run();

    return NextResponse.json({ token, user: { id: visitorUser.id, email: 'visitor@demo', name: 'Visitor', role: 'visitor' } });
  }

  // ── Change password (requires auth) ──────────────
  if (path === '/auth/change-password') {
    const authCheck = await authenticate(req, db);
    if (!authCheck.ok || !authCheck.scopes.includes('*') && !authCheck.scopes.includes('posts.read')) {
      // Any logged-in user can change their own password
    }
    const token = req.headers.get('authorization')?.slice(7) || '';
    if (!token.startsWith('ink_sess_')) return NextResponse.json({ error: 'Session required' }, { status: 403 });
    const tokHash = await sha256(token);
    const session = await db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').bind(tokHash).first() as any;
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!currentPassword || !newPassword) return NextResponse.json({ error: 'Both passwords required' }, { status: 400 });
    if (newPassword.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });

    const user = await db.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').bind(session.user_id).first() as any;
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const valid = await verifyPassword(currentPassword, user.password_salt, user.password_hash);
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });

    const salt = genSalt();
    const passwordHash = await hashPassword(newPassword, salt);
    await db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(passwordHash, salt, session.user_id).run();
    // Invalidate all sessions except current
    await db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(session.user_id, tokHash).run().catch(() => {});
    await logActivity(db, 'changed-password', 'user', session.user_id, '');
    return NextResponse.json({ ok: true });
  }

  // ── Update profile (requires auth) ───────────────
  if (path === '/auth/profile') {
    const token = req.headers.get('authorization')?.slice(7) || '';
    if (!token.startsWith('ink_sess_')) return NextResponse.json({ error: 'Session required' }, { status: 403 });
    const tokHash = await sha256(token);
    const session = await db.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').bind(tokHash).first() as any;
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    // Check email not taken by someone else
    const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, session.user_id).first();
    if (existing) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });

    await db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').bind(name, email, session.user_id).run();
    await logActivity(db, 'updated-profile', 'user', session.user_id, email);
    return NextResponse.json({ ok: true, user: { name, email } });
  }

  // ── Auth required below ───────────────────────
  const auth = await authenticate(req, db);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── Create user (admin-only) ─────────────────────
  if (path === '/admin/users') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    const role = ['admin', 'user', 'visitor'].includes(body.role) ? body.role : 'user';
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

    const salt = genSalt();
    const passwordHash = await hashPassword(password, salt);
    const id = genId();
    await db.prepare('INSERT INTO users (id, email, name, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, email, name, passwordHash, salt, role).run();
    await logActivity(db, 'created', 'user', id, email);
    return NextResponse.json({ user: { id, email, name, role, created_at: new Date().toISOString() } }, { status: 201 });
  }

  // Create post or page (both /admin/posts and /v1/posts)
  if (path === '/admin/posts' || path === '/v1/posts' || path === '/admin/pages') {
    if (!hasPermission(auth.scopes, 'posts.write')) return NextResponse.json({ error: 'Forbidden: posts.write required' }, { status: 403 });
    const body = await req.json();
    let scheduling = false;
    if (body.draft === false || body.draft === 0) {
      const dateStr = body.pub_date;
      if (isFutureDate(dateStr)) { scheduling = true; body.draft = true; }
    }
    const post = await createPostDb(db, body);
    if (scheduling) {
      try {
        await db.prepare('INSERT INTO scheduled (post_id, publish_at, status) VALUES (?, ?, ?) ON CONFLICT(post_id) DO UPDATE SET publish_at=excluded.publish_at, status=excluded.status')
          .bind(post.id, String(post.pub_date).slice(0, 10), 'pending').run();
      } catch { /* ignore */ }
      await logActivity(db, 'scheduled', 'post', post.id, post.title);
    } else {
      await logActivity(db, 'created', 'post', post.id, post.title);
      if (post.draft == 0) await fireWebhooks(db, post, 'post.published');
    }
    return NextResponse.json({ post }, { status: 201 });
  }

  // ── Markdown import (posts.write) ─────────────
  if (path === '/admin/import') {
    if (!hasPermission(auth.scopes, 'posts.write')) return NextResponse.json({ error: 'Forbidden: posts.write required' }, { status: 403 });
    let content = '';
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      const file = fd.get('file');
      if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      content = await (file as Blob).text();
    } else {
      const body = await req.json().catch(() => ({}));
      content = body.content || '';
    }
    if (!content.trim()) return NextResponse.json({ error: 'Empty content' }, { status: 400 });
    const { data, body: mdBody } = parseFrontmatter(content);
    const payload: Record<string, any> = {
      title: data.title || 'Imported Post',
      body: mdBody.trim(),
    };
    if (data.slug) payload.slug = String(data.slug);
    if (data.description) payload.description = String(data.description);
    if (data.pub_date) payload.pub_date = String(data.pub_date).slice(0, 10);
    if (data.author) payload.author = String(data.author);
    if (data.category) payload.category = String(data.category);
    if (Array.isArray(data.tags)) payload.tags = JSON.stringify(data.tags);
    else if (typeof data.tags === 'string') payload.tags = JSON.stringify(data.tags.split(',').map((t: string) => t.trim()).filter(Boolean));
    if (data.series) payload.series = String(data.series);
    if (data.series_order != null) payload.series_order = Number(data.series_order);
    if (data.draft !== undefined) payload.draft = !!data.draft;
    if (data.featured !== undefined) payload.featured = !!data.featured;
    if (data.cover_url) payload.cover_url = String(data.cover_url);

    const post = await createPostDb(db, payload);
    await logActivity(db, 'imported', 'post', post.id, post.title);
    return NextResponse.json({ post }, { status: 201 });
  }

  // ── Restore a revision (posts.write) ──────────
  const restoreMatch = path.match(/^\/admin\/posts\/([^/]+)\/revisions\/([^/]+)\/restore$/);
  if (restoreMatch) {
    if (!hasPermission(auth.scopes, 'posts.write')) return NextResponse.json({ error: 'Forbidden: posts.write required' }, { status: 403 });
    const [, postId, revId] = restoreMatch;
    const rev = await db.prepare('SELECT title, body FROM revisions WHERE id = ? AND post_id = ?').bind(revId, postId).first();
    if (!rev) return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
    // snapshot current before restore
    const current = await getPostById(db, postId);
    if (current) {
      try {
        await db.prepare('INSERT INTO revisions (id, post_id, title, body) VALUES (?, ?, ?, ?)').bind(genId(), postId, current.title, current.body).run();
      } catch { /* ignore */ }
    }
    const post = await updatePostDb(db, postId, { title: rev.title, body: rev.body });
    await logActivity(db, 'restored', 'post', postId, post?.title || '');
    return NextResponse.json({ post });
  }

  // ── Media upload (R2, requires media.write) ────
  if (path === '/admin/media') {
    if (!hasPermission(auth.scopes, 'media.write')) return NextResponse.json({ error: 'Forbidden: media.write required' }, { status: 403 });
    const MEDIA = await getMEDIA();
    if (!MEDIA) return NextResponse.json({ error: 'MEDIA (R2) not configured' }, { status: 500 });
    const fd = await req.formData();
    const file = fd.get('file');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    const blob = file as Blob;
    const safeName = String((file as any).name || 'file').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
    // Block dangerous file types
    const ext = safeName.split('.').pop()?.toLowerCase() || '';
    const blocked = ['html', 'htm', 'js', 'mjs', 'svg', 'xml', 'php', 'exe', 'bat', 'sh', 'py', 'rb', 'pl'];
    if (blocked.includes(ext)) return NextResponse.json({ error: `File type .${ext} not allowed` }, { status: 400 });
    const key = `media/${Date.now()}-${safeName}`;
    const buf = await blob.arrayBuffer();
    await MEDIA.put(key, buf, { httpMetadata: { contentType: blob.type || 'application/octet-stream' } }).catch((e: any) => {
      throw new Error('R2 put failed: ' + (e?.message || e));
    });
    await logActivity(db, 'uploaded', 'media', key, safeName);
    return NextResponse.json({ key, name: safeName, url: `/api/media/${encodeURIComponent(key)}`, size: blob.size }, { status: 201 });
  }

  // ── Webhooks create (admin-only) ───────────────
  if (path === '/admin/webhooks') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const url = String(body.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Valid url required' }, { status: 400 });
    if (isPrivateIP(new URL(url).hostname)) return NextResponse.json({ error: 'Internal URLs not allowed' }, { status: 400 });
    const id = genId();
    const events = Array.isArray(body.events) ? JSON.stringify(body.events) : (typeof body.events === 'string' ? body.events : '["post.published"]');
    await db.prepare('INSERT INTO webhooks (id, url, label, events) VALUES (?, ?, ?, ?)').bind(id, url, body.label || url, events).run();
    return NextResponse.json({ webhook: { id, url, label: body.label || url, events } }, { status: 201 });
  }

  // ── CSV bulk import (posts.write) ───────────────
  if (path === '/admin/import-csv') {
    if (!hasPermission(auth.scopes, 'posts.write')) return NextResponse.json({ error: 'Forbidden: posts.write required' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    const created: any[] = [];
    for (const row of rows) {
      try {
        const post = await createPostDb(db, {
          title: String(row.title || 'Untitled'),
          body: String(row.body || ''),
          slug: row.slug || undefined,
          category: row.category || 'Uncategorized',
          author: row.author || 'Admin',
          description: row.description || '',
          draft: row.draft === 'true' || row.draft === true,
        });
        created.push(post);
      } catch { /* skip bad rows */ }
    }
    await logActivity(db, 'imported', 'post', null, `CSV bulk: ${created.length} posts`);
    return NextResponse.json({ created: created.length, posts: created }, { status: 201 });
  }

  // Generate API key (admin-only)
  if (path === '/admin/keys') {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const rawKey = genApiKey();
    const keyHash = await sha256(rawKey);
    const id = genId();
    // Parse requested permissions; default to full access for backward compat
    let perms: string[] = ['*'];
    if (Array.isArray(body.permissions) && body.permissions.length > 0) {
      // Validate each scope
      perms = body.permissions.filter((s: string) => s === '*' || ALL_SCOPES.includes(s as any));
      if (perms.length === 0) perms = ['*'];
    }
    const permsJson = JSON.stringify(perms);
    await db.prepare('INSERT INTO api_keys (id, key_hash, label, permissions) VALUES (?, ?, ?, ?)').bind(id, keyHash, body.label || 'API Key', permsJson).run();
    return NextResponse.json({ key: rawKey, id, label: body.label || 'API Key', permissions: perms }, { status: 201 });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ── PUT ───────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const db = await getDB();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  const auth = await authenticate(req, db);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const path = new URL(req.url).pathname.replace(/^\/api/, '');
  const body = await req.json();

  const postMatch = path.match(/^\/(admin|v1)\/posts\/([^/]+)$/);
  if (postMatch) {
    if (!hasPermission(auth.scopes, 'posts.write')) return NextResponse.json({ error: 'Forbidden: posts.write required' }, { status: 403 });
    const post = await persistPostUpdate(db, postMatch[2], body);
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ post });
  }

  if (path === '/admin/settings' || path === '/v1/settings') {
    if (!hasPermission(auth.scopes, 'settings.write')) return NextResponse.json({ error: 'Forbidden: settings.write required' }, { status: 403 });
    for (const [key, value] of Object.entries(body)) await updateSettingDb(db, key, String(value));
    await logActivity(db, 'updated', 'settings', null, 'Site settings');
    return NextResponse.json({ settings: await getAllSettings(db) });
  }

  // ── Update user role (admin-only) ──────────────
  const userRoleMatch = path.match(/^\/admin\/users\/([^/]+)$/);
  if (userRoleMatch) {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    const { role } = body;
    if (!['admin', 'user', 'visitor'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, userRoleMatch[1]).run();
    // Invalidate all existing sessions — user must re-login with new role
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userRoleMatch[1]).run().catch(() => {});
    await logActivity(db, 'updated', 'user', userRoleMatch[1], `role → ${role}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

// ── DELETE ────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const db = await getDB();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  const auth = await authenticate(req, db);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const path = new URL(req.url).pathname.replace(/^\/api/, '');

  const postMatch = path.match(/^\/(admin|v1)\/posts\/([^/]+)$/);
  if (postMatch) {
    if (!hasPermission(auth.scopes, 'posts.delete')) return NextResponse.json({ error: 'Forbidden: posts.delete required' }, { status: 403 });
    const existing = await getPostById(db, postMatch[2]).catch(() => null);
    const ok = await deletePostDb(db, postMatch[2]);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await logActivity(db, 'deleted', 'post', postMatch[2], existing?.title || '');
    return NextResponse.json({ ok: true });
  }

  // ── Delete media from R2 (media.write) ─────────
  const mediaDel = path.match(/^\/admin\/media\/(.+)$/);
  if (mediaDel) {
    if (!hasPermission(auth.scopes, 'media.write')) return NextResponse.json({ error: 'Forbidden: media.write required' }, { status: 403 });
    const MEDIA = await getMEDIA();
    if (!MEDIA) return NextResponse.json({ error: 'MEDIA (R2) not configured' }, { status: 500 });
    const key = decodeURIComponent(mediaDel[1]);
    await MEDIA.delete(key).catch(() => {});
    await logActivity(db, 'deleted', 'media', key, key.split('/').pop() || key);
    return NextResponse.json({ ok: true });
  }

  // ── Delete webhook (admin-only) ────────────────
  const webhookDel = path.match(/^\/admin\/webhooks\/([^/]+)$/);
  if (webhookDel) {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    await db.prepare('DELETE FROM webhooks WHERE id = ?').bind(webhookDel[1]).run();
    return NextResponse.json({ ok: true });
  }

  // ── Delete user (admin-only) ─────────────────────
  const userDel = path.match(/^\/admin\/users\/([^/]+)$/);
  if (userDel) {
    if (!auth.scopes.includes('*')) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userDel[1]).run().catch(() => {});
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userDel[1]).run();
    await logActivity(db, 'deleted', 'user', userDel[1], '');
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
