import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, SelectInput, FormGrid, CheckboxRow } from '../ui/Form';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { btnGhost, colors } from '../../../../_shared/theme/tokens';
import { ChangeLog, ChipPicker, Section, SettingsSection } from './ReportsSettings';

/**
 * Books → Configuration → Tax control. The server sends every section with its settings, their values and whether the signed-in person may change the
 * section (the tax control permission changes everything; the tax administrator permission only the sections that may be handed to one). The kinds of
 * setting that are only found here are drawn below; the rest use the same controls as the Reports settings.
 */

const small = { fontSize: '0.75rem', color: colors.textMuted };

function Registrations({ value, onChange, disabled, max }) {
  const rows = value ?? [];
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr) auto', gap: 8, alignItems: 'center' }}>
          <TextInput disabled={disabled} value={r.name ?? ''} placeholder="VAT, PAYE, excise licence…" aria-label={`Registration ${i + 1} name`} onChange={(e) => set(i, { name: e.target.value })} />
          <TextInput disabled={disabled} value={r.number ?? ''} placeholder="Number" aria-label={`Registration ${i + 1} number`} onChange={(e) => set(i, { number: e.target.value })} />
          {!disabled && <button type="button" aria-label={`Remove registration ${i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }}><Trash2 size={15} /></button>}
        </div>
      ))}
      {!disabled && rows.length < max && <div><button type="button" onClick={() => onChange([...rows, { name: '', number: '' }])} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.75rem' }}><Plus size={12} /> Add a registration</button></div>}
    </div>
  );
}

/** One row per category in use: the ways of applying it that are allowed. */
function CategoryMethods({ value, enabled, onChange, disabled, lookups }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {enabled.map((c) => {
        const allowed = value?.[c] ?? [];
        const none = !allowed.length;
        return (
          <div key={c} style={{ borderTop: `1px solid ${colors.tint(0.06)}`, paddingTop: 8 }}>
            <p style={{ margin: '0 0 4px', fontSize: '0.8rem', fontWeight: 700, color: colors.text }}>
              {lookups.categories[c]} {none && <span style={{ fontWeight: 500, color: colors.dangerText, fontSize: '0.72rem' }}>no way of applying it is allowed</span>}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {Object.entries(lookups.methods).map(([m, label]) => (
                <label key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: colors.text }}>
                  <input type="checkbox" disabled={disabled} checked={allowed.includes(m)} style={{ accentColor: colors.primary }} aria-label={`${lookups.categories[c]}: ${label}`}
                    onChange={(e) => onChange({ ...value, [c]: e.target.checked ? [...allowed, m] : allowed.filter((x) => x !== m) })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** For each category, the ledgers a new tax of that category starts with. */
function CategoryLedgers({ value, enabled, onChange, disabled, lookups }) {
  const opts = lookups.ledgers;
  const set = (c, k, v) => {
    const row = { payable_ledger_id: null, input_ledger_id: null, cost_ledger_id: null, ...(value?.[c] ?? {}), [k]: v === '' ? null : Number(v) };
    onChange({ ...value, [c]: row });
  };
  const pick = (c, k, label) => (
    <SelectInput aria-label={`${lookups.categories[c]}: ${label}`} disabled={disabled} value={value?.[c]?.[k] ?? ''} onChange={(e) => set(c, k, e.target.value)}>
      <option value="">{label}: made when needed</option>
      {opts.map((l) => <option key={l.id} value={l.id}>{l.name}{l.group ? ` (${l.group})` : ''}</option>)}
    </SelectInput>
  );
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {enabled.map((c) => (
        <div key={c} style={{ borderTop: `1px solid ${colors.tint(0.06)}`, paddingTop: 8 }}>
          <p style={{ margin: '0 0 4px', fontSize: '0.8rem', fontWeight: 700, color: colors.text }}>{lookups.categories[c]}</p>
          <FormGrid min={220}>{pick(c, 'payable_ledger_id', 'Tax owed')}{pick(c, 'input_ledger_id', 'Input tax to recover')}{pick(c, 'cost_ledger_id', 'Tax that is a cost')}</FormGrid>
        </div>
      ))}
    </div>
  );
}

/** Taxes that apply to every qualifying document, each with what it does about exemptions and the documents it covers. */
function ApplyRegardless({ value, onChange, disabled, lookups, max }) {
  const rows = value ?? [];
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const taken = new Set(rows.map((r) => Number(r.tax_type_id)));
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {!rows.length && <p style={small}>No tax applies regardless: every tax follows the product, the account and the rules.</p>}
      {rows.map((r, i) => (
        <div key={i} style={{ borderTop: `1px solid ${colors.tint(0.06)}`, paddingTop: 8 }}>
          <FormGrid min={240}>
            <SelectInput aria-label={`Tax ${i + 1}`} disabled={disabled} value={r.tax_type_id ?? ''} onChange={(e) => set(i, { tax_type_id: Number(e.target.value) })}>
              <option value="">Choose a tax…</option>
              {lookups.tax_types.filter((t) => !taken.has(t.id) || t.id === Number(r.tax_type_id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectInput>
            <SelectInput aria-label={`Exemptions for tax ${i + 1}`} disabled={disabled} value={r.exemption_behaviour ?? 'respect_exemptions'} onChange={(e) => set(i, { exemption_behaviour: e.target.value })}>
              {Object.entries(lookups.exemptions).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </SelectInput>
          </FormGrid>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
            {Object.entries(lookups.documents).map(([d, label]) => (
              <label key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                <input type="checkbox" disabled={disabled} style={{ accentColor: colors.primary }} aria-label={`${label}: tax ${i + 1}`} checked={(r.documents ?? []).includes(d)}
                  onChange={(e) => set(i, { documents: e.target.checked ? [...(r.documents ?? []), d] : (r.documents ?? []).filter((x) => x !== d) })} />
                {label}
              </label>
            ))}
            {!disabled && <button type="button" aria-label={`Remove tax ${i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger, marginLeft: 'auto' }}><Trash2 size={15} /></button>}
          </div>
        </div>
      ))}
      {!disabled && rows.length < max && lookups.tax_types.length > rows.length && (
        <div><button type="button" onClick={() => onChange([...rows, { tax_type_id: '', exemption_behaviour: 'respect_exemptions', documents: ['sales'] }])} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.75rem' }}><Plus size={12} /> Add a tax</button></div>
      )}
    </div>
  );
}

