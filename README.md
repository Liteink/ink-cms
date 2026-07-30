# Ink CMS

Open-source headless CMS for Astro blogs. Built on Cloudflare Workers (D1 + R2 + KV), zero external database required.

## Features

- **Posts & Pages** — Unified content management with `type` field (post/page)
- **Headless API** — RESTful API with scoped API keys for external tools
- **Markdown native** — Write in Markdown, export/import with frontmatter
- **Media library** — Upload images to R2, insert into posts
- **Draft & schedule** — Draft mode with future-date scheduling
- **Revisions** — Auto-snapshot on every edit, one-click restore
- **AI assist** — Optional DeepSeek/OpenAI integration for title, excerpt, tags
- **Webhooks** — Fire on publish for external integrations
- **Multi-user** — Role-based access (admin / user / visitor)
- **Dark/light** — Theme toggle with system preference detection
- **Security** — Rate limiting, SSRF protection, CSP headers, PBKDF2 hashing

## Tech Stack

- Next.js 15 (App Router) + OpenNext for Cloudflare
- Cloudflare D1 (SQLite), R2 (media), KV (rate limiting)
- Tailwind CSS

## Quick Start

```bash
# Clone
git clone https://github.com/Liteink/ink-cms.git
cd ink-cms

# Install
npm install

# Create Cloudflare resources
npx wrangler d1 create ink-cms
npx wrangler r2 bucket create ink-cms-media
npx wrangler kv namespace create RATE_LIMIT

# Update wrangler.jsonc with the IDs from above

# Run migrations
npx wrangler d1 execute ink-cms --remote --file=migrations/001_initial.sql

# Set admin password (optional — first registered user becomes admin)
npx wrangler deploy --var ADMIN_PASSWORD:your-secure-password

# Deploy
npm run deploy
```

## Architecture

```
src/
├── app/
│   ├── api/[...path]/route.ts   — All API endpoints (catch-all)
│   ├── admin/                   — Admin dashboard (React)
│   ├── login/                   — Auth page
│   └── layout.tsx               — Root layout + theme provider
├── components/                  — Admin UI components
├── lib/
│   ├── db.ts                    — D1 query helpers
│   ├── api.ts                   — Client-side API functions
│   └── theme.tsx                — Theme context
└── middleware.ts                — Security headers + rate limiting
```

## API Reference

### Authentication

All API endpoints require a Bearer token:

```
Authorization: Bearer ink_xxx
```

Three token types:
1. **Admin password** — Full access (`*`)
2. **Session token** (`ink_sess_*`) — Scoped by user role
3. **API key** (`ink_*`) — Scoped per key

### Endpoints

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/admin/posts` | posts.read | List all posts (supports `?q=` search, `?type=page`) |
| POST | `/api/admin/posts` | posts.write | Create a post |
| PUT | `/api/admin/posts/:id` | posts.write | Update a post |
| DELETE | `/api/admin/posts/:id` | posts.delete | Delete a post |
| GET | `/api/admin/pages` | posts.read | List all pages |
| GET | `/api/admin/media` | media.read | List media |
| POST | `/api/admin/media` | media.write | Upload media |
| GET | `/api/admin/settings` | settings.read | Get settings |
| PUT | `/api/admin/settings` | settings.write | Update settings |
| GET | `/api/posts.json` | public | Public published posts |

## License

MIT
