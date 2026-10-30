import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Download, FileText, Globe, ImagePlus, Link2, Lock, Star, Trash2 } from 'lucide-react';
import { eventsMediaAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { Field, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 8px', fontSize: '0.72rem' };
const ROLE_LABEL = { cover: 'Cover', logo: 'Logo', poster: 'Poster', gallery: 'Gallery', floor_plan: 'Floor plan', contract: 'Contract', other: 'Other' };

/** The pictures, videos, video links and private documents of one event, organiser, vendor or venue. Public items show on the public page; private ones stay with the team. */
export default function MediaPanel({ type, id, readOnly = false, onCover }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('gallery');
  const [visibility, setVisibility] = useState('public');
  const [link, setLink] = useState('');
  const file = useRef(null);

  const load = useCallback(() => eventsMediaAPI.list(type, id).then(setItems).catch((e) => toast.error(errMsg(e, 'Could not load the gallery'))), [type, id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const isDoc = ['floor_plan', 'contract', 'other'].includes(role);
  const pick = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) run(() => eventsMediaAPI.upload(type, id, f, { role, visibility: isDoc ? 'private' : visibility }), 'Uploaded');
  };
  const addLink = () => run(async () => { await eventsMediaAPI.embed(type, id, link.trim(), { role: role === 'cover' || role === 'poster' ? role : 'gallery' }); setLink(''); }, 'Video link added');
  const makeCover = (m) => run(async () => { const r = await eventsMediaAPI.update(m.id, { role: 'cover' }); onCover?.(r); }, 'Cover set');
  const move = (i, d) => {
    const ids = items.map((m) => m.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => eventsMediaAPI.reorder(type, id, ids));
  };

  const thumb = (m) => {
    const box = { width: 96, height: 72, borderRadius: 8, objectFit: 'cover', background: colors.tint(0.08), display: 'grid', placeItems: 'center', color: colors.textFaint, flexShrink: 0 };
    if (m.kind === 'image' && m.url) return <img src={m.url} alt="" style={box} />;
    if (m.kind === 'video' && m.url) return <video src={m.url} style={box} muted preload="metadata" />;
    return <span style={box}>{m.kind === 'embed' ? <Link2 size={22} /> : <FileText size={22} />}</span>;
  };

  return (
    <div style={{ ...card, padding: 20 }}>
      {!readOnly && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Add as" htmlFor="mp-role"><SelectInput id="mp-role" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 'auto' }}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
            <Field label="Who can see it" htmlFor="mp-vis"><SelectInput id="mp-vis" value={isDoc ? 'private' : visibility} disabled={isDoc} onChange={(e) => setVisibility(e.target.value)} style={{ width: 'auto' }}>
              <option value="public">Everyone (public page)</option><option value="private">Our team only</option></SelectInput></Field>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => file.current?.click()}><ImagePlus size={14} /> Upload a file</button>
            <input ref={file} type="file" accept="image/*,video/mp4,video/webm,application/pdf" onChange={pick} style={{ display: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <TextInput value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube or Vimeo link" aria-label="Video link" style={{ flex: '1 1 260px' }} />
            <button type="button" style={btnGhost} disabled={busy || !link.trim()} onClick={addLink}><Link2 size={14} /> Add link</button>
          </div>
          <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>Pictures (JPG, PNG), videos (MP4, WebM) or PDFs. Floor plans, contracts and other documents are always private.</p>
        </div>
      )}
      {items.length === 0 ? <p style={{ margin: 0, fontSize: '0.84rem', color: colors.textMuted }}>Nothing here yet.</p> : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
          {items.map((m, i) => (
            <li key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 10, borderBottom: `1px solid ${colors.tint(0.07)}` }}>
              {thumb(m)}
              <div style={{ flex: 1, minWidth: 160 }}>
                <strong style={{ fontSize: '0.84rem' }}>{m.title || ROLE_LABEL[m.role] || m.role}</strong>
                <div style={{ fontSize: '0.74rem', color: colors.textFaint, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{ROLE_LABEL[m.role]} · {m.kind === 'embed' ? 'video link' : m.kind}</span>
                  <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>{m.visibility === 'public' ? <><Globe size={11} /> public</> : <><Lock size={11} /> private</>}</span>
                </div>
              </div>
              {!readOnly && (
                <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                  {m.kind === 'image' && m.role !== 'cover' && <button type="button" style={small} disabled={busy} onClick={() => makeCover(m)}><Star size={12} /> Cover</button>}
                  {m.kind !== 'embed' && !['floor_plan', 'contract', 'other'].includes(m.role) && <button type="button" style={small} disabled={busy} onClick={() => run(() => eventsMediaAPI.update(m.id, { visibility: m.visibility === 'public' ? 'private' : 'public' }))}>{m.visibility === 'public' ? 'Make private' : 'Make public'}</button>}
                  {m.visibility === 'private' && m.kind !== 'embed' && <button type="button" style={small} onClick={() => eventsMediaAPI.download(m.id, m.title || 'file').catch((e) => toast.error(errMsg(e, 'Could not download')))}><Download size={12} /></button>}
                  <button type="button" style={small} disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={12} /></button>
                  <button type="button" style={small} disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={12} /></button>
                  <button type="button" style={{ ...small, color: colors.danger }} disabled={busy} onClick={() => run(() => eventsMediaAPI.remove(m.id), 'Removed')} aria-label="Remove"><Trash2 size={12} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
