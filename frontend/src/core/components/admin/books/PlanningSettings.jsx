import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { hasPermission } from '../../../../_shared/lib/roles';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { CheckboxRow, Field, FormGrid, NumberInput, SelectInput, TextInput } from '../ui/Form';

const th = { padding: '6px 6px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
const BLANK = { id: null, label: '', kind: 'rent', direction: 'out', amount: '', frequency: 'monthly', start_date: '', end_date: '', certainty: 'confirmed', is_active: true, note: '' };

const Section = ({ title, hint, children }) => (
  <div style={{ ...card, padding: 18, marginBottom: 16 }}>
    <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>{title}</p>
    {hint && <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 640, lineHeight: 1.5 }}>{hint}</p>}
    {children}
  </div>
);

/** Budgets: a row per expense group or ledger, a box per month. */
function Budgets({ data, year, setYear, reload, canEdit }) {
  const [draft, setDraft] = useState({});   // 'type:id' -> { 'YYYY-MM': text }
  const [extra, setExtra] = useState([]);   // rows added here and not saved yet
  const [pick, setPick] = useState('');
  const [fill, setFill] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft({}); setExtra([]); }, [data]);

  const rows = useMemo(() => [...data.lines, ...extra.filter((e) => !data.lines.some((l) => l.type === e.type && l.id === e.id))], [data.lines, extra]);
  const cellOf = (r, ym) => draft[`${r.type}:${r.id}`]?.[ym] ?? (r.months[ym] ?? '');
  const setCell = (r, ym, v) => setDraft((d) => ({ ...d, [`${r.type}:${r.id}`]: { ...d[`${r.type}:${r.id}`], [ym]: v } }));
  const dirty = Object.keys(draft).length > 0;
  const colTotal = (ym) => rows.reduce((t, r) => t + (Number(cellOf(r, ym)) || 0), 0);

  const add = () => {
    if (!pick) return;
    const [type, id] = pick.split(':');
    const name = type === 'group' ? data.choices.groups.find((g) => g.id === Number(id))?.path : data.choices.ledgers.find((l) => l.id === Number(id))?.name;
    setExtra((e) => [...e, { type, id: Number(id), name, months: {} }]);
    setPick('');
  };
  const save = async () => {
    setBusy(true);
    try {
      await booksAPI.saveBudgets(Object.entries(draft).map(([k, months]) => { const [type, id] = k.split(':'); return { type, id: Number(id), months: Object.fromEntries(Object.entries(months).map(([ym, v]) => [ym, v === '' ? 0 : Number(v)])) }; }));
      toast.success('Budget saved');
      reload();
    } catch (e) { toast.error(errMsg(e, 'Could not save the budget')); } finally { setBusy(false); }
  };
  const remove = async (r) => {
    if (!data.lines.some((l) => l.type === r.type && l.id === r.id)) { setExtra((e) => e.filter((x) => !(x.type === r.type && x.id === r.id))); return; }
    try { await booksAPI.removeBudget(r.type, r.id, { from: data.from, to: data.to }); toast.success('Removed'); reload(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); }
  };
  const apply = (r) => { const v = fill[`${r.type}:${r.id}`]; if (v === undefined || v === '') return; data.months.forEach((ym) => setCell(r, ym, v)); };

  return (
    <Section title="Budgets" hint="What you plan to spend on an expense group (and every group under it) or on one ledger, month by month. The Visual reports chart 'Budget against actual' sets this against what the books show. Leave a month empty for no budget.">
      {!data.budgets_ready && <p style={{ color: colors.warningText, fontSize: '0.8rem' }}>Run database script 237_planning.sql to turn budgets on.</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btnGhost} onClick={() => setYear((y) => y - 1)}>‹</button><b>{year}</b><button type="button" style={btnGhost} onClick={() => setYear((y) => y + 1)}>›</button>
        {canEdit && data.budgets_ready && (
          <>
            <SelectInput aria-label="Add a budget row" value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 280 }}>
              <option value="">Add an expense group or ledger…</option>
              <optgroup label="Groups">{data.choices.groups.map((g) => <option key={`g${g.id}`} value={`group:${g.id}`}>{g.path}</option>)}</optgroup>
              <optgroup label="Ledgers">{data.choices.ledgers.map((l) => <option key={`l${l.id}`} value={`ledger:${l.id}`}>{l.name} ({l.group})</option>)}</optgroup>
            </SelectInput>
            <button type="button" style={btnGhost} onClick={add} disabled={!pick}><Plus size={13} /> Add</button>
          </>
        )}
        <span style={{ flex: 1 }} />
        {canEdit && <button type="button" style={{ ...btnPrimary, opacity: dirty && !busy ? 1 : 0.6 }} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save budget'}</button>}
      </div>
      {rows.length === 0 ? <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>No budget for {year} yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr><th style={th}>Expense</th>{data.months.map((ym) => <th key={ym} style={{ ...th, textAlign: 'right' }}>{monthName(ym)}</th>)}<th style={{ ...th, textAlign: 'right' }}>Year</th>{canEdit && <th style={th}>Same every month</th>}<th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.type}:${r.id}`}>
                  <td style={{ padding: '3px 6px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{r.name}<span style={{ marginLeft: 6, fontSize: '0.64rem', color: colors.textFaint }}>{r.type === 'group' ? 'group' : 'ledger'}</span></td>
                  {data.months.map((ym) => (
                    <td key={ym} style={{ padding: '2px 2px' }}>
                      <input type="number" min="0" step="0.01" disabled={!canEdit} value={cellOf(r, ym)} onChange={(e) => setCell(r, ym, e.target.value)} aria-label={`${r.name} ${ym}`}
                        style={{ width: 84, padding: '4px 6px', fontSize: '0.74rem', textAlign: 'right', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, background: 'var(--bg-primary)', color: colors.text }} />
                    </td>
                  ))}
                  <td style={{ padding: '3px 6px', fontSize: '0.76rem', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(data.months.reduce((t, ym) => t + (Number(cellOf(r, ym)) || 0), 0))}</td>
                  {canEdit && <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                    <input type="number" min="0" step="0.01" placeholder="amount" value={fill[`${r.type}:${r.id}`] ?? ''} onChange={(e) => setFill((f) => ({ ...f, [`${r.type}:${r.id}`]: e.target.value }))} aria-label={`Same amount every month for ${r.name}`}
                      style={{ width: 80, padding: '4px 6px', fontSize: '0.74rem', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, background: 'var(--bg-primary)', color: colors.text }} />
                    <button type="button" style={{ ...btnGhost, padding: '3px 8px', fontSize: '0.7rem', marginLeft: 4 }} onClick={() => apply(r)}>Fill</button>
                  </td>}
                  <td>{canEdit && <button type="button" aria-label={`Remove ${r.name}`} onClick={() => remove(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
              <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                <td style={{ padding: '4px 6px', fontSize: '0.76rem' }}>Total</td>
                {data.months.map((ym) => <td key={ym} style={{ padding: '4px 6px', textAlign: 'right', fontSize: '0.74rem', fontVariantNumeric: 'tabular-nums' }}>{money(colTotal(ym))}</td>)}
                <td style={{ padding: '4px 6px', textAlign: 'right', fontSize: '0.76rem' }}>{money(data.months.reduce((t, ym) => t + colTotal(ym), 0))}</td><td colSpan={canEdit ? 2 : 1} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>A group and one of its own ledgers should not both be budgeted: the ledger's spending would be counted twice in the totals.</p>
    </Section>
  );
}

/** The recurring and one-off money in and out the books cannot know yet, each marked confirmed or estimate. */
function Items({ data, reload, canEdit }) {
  const nav = useNavigate();
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
        <button type="button" style={btnGhost} onClick={() => nav('/admin/books?tab=settings&sub=reports')}>Forecast assumptions (collection delay, supplier terms, tax) →</button>
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

/** Books -> Configuration -> Planning: the budgets and the cash forecast's regular items. */
export default function PlanningSettings() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const canEdit = hasPermission(null, 'books.planning');
  const load = useCallback(() => booksAPI.planning({ from: `${year}-01-01`, to: `${year}-12-31` }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load Planning'))), [year]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p style={{ fontSize: '0.85rem', color: colors.textFaint }}>Loading…</p>;
  return (
    <div>
      {!canEdit && <p style={{ fontSize: '0.78rem', color: colors.textFaint }}>You can look at these; changing them needs the Planning permission.</p>}
      <Budgets data={data} year={year} setYear={setYear} reload={load} canEdit={canEdit} />
      <Items data={data} reload={load} canEdit={canEdit} />
    </div>
  );
}
