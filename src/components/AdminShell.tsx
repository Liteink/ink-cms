'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme';
import { useEffect, useState } from 'react';
import PostSearch from './PostSearch';

const navItems = [
  { href: '/admin', label: 'Overview', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { href: '/admin/posts', label: 'Posts', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6' },
  { href: '/admin/media', label: 'Media', icon: 'M3 3h18v18H3zM8.5 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21' },
  { href: '/admin/categories', label: 'Categories', icon: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z' },
  { href: '/admin/users', label: 'Users', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
  { href: '/admin/profile', label: 'Profile', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
  { href: '/admin/settings', label: 'Settings', icon: 'M12 2v6m0 8v6m4.22-13.22l4.24-4.24M6.34 17.66l-4.24 4.24M23 12h-6m-6 0H1' },
];

export default function AdminShell({ children, breadcrumb }: { children: React.ReactNode; breadcrumb: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [postCount, setPostCount] = useState<number | null>(null);
  const [authState, setAuthState] = useState<'checking' | 'ok' | 'redirect'>('checking');

  const isActive = (href: string) => href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  useEffect(() => {
    const token = localStorage.getItem('ink-cms-token');
    // No token or legacy 'changeme' → must login
    if (!token || !token.startsWith('ink_sess_')) {
      setAuthState('redirect');
      router.replace('/login');
      return;
    }
    // Validate session is still alive
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d?.user) {
          setAuthState('ok');
          // Fetch post count for badge
          fetch('/api/admin/posts', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(dd => { if (dd?.posts) setPostCount(dd.posts.length); })
            .catch(() => {});
        } else {
          // Session expired/invalid — clean up and redirect
          localStorage.removeItem('ink-cms-token');
          setAuthState('redirect');
          router.replace('/login');
        }
      })
      .catch(() => setAuthState('ok')); // network error — let API calls handle 401
  }, []);

  const isEditor = pathname.includes('/posts/new') || pathname.includes('/edit');
  const showNewPost = !isEditor && !pathname.startsWith('/admin/settings') && !pathname.startsWith('/admin/media') && !pathname.startsWith('/admin/users') && !pathname.startsWith('/admin/profile');

  if (authState === 'checking' || authState === 'redirect') {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[200px] shrink-0 flex-col border-r md:flex" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
        <Link href="/admin" className="flex items-center gap-2 border-b px-4 py-3.5" style={{ borderColor: 'var(--border)' }}>
          <span className="flex h-6 w-6 items-center justify-center rounded-[5px]" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /></svg>
          </span>
          <span className="text-[14px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Ink</span>
        </Link>
        <nav className="flex-1 p-2">
          <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Workspace</div>
          {navItems.slice(0, 4).map(item => (
            <NavIconLink key={item.href} {...item} active={isActive(item.href)} badge={item.href === '/admin/posts' && postCount ? String(postCount) : undefined} />
          ))}
          <div className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>System</div>
          <NavIconLink {...navItems[4]} active={isActive(navItems[4].href)} />
          <NavIconLink {...navItems[5]} active={isActive(navItems[5].href)} />
          <NavIconLink {...navItems[6]} active={isActive(navItems[6].href)} />
        </nav>
        <div className="border-t p-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={toggle} className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--surface-2)]" style={{ color: 'var(--body)' }}>
            {theme === 'dark' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            )}
            <span>Theme</span>
          </button>
          <a href="/" target="_blank" rel="noopener" className="flex w-full items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-[var(--surface-2)]" style={{ color: 'var(--body)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            <span>View Site</span>
          </a>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b px-4 md:px-5" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Link href="/admin" className="flex items-center gap-1.5 md:hidden">
              <span className="flex h-5 w-5 items-center justify-center rounded-[4px]" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /></svg>
              </span>
            </Link>
            <span className="truncate text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{breadcrumb}</span>
          </div>
          <div className="flex items-center gap-3">
            {showNewPost && <div className="hidden md:block"><PostSearch /></div>}
            {showNewPost && (
              <Link href="/admin/posts/new" className="btn-pill btn-solid shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                <span className="hidden sm:inline">New</span>
              </Link>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden p-4 pb-20 md:p-7 md:pb-12">
          <div className="mx-auto max-w-[1100px]">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t md:hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {navItems.map(item => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 px-3 py-2 transition-colors" style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.5' : '2'} strokeLinecap="round"><path d={item.icon} /></svg>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
        <button onClick={toggle} className="flex flex-col items-center gap-0.5 px-3 py-2" style={{ color: 'var(--muted)' }}>
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
          )}
          <span className="text-[10px] font-medium">Theme</span>
        </button>
      </nav>
    </div>
  );
}

function NavIconLink({ href, label, icon, active, badge }: { href: string; label: string; icon: string; active: boolean; badge?: string }) {
  return (
    <Link href={href} className="mb-px flex items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[13px] font-medium transition-colors"
      style={{ background: active ? 'var(--surface-2)' : 'transparent', color: active ? 'var(--ink)' : 'var(--body)' }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--ink)'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--body)'; } }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={icon} /></svg>
      <span>{label}</span>
      {badge && <span className="ml-auto min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] font-semibold" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>{badge}</span>}
    </Link>
  );
}
