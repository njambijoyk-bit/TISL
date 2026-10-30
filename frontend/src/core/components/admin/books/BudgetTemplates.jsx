import { Fragment, useState } from 'react';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { Field, FormGrid, TextInput } from '../ui/Form';
import { METHODS } from './budgetMethods';

const methodName = Object.fromEntries(METHODS);
const th = { padding: '5px 6px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left' };

/**
 * Templates: a budget's structure kept for reuse. Save the version on screen as a template (every row, with how its months were filled but not the amounts), then make a new budget
 * from it for another year or branch: the months are worked out again for the new budget's months.
 */
export default function BudgetTemplates({ data, versionId, canEdit, reload, onMade }) {
  const [form, setForm] = useState(null);   // { kind: 'save' } | { kind: 'use', id } | { kind: 'rename', id }
  const [vals, setVals] = useState({});
  const [lines, setLines] = useState({});   // template id -> lines, for the ones opened
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e.target.value }));
  const run = async (fn, ok) => {
    setBusy(true); setErrs({});
    try { const r = await fn(); toast.success(ok); return r ?? true; } catch (e) {
      setErrs(Object.fromEntries(Object.entries(e?.response?.data?.errors ?? {}).map(([k, v]) => [k, v[0]])));
      toast.error(Object.values(e?.response?.data?.errors ?? {})[0]?.[0] ?? errMsg(e, 'That did not work')); return null;
    } finally { setBusy(false); }
  };
  const year = new Date().getFullYear() + 1;
  const open = (f, v = {}) => { setForm(f); setVals(v); setErrs({}); };
  const toggle = async (t) => {
    if (lines[t.id]) { setLines((l) => Object.fromEntries(Object.entries(l).filter(([k]) => Number(k) !== t.id))); return; }
    try { setLines((l) => ({ ...l, [t.id]: [] })); const r = await booksAPI.budgetTemplate(t.id); setLines((l) => ({ ...l, [t.id]: r.lines })); } catch (e) { toast.error(errMsg(e, 'Could not read the template')); }
  };
  const removeLine = async (t, l) => { if (await run(() => booksAPI.deleteBudgetTemplateLine(t.id, l.id), 'Line removed')) { setLines((x) => ({ ...x, [t.id]: x[t.id].filter((y) => y.id !== l.id) })); reload(); } };
  const del = async (t) => { if (window.confirm(`Delete the template "${t.name}"? Budgets already made from it are not affected.`) && await run(() => booksAPI.deleteBudgetTemplate(t.id), 'Template deleted')) reload(); };

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>Templates</p>
      <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 660, lineHeight: 1.5 }}>
        Keep a budget's structure to start next year's, or another branch's, without building every row again. A template holds the accounts, their cost centre, department, branch and initiative and how each row's months are filled (a fixed amount, a seasonal split, last year plus growth …), not the amounts: they are worked out again for the new budget.
      </p>
      {!data.templates_ready && <p style={{ color: colors.warningText, fontSize: '0.8rem' }}>Run database script 241_budget_templates.sql to turn templates on.</p>}
      {canEdit && data.templates_ready && versionId && form?.kind !== 'save' && <button type="button" style={{ ...btnGhost, marginBottom: 10 }} onClick={() => open({ kind: 'save' }, { name: '', description: '' })}>Save the version on screen as a template</button>}
      {form?.kind === 'save' && (
        <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <FormGrid min={220}>
            <Field label="Template name" htmlFor="tp-name" error={errs.name}><TextInput id="tp-name" value={vals.name} onChange={set('name')} maxLength={120} placeholder="Retail operating budget" /></Field>
            <Field label="Description" htmlFor="tp-desc"><TextInput id="tp-desc" value={vals.description} onChange={set('description')} maxLength={255} /></Field>
          </FormGrid>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={btnPrimary} disabled={busy} onClick={async () => { if (await run(() => booksAPI.saveBudgetTemplate({ version_id: versionId, ...vals }), 'Template saved')) { setForm(null); reload(); } }}>{busy ? 'Saving…' : 'Save the template'}</button>
            <button type="button" style={btnGhost} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
      {data.templates.length === 0 ? <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>No templates yet.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.templates.map((t) => (
            <Fragment key={t.id}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.1)}` }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <b style={{ fontSize: '0.84rem' }}>{t.name}</b><span style={{ marginLeft: 8, fontSize: '0.68rem', color: colors.textFaint }}>{t.lines} line{t.lines === 1 ? '' : 's'}</span>
                  {t.description && <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{t.description}</div>}
                </div>
                <button type="button" style={btnGhost} onClick={() => toggle(t)}>{lines[t.id] ? 'Hide lines' : 'Lines'}</button>
                {canEdit && <>
                  <button type="button" style={btnPrimary} onClick={() => open({ kind: 'use', id: t.id }, { name: '', from: `${year}-01`, to: `${year}-12` })}>Make a budget</button>
                  <button type="button" style={btnGhost} onClick={() => open({ kind: 'rename', id: t.id }, { name: t.name, description: t.description ?? '' })}>Rename</button>
                  <button type="button" aria-label={`Delete ${t.name}`} onClick={() => del(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><Trash2 size={14} /></button>
                </>}
              </div>
              {form?.id === t.id && form.kind === 'use' && (
                <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14 }}>
                  <FormGrid min={170}>
                    <Field label="Name of the new budget" htmlFor="tu-name" error={errs.name}><TextInput id="tu-name" value={vals.name} onChange={set('name')} maxLength={120} placeholder={`${year} operating budget`} /></Field>
                    <Field label="From month" htmlFor="tu-from" error={errs.from_month}><TextInput id="tu-from" type="month" value={vals.from} onChange={set('from')} /></Field>
                    <Field label="To month" htmlFor="tu-to" error={errs.to_month}><TextInput id="tu-to" type="month" value={vals.to} onChange={set('to')} /></Field>
                  </FormGrid>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" style={btnPrimary} disabled={busy} onClick={async () => { const r = await run(() => booksAPI.budgetFromTemplate(t.id, { name: vals.name, from_month: vals.from, to_month: vals.to }), 'Budget made from the template'); if (r && r !== true) { setForm(null); onMade(r.version_id, Number(String(vals.from).slice(0, 4))); } }}>{busy ? 'Making…' : 'Make the budget'}</button>
                    <button type="button" style={btnGhost} onClick={() => setForm(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {form?.id === t.id && form.kind === 'rename' && (
                <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14 }}>
                  <FormGrid min={220}>
                    <Field label="Name" htmlFor="tr-name" error={errs.name}><TextInput id="tr-name" value={vals.name} onChange={set('name')} maxLength={120} /></Field>
                    <Field label="Description" htmlFor="tr-desc"><TextInput id="tr-desc" value={vals.description} onChange={set('description')} maxLength={255} /></Field>
                  </FormGrid>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" style={btnPrimary} disabled={busy} onClick={async () => { if (await run(() => booksAPI.updateBudgetTemplate(t.id, vals), 'Saved')) { setForm(null); reload(); } }}>Save</button>
                    <button type="button" style={btnGhost} onClick={() => setForm(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {lines[t.id] && (
                <div style={{ overflowX: 'auto', padding: '0 4px 6px' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.76rem' }}>
                    <thead><tr><th style={th}>Account</th><th style={th}>For</th><th style={th}>Months filled by</th><th style={th}>Note</th><th style={th} /></tr></thead>
                    <tbody>{lines[t.id].map((l) => (
                      <tr key={l.id} style={{ borderTop: `1px solid ${colors.tint(0.06)}` }}>
                        <td style={{ padding: '4px 6px' }}>{l.name}{l.is_recovery && <span style={{ marginLeft: 6, fontSize: '0.64rem', fontWeight: 700, color: colors.successText }}>recovery</span>}</td>
                        <td style={{ padding: '4px 6px', color: colors.textMuted }}>{l.dimensions.join(' › ') || 'Everything'}</td>
                        <td style={{ padding: '4px 6px', color: colors.textMuted }}>{methodName[l.method] ?? l.method}</td>
                        <td style={{ padding: '4px 6px', color: colors.textMuted }}>{l.note}</td>
                        <td>{canEdit && <button type="button" aria-label={`Remove ${l.name} from the template`} onClick={() => removeLine(t, l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><Trash2 size={13} /></button>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
