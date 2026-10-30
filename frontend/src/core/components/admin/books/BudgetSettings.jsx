import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { hasPermission } from '../../../../_shared/lib/roles';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import BudgetControls from './BudgetControls';
import ReportsSettings from './ReportsSettings';
import { CheckboxRow, Field, FormGrid, NumberInput, SelectInput, TextInput } from '../ui/Form';

const th = { padding: '6px 6px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const BLANK = { id: null, label: '', kind: 'rent', direction: 'out', amount: '', frequency: 'monthly', start_date: '', end_date: '', certainty: 'confirmed', is_active: true, note: '' };

const Section = ({ title, hint, children }) => (
  <div style={{ ...card, padding: 18, marginBottom: 16 }}>
    <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>{title}</p>
    {hint && <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 640, lineHeight: 1.5 }}>{hint}</p>}
    {children}
  </div>
);

/** The recurring and one-off money in and out the books cannot know yet, each marked confirmed or estimate. */
function Items({ data, reload, canEdit }) {
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setBusy(true); setErrs({});
    try { await booksAPI.saveForecastItem(form.id, { ...form, end_date: form.end_date || null, amount: Number(form.amount) }); toast.success('Saved'); setForm(null); reload(); }
    catch (e) { setErrs(Object.fromEntries(Object.entries(e?.response?.data?.errors ?? {}).map(([k, v]) => [k, v[0]]))); toast.error(errMsg(e, 'Could not save it')); } finally { setBusy(false); }
  };
  const remove = async (i) => { try { await booksAPI.deleteForecastItem(i.id); toast.success('Removed'); reload(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); } };
  const kinds = data.kinds ?? {};

  return (
    <Section title="Cash forecast: regular payments and receipts" hint="Money the books cannot see yet: payroll, rent, loan repayments, a tax payment, a retainer. Mark each Confirmed when it is a contract or schedule, or Estimate when it is a guess; the 90-day forecast shows the two apart. Customer and supplier bills are picked up from the books on their own.">
      {!data.forecast_ready && <p style={{ color: colors.warningText, fontSize: '0.8rem' }}>Run database script 237_planning.sql to turn the forecast items on.</p>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {canEdit && data.forecast_ready && <button type="button" style={btnGhost} onClick={() => setForm({ ...BLANK, start_date: new Date().toLocaleDateString('en-CA') })}><Plus size={13} /> Add an item</button>}
      </div>
      {form && (
        <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <FormGrid min={180}>
            <Field label="Name" htmlFor="fi-label" error={errs.label}><TextInput id="fi-label" value={form.label} onChange={set('label')} maxLength={120} /></Field>
            <Field label="Kind" htmlFor="fi-kind" error={errs.kind}><SelectInput id="fi-kind" value={form.kind} onChange={set('kind')}>{Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
            <Field label="Money" htmlFor="fi-dir" error={errs.direction}><SelectInput id="fi-dir" value={form.direction} onChange={set('direction')}><option value="out">Goes out</option><option value="in">Comes in</option></SelectInput></Field>
            <Field label="Amount each time" htmlFor="fi-amount" error={errs.amount}><NumberInput id="fi-amount" min="0" step="0.01" value={form.amount} onChange={set('amount')} /></Field>
            <Field label="How often" htmlFor="fi-freq" error={errs.frequency}><SelectInput id="fi-freq" value={form.frequency} onChange={set('frequency')}>{Object.entries(data.frequencies ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
            <Field label="First date" htmlFor="fi-start" error={errs.start_date}><TextInput id="fi-start" type="date" value={form.start_date} onChange={set('start_date')} /></Field>
            {form.frequency !== 'once' && <Field label="Last date (optional)" htmlFor="fi-end" error={errs.end_date}><TextInput id="fi-end" type="date" value={form.end_date ?? ''} onChange={set('end_date')} /></Field>}
            <Field label="How sure" htmlFor="fi-cert" error={errs.certainty}><SelectInput id="fi-cert" value={form.certainty} onChange={set('certainty')}>{Object.entries(data.certainty ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
            <Field label="Note" htmlFor="fi-note"><TextInput id="fi-note" value={form.note ?? ''} onChange={set('note')} maxLength={255} /></Field>
          </FormGrid>
          <CheckboxRow checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Counted in the forecast" description="Switch off to keep it here without counting it." />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button type="button" style={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button><button type="button" style={btnGhost} onClick={() => setForm(null)}>Cancel</button></div>
        </div>
      )}
      {data.items.length === 0 ? <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>Nothing entered yet. Without items the forecast has only the bills already in the books.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Name</th><th style={th}>Kind</th><th style={th}>Money</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>How often</th><th style={th}>From</th><th style={th}>Until</th><th style={th}>How sure</th><th /></tr></thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id} style={{ opacity: i.is_active ? 1 : 0.5 }}>
                  <td style={{ padding: '5px 6px', fontSize: '0.8rem' }}>{i.label}{!i.is_active && <span style={{ marginLeft: 6, fontSize: '0.66rem', color: colors.textFaint }}>off</span>}</td>
                  <td style={{ padding: '5px 6px', fontSize: '0.76rem' }}>{kinds[i.kind] ?? i.kind}</td>
                  <td style={{ padding: '5px 6px', fontSize: '0.76rem', color: i.direction === 'in' ? colors.successText : colors.dangerText }}>{i.direction === 'in' ? 'In' : 'Out'}</td>
                  <td style={{ padding: '5px 6px', fontSize: '0.78rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(i.amount)}</td>
                  <td style={{ padding: '5px 6px', fontSize: '0.76rem' }}>{data.frequencies?.[i.frequency] ?? i.frequency}</td>
                  <td style={{ padding: '5px 6px', fontSize: '0.76rem' }}>{i.start_date}</td><td style={{ padding: '5px 6px', fontSize: '0.76rem' }}>{i.end_date ?? ''}</td>
                  <td style={{ padding: '5px 6px' }}><span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: i.certainty === 'confirmed' ? colors.successBg : colors.warningBg, color: i.certainty === 'confirmed' ? colors.successText : colors.warningText }}>{data.certainty?.[i.certainty] ?? i.certainty}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{canEdit && <>
                    <button type="button" aria-label={`Edit ${i.label}`} onClick={() => setForm({ ...i, end_date: i.end_date ?? '', note: i.note ?? '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><Pencil size={14} /></button>
                    <button type="button" aria-label={`Remove ${i.label}`} onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><Trash2 size={14} /></button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/** Books -> Configuration -> Budget settings: the budgets and the cash forecast's regular items. */
export default function BudgetSettings() {
  const [data, setData] = useState(null);
  const canPlan = hasPermission(null, 'books.planning');
  const load = useCallback(() => booksAPI.planning({}).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the budget settings'))), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p style={{ fontSize: '0.85rem', color: colors.textFaint }}>Loading…</p>;
  return (
    <div>
      {!canPlan && <p style={{ fontSize: '0.78rem', color: colors.textFaint }}>You can look at these; changing them needs the Planning permission. The budgets themselves are on the Budgets tab at the top of Books.</p>}
      <BudgetControls data={data} canEdit={canPlan} reload={load} />
      <Items data={data} reload={load} canEdit={canPlan} />
      <ReportsSettings only="forecast" />
    </div>
  );
}
