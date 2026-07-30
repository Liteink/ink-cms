import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ink CMS — Open-source headless CMS for Astro',
  description: 'Free, self-hosted CMS that runs on Cloudflare. Posts, media, API keys, webhooks — zero JavaScript to your frontend.',
  robots: { index: true, follow: true },
};

export default function HomePage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <style>{`
        @media (max-width: 640px) {
          .hero-wrap { padding-top: 80px; padding-bottom: 60px; justify-content: flex-start !important; }
          .hero-cta { flex-direction: column; width: 100%; }
          .hero-cta a { width: 100%; justify-content: center; }
          .hero-pills { gap: 6px !important; }
          .hero-pills span { font-size: 11px; padding: 5px 10px; }
          .hero-footer { position: static !important; margin-top: 40px; }
        }
      `}</style>
      {/* Hero */}
      <div className="hero-wrap flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 md:mb-12">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FF7A30, #FF4D00)' }}>
            <svg width="18" height="18" viewBox="0 0 120 120" fill="none">
              <path fillRule="evenodd" clipRule="evenodd" d="M60 12 C60 12, 92 48, 92 70 C92 88, 78 100, 60 100 C42 100, 28 88, 28 70 C28 48, 60 12, 60 12 Z M58 30 L46 62 L56 62 L50 84 L66 50 L56 50 Z" fill="white"/>
            </svg>
          </div>
          <span className="text-lg font-semibold" style={{ color: 'var(--ink)', fontFamily: 'Inter, sans-serif' }}>
            Ink CMS
          </span>
        </div>

        {/* Tagline */}
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight max-w-2xl mb-3 md:mb-4" style={{ color: 'var(--ink)' }}>
          The open-source CMS<br />
          <span style={{ color: '#FF7A30' }}>for Astro.</span>
        </h1>

        <p className="text-sm md:text-lg max-w-xl mb-8 md:mb-10 px-4" style={{ color: 'var(--muted)' }}>
          Free. Self-hosted. Zero JavaScript to your frontend.
          Runs entirely on Cloudflare's free tier.
        </p>

        {/* CTAs */}
        <div className="hero-cta flex gap-3 mb-10 md:mb-16">
          <a
            href="/admin"
            className="px-6 py-3 rounded-full text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #FF7A30, #FF4D00)', color: 'white', whiteSpace: 'nowrap' }}
          >
            Open Dashboard →
          </a>
          <a
            href="https://github.com/Liteink/ink-cms"
            target="_blank"
            rel="noopener"
            className="px-6 py-3 rounded-full text-sm font-semibold border transition-all hover:opacity-70"
            style={{ borderColor: 'var(--border-2)', color: 'var(--ink)', whiteSpace: 'nowrap' }}
          >
            <span className="inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12z"/></svg>
              Star on GitHub
            </span>
          </a>
        </div>

        {/* Feature pills */}
        <div className="hero-pills flex flex-wrap gap-2 justify-center max-w-md md:max-w-lg">
          {[
            'Posts & Pages',
            'Markdown Native',
            'Media Library',
            'AI Assistant',
            'API Keys',
            'Webhooks',
            'Multi-user',
            'Dark Mode',
          ].map((f) => (
            <span
              key={f}
              className="px-3 py-1.5 rounded-full text-xs font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'var(--surface)' }}
            >
              {f}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="hero-footer absolute bottom-6 text-xs" style={{ color: 'var(--faint)' }}>
          <a href="https://liteink.co" className="hover:opacity-70">LiteInk</a>
          {' · '}
          <a href="https://github.com/Liteink/ink-cms" target="_blank" rel="noopener" className="hover:opacity-70">GitHub</a>
        </div>
      </div>
    </div>
  );
}
