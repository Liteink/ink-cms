'use client';

import AdminShell from '@/components/AdminShell';
import { useState, useEffect } from 'react';
import { fetchSettings, saveSettings, fetchWebhooks, createWebhook, deleteWebhook, type Webhook } from '@/lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<'site' | 'ai' | 'api' | 'webhooks' | 'backup'>('site');

  // API keys
  const [keys, setKeys] = useState<Array<{id: string; label: string; permissions?: string; created_at: string}>>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [keysLoading, setKeysLoading] = useState(false);
  // Permission selection for new key
  const SCOPE_GROUPS = [
    { resource: 'posts', label: 'Posts', scopes: [
      { value: 'posts.read', label: 'Read' },
      { value: 'posts.write', label: 'Write' },
      { value: 'posts.delete', label: 'Delete' },
    ]},
    { resource: 'settings', label: 'Settings', scopes: [
      { value: 'settings.read', label: 'Read' },
      { value: 'settings.write', label: 'Write' },
    ]},
    { resource: 'media', label: 'Media', scopes: [
      { value: 'media.read', label: 'Read' },
      { value: 'media.write', label: 'Write' },
    ]},
  ];
  const [keyPerms, setKeyPerms] = useState<string[]>(['*']);
  const [permOpen, setPermOpen] = useState(false);

  // Webhooks
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hookUrl, setHookUrl] = useState('');
  const [hookLabel, setHookLabel] = useState('');
  const [hookError, setHookError] = useState('');

  useEffect(() => {
    fetchSettings().then(s => { setSettings(s); setLoading(false); }).catch(() => { setError(true); setLoading(false); });
  }, []);

  const loadKeys = async () => {
    setKeysLoading(true);
    const token = localStorage.getItem('ink-cms-token') || '';
    try {
      const res = await fetch('/api/admin/keys', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setKeys(data.keys || []);
    } catch {}
    finally { setKeysLoading(false); }
  };

  useEffect(() => { if (activeTab === 'api') loadKeys(); }, [activeTab]);

  const loadWebhooks = async () => {
    setHooksLoading(true);
    try { setWebhooks(await fetchWebhooks()); } catch { /* ignore */ }
    finally { setHooksLoading(false); }
  };

  useEffect(() => { if (activeTab === 'webhooks') loadWebhooks(); }, [activeTab]);

  const addWebhook = async () => {
    setHookError('');
    if (!hookUrl.trim()) return;
    try {
      await createWebhook(hookUrl.trim(), hookLabel.trim() || hookUrl.trim(), ['post.published']);
      setHookUrl(''); setHookLabel('');
      loadWebhooks();
    } catch (e: any) { setHookError(e.message || 'Failed'); }
  };

  const removeWebhook = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    await deleteWebhook(id);
    loadWebhooks();
  };

  const save = async () => {
    setSaving(true);
    try { await saveSettings(settings); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch { setError(true); }
    finally { setSaving(false); }
  };

  const createKey = async () => {
    const token = localStorage.getItem('ink-cms-token') || '';
    const res = await fetch('/api/admin/keys', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: newKeyLabel || 'API Key', permissions: keyPerms }),
    });
    const data = await res.json();
    if (data.key) {
      setGeneratedKey(data.key);
      setNewKeyLabel('');
      setKeyPerms(['*']);
      loadKeys();
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    const token = localStorage.getItem('ink-cms-token') || '';
    await fetch(`/api/admin/keys/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    loadKeys();
  };

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ink-cms-token') || '' : '';

  if (loading) return <AdminShell breadcrumb="Overview / Settings"><div className="flex justify-center py-12"><div className="spinner" /></div></AdminShell>;

  return (
    <AdminShell breadcrumb="Overview / Settings">
      <h1 className="mb-1 text-[18px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Settings</h1>
      <p className="mb-6 text-[12px]" style={{ color: 'var(--muted)' }}>Configure your CMS.</p>

      {error ? (
        <div className="card-glass p-5">
          <p className="mb-2 text-[13px]" style={{ color: 'var(--body)' }}>⚠ Could not connect to database.</p>
          <p className="text-[12px]" style={{ color: 'var(--muted)' }}>Make sure D1 is bound and ADMIN_PASSWORD is set.</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="mb-6 flex gap-1 rounded-[6px] border p-0.5" style={{ borderColor: 'var(--border-2)', background: 'var(--surface)', width: 'fit-content' }}>
            {([['site', 'Site'], ['ai', 'AI'], ['api', 'API Keys'], ['webhooks', 'Webhooks'], ['backup', 'Backup']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className="rounded-[4px] px-3 py-1 text-[12px] font-medium transition-colors"
                style={{ background: activeTab === key ? 'var(--ink)' : 'transparent', color: activeTab === key ? 'var(--surface)' : 'var(--muted)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Site tab */}
          {activeTab === 'site' && (
            <>
              <div className="flex max-w-[440px] flex-col gap-6">
                <div>
                  <label className="mb-2 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Site Title</label>
                  <input className="input-line" value={settings.site_title || ''} onChange={e => setSettings(s => ({ ...s, site_title: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Site Description</label>
                  <input className="input-line" value={settings.site_description || ''} onChange={e => setSettings(s => ({ ...s, site_description: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Site URL</label>
                  <input className="input-line" placeholder="https://yoursite.com" value={settings.site_url || ''} onChange={e => setSettings(s => ({ ...s, site_url: e.target.value }))} />
                </div>
              </div>
              <button onClick={save} disabled={saving} className="btn-pill btn-solid mt-8">{saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}</button>
            </>
          )}

          {/* AI tab */}
          {activeTab === 'ai' && (
            <>
              <p className="mb-4 max-w-[440px] text-[12px]" style={{ color: 'var(--muted)' }}>Connect any OpenAI-compatible API to enable AI writing tools in the editor.</p>
              <div className="flex max-w-[440px] flex-col gap-6">
                <div>
                  <label className="mb-2 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>API Key</label>
                  <input type="password" className="input-line" placeholder="sk-..." value={settings.ai_api_key || ''} onChange={e => setSettings(s => ({ ...s, ai_api_key: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Base URL</label>
                  <input className="input-line" placeholder="https://api.deepseek.com" value={settings.ai_base_url || ''} onChange={e => setSettings(s => ({ ...s, ai_base_url: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Model</label>
                  <input className="input-line" placeholder="deepseek-chat" value={settings.ai_model || ''} onChange={e => setSettings(s => ({ ...s, ai_model: e.target.value }))} />
                </div>
              </div>
              <button onClick={save} disabled={saving} className="btn-pill btn-solid mt-8">{saving ? 'Saving...' : saved ? '✓ Saved' : 'Save AI Settings'}</button>
            </>
          )}

          {/* API Keys tab */}
          {activeTab === 'api' && (
            <>
              <p className="mb-5 max-w-[500px] text-[12px]" style={{ color: 'var(--muted)' }}>
                Generate API keys for external tools and AI agents. They can create posts, update content, and manage settings programmatically.
              </p>

              {/* Generate new key */}
              <div className="mb-6" style={{ position: 'relative' }}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <input className="input-box sm:max-w-[200px]" placeholder="Key label (e.g. Claude)" value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} />
                  {/* Permission dropdown trigger */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={() => setPermOpen(o => !o)}
                      className="input-box flex items-center justify-between gap-2 text-[12px]"
                      style={{ cursor: 'pointer', minWidth: '200px', color: 'var(--body)' }}>
                      <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Permissions:</span>
                      <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
                        {keyPerms.includes('*') ? 'Full Access' : keyPerms.length === 0 ? 'None' : `${keyPerms.length} selected`}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--faint)', transform: permOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  </div>
                  <button onClick={createKey} className="btn-pill btn-solid">Generate Key</button>
                </div>

                {/* Dropdown panel */}
                {permOpen && (
                  <div className="card-glass mt-2 p-3" style={{ position: 'absolute', zIndex: 50, left: 0, right: 0, maxWidth: '480px', border: '1px solid var(--border-2)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                    {/* All Access row */}
                    <div onClick={() => { setKeyPerms(['*']); setPermOpen(false); }}
                      className="flex items-center gap-2.5 rounded-[6px] px-3 py-2.5 cursor-pointer transition-colors hover:bg-[var(--surface-2)]">
                      <span className="flex h-4 w-4 items-center justify-center rounded-[4px] border" style={{
                        borderColor: keyPerms.includes('*') ? 'var(--ink)' : 'var(--border-2)',
                        background: keyPerms.includes('*') ? 'var(--ink)' : 'transparent',
                      }}>
                        {keyPerms.includes('*') && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                      </span>
                      <span className="text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>All Access</span>
                      <span className="ml-auto text-[10px]" style={{ color: 'var(--faint)' }}>Unrestricted</span>
                    </div>

                    <div className="my-2 h-px" style={{ background: 'var(--border)' }} />

                    {/* Grouped scopes */}
                    {SCOPE_GROUPS.map(group => (
                      <div key={group.resource} className="mb-1">
                        <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>{group.label}</div>
                        {group.scopes.map(s => {
                          const checked = keyPerms.includes(s.value);
                          return (
                            <div key={s.value} onClick={() => {
                              setKeyPerms(prev => {
                                if (prev.includes('*')) return [s.value];
                                return prev.includes(s.value) ? prev.filter(x => x !== s.value) : [...prev, s.value];
                              });
                            }}
                            className="flex items-center gap-2.5 rounded-[6px] px-3 py-2 cursor-pointer transition-colors hover:bg-[var(--surface-2)]">
                              <span className="flex h-4 w-4 items-center justify-center rounded-[4px] border" style={{
                                borderColor: checked ? 'var(--ink)' : 'var(--border-2)',
                                background: checked ? 'var(--ink)' : 'transparent',
                              }}>
                                {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                              </span>
                              <span className="text-[12px]" style={{ color: 'var(--body)' }}>{s.label}</span>
                              <span className="ml-auto font-mono text-[10px]" style={{ color: 'var(--faint)' }}>{s.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    <div className="mt-2 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                      <button onClick={() => setKeyPerms([])} className="text-[11px]" style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
                      <button onClick={() => setPermOpen(false)} className="btn-pill btn-solid text-[11px]">Done</button>
                    </div>
                  </div>
                )}

                {/* Click-away overlay */}
                {permOpen && <div onClick={() => setPermOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}
              </div>

              {/* Generated key display */}
              {generatedKey && (
                <div className="card-glass mb-6 p-4" style={{ borderColor: 'rgba(34,197,94,0.3)' }}>
                  <div className="mb-2 text-[12px] font-semibold" style={{ color: '#22c55e' }}>✓ Key created — copy it now (shown only once)</div>
                  <code className="block break-all rounded-[4px] p-2.5 font-mono text-[12px]" style={{ background: 'var(--surface-3)', color: 'var(--ink)' }}>{generatedKey}</code>
                  <button onClick={() => { navigator.clipboard.writeText(generatedKey); }} className="mt-2 text-[11px] font-medium" style={{ color: 'var(--muted)' }}>Copy to clipboard</button>
                </div>
              )}

              {/* Existing keys */}
              {keysLoading ? (
                <div className="flex justify-center py-8"><div className="spinner" /></div>
              ) : keys.length === 0 ? (
                <div className="card-glass p-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>No API keys yet.</div>
              ) : (
                <div className="card-glass overflow-hidden">
                  {keys.map((k, i) => (
                    <div key={k.id} className="flex items-center justify-between border-b px-4 py-3 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{k.label}</div>
                        <div className="font-mono text-[11px]" style={{ color: 'var(--faint)' }}>{k.id.slice(0, 8)}... · {new Date(k.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {((() => { try { const p = k.permissions; if (!p || p === '*') return ['*']; const a = JSON.parse(p); return Array.isArray(a) ? a : ['*']; } catch { return ['*']; } })()).map((p: string, i: number) => (
                            <span key={i} className="pill pill-cat text-[10px]">{p}</span>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => revokeKey(k.id)} className="text-[12px] font-medium transition-colors" style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Revoke</button>
                    </div>
                  ))}
                </div>
              )}

              {/* API docs */}
              <div className="card-glass mt-6 p-4">
                <div className="mb-3 text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>API Reference</div>
                <div className="flex flex-col gap-1.5 font-mono text-[11px]" style={{ color: 'var(--muted)' }}>
                  <code><span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: 'var(--ink)' }}>/api/v1/posts</span> — List posts</code>
                  <code><span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: 'var(--ink)' }}>/api/v1/posts/:slug</span> — Get post</code>
                  <code><span style={{ color: '#f59e0b' }}>POST</span> <span style={{ color: 'var(--ink)' }}>/api/v1/posts</span> — Create post</code>
                  <code><span style={{ color: '#f59e0b' }}>PUT</span> <span style={{ color: 'var(--ink)' }}>/api/v1/posts/:id</span> — Update post</code>
                  <code><span style={{ color: '#ef4444' }}>DEL</span> <span style={{ color: 'var(--ink)' }}>/api/v1/posts/:id</span> — Delete post</code>
                  <code><span style={{ color: '#22c55e' }}>GET</span> <span style={{ color: 'var(--ink)' }}>/api/v1/settings</span> — Get settings</code>
                  <code><span style={{ color: '#f59e0b' }}>PUT</span> <span style={{ color: 'var(--ink)' }}>/api/v1/settings</span> — Update settings</code>
                </div>
                <div className="mt-3 rounded-[4px] p-2.5 font-mono text-[11px]" style={{ background: 'var(--surface-3)', color: 'var(--body)' }}>
                  <div style={{ color: 'var(--faint)' }}># Create a post with curl</div>
                  <div style={{ marginTop: '4px' }}>curl -X POST /api/v1/posts \</div>
                  <div style={{ paddingLeft: '16px' }}>-H "Authorization: Bearer ink_xxx" \</div>
                  <div style={{ paddingLeft: '16px' }}>-H "Content-Type: application/json" \</div>
                  <div style={{ paddingLeft: '16px' }}>-d {'\'{"title":"Hi","body":"# Hello"}\''}</div>
                </div>
              </div>
            </>
          )}

          {/* Webhooks tab */}
          {activeTab === 'webhooks' && (
            <>
              <p className="mb-5 max-w-[500px] text-[12px]" style={{ color: 'var(--muted)' }}>
                Fire HTTP requests when posts are published. Useful for search indexing, social cross-posting, or triggering rebuilds.
              </p>

              <div className="mb-6 flex max-w-[560px] flex-col gap-2 sm:flex-row">
                <input className="input-box sm:flex-1" placeholder="https://example.com/webhook" value={hookUrl} onChange={e => setHookUrl(e.target.value)} />
                <input className="input-box sm:w-[180px]" placeholder="Label (optional)" value={hookLabel} onChange={e => setHookLabel(e.target.value)} />
                <button onClick={addWebhook} className="btn-pill btn-solid">Add</button>
              </div>
              {hookError && <div className="mb-4 text-[12px]" style={{ color: '#ef4444' }}>{hookError}</div>}

              {hooksLoading ? (
                <div className="flex justify-center py-8"><div className="spinner" /></div>
              ) : webhooks.length === 0 ? (
                <div className="card-glass p-6 text-center text-[12px]" style={{ color: 'var(--muted)' }}>No webhooks configured.</div>
              ) : (
                <div className="card-glass overflow-hidden">
                  {webhooks.map((h, i) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium" style={{ color: 'var(--ink)' }}>{h.label}</div>
                        <div className="truncate font-mono text-[11px]" style={{ color: 'var(--faint)' }}>{h.url}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="pill pill-cat">{h.events || 'post.published'}</span>
                        <button onClick={() => removeWebhook(h.id)} className="text-[12px] font-medium transition-colors" style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="card-glass mt-6 p-4">
                <div className="mb-2 text-[12px] font-semibold" style={{ color: 'var(--ink)' }}>Webhook payload</div>
                <p className="mb-3 text-[11px]" style={{ color: 'var(--muted)' }}>Delivered as a POST with JSON body when a post is published:</p>
                <div className="rounded-[4px] p-2.5 font-mono text-[11px]" style={{ background: 'var(--surface-3)', color: 'var(--body)' }}>
                  <div>{'{'}</div>
                  <div style={{ paddingLeft: '16px' }}><span style={{ color: 'var(--faint)' }}>"event":</span> "post.published",</div>
                  <div style={{ paddingLeft: '16px' }}><span style={{ color: 'var(--faint)' }}>"post":</span> {'{ id, title, slug, body, ... }'},</div>
                  <div style={{ paddingLeft: '16px' }}><span style={{ color: 'var(--faint)' }}>"at":</span> "2026-01-01T00:00:00Z"</div>
                  <div>{'}'}</div>
                </div>
              </div>
            </>
          )}

          {/* Backup tab */}
          {activeTab === 'backup' && (
            <>
              <p className="mb-4 max-w-[500px] text-[12px]" style={{ color: 'var(--muted)' }}>
                Export all posts, settings, users, and categories as a single JSON file. Useful for migration or backup.
              </p>
              <button
                onClick={async () => {
                  const res = await fetch('/api/admin/backup', { headers: { Authorization: `Bearer ${token}` } });
                  if (!res.ok) { alert('Export failed'); return; }
                  const data = await res.json();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `ink-cms-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="btn-pill btn-solid"
              >
                Download Full Backup
              </button>
            </>
          )}
        </>
      )}
    </AdminShell>
  );
}
