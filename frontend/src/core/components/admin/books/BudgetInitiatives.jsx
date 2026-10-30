import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { CheckboxRow, Field, FormGrid, SelectInput, TextInput } from '../ui/Form';

const BLANK = { id: null, name: '', code: '', parent_id: '', note: '', is_active: true };

/** Initiatives: one-off things that have their own budget (Website redesign, New warehouse, Cash sales), nested to any depth. Not the Projects module. */
export default function BudgetInitiatives({ initiatives, canEdit, reload }) {
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setBusy(true); setErrs({});
    try {
      await booksAPI.saveInitiative(form.id, { ...form, parent_id: form.parent_id || null });
      toast.success('Saved'); setForm(null); reload();
    } catch (e) { setErrs(Object.fromEntries(Object.entries(e?.response?.data?.errors ?? {}).map(([k, v]) => [k, v[0]]))); toast.error(errMsg(e, 'Could not save it')); } finally { setBusy(false); }
  };
  const remove = async (i) => {
    try { const r = await booksAPI.deleteInitiative(i.id); toast.success(r.result === 'switched_off' ? 'It is in a budget, so it was switched off instead of removed' : 'Removed'); reload(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); }
  };
  // an initiative cannot be moved under itself or anything under it
  const blocked = (id) => { const out = new Set([id]); initiatives.forEach((i) => { if (out.has(i.parent_id)) out.add(i.id); }); return out; };

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>Initiatives</p>
      <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 640, lineHeight: 1.5 }}>
        A one-off or time-limited thing that has its own budget: a website redesign, a new warehouse, a sales channel. Put initiatives under one another to drill down (Cash sales › Travel). This is a list of its own, separate from the Projects module.
      </p>
      {canEdit && !form && <button type="button" style={{ ...btnGhost, marginBottom: 10 }} onClick={() => setForm({ ...BLANK })}><Plus size={13} /> Add an initiative</button>}
      {form && (
        <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <FormGrid min={200}>
            <Field label="Name" htmlFor="ini-name" error={errs.name}><TextInput id="ini-name" value={form.name} onChange={set('name')} maxLength={120} /></Field>
            <Field label="Code" htmlFor="ini-code"><TextInput id="ini-code" value={form.code ?? ''} onChange={set('code')} maxLength={30} /></Field>
            <Field label="Sits under" htmlFor="ini-parent" error={errs.parent_id}>
              <SelectInput id="ini-parent" value={form.parent_id ?? ''} onChange={set('parent_id')}>
                <option value="">Top level</option>{initiatives.filter((i) => !blocked(form.id ?? -1).has(i.id)).map((i) => <option key={i.id} value={i.id}>{'  '.repeat(i.depth)}{i.name}</option>)}
              </SelectInput>
            </Field>
            <Field label="Note" htmlFor="ini-note"><TextInput id="ini-note" value={form.note ?? ''} onChange={set('note')} maxLength={255} /></Field>
          </FormGrid>
          <CheckboxRow checked={form.is_active} onChange={set('is_active')} label="In use" description="Switch off to stop it being offered on new budget rows." />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" style={btnGhost} onClick={() => { setForm(null); setErrs({}); }}>Cancel</button>
          </div>
        </div>
      )}
      {initiatives.length === 0 ? <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>No initiatives yet.</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
          {initiatives.map((i) => (
            <li key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 6px', paddingLeft: 6 + i.depth * 20, fontSize: '0.8rem', opacity: i.is_active ? 1 : 0.55 }}>
              <span style={{ flex: 1 }}>{i.name}{i.code ? <span style={{ marginLeft: 6, color: colors.textFaint, fontSize: '0.68rem' }}>{i.code}</span> : null}{!i.is_active && <span style={{ marginLeft: 6, color: colors.textFaint, fontSize: '0.68rem' }}>switched off</span>}</span>
              {canEdit && <>
                <button type="button" aria-label={`Edit ${i.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }} onClick={() => setForm({ ...BLANK, ...i, parent_id: i.parent_id ?? '' })}><Pencil size={14} /></button>
                <button type="button" aria-label={`Remove ${i.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }} onClick={() => remove(i)}><Trash2 size={14} /></button>
              </>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
