import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import { tendersAPI, vendorsAPI } from '../../../../_shared/api/index';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { Field, TextInput, TextArea, SelectInput, NumberInput, CheckboxRow } from '../../../../core/components/admin/ui/Form';
import { fmtDateTime } from '../../../components/procurement/format';

const box = { ...card, padding: 18, display: 'grid', gap: 12 };

/** Addendum 1, 2...: what changed after publishing, optionally with a new closing date and files. */
export function AddendaPanel({ tender, reload, onError }) {
  const fileRef = useRef(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [deadline, setDeadline] = useState('');
  const [files, setFiles] = useState([]);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const draft = tender.status === 'draft';

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('title', title);
    if (note.trim()) fd.append('note', note.trim());
    if (deadline) fd.append('new_deadline', deadline);
    files.forEach(f => fd.append('files[]', f));
    if (notify) fd.append('notify', '1');
    setBusy(true); onError(null);
    try {
      const res = await tendersAPI.addAddendum(tender.id, fd);
      toast.success(res.message);
      setTitle(''); setNote(''); setDeadline(''); setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      reload();
    } catch (x) { onError(errMsg(x, 'Could not add the addendum')); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {draft ? <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Addenda change a tender that is already published. Publish it first; until then just edit it.</p> : (
        <form onSubmit={submit} style={box}>
          <strong style={{ fontSize: '0.85rem' }}>Add an addendum</strong>
          <Field label="Title"><TextInput required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Clarification on the site visit" /></Field>
          <Field label="What changed"><TextArea rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field>
          <Field label="New close date and time" hint="Only if the closing date moves. The tender is updated and the change is shown on its page"><TextInput type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>
          <Field label="Files" hint="Optional. The revised document, drawings and so on"><input ref={fileRef} type="file" multiple onChange={e => setFiles([...e.target.files])} style={{ fontSize: '0.8rem', color: colors.text }} /></Field>
          <CheckboxRow checked={notify} onChange={setNotify} label="Tell eligible vendors" description="Sends a notification and email to the vendors who can see this tender" />
          <div><button type="submit" disabled={busy || !title.trim()} style={{ ...btnPrimary, opacity: busy || !title.trim() ? 0.6 : 1 }}><Plus size={14} /> {busy ? 'Adding…' : 'Add addendum'}</button></div>
        </form>
      )}
      {(tender.addenda || []).length === 0 ? <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No addenda yet.</p> : (
        <div style={box}>
          {tender.addenda.map(a => (
            <div key={a.id} style={{ fontSize: '0.82rem', color: colors.textBody }}>
              <strong style={{ color: colors.text }}>Addendum {a.number}: {a.title}</strong> <span style={{ color: colors.textMuted }}>{fmtDateTime(a.created_at)}</span>
              {a.new_deadline && <div style={{ color: colors.warningText }}>Closing date moved{a.previous_deadline ? ` from ${fmtDateTime(a.previous_deadline)}` : ''} to {fmtDateTime(a.new_deadline)}</div>}
              {a.note && <div style={{ whiteSpace: 'pre-wrap' }}>{a.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const blankRow = (lot) => ({ lot_code: lot?.code || '', vendor_id: '', winner_name: '', amount: '', awarded_on: '' });

/** Record the offline decision: who won the whole tender, or each lot. A lot left with no winner simply had none. */
export function AwardPanel({ tender, reload, onError }) {
  const lots = tender.lots || [];
  const [rows, setRows] = useState(() => (tender.awards || []).length
    ? tender.awards.map(w => ({ lot_code: w.lot_code || '', vendor_id: w.vendor_id || '', winner_name: w.winner_name || '', amount: w.amount ?? '', awarded_on: w.awarded_on ? String(w.awarded_on).slice(0, 10) : '' }))
    : (lots.length ? lots.map(blankRow) : [blankRow()]));
  const [show, setShow] = useState(tender.show_award === undefined ? true : !!tender.show_award);
  const [vendors, setVendors] = useState([]);
  const [busy, setBusy] = useState(false);
  const locked = !['published', 'closed', 'awarded'].includes(tender.status);

  useEffect(() => { vendorsAPI.list({ status: 'active' }).then(r => setVendors(r.rows || [])).catch(() => setVendors([])); }, []);

  const set = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    setBusy(true); onError(null);
    try {
      const awards = rows.filter(r => r.vendor_id || r.winner_name.trim()).map(r => ({
        lot_code: r.lot_code || null, vendor_id: r.vendor_id || null, winner_name: r.winner_name.trim() || null,
        amount: r.amount === '' ? null : r.amount, awarded_on: r.awarded_on || null,
      }));
      if (awards.length === 0) { onError('Enter at least one winner.'); return; }
      const res = await tendersAPI.award(tender.id, { awards, show_award: show });
      toast.success(res.message); reload();
    } catch (x) { onError(errMsg(x, 'Could not record the award')); } finally { setBusy(false); }
  };

  if (locked) return <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Only a published or closed tender can be awarded.</p>;

  return (
    <div style={box}>
      <strong style={{ fontSize: '0.85rem' }}>{tender.status === 'awarded' ? 'Award recorded' : 'Record the award'}</strong>
      <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>The decision is made offline. Record the winner{lots.length ? ' of each lot' : ''} here and the tender becomes Awarded. Leave a lot blank if it had no winner. Upload the Notice of award on the Files tab.</p>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 90px) minmax(170px, 2fr) minmax(150px, 1.5fr) minmax(110px, 1fr) minmax(130px, 1fr) auto', gap: 8, alignItems: 'end' }}>
          <Field label={i === 0 ? 'Lot' : undefined}>
            {lots.length ? <SelectInput value={r.lot_code} onChange={e => set(i, 'lot_code', e.target.value)}><option value="">Whole tender</option>{lots.map(l => <option key={l.code} value={l.code}>{l.code}: {l.title}</option>)}</SelectInput> : <TextInput value="Whole tender" disabled />}
          </Field>
          <Field label={i === 0 ? 'Vendor on the list' : undefined}>
            <SelectInput value={r.vendor_id} onChange={e => set(i, 'vendor_id', e.target.value)}><option value="">Not on the list</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}</SelectInput>
          </Field>
          <Field label={i === 0 ? 'Or type the name' : undefined}><TextInput value={r.winner_name} onChange={e => set(i, 'winner_name', e.target.value)} disabled={!!r.vendor_id} /></Field>
          <Field label={i === 0 ? 'Amount' : undefined}><NumberInput value={r.amount} onChange={e => set(i, 'amount', e.target.value)} /></Field>
          <Field label={i === 0 ? 'Date' : undefined}><TextInput type="date" value={r.awarded_on} onChange={e => set(i, 'awarded_on', e.target.value)} /></Field>
          <button type="button" aria-label="Remove row" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} style={{ ...btnGhost, padding: '8px 10px' }}><Trash2 size={14} /></button>
        </div>
      ))}
      <div><button type="button" onClick={() => setRows(rs => [...rs, blankRow()])} style={btnGhost}><Plus size={14} /> Add another winner</button></div>
      <CheckboxRow checked={show} onChange={setShow} label="Show the winners on the public tender page" description="Untick to keep the award private" />
      <div><button type="button" onClick={save} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}><Award size={14} /> {busy ? 'Saving…' : tender.status === 'awarded' ? 'Update the award' : 'Mark as awarded'}</button></div>
    </div>
  );
}
