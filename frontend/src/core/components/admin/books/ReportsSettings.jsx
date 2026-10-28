import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg, fieldErrors } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, NumberInput, SelectInput, FormGrid, CheckboxRow, FormError } from '../ui/Form';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import StatementsEditor from './StatementsEditor';

/**
 * Books → Configuration → Reports. The server sends every section with its settings, their values and whether the signed-in person may change
 * the section (each section has its own permission), so this screen holds no list of settings: a setting added on the server shows up here.
 * Ledger lists and kinds (reconciliation) and the ratio figures have their own small editors; every other kind is a plain control.
 */

const Section = ({ title, hint, children, footer }) => (
  <div style={{ ...card, padding: 18, marginBottom: 16 }}>
    <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>{title}</p>
    {hint && <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 640, lineHeight: 1.5 }}>{hint}</p>}
    {children}
    {footer}
  </div>
);

/** Chosen values shown as chips, with a drop-down to add another. options: [{ value, label }]. */
function ChipPicker({ options, selected, onChange, placeholder, disabled, label }) {
  const byValue = useMemo(() => Object.fromEntries(options.map((o) => [String(o.value), o.label])), [options]);
  const chosen = new Set(selected.map(String));
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: selected.length ? 6 : 0 }}>
        {selected.map((v) => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: colors.tint(0.08), fontSize: '0.75rem', color: colors.text }}>
            {byValue[String(v)] ?? `#${v} (gone)`}
            {!disabled && <button type="button" aria-label={`Remove ${byValue[String(v)] ?? v}`} onClick={() => onChange(selected.filter((x) => String(x) !== String(v)))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', color: colors.textMuted }}><X size={12} /></button>}
          </span>
        ))}
        {!selected.length && disabled && <span style={{ fontSize: '0.75rem', color: colors.textFaint }}>None chosen</span>}
      </div>
      {!disabled && (
        <SelectInput aria-label={label} value="" onChange={(e) => { if (e.target.value) onChange([...selected, e.target.value]); }} style={{ maxWidth: 360 }}>
          <option value="">{placeholder}</option>
          {options.filter((o) => !chosen.has(String(o.value))).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectInput>
      )}
    </div>
  );
}

