import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, SelectInput } from '../ui/Form';
import LedgerPicker from './LedgerPicker';
import { btnGhost, btnPrimary, card, colors, input } from '../../../../_shared/theme/tokens';

const REPEAT = { none: 'Does not repeat', weekly: 'Every week', monthly: 'Every month', quarterly: 'Every quarter', yearly: 'Every year' };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const small = { ...input, padding: '6px 8px', fontSize: '0.8rem', width: '100%' };

const repeatText = (t) => (t.repeat_every === 'none' ? 'One-off' : `${REPEAT[t.repeat_every]}${t.repeat_day ? (t.repeat_every === 'weekly' ? `, ${DAYS[t.repeat_day - 1]}` : `, day ${t.repeat_day}`) : ''}${t.next_due_on && t.is_active ? ` · next ${t.next_due_on}` : ''}`);

const Section = ({ title, hint, children }) => (
  <div style={{ ...card, padding: 18, marginBottom: 16 }}>
    <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>{title}</p>
    {hint && <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textFaint }}>{hint}</p>}
    {children}
  </div>
);

const row = { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', border: `1px solid ${colors.tint(0.15)}`, borderRadius: 8, flexWrap: 'wrap' };

/** Where a template's ledgers are chosen: each entry (Dr or Cr) of a journal, or each ledger line of an invoice. Saving writes them into the template. */
function LedgerEditor({ template, ledgers, onSaved, onClose }) {
  const [state, setState] = useState(() => JSON.parse(JSON.stringify(template.form_state ?? {})));
  const [busy, setBusy] = useState(false);
  const entries = state.entries ?? [];
  const lines = (state.lines ?? []).map((l, i) => [l, i]).filter(([l]) => l.type === 'custom' || l.other);
  const setEntry = (i, patch) => setState((s) => ({ ...s, entries: s.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const addEntry = () => setState((st) => ({ ...st, entries: [...(st.entries ?? []), { ledger_id: '', side: (st.entries ?? []).filter((e) => e.side === 'D').length > (st.entries ?? []).filter((e) => e.side === 'C').length ? 'C' : 'D', amount: '' }] }));
  const removeEntry = (i) => setState((st) => ({ ...st, entries: st.entries.filter((_, j) => j !== i) }));
  const setLine = (i, patch) => setState((s) => ({ ...s, lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const save = async () => {
    setBusy(true);
    try {
      await booksAPI.saveVoucherTemplate({ name: template.name, category: template.category, form: template.form, voucher_type_id: template.voucher_type_id, base_type: template.base_type, form_state: state,
        repeat_every: template.repeat_every, repeat_day: template.repeat_day, is_active: template.is_active }, template.id);
      toast.success('Ledgers saved'); onSaved();
    } catch (e) { toast.error(errMsg(e, 'Could not save the ledgers')); } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 8, padding: 12, background: colors.tint(0.04), borderRadius: 8, display: 'grid', gap: 8, width: '100%' }}>
      {entries.length === 0 && lines.length === 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>This template has no ledger lines to set. Save a form with entries or ledger lines as a template first.</p>}
      {entries.map((e, i) => (
        <div key={`e${i}`} style={{ display: 'grid', gridTemplateColumns: '60px minmax(0,1fr) 110px 34px', gap: 8, alignItems: 'center' }}>
          <SelectInput value={e.side} onChange={(ev) => setEntry(i, { side: ev.target.value })} aria-label="Debit or credit"><option value="D">Dr</option><option value="C">Cr</option></SelectInput>
          <LedgerPicker ledgers={ledgers} value={e.ledger_id} style={small} onPick={(l) => setEntry(i, { ledger_id: l.id })} />
          <input type="number" min="0" step="0.01" value={e.amount ?? ''} onChange={(ev) => setEntry(i, { amount: ev.target.value })} placeholder="Amount (optional)" style={small} aria-label="Usual amount" />
          <button type="button" aria-label="Remove entry" disabled={entries.length <= 2} onClick={() => removeEntry(i)} style={{ ...btnGhost, padding: '4px 6px', opacity: entries.length <= 2 ? 0.4 : 1 }}>✕</button>
        </div>
      ))}
      {(entries.length > 0 || ['journal', 'contra'].includes(template.base_type)) && entries.length < 8 && <button type="button" style={{ ...btnGhost, alignSelf: 'flex-start', padding: '3px 12px', fontSize: '0.75rem' }} onClick={addEntry}>+ Entry ({entries.length} of 8)</button>}
      {lines.map(([l, i]) => (
        <div key={`l${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 110px', gap: 8, alignItems: 'center' }}>
          <LedgerPicker ledgers={ledgers} value={l.ledger_id} style={small} onPick={(x) => setLine(i, { ledger_id: x.id, description: l.description || x.name })} />
          <input value={l.description ?? ''} onChange={(ev) => setLine(i, { description: ev.target.value })} placeholder="Description" style={small} aria-label="Description" />
          <input type="number" min="0" step="0.01" value={l.rate ?? ''} onChange={(ev) => setLine(i, { rate: ev.target.value })} placeholder="Usual amount" style={small} aria-label="Usual amount" />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ ...btnPrimary, padding: '4px 14px', fontSize: '0.78rem' }} disabled={busy} onClick={save}>Save ledgers</button>
        <button type="button" style={{ ...btnGhost, padding: '4px 12px', fontSize: '0.78rem' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Make a template from scratch: a journal (or contra) with the ledgers it posts to, up to 8 entries, and how often it repeats. */
function NewTemplate({ ledgers, onSaved, onClose }) {
  const [types, setTypes] = useState([]);
  const [f, setF] = useState({ name: '', category: '', type_id: '', narration: '', repeat_every: 'none', repeat_day: '' });
  const [entries, setEntries] = useState([{ ledger_id: '', side: 'D', amount: '' }, { ledger_id: '', side: 'C', amount: '' }]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { booksAPI.types().then((t) => { const j = t.filter((x) => ['journal', 'contra'].includes(x.base_type) && x.is_active); setTypes(j); setF((x) => ({ ...x, type_id: x.type_id || (j.find((y) => y.base_type === 'journal') ?? j[0])?.id || '' })); }).catch(() => {}); }, []);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setEntry = (i, patch) => setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const save = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) { toast.error('Give the template a name.'); return; }
    if (!f.type_id) { toast.error('There is no journal voucher type to make it for.'); return; }
    setBusy(true);
    try {
      await booksAPI.saveVoucherTemplate({ name: f.name.trim(), category: f.category || null, form: 'voucher', voucher_type_id: Number(f.type_id), form_state: { h: { narration: f.narration }, lines: [], entries, tenders: [], acct: false },
        repeat_every: f.repeat_every, repeat_day: f.repeat_every === 'none' ? null : Number(f.repeat_day) || null });
      toast.success('Template made'); onSaved();
    } catch (x) { toast.error(errMsg(x, 'Could not make the template')); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} style={{ ...card, padding: 18, marginBottom: 16, display: 'grid', gap: 10 }}>
      <strong style={{ fontSize: '0.9rem' }}>New template</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
        <Field label="Name"><TextInput value={f.name} onChange={set('name')} placeholder="e.g. Pay licence fees" /></Field>
        <Field label="Group (optional)"><TextInput value={f.category} onChange={set('category')} placeholder="Premises, Staff…" /></Field>
        <Field label="Voucher type"><SelectInput value={f.type_id} onChange={set('type_id')}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectInput></Field>
        <Field label="Narration"><TextInput value={f.narration} onChange={set('narration')} placeholder="What it is for" /></Field>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px minmax(0,1fr) 110px 34px', gap: 8, alignItems: 'center' }}>
            <SelectInput value={e.side} onChange={(ev) => setEntry(i, { side: ev.target.value })} aria-label="Debit or credit"><option value="D">Dr</option><option value="C">Cr</option></SelectInput>
            <LedgerPicker ledgers={ledgers} value={e.ledger_id} style={small} onPick={(l) => setEntry(i, { ledger_id: l.id })} />
            <input type="number" min="0" step="0.01" value={e.amount} onChange={(ev) => setEntry(i, { amount: ev.target.value })} placeholder="Usual amount" style={small} aria-label="Usual amount" />
            <button type="button" aria-label="Remove entry" disabled={entries.length <= 2} onClick={() => setEntries((es) => es.filter((_, j) => j !== i))} style={{ ...btnGhost, padding: '4px 6px', opacity: entries.length <= 2 ? 0.4 : 1 }}>✕</button>
          </div>
        ))}
        {entries.length < 8 && <button type="button" style={{ ...btnGhost, alignSelf: 'flex-start', padding: '3px 12px', fontSize: '0.75rem' }} onClick={() => setEntries((es) => [...es, { ledger_id: '', side: es.filter((x) => x.side === 'D').length > es.filter((x) => x.side === 'C').length ? 'C' : 'D', amount: '' }])}>+ Entry ({entries.length} of 8)</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8 }}>
        <Field label="Repeat"><SelectInput value={f.repeat_every} onChange={(e) => setF((x) => ({ ...x, repeat_every: e.target.value, repeat_day: '' }))}>{Object.entries(REPEAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
        {f.repeat_every !== 'none' && (
          <Field label={f.repeat_every === 'weekly' ? 'On' : 'On day of the month'}>
            {f.repeat_every === 'weekly'
              ? <SelectInput value={f.repeat_day} onChange={set('repeat_day')}><option value="">Monday</option>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</SelectInput>
              : <TextInput type="number" min="1" max="31" value={f.repeat_day} onChange={set('repeat_day')} placeholder="1 to 31" />}
          </Field>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" style={btnPrimary} disabled={busy}>Make the template</button>
        <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

/** A template's schedule. */
function ScheduleEditor({ template, onSaved, onClose }) {
  const [every, setEvery] = useState(template.repeat_every);
  const [day, setDay] = useState(template.repeat_day ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await booksAPI.saveVoucherTemplate({ name: template.name, category: template.category, form: template.form, voucher_type_id: template.voucher_type_id, base_type: template.base_type, form_state: template.form_state,
        repeat_every: every, repeat_day: every === 'none' ? null : Number(day) || null, is_active: template.is_active }, template.id);
      toast.success('Schedule saved'); onSaved();
    } catch (e) { toast.error(errMsg(e, 'Could not save the schedule')); } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 8, padding: 12, background: colors.tint(0.04), borderRadius: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8, alignItems: 'end', width: '100%' }}>
      <Field label="Repeat"><SelectInput value={every} onChange={(e) => { setEvery(e.target.value); setDay(''); }}>{Object.entries(REPEAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
      {every !== 'none' && (
        <Field label={every === 'weekly' ? 'On' : 'On day of the month'}>
          {every === 'weekly'
            ? <SelectInput value={day} onChange={(e) => setDay(e.target.value)}><option value="">Monday</option>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</SelectInput>
            : <TextInput type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} placeholder="1 to 31" />}
        </Field>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ ...btnPrimary, padding: '4px 14px', fontSize: '0.78rem' }} disabled={busy} onClick={save}>Save schedule</button>
        <button type="button" style={{ ...btnGhost, padding: '4px 12px', fontSize: '0.78rem' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Configuration → Voucher templates: set each template's ledgers and schedule, pause or resume it, restore what was deleted, bring back starter templates and skipped drafts. */
export default function TemplatesSettings({ canWrite }) {
  const [data, setData] = useState(null);
  const [ledgers, setLedgers] = useState([]);
  const [open, setOpen] = useState(null);   // `${id}:ledgers` or `${id}:schedule`
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(false);
  const load = useCallback(() => booksAPI.voucherTemplates().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the templates'))), []);
  useEffect(() => { load(); booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {}); }, [load]);

  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(r?.message ?? ok); await load(); } catch (e) { toast.error(errMsg(e, 'Could not do that')); } finally { setBusy(false); } };

  if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  if (data.ready === false) return <p role="alert" style={{ color: colors.dangerText }}>{data.message}</p>;
  const live = data.templates ?? [];
  const inUse = live.filter((t) => t.is_active);
  const paused = live.filter((t) => !t.is_active);
  const edit = (t) => {
    const k = (kind) => `${t.id}:${kind}`;
    return open === k('ledgers') ? <LedgerEditor template={t} ledgers={ledgers} onSaved={() => { setOpen(null); load(); }} onClose={() => setOpen(null)} />
      : open === k('schedule') ? <ScheduleEditor template={t} onSaved={() => { setOpen(null); load(); }} onClose={() => setOpen(null)} /> : null;
  };
  const rowFor = (t) => (
    <div key={t.id} style={row}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.name}{t.category && <span style={{ marginLeft: 8, fontSize: '0.68rem', color: colors.textFaint }}>{t.category}</span>}</div>
        <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{repeatText(t)}</div>
      </div>
      {canWrite && <>
        <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => setOpen(open === `${t.id}:ledgers` ? null : `${t.id}:ledgers`)}>Set ledgers</button>
        <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => setOpen(open === `${t.id}:schedule` ? null : `${t.id}:schedule`)}>Schedule</button>
        <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} disabled={busy} onClick={() => run(() => booksAPI.saveVoucherTemplate({ name: `${t.name} (copy)`, category: t.category, form: t.form, voucher_type_id: t.voucher_type_id, base_type: t.base_type, form_state: t.form_state, repeat_every: 'none' }), 'Copied: change its name and ledgers')}>Copy</button>
        <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} disabled={busy} onClick={() => run(() => booksAPI.setTemplateActive(t.id, !t.is_active), t.is_active ? 'Paused' : 'Resumed')}>{t.is_active ? 'Pause' : 'Resume'}</button>
        <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', color: colors.danger }} disabled={busy} onClick={() => confirm(`Delete “${t.name}”? You can restore it from the deleted list below.`) && run(() => booksAPI.deleteVoucherTemplate(t.id), 'Deleted')}>Delete</button>
      </>}
      {edit(t)}
    </div>
  );

  return (
    <div>
      {canWrite && !making && <button type="button" style={{ ...btnPrimary, marginBottom: 14 }} onClick={() => setMaking(true)}>New template</button>}
      {making && <NewTemplate ledgers={ledgers} onSaved={() => { setMaking(false); load(); }} onClose={() => setMaking(false)} />}
      <Section title="Voucher templates" hint="Each template is a saved voucher. Set the ledgers it posts to, and how often it repeats. A repeating template never posts: it leaves a draft in the inbox on the Vouchers tab.">
        {live.length === 0 && <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No templates yet. Save one from a voucher form (F3), or restore a starter template below.</p>}
        <div style={{ display: 'grid', gap: 6 }}>{inUse.map(rowFor)}</div>
      </Section>

      {paused.length > 0 && (
        <Section title={`Paused (${paused.length})`} hint="Kept, but they do not repeat and leave no drafts until you resume them.">
          <div style={{ display: 'grid', gap: 6 }}>{paused.map(rowFor)}</div>
        </Section>
      )}

      {(data.starters_missing ?? []).length > 0 && (
        <Section title="Starter templates not in use" hint="Rent, electricity, deposits and the like. A deleted one comes back as it was, with the ledgers you set.">
          <div style={{ display: 'grid', gap: 6 }}>
            {data.starters_missing.map((n) => (
              <div key={n} style={row}>
                <span style={{ flex: 1, fontSize: '0.85rem' }}>{n}</span>
                {canWrite && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} disabled={busy} onClick={() => run(() => booksAPI.addTemplateStarters([n]), 'Restored')}>{(data.trash ?? []).some((t) => t.name === n) ? 'Restore' : 'Add'}</button>}
              </div>
            ))}
            {canWrite && data.starters_missing.length > 1 && <button type="button" style={{ ...btnPrimary, alignSelf: 'flex-start', padding: '4px 14px', fontSize: '0.78rem' }} disabled={busy} onClick={() => run(() => booksAPI.addTemplateStarters(), 'Starter templates added')}>Add all of them</button>}
          </div>
        </Section>
      )}

      {(data.trash ?? []).length > 0 && (
        <Section title={`Deleted (${data.trash.length})`} hint="Restoring brings a template back paused, so nothing starts repeating until you resume it. Delete for good removes it and its drafts.">
          <div style={{ display: 'grid', gap: 6 }}>
            {data.trash.map((t) => (
              <div key={t.id} style={row}>
                <div style={{ flex: '1 1 220px' }}><div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.name}</div><div style={{ fontSize: '0.72rem', color: colors.textMuted }}>deleted {t.deleted_at}</div></div>
                {canWrite && <button type="button" style={{ ...btnPrimary, padding: '4px 12px', fontSize: '0.75rem' }} disabled={busy} onClick={() => run(() => booksAPI.restoreVoucherTemplate(t.id), 'Restored')}>Restore</button>}
                {canWrite && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', color: colors.danger }} disabled={busy} onClick={() => confirm(`Delete “${t.name}” for good? This cannot be undone.`) && run(() => booksAPI.purgeVoucherTemplate(t.id), 'Deleted for good')}>Delete for good</button>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {(data.skipped_drafts ?? []).length > 0 && (
        <Section title={`Skipped drafts (${data.skipped_drafts.length})`} hint="Drafts you skipped from the inbox. Put one back to see it on the Vouchers tab again.">
          <div style={{ display: 'grid', gap: 6 }}>
            {data.skipped_drafts.map((d) => (
              <div key={d.id} style={row}>
                <span style={{ flex: 1, fontSize: '0.85rem' }}>{d.name} <span style={{ color: colors.textMuted }}>· due {d.due_on}</span></span>
                {canWrite && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} disabled={busy} onClick={() => run(() => booksAPI.handleVoucherDraft(d.id, 'pending'), 'Back in the inbox')}>Put back in the inbox</button>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
