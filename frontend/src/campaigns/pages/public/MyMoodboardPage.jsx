import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import Modal from '../../../core/components/admin/ui/Modal';
import myMoodboardsAPI from '../../../_shared/api/myMoodboards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import Moodboard from '../../components/Moodboard';
import { stateLabel } from '../../components/moodboardState';

const FONTS = [['sans', 'Plain'], ['serif', 'Classic'], ['script', 'Handwritten'], ['mono', 'Typewriter'], ['display', 'Bold poster']];
const STICKERS = ['⭐', '❤️', '✨', '🌿', '🌸', '🔥', '🎁', '🛍️', '📍', '☀️', '🌙', '🎨', '💎', '🏷️', '👑', '🍃'];
const btn = (primary) => ({ padding: '9px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: 6, border: primary ? 0 : '1.5px solid var(--line)', color: primary ? '#fff' : 'var(--text-primary)', background: primary ? 'var(--color-primary-500)' : 'transparent' });
const box = { padding: 14, borderRadius: 16, background: 'var(--surface-card)', border: '1px solid var(--line)', display: 'grid', gap: 10 };
const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input, var(--surface-card))', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.86rem' };
const lab = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const colorBox = { width: 56, height: 34, border: 0, background: 'transparent', padding: 0 };

function PinChooser({ onClose, onPick }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => myMoodboardsAPI.pins(q).then(setRows).catch((e) => { toast.error(errMsg(e, 'Could not load your pictures')); setRows([]); }), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Modal title="Choose a picture" subtitle="From the pins on your boards" onClose={onClose} width={720} footer={<div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" style={btn(false)} onClick={onClose}>Cancel</button></div>}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your pictures…" style={{ ...input, marginBottom: 12 }} />
      {rows?.length === 0 && <p style={{ color: 'var(--text-tertiary)', fontSize: '0.86rem' }}>No pictures yet. Save pictures from Discover to a board, or add your own to a board, and they show up here.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
        {rows?.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} style={{ padding: 0, cursor: 'pointer', borderRadius: 10, overflow: 'hidden', border: '2px solid var(--line)', background: 'var(--surface-card)', aspectRatio: '1 / 1' }}>
            {p.image && <img src={storageUrl(p.image)} alt={p.title || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Fill one of my moodboards: click a spot, then choose its picture, colour, words or sticker. Publishing sends it to staff first. */
export default function MyMoodboardPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [m, setM] = useState(null);
  const [raw, setRaw] = useState({});
  const [pins, setPins] = useState({});
  const [title, setTitle] = useState('');
  const [bg, setBg] = useState('#ffffff');
  const [sel, setSel] = useState(null);
  const [picking, setPicking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const take = (d) => {
    setM(d); setTitle(d.title); setBg(d.layout.background || '#ffffff'); setDirty(false);
    const r = {}; const p = {};
    Object.entries(d.contents ?? {}).forEach(([k, c]) => { if (c.pin_id) { r[k] = { pin_id: c.pin_id }; p[c.pin_id] = { title: c.title, image: c.image }; } else r[k] = c; });
    setRaw(r); setPins(p);
  };
  useEffect(() => { myMoodboardsAPI.get(id).then(take).catch((e) => { toast.error(errMsg(e, 'Could not open the moodboard')); nav('/my/moodboards', { replace: true }); }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shell = (body) => <div className="min-h-screen"><Helmet><title>{m ? `${m.title} | TISL` : 'My moodboard | TISL'}</title></Helmet><Header /><main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 64px' }}>{body}</main><Footer /></div>;
  if (!m) return shell(<p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>);

  const canEdit = m.can_edit;
  const slots = m.layout.slots;
  const slot = slots.find((s) => s.id === sel);
  const show = { layout: { ...m.layout, background: bg }, contents: Object.fromEntries(Object.entries(raw).map(([k, c]) => [k, c.pin_id ? { ...c, ...(pins[c.pin_id] ?? {}) } : c])) };
  const setSlot = (value) => { setRaw((r) => { const n = { ...r }; if (value === null) delete n[sel]; else n[sel] = value; return n; }); setDirty(true); };
  const cur = raw[sel] ?? {};
  const [label, color] = stateLabel(m);

  const save = async () => {
    setBusy(true);
    try { const r = await myMoodboardsAPI.update(m.id, { title, background: bg, contents: raw }); toast.success(r.message); take(r.data); }
    catch (e) { toast.error(errMsg(e, 'Could not save the moodboard'), { duration: 6000 }); } finally { setBusy(false); }
  };
  const run = async (fn) => { try { const r = await fn(); toast.success(r.message); take(r.data); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 6000 }); } };
  const withSaved = (fn) => { if (dirty) { toast.error('Save your changes first.'); return; } fn(); };
  const remove = async () => {
    if (!window.confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
    try { await myMoodboardsAPI.remove(m.id); toast.success('Moodboard deleted'); nav('/my/moodboards', { replace: true }); } catch (e) { toast.error(errMsg(e, 'Could not delete it')); }
  };

  return shell(
    <>
      <Link to="/my/moodboards" style={{ fontSize: '0.84rem', color: 'var(--color-primary-500)', fontWeight: 700 }}>‹ My moodboards</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '12px 0 14px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.4rem, 3.5vw, 2rem)', fontWeight: 900, color: 'var(--text-primary)' }}>{m.title}</h1>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{label}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          {m.visibility === 'private' || m.approval_status === 'rejected'
            ? <button type="button" style={btn(true)} onClick={() => withSaved(() => run(() => myMoodboardsAPI.publish(m.id)))}>Make public</button>
            : <button type="button" style={btn(false)} onClick={() => run(() => myMoodboardsAPI.makePrivate(m.id))}>{m.approval_status === 'pending' ? 'Take it back' : 'Make private'}</button>}
          <button type="button" style={{ ...btn(false), color: 'var(--status-error, #b91c1c)' }} onClick={remove}>Delete</button>
        </span>
      </div>
      {m.approval_status === 'pending' && <p style={{ ...box, margin: '0 0 14px', fontSize: '0.84rem' }}>Sent to our team for approval. It goes public once approved. You can take it back to keep working.</p>}
      {m.approval_status === 'rejected' && <p style={{ ...box, margin: '0 0 14px', fontSize: '0.84rem', borderColor: 'var(--status-error, #b91c1c)' }}><strong>Not approved.</strong> {m.rejected_note}<br />Change what was asked, then choose Make public again.</p>}
      {m.visibility === 'public' && m.approval_status === 'approved' && <p style={{ ...box, margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>This is public. If you change it, it goes back to our team for approval before it shows again.</p>}
      {!canEdit && <p style={{ ...box, margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>You can look at this but not change it while it waits for approval.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }} className="my-mood">
        <div style={{ ...box, display: 'block' }}><div style={{ maxWidth: 760, margin: '0 auto' }}><Moodboard board={show} editing selected={sel} onSlot={(s) => setSel(s.id)} /></div></div>
        <div style={{ display: 'grid', gap: 14 }}>
          <section style={box}>
            <label style={lab}>Name<input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} disabled={!canEdit} maxLength={160} style={{ ...input, marginTop: 4 }} /></label>
            <label style={lab}>Background<br /><input type="color" value={bg} onChange={(e) => { setBg(e.target.value); setDirty(true); }} disabled={!canEdit} style={colorBox} aria-label="Background colour" /></label>
            {canEdit && <button type="button" style={{ ...btn(true), justifyContent: 'center', opacity: dirty ? 1 : 0.6 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>}
          </section>
          <section style={box}>
            <span style={lab}>{slot ? slot.hint : 'Pick a spot'}</span>
            {!slot && <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Click any dashed box on the board.</p>}
            {slot?.type === 'photo' && (
              <>
                {cur.pin_id && pins[cur.pin_id]?.image && <img src={storageUrl(pins[cur.pin_id].image)} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8 }} />}
                {canEdit && <button type="button" style={btn(false)} onClick={() => setPicking(true)}>{cur.pin_id ? 'Choose another picture' : 'Choose a picture'}</button>}
              </>
            )}
            {slot?.type === 'color' && (
              <>
                <label style={lab}>Colour<br /><input type="color" value={cur.value ?? '#cccccc'} onChange={(e) => setSlot({ ...cur, value: e.target.value })} disabled={!canEdit} style={colorBox} aria-label="Colour" /></label>
                <label style={lab}>Name for it (optional)<input value={cur.label ?? ''} onChange={(e) => setSlot({ value: '#cccccc', ...cur, label: e.target.value })} disabled={!canEdit} maxLength={30} style={{ ...input, marginTop: 4 }} /></label>
              </>
            )}
            {slot?.type === 'text' && (
              <>
                <label style={lab}>Words<input value={cur.text ?? ''} onChange={(e) => setSlot({ font: 'sans', color: '#222222', ...cur, text: e.target.value })} disabled={!canEdit} maxLength={120} style={{ ...input, marginTop: 4 }} /></label>
                <label style={lab}>Style<select value={cur.font ?? 'sans'} onChange={(e) => setSlot({ color: '#222222', text: '', ...cur, font: e.target.value })} disabled={!canEdit} style={{ ...input, marginTop: 4 }}>{FONTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label style={lab}>Colour<br /><input type="color" value={cur.color ?? '#222222'} onChange={(e) => setSlot({ font: 'sans', text: '', ...cur, color: e.target.value })} disabled={!canEdit} style={colorBox} aria-label="Text colour" /></label>
              </>
            )}
            {slot?.type === 'sticker' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
                {STICKERS.map((s) => <button key={s} type="button" disabled={!canEdit} onClick={() => setSlot({ value: s })} aria-label={`Sticker ${s}`} style={{ fontSize: '1.2rem', padding: 4, borderRadius: 8, cursor: 'pointer', background: 'transparent', border: `2px solid ${cur.value === s ? 'var(--color-primary-500)' : 'transparent'}` }}>{s}</button>)}
              </div>
            )}
            {slot && canEdit && raw[sel] && <button type="button" style={{ ...btn(false), color: 'var(--status-error, #b91c1c)' }} onClick={() => setSlot(null)}>Empty this spot</button>}
          </section>
        </div>
      </div>
      {picking && <PinChooser onClose={() => setPicking(false)} onPick={(p) => { setPicking(false); setPins((x) => ({ ...x, [p.id]: { title: p.title, image: p.image } })); setSlot({ pin_id: p.id }); }} />}
      <style>{'@media (max-width: 900px) { .my-mood { grid-template-columns: minmax(0, 1fr) !important; } }'}</style>
    </>,
  );
}