function SignatoriesEditor({ value, onChange, disabled, maxItems }) {
  const rows = value ?? [];
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr) auto', gap: 8, alignItems: 'center' }}>
          <TextInput disabled={disabled} value={r.title ?? ''} placeholder="Title (Director, Accountant…)" aria-label={`Signatory ${i + 1} title`} onChange={(e) => set(i, { title: e.target.value })} />
          <TextInput disabled={disabled} value={r.name ?? ''} placeholder="Name" aria-label={`Signatory ${i + 1} name`} onChange={(e) => set(i, { name: e.target.value })} />
          {!disabled && <button type="button" aria-label={`Remove signatory ${i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }}><Trash2 size={15} /></button>}
        </div>
      ))}
      {!disabled && rows.length < maxItems && <div><button type="button" onClick={() => onChange([...rows, { title: '', name: '' }])} style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.75rem' }}><Plus size={12} /> Add a signatory</button></div>}
    </div>
  );
}

/** One row per ratio figure: the ledger groups and statement lines it adds up. */
function RatioInputsEditor({ value, onChange, disabled, lookups }) {
  const groups = lookups.groups.map((g) => ({ value: g.id, label: g.path }));
  const lines = lookups.statements.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));
  const set = (key, patch) => onChange({ ...value, [key]: { groups: [], statements: [], ...(value[key] ?? {}), ...patch } });
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {Object.entries(lookups.ratio_inputs).map(([key, label]) => {
        const v = value[key] ?? { groups: [], statements: [] };
        const empty = !v.groups.length && !v.statements.length;
        return (
          <div key={key} style={{ borderTop: `1px solid ${colors.tint(0.06)}`, paddingTop: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 700, color: colors.text }}>
              {label} {empty && <span style={{ fontWeight: 500, color: colors.dangerText, fontSize: '0.72rem' }}>nothing chosen: this figure will show as 0</span>}
            </p>
            <FormGrid min={280}>
              <ChipPicker label={`${label}: ledger groups`} disabled={disabled} options={groups} selected={v.groups} placeholder="Add a ledger group…" onChange={(next) => set(key, { groups: next.map(Number) })} />
              <ChipPicker label={`${label}: statement lines`} disabled={disabled} options={lines} selected={v.statements} placeholder="Add a statement line…" onChange={(next) => set(key, { statements: next })} />
            </FormGrid>
          </div>
        );
      })}
    </div>
  );
}

/** The ledgers that can be reconciled: switch one off, and confirm what kind of account it is. */
function ReconcilableLedgers({ ledgers, disabledIds, kinds, kindOptions, onDisabled, onKinds, disabled }) {
  if (!ledgers.length) return <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: colors.textMuted }}>No ledger is in a reconcilable group yet. Choose a group above and save, and its ledgers are listed here.</p>;
  const off = new Set(disabledIds.map(Number));
  const unconfirmed = ledgers.filter((l) => !off.has(l.id) && !kinds[String(l.id)]).length;
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 700, color: colors.text }}>Accounts that can be reconciled</p>
      <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: unconfirmed ? colors.warningText : colors.textMuted }}>
        {unconfirmed ? `${unconfirmed} account${unconfirmed === 1 ? '' : 's'} still to confirm. The kind we would guess is shown; choose it, or another, to confirm.` : 'Every account is confirmed.'}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead><tr style={{ textAlign: 'left', color: colors.textFaint, fontSize: '0.68rem' }}><th style={{ padding: '6px 8px' }}>Ledger</th><th style={{ padding: '6px 8px' }}>Group</th><th style={{ padding: '6px 8px' }}>Reconcile</th><th style={{ padding: '6px 8px' }}>Kind of account</th></tr></thead>
          <tbody>
            {ledgers.map((l) => {
              const isOff = off.has(l.id);
              const confirmed = kinds[String(l.id)];
              return (
                <tr key={l.id} style={{ borderTop: `1px solid ${colors.tint(0.05)}`, opacity: isOff ? 0.55 : 1 }}>
                  <td style={{ padding: '6px 8px' }}>{l.name}</td>
                  <td style={{ padding: '6px 8px', color: colors.textMuted }}>{l.group}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <input type="checkbox" aria-label={`Reconcile ${l.name}`} disabled={disabled} checked={!isOff} style={{ accentColor: colors.primary }}
                      onChange={(e) => onDisabled(e.target.checked ? disabledIds.filter((x) => Number(x) !== l.id) : [...disabledIds, l.id])} />
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <SelectInput aria-label={`Kind of ${l.name}`} disabled={disabled || isOff} value={confirmed ?? ''} style={{ minWidth: 220 }}
                      onChange={(e) => { const next = { ...kinds }; if (e.target.value) next[String(l.id)] = e.target.value; else delete next[String(l.id)]; onKinds(next); }}>
                      <option value="">Not confirmed (looks like: {kindOptions[l.suggested_kind] ?? l.suggested_kind})</option>
                      {Object.entries(kindOptions).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </SelectInput>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const HIDDEN_IN_LOOP = ['ledger_list', 'ledger_kinds'];   // drawn by ReconcilableLedgers

function SettingControl({ s, value, onChange, disabled, error, lookups }) {
  const id = `report-setting-${s.key}`;   // ties each label to its control
  switch (s.type) {
    case 'bool':
      return <CheckboxRow disabled={disabled} checked={value} onChange={onChange} label={s.label} description={s.hint} />;
    case 'int':
    case 'number':
      return <Field label={s.label} htmlFor={id} hint={s.hint} error={error}><NumberInput id={id} disabled={disabled} min={s.min} max={s.max} step={s.type === 'number' ? '0.01' : '1'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></Field>;
    case 'enum':
      return (
        <Field label={s.label} htmlFor={id} hint={s.hint} error={error}>
          <SelectInput id={id} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {Object.entries(s.options).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </SelectInput>
        </Field>
      );
    case 'text':
      return <Field label={s.label} htmlFor={id} hint={s.hint} error={error}><TextInput id={id} disabled={disabled} maxLength={s.max_length} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></Field>;
    case 'int_list':
      return (
        <Field label={s.label} htmlFor={id} hint={s.hint} error={error}>
          <TextInput id={id} disabled={disabled} value={(value ?? []).join(', ')} placeholder="30, 60, 90"
            onChange={(e) => onChange(e.target.value.split(/[ ,;]+/).filter((x) => x !== '').map((x) => (/^\d+$/.test(x) ? Number(x) : x)))} />
        </Field>
      );
    case 'signatories':
      return <div style={{ gridColumn: '1 / -1' }}><Field label={s.label} hint={s.hint} error={error}><SignatoriesEditor disabled={disabled} value={value} onChange={onChange} maxItems={s.max_items} /></Field></div>;
    case 'group_list':
      return (
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={s.label} hint={s.hint} error={error}>
            <ChipPicker label={s.label} disabled={disabled} options={lookups.groups.map((g) => ({ value: g.id, label: g.path }))} selected={value ?? []} placeholder="Add a ledger group…" onChange={(next) => onChange(next.map(Number))} />
          </Field>
        </div>
      );
    case 'ratio_inputs':
      return <div style={{ gridColumn: '1 / -1' }}>{error && <FormError message={error} />}<RatioInputsEditor disabled={disabled} value={value ?? {}} onChange={onChange} lookups={lookups} /></div>;
    default:
      return null;
  }
}

function SettingsSection({ section, lookups, ledgers, onSaved }) {
  const initial = useMemo(() => Object.fromEntries(section.settings.map((s) => [s.key, s.value])), [section]);
  const [draft, setDraft] = useState(initial);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(initial); setErrs({}); }, [initial]);
  const disabled = !section.can_edit;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const set = (key) => (v) => setDraft((d) => ({ ...d, [key]: v }));
  const reconcile = section.id === 'reconciliation';

  const save = async () => {
    setBusy(true); setErrs({});
    try {
      const changed = Object.fromEntries(Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(initial[k])).map((k) => [k, draft[k]]));
      const r = await booksAPI.saveReportSettings(section.id, changed);
      toast.success(r.changed?.length ? 'Saved' : 'Nothing had changed');
      onSaved(r, section.id);
    } catch (e) {
      const fe = fieldErrors(e);
      setErrs(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k.replace(/^values\./, ''), v])));
      toast.error(errMsg(e, 'Could not save'));
    } finally { setBusy(false); }
  };

  return (
    <Section title={section.title} hint={section.hint}
      footer={(
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {disabled
            ? <span style={{ fontSize: '0.75rem', color: colors.textFaint }}>You do not have the permission to change these settings.</span>
            : <><button type="button" style={{ ...btnPrimary, opacity: dirty && !busy ? 1 : 0.6 }} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              {dirty && <button type="button" style={btnGhost} onClick={() => { setDraft(initial); setErrs({}); }}>Undo changes</button>}</>}
        </div>
      )}>
      <FormGrid min={260}>
        {section.settings.filter((s) => !HIDDEN_IN_LOOP.includes(s.type)).map((s) => (
          <SettingControl key={s.key} s={s} value={draft[s.key]} onChange={set(s.key)} disabled={disabled} error={errs[s.key]} lookups={lookups} />
        ))}
      </FormGrid>
      {reconcile && (
        <>
          {(errs.reconcile_disabled_ledgers || errs.reconcile_ledger_kinds) && <FormError message={errs.reconcile_disabled_ledgers || errs.reconcile_ledger_kinds} />}
          <ReconcilableLedgers ledgers={ledgers} disabled={disabled} kindOptions={lookups.ledger_kinds}
            disabledIds={draft.reconcile_disabled_ledgers ?? []} kinds={draft.reconcile_ledger_kinds ?? {}}
            onDisabled={set('reconcile_disabled_ledgers')} onKinds={set('reconcile_ledger_kinds')} />
        </>
      )}
    </Section>
  );
}

const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function ChangeLog() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) booksAPI.reportSettingsLog({ limit: 100 }).then((r) => setRows(r.rows)).catch((e) => toast.error(errMsg(e, 'Could not load the log'))); }, [open]);
  return (
    <Section title="Change log" hint="Every change to these settings: what, who and when. The approval rules are logged too.">
      <button type="button" style={btnGhost} onClick={() => setOpen((o) => !o)}>{open ? 'Hide the log' : 'Show the last 100 changes'}</button>
      {open && (rows === null ? <p style={{ color: colors.textMuted }}>Loading…</p> : !rows.length ? <p style={{ fontSize: '0.8rem', color: colors.textMuted }}>No change has been made yet.</p> : (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead><tr style={{ textAlign: 'left', color: colors.textFaint, fontSize: '0.68rem' }}><th style={{ padding: '6px 8px' }}>When</th><th style={{ padding: '6px 8px' }}>Who</th><th style={{ padding: '6px 8px' }}>Setting</th><th style={{ padding: '6px 8px' }}>From</th><th style={{ padding: '6px 8px' }}>To</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' }}>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.at}</td><td style={{ padding: '6px 8px' }}>{r.by ?? '—'}</td><td style={{ padding: '6px 8px' }}>{r.label}</td>
                <td style={{ padding: '6px 8px', color: colors.textMuted, wordBreak: 'break-word', maxWidth: 260 }}>{show(r.old)}</td><td style={{ padding: '6px 8px', wordBreak: 'break-word', maxWidth: 260 }}>{show(r.new)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </Section>
  );
}

export default function ReportsSettings({ canEditStatements }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => booksAPI.reportSettings().then(setData).catch((e) => { toast.error(errMsg(e, 'Could not load the Reports settings')); setData({ ready: false, message: errMsg(e, 'Could not load the Reports settings.'), sections: [] }); }), []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  if (!data.ready) return <Section title="Reports settings" hint={data.message} />;

  // only the section that was saved is replaced, so what has been typed in the other sections is not thrown away
  const onSaved = (r, sectionId) => setData((d) => ({ ...d, sections: d.sections.map((x) => (x.id === sectionId ? r.sections.find((y) => y.id === sectionId) ?? x : x)), reconcilable_ledgers: r.reconcilable_ledgers }));

  return (
    <>
      {data.sections.map((section) => (
        <SettingsSection key={section.id} section={section} lookups={data.lookups} ledgers={data.reconcilable_ledgers} onSaved={onSaved} />
      ))}
      <StatementsEditor canEdit={canEditStatements} />
      <ChangeLog />
    </>
  );
}
