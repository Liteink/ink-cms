'use client';

import AdminShell from '@/components/AdminShell';
import { useEffect, useRef, useState } from 'react';
import { fetchMedia, uploadMedia, deleteMedia, type MediaFile } from '@/lib/api';

function humanSize(bytes: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

export default function MediaLibrary() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try { setFiles(await fetchMedia()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const handleFiles = async (fileList: FileList | File[]) => {
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(fileList)) {
        await uploadMedia(file);
      }
      await reload();
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  };

  const handleDelete = async (f: MediaFile) => {
    if (!confirm(`Delete "${f.name}"?`)) return;
    await deleteMedia(f.key);
    reload();
  };

  return (
    <AdminShell breadcrumb="Overview / Media">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>Media</h1>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--muted)' }}>Upload images and files. Click any item to copy its URL.</p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-pill btn-solid"
        >
          {uploading ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          )}
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        <input
          ref={inputRef} type="file" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {error && <div className="mb-3 rounded-[6px] border px-3 py-2 text-[12px]" style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444', background: 'var(--surface)' }}>{error}</div>}

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); }}
      >
        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : files.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-16 text-center"
            style={{ borderColor: dragOver ? 'var(--ink)' : 'var(--border-2)', background: 'var(--surface)' }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </span>
            <p className="text-[13px]" style={{ color: 'var(--body)' }}>No media yet</p>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Drag files here or click Upload</p>
          </div>
        ) : (
          <div
            className="grid gap-3 rounded-lg border p-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', borderColor: dragOver ? 'var(--ink)' : 'var(--border)', background: 'var(--surface)', outline: dragOver ? '2px solid var(--ink)' : 'none' }}
          >
            {files.map(f => {
              const isImage = IMAGE_RE.test(f.name) || IMAGE_RE.test(f.key);
              return (
                <div
                  key={f.key}
                  className="group flex flex-col overflow-hidden rounded-[8px] border transition-colors"
                  style={{ borderColor: 'var(--border-2)', background: 'var(--surface-2)' }}
                >
                  <button
                    onClick={() => copyUrl(f.url)}
                    className="relative flex aspect-square items-center justify-center overflow-hidden"
                    style={{ background: 'var(--surface-3)' }}
                    title="Copy URL"
                  >
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--muted)' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {copied === f.url ? '✓ Copied' : 'Copy URL'}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium" style={{ color: 'var(--ink)' }} title={f.name}>{f.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--faint)' }}>{humanSize(Number(f.size))}</div>
                    </div>
                    <button
                      onClick={() => handleDelete(f)}
                      className="flex shrink-0 items-center rounded p-0.5 transition-colors"
                      style={{ color: 'var(--faint)', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--faint)'}
                      title="Delete"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="mt-2.5 font-mono text-[11px]" style={{ color: 'var(--faint)' }}>{files.length} file{files.length === 1 ? '' : 's'}</div>
      )}
    </AdminShell>
  );
}
