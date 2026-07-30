'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchMedia, uploadMedia, type MediaFile } from '@/lib/api';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;

export default function MediaPicker({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string, file?: MediaFile) => void;
}) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try { setFiles(await fetchMedia()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) reload(); }, [open]);

  const handleFiles = async (fileList: FileList | File[]) => {
    setUploading(true);
    setError('');
    try {
      let last: MediaFile | null = null;
      for (const file of Array.from(fileList)) { last = await uploadMedia(file); }
      await reload();
      if (last && Array.from(fileList).length === 1) { onPick(last.url, last); onClose(); }
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[12px] border"
        style={{ background: 'var(--surface)', borderColor: 'var(--border-2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>Insert from Media</span>
          <button onClick={onClose} className="flex items-center rounded p-1 transition-colors" style={{ color: 'var(--muted)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{files.length} item{files.length === 1 ? '' : 's'}</span>
          <button onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-pill btn-ghost" style={{ padding: '4px 12px', fontSize: 11 }}>
            {uploading ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            )}
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {error && <div className="px-4 py-2 text-[11px]" style={{ color: '#ef4444' }}>{error}</div>}

        <div className="overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10"><div className="spinner" /></div>
          ) : files.length === 0 ? (
            <div className="py-10 text-center text-[12px]" style={{ color: 'var(--muted)' }}>No media yet. Upload one above.</div>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
              {files.map(f => {
                const isImage = IMAGE_RE.test(f.name) || IMAGE_RE.test(f.key);
                return (
                  <button
                    key={f.key}
                    onClick={() => { onPick(f.url, f); onClose(); }}
                    className="group flex flex-col overflow-hidden rounded-[7px] border text-left transition-colors"
                    style={{ borderColor: 'var(--border-2)', background: 'var(--surface-2)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ink)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-2)'}
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.url} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--muted)' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                      )}
                    </div>
                    <div className="truncate px-1.5 py-1 text-[10px] font-medium" style={{ color: 'var(--body)' }}>{f.name}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
