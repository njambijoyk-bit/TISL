import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Mail, Pencil, Plus, Send, Trash2, Upload } from 'lucide-react';
import { eventsGuestAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import { Field, FormGrid, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };
const RSVP_TONE = { yes: colors.successText, no: colors.dangerText, maybe: colors.warningText, pending: colors.textMuted };
const blank = { id: null, name: '', email: '', phone: '', role: 'guest', group_name: '', table_label: '', plus_ones: 0, meal: '', needs: '', note: '' };

/** The guest list: who is invited, who has answered, how many are coming, meals and needs; invitations and reminders go out from here. */
export default function GuestsPanel({ eventId, canEdit }) {
  const [res, setRes] = useState(null);
  const [f, setF] = useState({ rsvp: '', q: '' });
  const [edit, setEdit] = useState(null);
  const [paste, setPaste] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => eventsGuestAPI.list(eventId, { rsvp: f.rsvp || undefined, q: f.q || undefined }).then(setRes).catch((e) => toast.error(errMsg(e, 'Could not load the guests'))), [eventId, f]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);

  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(typeof ok === 'function' ? ok(r) : ok); await load(); return r; } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } finally { setBusy(false); } };
  const save = () => run(async () => { const { id, ...v } = edit; await eventsGuestAPI.save(eventId, id, { ...v, email: v.email || null, phone: v.phone || null, group_name: v.group_name || null, table_label: v.table_label || null, meal: v.meal || null, needs: v.needs || null, note: v.note || null, plus_ones: Number(v.plus_ones) || 0 }); setEdit(null); }, 'Saved');
  const send = (reminder) => run(() => eventsGuestAPI.send(eventId, { reminder }), (r) => r.message);

  if (!res) return <p style={{ color: colors.textMuted, fontSize: '0.84rem' }}>Loading…</p>;
  const s = res.summary;
  const columns = [
    { key: 'name', label: 'Guest', render: (g) => <span><strong>{g.name}</strong>{g.role !== 'guest' && <em style={{ color: colors.textFaint }}> · {g.role}</em>}<span style={{ display: 'block', fontSize: '0.72rem', color: colors.textFaint }}>{[g.group_name, g.table_label && `table ${g.table_label}`, g.email, g.phone].filter(Boolean).join(' · ')}</span></span> },
    { key: 'rsvp', label: 'Reply', render: (g) => <span style={{ color: RSVP_TONE[g.rsvp], fontWeight: 700, textTransform: 'capitalize' }}>{g.rsvp}{g.rsvp === 'yes' ? ` · ${g.attending}` : ''}{!g.invited_at && <em style={{ color: colors.textFaint, fontWeight: 400 }}> · not invited</em>}</span> },
    { key: 'meal', label: 'Meal / needs', render: (g) => <span style={{ fontSize: '0.76rem' }}>{[g.meal, g.needs].filter(Boolean).join(' · ') || '—'}</span> },
    ...(canEdit ? [{ key: '_', label: '', align: 'right', render: (g) => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" style={small} title="Copy their reply link" onClick={() => navigator.clipboard?.writeText(g.link).then(() => toast.success('Link copied'))} aria-label="Copy link"><Copy size={12} /></button>
        <button type="button" style={small} onClick={() => setEdit({ ...blank, ...Object.fromEntries(Object.keys(blank).map((k) => [k, g[k] ?? blank[k]])) })} aria-label="Edit"><Pencil size={12} /></button>
        <button type="button" style={{ ...small, color: colors.danger }} onClick={() => run(() => eventsGuestAPI.remove(eventId, g.id), 'Removed')} aria-label="Remove"><Trash2 size={12} /></button>
      </span>) }] : []),
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...card, padding: 14, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {[['Invited', s.invited], ['Coming', s.yes], ['Heads', s.heads], ['Not coming', s.no], ['Maybe', s.maybe], ['Waiting', s.pending]].map(([l, v]) => <div key={l}><div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{v}</div><div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{l}</div></div>)}
      </div>
      {(Object.keys(s.meals).length > 0 || s.needs.length > 0) && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textBody }}>
          {Object.entries(s.meals).map(([m, n]) => `${m}: ${n}`).join(' · ')}{s.needs.length ? ` · Needs: ${s.needs.map((n) => `${n.name} (${n.needs})`).join('; ')}` : ''}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {canEdit && <>
          <button type="button" style={btnPrimary} onClick={() => setEdit(blank)}><Plus size={14} /> Add a guest</button>
          <button type="button" style={btnGhost} onClick={() => setPaste('')}><Upload size={14} /> Paste a list</button>
          <button type="button" style={btnGhost} disabled={busy || s.invited === s.sent} onClick={() => send(false)}><Send size={14} /> Send invitations ({s.invited - s.sent})</button>
          <button type="button" style={btnGhost} disabled={busy || s.pending === 0 || s.sent === 0} onClick={() => send(true)}><Mail size={14} /> Remind those who have not replied</button>
        </>}
        <SelectInput value={f.rsvp} onChange={(e) => setF({ ...f, rsvp: e.target.value })} aria-label="Reply" style={{ width: 'auto', marginLeft: 'auto' }}>
          <option value="">Everyone</option><option value="pending">Waiting</option><option value="yes">Coming</option><option value="no">Not coming</option><option value="maybe">Maybe</option>
        </SelectInput>
        <TextInput value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search" aria-label="Search guests" style={{ width: 160 }} />
      </div>
      <SimpleTable columns={columns} rows={res.data} empty="No guests yet. Add them one by one or paste a list." />

      {edit && (
        <Modal title={edit.id ? 'Edit guest' : 'Add a guest'} width={560} onClose={() => setEdit(null)} footer={<ModalActions onCancel={() => setEdit(null)} onSubmit={save} busy={busy} disabled={!edit.name.trim()} submitLabel="Save" busyLabel="Saving…" />}>
          <FormStack>
            <FormGrid min={200}>
              <Field label="Name" htmlFor="g-name"><TextInput id="g-name" maxLength={160} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Role" htmlFor="g-role"><SelectInput id="g-role" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{res.roles.map((r) => <option key={r} value={r}>{r}</option>)}</SelectInput></Field>
              <Field label="Email" htmlFor="g-em"><TextInput id="g-em" type="email" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
              <Field label="Phone / WhatsApp" htmlFor="g-ph"><TextInput id="g-ph" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="Group" htmlFor="g-gr"><TextInput id="g-gr" maxLength={80} value={edit.group_name ?? ''} onChange={(e) => setEdit({ ...edit, group_name: e.target.value })} placeholder="Bride's family" /></Field>
              <Field label="Table" htmlFor="g-tb"><TextInput id="g-tb" maxLength={40} value={edit.table_label ?? ''} onChange={(e) => setEdit({ ...edit, table_label: e.target.value })} /></Field>
              <Field label="Plus-ones allowed" htmlFor="g-po"><NumberInput id="g-po" min={0} max={20} value={edit.plus_ones} onChange={(e) => setEdit({ ...edit, plus_ones: e.target.value })} /></Field>
              <Field label="Meal" htmlFor="g-meal"><TextInput id="g-meal" maxLength={80} value={edit.meal ?? ''} onChange={(e) => setEdit({ ...edit, meal: e.target.value })} /></Field>
            </FormGrid>
            <Field label="Special needs" htmlFor="g-needs"><TextInput id="g-needs" maxLength={300} value={edit.needs ?? ''} onChange={(e) => setEdit({ ...edit, needs: e.target.value })} /></Field>
            <Field label="Note (only you see it)" htmlFor="g-note"><TextInput id="g-note" maxLength={300} value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          </FormStack>
        </Modal>
      )}
      {paste !== null && (
        <Modal title="Paste a list of guests" subtitle="One guest a line: name, email, phone, role, group, plus-ones" width={600} onClose={() => setPaste(null)}
          footer={<ModalActions onCancel={() => setPaste(null)} onSubmit={() => run(async () => { const r = await eventsGuestAPI.import(eventId, paste); if (r.errors.length) toast.error(r.errors.slice(0, 3).join('\n'), { duration: 9000 }); setPaste(null); return r; }, (r) => `${r.added} added, ${r.skipped} already there`)} busy={busy} disabled={!paste.trim()} submitLabel="Add them" busyLabel="Adding…" />}>
          <TextArea rows={10} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Guests" placeholder={'Amina Wanjiru, amina@example.com, 0711000001, guest, Bride\'s family, 1\nJoseph Otieno, joseph@example.com'} />
        </Modal>
      )}
    </div>
  );
}
