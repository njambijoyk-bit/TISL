import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import { Field, TextInput, TextArea, SelectInput } from '../../../core/components/admin/ui/Form';
import boardsAPI from '../../../_shared/api/boards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import BoardChip from '../../components/BoardChip';
import PinThumb from '../../components/PinThumb';
import PinPicker from '../../components/PinPicker';

const label = { fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' };
const small = { ...btnGhost, padding: '3px 8px', fontSize: '0.7rem' };
const NONE = { can_edit: true, can_publish: false, can_decide: false, can_submit: false, can_withdraw: false };
const permOf = (r) => ({ can_edit: r.can_edit, can_publish: r.can_publish, can_decide: r.can_decide, can_submit: r.can_submit, can_withdraw: r.can_withdraw });

/** Make or change a board: its name and who can see it, then the pins on it, in the order they show. */
export default function BoardEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState({ title: '', description: '', visibility: 'public' });
  const [b, setB] = useState(null);
  const [perm, setPerm] = useState(NONE);
  const [rejecting, setRejecting] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [views, setViews] = useState([]);

  const take = (r) => { setB(r.data); setPerm(permOf(r.data)); setF({ title: r.data.title, description: r.data.description ?? '', visibility: r.data.visibility }); };
  useEffect(() => {
    if (!id) return;
    boardsAPI.get(id).then((r) => take(r)).catch((e) => { toast.error(errMsg(e, 'Could not open the board')); nav('/admin/boards', { replace: true }); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const readOnly = b && !perm.can_edit;
  const customer = b && !b.is_official;
  const watched = customer && b.visibility === 'private';
  useEffect(() => { if (b && watched && perm.can_publish) boardsAPI.views(b.id).then(setViews).catch(() => {}); }, [b?.id, watched, perm.can_publish]); // eslint-disable-line react-hooks/exhaustive-deps
  const pins = b?.pins ?? [];

  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = id ? await boardsAPI.update(id, f) : await boardsAPI.create(f);
      toast.success(r.message);
      if (!id) nav(`/admin/boards/${r.data.id}/edit`, { replace: true }); else take(r);
    } catch (er) { setErr(errMsg(er, 'Could not save the board')); } finally { setBusy(false); }
  };
  // Every action returns the board; the full read gives the pins and buttons for the new state.
  const run = async (fn, after = true) => {
    try {
      const r = await fn();
      toast.success(r.message);
      if (after) take(await boardsAPI.get(b.id));
      setRejecting(null);
    } catch (er) { toast.error(errMsg(er, 'That did not work'), { duration: 6000 }); }
  };
  const move = (i, d) => {
    const ids = pins.map((p) => p.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => boardsAPI.reorder(b.id, ids));
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${b.title}"? The pins stay in the library.`)) return;
    try { await boardsAPI.remove(b.id); toast.success('Board deleted'); nav('/admin/boards', { replace: true }); } catch (er) { toast.error(errMsg(er, 'Could not delete it')); }
  };
  const hide = () => { const reason = window.prompt('Why is it being hidden? (optional)', ''); if (reason !== null) run(() => boardsAPI.hide(b.id, reason)); };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1240, margin: '0 auto' }}>
        <HubHeader title={id ? 'Board' : 'New board'} description="Name the board and choose who sees it. After you save, add pins." />
        {b && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px' }}>
            <BoardChip board={b} />
            <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>by {b.owner_name}</span>
            {perm.can_submit && <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={() => run(() => boardsAPI.submit(b.id))}>Send for approval</button>}
            {perm.can_publish && (
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {b.status === 'hidden' ? <button type="button" style={btnGhost} onClick={() => run(() => boardsAPI.unhide(b.id))}>Show again</button> : <button type="button" style={btnGhost} onClick={hide}>Hide</button>}
                <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={remove}>Delete</button>
              </span>
            )}
          </div>
        )}
        {b?.approval_status === 'pending' && (
          <div style={{ ...card, padding: 12, margin: '0 0 14px', display: 'grid', gap: 8, borderColor: 'var(--status-warning, #b45309)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{perm.can_decide ? 'This board is waiting for your decision.' : perm.can_withdraw ? 'Sent for approval. You will see the answer on your calendar.' : 'Waiting for approval.'}</div>
            {perm.can_decide && (rejecting === null
              ? <div style={{ display: 'flex', gap: 8 }}><button type="button" style={btnPrimary} onClick={() => run(() => boardsAPI.approve(b.id))}>Approve</button><button type="button" style={btnGhost} onClick={() => setRejecting('')}>Not approved…</button></div>
              : <div style={{ display: 'grid', gap: 8 }}>
                <TextInput value={rejecting} onChange={(e) => setRejecting(e.target.value)} placeholder="Say what needs to change (the author will see this)" />
                <div style={{ display: 'flex', gap: 8 }}><button type="button" style={{ ...btnPrimary, opacity: rejecting.trim() ? 1 : 0.5 }} disabled={!rejecting.trim()} onClick={() => run(() => boardsAPI.reject(b.id, rejecting))}>Send back to the author</button><button type="button" style={btnGhost} onClick={() => setRejecting(null)}>Cancel</button></div>
              </div>)}
            {perm.can_withdraw && <div><button type="button" style={btnGhost} onClick={() => run(() => boardsAPI.withdraw(b.id))}>Take it back</button></div>}
          </div>
        )}
        {b?.approval_status === 'rejected' && (
          <div style={{ ...card, padding: 12, margin: '0 0 14px', borderColor: 'var(--status-error, #b91c1c)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--status-error, #b91c1c)' }}>Not approved</div>
            {b.rejected_note && <div style={{ fontSize: '0.82rem', marginTop: 4 }}>{b.rejected_note}</div>}
            {perm.can_submit && <div style={{ fontSize: '0.74rem', color: colors.textFaint, marginTop: 6 }}>Change what was asked, then send it for approval again.</div>}
          </div>
        )}
        {b?.is_official && b.approval_status === 'draft' && perm.can_submit && (
          <p style={{ ...card, padding: 12, fontSize: '0.8rem', color: colors.textMuted, margin: '0 0 14px' }}>This board is a draft and is not on the website yet. Add pins, then send it for approval. Later changes to an approved board go for approval again.</p>
        )}
        {customer && <p style={{ ...card, padding: 12, fontSize: '0.8rem', color: colors.textMuted, margin: '0 0 14px' }}>This is a customer's board. You can look at it, but only they can change it{perm.can_publish ? '; you can hide or delete it' : ''}.{watched ? ' It is private, so every time staff open it, it is recorded.' : ''}</p>}
        {readOnly && !customer && <p style={{ ...card, padding: 12, fontSize: '0.8rem', color: colors.textMuted }}>You can look at this board, but not change it while it waits for a decision.</p>}

        <form onSubmit={save} style={{ display: 'grid', gap: 18, maxWidth: 760, marginBottom: 24 }}>
          {err && <p role="alert" style={{ color: colors.dangerText, margin: 0, fontSize: '0.84rem' }}>{err}</p>}
          <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
            <Field label="Name"><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} disabled={readOnly} maxLength={160} required /></Field>
            <Field label="About (optional)"><TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} disabled={readOnly} rows={2} maxLength={500} /></Field>
            <Field label="Who can see it" hint="Public boards, and the pins on them, show on the website once approved. Private boards are for staff only.">
              <SelectInput value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} disabled={readOnly}><option value="public">Public</option><option value="private">Private</option></SelectInput>
            </Field>
          </section>
          {!readOnly && <div><button type="submit" style={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save board'}</button></div>}
        </form>

        {watched && perm.can_publish && (
          <section style={{ ...card, padding: 14, margin: '0 0 18px', maxWidth: 760 }}>
            <p style={label}>Who on the staff has opened this board</p>
            {views.length === 0 ? <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>No one yet.</p> : views.slice(0, 15).map((v, i) => <div key={i} style={{ fontSize: '0.8rem', padding: '3px 0', display: 'flex', gap: 10 }}><strong>{v.name ?? 'Unknown'}</strong><span style={{ color: colors.textFaint }}>{String(v.role ?? '').replace('_', ' ')}</span><span style={{ marginLeft: 'auto', color: colors.textMuted }}>{v.at ? new Date(v.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>)}
          </section>
        )}
        {b && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <p style={{ ...label, margin: 0 }}>Pins on this board ({pins.length})</p>
              {perm.can_edit && <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={() => setPicking(true)}><Plus size={14} /> Add pins</button>}
            </div>
            {pins.length === 0 && <p style={{ ...card, padding: 16, fontSize: '0.84rem', color: colors.textMuted }}>No pins yet. Add some from the library.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
              {pins.map((p, i) => (
                <div key={p.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <PinThumb p={p} ratio="1 / 1" />
                  <div style={{ padding: '8px 10px 10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title || p.item?.name || (p.kind === 'note' ? p.caption?.slice(0, 40) : '') || 'Untitled'}</div>
                    {b.cover_pin_id === p.id && <div style={{ fontSize: '0.64rem', fontWeight: 800, color: colors.primary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cover</div>}
                    {perm.can_edit && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        <button type="button" aria-label="Move earlier" style={small} disabled={i === 0} onClick={() => move(i, -1)}><ArrowLeft size={12} /></button>
                        <button type="button" aria-label="Move later" style={small} disabled={i === pins.length - 1} onClick={() => move(i, 1)}><ArrowRight size={12} /></button>
                        {b.cover_pin_id !== p.id && <button type="button" aria-label="Make cover" title="Make cover" style={small} onClick={() => run(() => boardsAPI.update(b.id, { cover_pin_id: p.id }))}><ImageIcon size={12} /></button>}
                        <button type="button" aria-label="Remove from board" title="Remove from board" style={{ ...small, color: colors.danger }} onClick={() => run(() => boardsAPI.removePin(b.id, p.id))}><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      {picking && <PinPicker exclude={pins.map((p) => p.id)} onClose={() => setPicking(false)} onPick={(ids) => { setPicking(false); run(() => boardsAPI.addPins(b.id, ids)); }} />}
    </AdminLayout>
  );
}
