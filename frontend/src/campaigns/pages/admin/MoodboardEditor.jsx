import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import { Field, TextInput, SelectInput } from '../../../core/components/admin/ui/Form';
import moodboardsAPI from '../../../_shared/api/moodboards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import BoardChip from '../../components/BoardChip';
import Moodboard from '../../components/Moodboard';
import PinPicker from '../../components/PinPicker';
import { FONT_LIST, PATTERNS, STICKERS, SVG_LIST } from '../../lib/moodboardKit';
import StickerPicker from '../../components/StickerPicker';

const permOf = (r) => ({ can_edit: r.can_edit, can_publish: r.can_publish, can_decide: r.can_decide, can_submit: r.can_submit, can_withdraw: r.can_withdraw });
const label = { fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' };

/** Fill a moodboard: click a spot on the artboard, then choose its picture, colour, words or sticker. Save, send for approval, or keep the layout as a template. */
export default function MoodboardEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [m, setM] = useState(null);
  const [perm, setPerm] = useState({});
  const [raw, setRaw] = useState({});           // slot id -> what fills it, as it is saved
  const [pins, setPins] = useState({});         // pin id -> { title, image }, for drawing
  const [title, setTitle] = useState('');
  const [bg, setBg] = useState('#ffffff');
  const [pat, setPat] = useState('none');
  const [sel, setSel] = useState(null);
  const [picking, setPicking] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [views, setViews] = useState([]);

  const take = (d) => {
    setM(d); setPerm(permOf(d)); setTitle(d.title); setBg(d.layout.background || '#ffffff'); setPat(d.layout.pattern || 'none'); setDirty(false);
    const r = {}; const p = {};
    Object.entries(d.contents ?? {}).forEach(([k, c]) => { if (c.pin_id) { r[k] = { pin_id: c.pin_id }; p[c.pin_id] = { title: c.title, image: c.image }; } else r[k] = c; });
    setRaw(r); setPins(p);
  };
  useEffect(() => { moodboardsAPI.get(id).then(take).catch((e) => { toast.error(errMsg(e, 'Could not open the moodboard')); nav('/admin/moodboards', { replace: true }); }); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (m?.private_customer && m.can_view_log) moodboardsAPI.views(m.id).then(setViews).catch(() => {}); }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return <AdminLayout><div style={{ padding: 32, color: colors.textFaint }}>Loading…</div></AdminLayout>;
  const canEdit = perm.can_edit && !(m.is_template && !perm.can_publish);
  const slots = m.layout.slots;
  const slot = slots.find((s) => s.id === sel);
  const show = { layout: { ...m.layout, background: bg, pattern: pat }, contents: Object.fromEntries(Object.entries(raw).map(([k, c]) => [k, c.pin_id ? { ...c, ...(pins[c.pin_id] ?? {}) } : c])) };
  const setSlot = (value) => { setRaw((r) => { const n = { ...r }; if (value === null) delete n[sel]; else n[sel] = value; return n; }); setDirty(true); };
  const cur = raw[sel] ?? {};

  const save = async () => {
    setBusy(true);
    try { const r = await moodboardsAPI.update(m.id, { title, background: bg, pattern: pat, contents: raw }); toast.success(r.message); take(r.data); }
    catch (e) { toast.error(errMsg(e, 'Could not save the moodboard'), { duration: 6000 }); } finally { setBusy(false); }
  };
  const run = async (fn, ok) => {
    try { const r = await fn(); toast.success(r.message ?? ok); take(await moodboardsAPI.get(m.id)); setRejecting(null); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 6000 }); }
  };
  const template = async () => {
    const name = window.prompt('Name this template', `${m.title} layout`);
    if (name?.trim()) run(() => moodboardsAPI.saveTemplate(m.id, name.trim()));
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${m.title}"?`)) return;
    try { await moodboardsAPI.remove(m.id); toast.success('Moodboard deleted'); nav('/admin/moodboards', { replace: true }); } catch (e) { toast.error(errMsg(e, 'Could not delete it')); }
  };
  const withSaved = (fn) => { if (dirty) { toast.error('Save your changes first.'); return; } fn(); };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }}>
        <HubHeader title={m.is_template ? 'Template' : 'Moodboard'} description="Click a spot on the board to fill it." />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px' }}>
          {!m.is_template && <BoardChip board={{ approval_status: m.approval_status, status: m.status, visibility: 'public' }} />}
          <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>by {m.owner_name}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {perm.can_submit && <button type="button" style={btnPrimary} onClick={() => withSaved(() => run(() => moodboardsAPI.submit(m.id)))}>Send for approval</button>}
            {!m.is_template && <button type="button" style={btnGhost} onClick={() => withSaved(template)}>Save as template</button>}
            {perm.can_publish && !m.is_template && (m.status === 'hidden' ? <button type="button" style={btnGhost} onClick={() => run(() => moodboardsAPI.unhide(m.id))}>Show again</button> : <button type="button" style={btnGhost} onClick={() => run(() => moodboardsAPI.hide(m.id))}>Hide</button>)}
            {perm.can_publish && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={remove}>Delete</button>}
          </span>
        </div>
        {m.approval_status === 'pending' && !m.is_template && (
          <div style={{ ...card, padding: 12, margin: '0 0 14px', display: 'grid', gap: 8, borderColor: 'var(--status-warning, #b45309)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{perm.can_decide ? 'This moodboard is waiting for your decision.' : perm.can_withdraw ? 'Sent for approval. You will see the answer on your calendar.' : 'Waiting for approval.'}</div>
            {perm.can_decide && (rejecting === null
              ? <div style={{ display: 'flex', gap: 8 }}><button type="button" style={btnPrimary} onClick={() => run(() => moodboardsAPI.approve(m.id))}>Approve</button><button type="button" style={btnGhost} onClick={() => setRejecting('')}>Not approved…</button></div>
              : <div style={{ display: 'grid', gap: 8 }}><TextInput value={rejecting} onChange={(e) => setRejecting(e.target.value)} placeholder="Say what needs to change (the author will see this)" /><div style={{ display: 'flex', gap: 8 }}><button type="button" style={{ ...btnPrimary, opacity: rejecting.trim() ? 1 : 0.5 }} disabled={!rejecting.trim()} onClick={() => run(() => moodboardsAPI.reject(m.id, rejecting))}>Send back to the author</button><button type="button" style={btnGhost} onClick={() => setRejecting(null)}>Cancel</button></div></div>)}
            {perm.can_withdraw && <div><button type="button" style={btnGhost} onClick={() => run(() => moodboardsAPI.withdraw(m.id))}>Take it back</button></div>}
          </div>
        )}
        {m.approval_status === 'rejected' && !m.is_template && (
          <div style={{ ...card, padding: 12, margin: '0 0 14px', borderColor: 'var(--status-error, #b91c1c)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--status-error, #b91c1c)' }}>Not approved</div>
            {m.rejected_note && <div style={{ fontSize: '0.82rem', marginTop: 4 }}>{m.rejected_note}</div>}
            {perm.can_submit && <div style={{ fontSize: '0.74rem', color: colors.textFaint, marginTop: 6 }}>Change what was asked, then send it for approval again.</div>}
          </div>
        )}
        {m.private_customer && (
          <div style={{ ...card, padding: 12, margin: '0 0 14px', display: 'grid', gap: 6, borderColor: 'var(--status-warning, #b45309)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>A customer's private moodboard. You can look but not change it, and your look is logged.</div>
            {m.can_view_log && (
              <>
                <div style={label}>Who has looked</div>
                {views.length === 0 ? <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>No one yet.</div> : views.slice(0, 15).map((v, i) => <div key={i} style={{ fontSize: '0.8rem', display: 'flex', gap: 10 }}><strong>{v.name ?? 'Unknown'}</strong><span style={{ color: colors.textFaint }}>{String(v.role ?? '').replace('_', ' ')}</span><span style={{ marginLeft: 'auto', color: colors.textMuted }}>{v.at ? new Date(v.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>)}
              </>
            )}
          </div>
        )}
        {!canEdit && !m.private_customer && <p style={{ ...card, padding: 12, fontSize: '0.8rem', color: colors.textMuted }}>You can look at this, but not change it{m.approval_status === 'pending' ? ' while it waits for a decision' : ''}.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20, alignItems: 'start' }} className="mood-editor">
          <div style={{ ...card, padding: 14 }}><div style={{ maxWidth: 760, margin: '0 auto' }}><Moodboard board={show} editing selected={sel} onSlot={(s) => setSel(s.id)} /></div></div>
          <div style={{ display: 'grid', gap: 14 }}>
            <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
              <Field label="Name"><TextInput value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} disabled={!canEdit} maxLength={160} /></Field>
              <Field label="Background"><input type="color" value={bg} onChange={(e) => { setBg(e.target.value); setDirty(true); }} disabled={!canEdit} style={{ width: 56, height: 34, border: 0, background: 'transparent', padding: 0 }} aria-label="Background colour" /></Field>
              <Field label="Pattern"><SelectInput value={pat} onChange={(e) => { setPat(e.target.value); setDirty(true); }} disabled={!canEdit}>{PATTERNS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
              {canEdit && <button type="button" style={{ ...btnPrimary, opacity: dirty ? 1 : 0.6 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>}
            </section>
            <section style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
              <p style={label}>{slot ? slot.hint : 'Pick a spot'}</p>
              {!slot && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Click any dashed box on the board.</p>}
              {slot?.type === 'photo' && (
                <>
                  {cur.pin_id && pins[cur.pin_id]?.image && <img src={storageUrl(pins[cur.pin_id].image)} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8 }} />}
                  {canEdit && <button type="button" style={btnGhost} onClick={() => setPicking(true)}>{cur.pin_id ? 'Choose another pin' : 'Choose a pin'}</button>}
                </>
              )}
              {slot?.type === 'color' && (
                <>
                  <Field label="Colour"><input type="color" value={cur.value ?? '#cccccc'} onChange={(e) => setSlot({ ...cur, value: e.target.value })} disabled={!canEdit} style={{ width: 56, height: 34, border: 0, background: 'transparent', padding: 0 }} aria-label="Colour" /></Field>
                  <Field label="Name for it (optional)"><TextInput value={cur.label ?? ''} onChange={(e) => setSlot({ value: '#cccccc', ...cur, label: e.target.value })} disabled={!canEdit} maxLength={30} /></Field>
                </>
              )}
              {slot?.type === 'text' && (
                <>
                  <Field label="Words"><TextInput value={cur.text ?? ''} onChange={(e) => setSlot({ font: 'sans', color: '#222222', ...cur, text: e.target.value })} disabled={!canEdit} maxLength={120} /></Field>
                  <Field label="Style"><SelectInput value={cur.font ?? 'sans'} onChange={(e) => setSlot({ color: '#222222', text: '', ...cur, font: e.target.value })} disabled={!canEdit}>{FONT_LIST.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
                  <Field label="Colour"><input type="color" value={cur.color ?? '#222222'} onChange={(e) => setSlot({ font: 'sans', text: '', ...cur, color: e.target.value })} disabled={!canEdit} style={{ width: 56, height: 34, border: 0, background: 'transparent', padding: 0 }} aria-label="Text colour" /></Field>
                </>
              )}
              {slot?.type === 'sticker' && <StickerPicker cur={cur} disabled={!canEdit} onChange={setSlot} />}
              {slot && canEdit && raw[sel] && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => setSlot(null)}>Empty this spot</button>}
            </section>
          </div>
        </div>
      </div>
      {picking && <PinPicker single title="Choose a pin" onClose={() => setPicking(false)} onPick={(ids, rows) => { const p = rows[0]; setPicking(false); if (!p) return; setPins((x) => ({ ...x, [p.id]: { title: p.title || p.item?.name, image: p.thumb_path || p.media_path || p.video?.poster || p.item?.image } })); setSlot({ pin_id: p.id }); }} />}
      <style>{'@media (max-width: 900px) { .mood-editor { grid-template-columns: minmax(0, 1fr) !important; } }'}</style>
    </AdminLayout>
  );
}