/** Controls for the kinds of setting only Tax control has. `saved` is the categories in use as last saved; a control in the same section sees the unsaved edit through `draft`. */
const control = (saved) => (s, { value, onChange, disabled, error, lookups, id, draft }) => {
  const enabledNow = draft?.enabled_categories ?? saved;   // what is being edited in this section, else what was last saved
  const wide = (node) => <div style={{ gridColumn: '1 / -1' }}>{node}</div>;
  switch (s.type) {
    case 'country':
      return <Field label={s.label} htmlFor={id} hint={s.hint} error={error}><TextInput id={id} disabled={disabled} maxLength={2} style={{ maxWidth: 90, textTransform: 'uppercase' }} value={value ?? ''} onChange={(e) => onChange(e.target.value.toUpperCase())} /></Field>;
    case 'registrations':
      return wide(<Field label={s.label} hint={s.hint} error={error}><Registrations disabled={disabled} value={value} onChange={onChange} max={s.max_items} /></Field>);
    case 'category_list':
      return wide(<Field label={s.label} hint={s.hint} error={error}>
        <ChipPicker label={s.label} disabled={disabled} options={Object.entries(lookups.categories).map(([k, label]) => ({ value: k, label }))} selected={value ?? []} placeholder="Add a category…" onChange={onChange} />
      </Field>);
    case 'category_methods':
      return wide(<Field label={s.label} hint={s.hint} error={error}><CategoryMethods disabled={disabled} value={value} enabled={enabledNow} onChange={onChange} lookups={lookups} /></Field>);
    case 'group_id':
      return (
        <Field label={s.label} htmlFor={id} hint={s.hint} error={error}>
          <SelectInput id={id} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Not chosen</option>
            {lookups.groups.map((g) => <option key={g.id} value={g.id}>{g.path}</option>)}
          </SelectInput>
        </Field>
      );
    case 'category_ledgers':
      return wide(<Field label={s.label} hint={s.hint} error={error}><CategoryLedgers disabled={disabled} value={value ?? {}} enabled={enabledNow} onChange={onChange} lookups={lookups} /></Field>);
    case 'apply_regardless':
      return wide(<Field label={s.label} hint={s.hint} error={error}><ApplyRegardless disabled={disabled} value={value} onChange={onChange} lookups={lookups} max={s.max_items} /></Field>);
    default:
      return null;
  }
};

