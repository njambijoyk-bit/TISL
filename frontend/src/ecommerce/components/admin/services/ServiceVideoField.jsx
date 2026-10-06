import { useState } from 'react';
import { Upload, Link2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../_shared/api/axios';
import { errMsg } from '../../../../_shared/store/helpers/apiState';

const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid var(--border-color, rgba(148,163,184,0.45))', background: 'transparent', color: 'var(--text-primary)' };
const input = { flex: 1, minWidth: 220, padding: '8px 10px', borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', border: '1px solid var(--border-color, rgba(148,163,184,0.45))', background: 'var(--surface-input, transparent)', color: 'var(--text-primary)' };

/**
 * A service's video: a pasted link (YouTube, Vimeo, TikTok, Facebook) or an uploaded mp4 or webm of up to 100 MB. It is saved straight away, on its own, so it does not
 * wait for the form's Save button (and a large upload does not travel with the rest of the form). A new service needs saving once first.
 */
export default function ServiceVideoField({ serviceId, video, onChange }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(null);

  if (!serviceId) return <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Save the service first, then come back to add a video (a file or a link).</p>;

  const save = async (body, config = {}) => {
    setBusy(true);
    try { const r = await api.post(`/admin/services/${serviceId}/video`, body, config); toast.success(r.data.message); onChange(r.data.video); setUrl(''); }
    catch (e) { toast.error(e.response?.data?.errors?.url?.[0] ?? e.response?.data?.errors?.file?.[0] ?? errMsg(e, 'Could not save the video')); } finally { setBusy(false); setPct(null); }
  };
  const pick = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast.error('A video file can be up to 100 MB.'); return; }
    const f = new FormData(); f.append('file', file);
    save(f, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 0, onUploadProgress: (p) => setPct(p.total ? Math.round((p.loaded / p.total) * 100) : null) });
  };
  const remove = async () => {
    if (!window.confirm('Remove this video?')) return;
    try { await api.delete(`/admin/services/${serviceId}/video`); onChange(null); toast.success('Video removed'); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); }
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {video && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {video.kind === 'upload'
            ? <video src={video.url} controls muted preload="metadata" style={{ width: 220, maxHeight: 130, borderRadius: 8, background: '#000' }} />
            : <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{video.provider} link: <a href={video.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-500)' }}>{video.url}</a></span>}
          <button type="button" style={{ ...btn, color: 'var(--status-error, #b91c1c)' }} onClick={remove}><Trash2 size={13} /> Remove</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
          <Upload size={13} /> {video ? 'Replace with a file' : 'Upload a video file'}
          <input type="file" accept="video/mp4,video/webm" onChange={pick} disabled={busy} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>or</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a YouTube, Vimeo, TikTok or Facebook link" style={input} aria-label="Video link" />
        <button type="button" style={{ ...btn, opacity: url.trim() && !busy ? 1 : 0.5 }} disabled={!url.trim() || busy} onClick={() => save({ url: url.trim() })}><Link2 size={13} /> Use link</button>
      </div>
      {pct !== null && <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Uploading… {pct}%</div>}
      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>MP4 or WebM, up to 100 MB. On the website the video plays silently when someone points at the service card, and in the service's gallery while it is on screen.</p>
    </div>
  );
}
