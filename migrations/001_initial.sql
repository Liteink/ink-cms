-- 001_initial.sql — Initial schema for Ink CMS

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  body TEXT NOT NULL DEFAULT '',
  pub_date TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Admin',
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  tags TEXT DEFAULT '[]',
  series TEXT,
  series_order INTEGER,
  featured INTEGER DEFAULT 0,
  draft INTEGER DEFAULT 1,
  cover_url TEXT,
  cover_alt TEXT,
  type TEXT DEFAULT 'post',
  lang TEXT DEFAULT '',
  custom_fields TEXT DEFAULT '{}',
  reading_time INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  email_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  permissions TEXT DEFAULT '*',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  title TEXT,
  body TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scheduled (
  post_id TEXT PRIMARY KEY,
  publish_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  label TEXT,
  events TEXT DEFAULT '["post.published"]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seed default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_title', 'Ink CMS'),
  ('site_description', 'A headless CMS for blogs.'),
  ('site_url', ''),
  ('posts_per_page', '10'),
  ('ai_provider', ''),
  ('ai_model', ''),
  ('ai_api_key', '');