const HealthPanel = () => {
  const [checks, setChecks] = useState(null);
  useEffect(() => { booksAPI.taxControlHealth().then((r) => setChecks(r.checks ?? [])).catch(() => setChecks([])); }, []);
  if (checks === null) return null;

  // the colour follows the worst finding: red for something to fix, amber for something to check, green when all is well
  const errors = checks.filter((c) => c.level === 'error').length;
  const tone = errors ? { main: colors.danger, text: colors.dangerText, bg: colors.dangerBg, Icon: AlertOctagon } : checks.length ? { main: colors.warning, text: colors.warningText, bg: colors.warningBg, Icon: AlertTriangle } : { main: colors.success, text: colors.successText, bg: colors.successBg, Icon: CheckCircle2 };
  const heading = errors ? `${errors} thing${errors === 1 ? '' : 's'} to fix in the tax set-up` : checks.length ? `${checks.length} thing${checks.length === 1 ? '' : 's'} to check in the tax set-up` : 'The tax set-up is healthy';

  return (
    <div role={checks.length ? 'alert' : 'status'} style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 12, background: tone.bg, border: `1px solid ${tone.main}`, borderLeft: `6px solid ${tone.main}` }}>
      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: tone.text }}><tone.Icon size={18} color={tone.main} /> {heading}</p>
      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: tone.text, opacity: 0.85 }}>{checks.length ? 'These could make a document tax wrongly or leave a tax with nowhere to post. Nothing here changes by itself.' : 'No problems found.'}</p>
      {checks.length > 0 && (
        <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
          {checks.map((c, i) => (
            <li key={i} style={{ margin: '0 0 5px', fontSize: '0.8rem', color: c.level === 'error' ? colors.dangerText : colors.warningText }}>
              <strong>{c.level === 'error' ? 'Fix: ' : 'Check: '}</strong>{c.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default function TaxControlSettings() {
  const [data, setData] = useState(null);
  const load = useCallback(() => booksAPI.taxControl().then(setData).catch((e) => { toast.error(errMsg(e, 'Could not load Tax control')); setData({ ready: false, message: errMsg(e, 'Could not load Tax control.'), sections: [] }); }), []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  if (!data.ready) return <Section title="Tax control" hint={data.message} />;

  // only the section that was saved is replaced, so what has been typed in the other sections is not thrown away
  const onSaved = (r, sectionId) => setData((d) => ({ ...d, sections: d.sections.map((x) => (x.id === sectionId ? r.sections.find((y) => y.id === sectionId) ?? x : x)) }));
  const categories = data.sections.find((s) => s.id === 'categories')?.settings.find((s) => s.key === 'enabled_categories')?.value ?? [];

  return (
    <>
      <HealthPanel />
      {data.sections.map((section) => (
        <SettingsSection key={section.id} section={section} lookups={data.lookups} ledgers={[]} onSaved={onSaved} save={booksAPI.saveTaxControl}
          renderControl={control(categories)} />
      ))}
      <ChangeLog fetchLog={booksAPI.taxControlLog} title="Change log" hint="Every change to Tax control: what, who and when. Documents already posted are never recalculated by a change." />
    </>
  );
}
