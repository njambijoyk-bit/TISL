import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { SelectInput } from '../ui/Form';
import BudgetRowDetails from './BudgetRowDetails';

const th = { padding: '6px 6px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
const SECTIONS = [['income', 'Income'], ['expense', 'Expenses'], ['balance', 'Balance sheet (not part of the result)']];
let counter = 0;

const fromLine = (l) => ({ ...l, key: `r${l.id}`, row_id: l.id, months: Object.fromEntries(Object.entries(l.months).map(([ym, v]) => [ym, String(v)])), dirty: false });

/**
 * Budgets: a row per income, expense or balance-sheet account (a group or one ledger), optionally for one cost centre, department, branch and initiative, with a box per month.
 * A row opens to its details and to the ways of filling its months. Income less expenses (a recovery lowers its expense) is shown as the planned result.
 */
export default function BudgetGrid({ data, year, setYear, reload, canEdit, versionId }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRows(data.lines.map(fromLine)); setOpen(null); }, [data]);

  const change = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)));
  const setCell = (key, ym, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, months: { ...r.months, [ym]: v }, method: 'manual', method_params: null, dirty: true } : r)));
  const dirty = rows.some((r) => r.dirty);
  const val = (r, ym) => Number(r.months[ym]) || 0;
  const signed = (r, ym) => (r.is_recovery ? -val(r, ym) : val(r, ym));
  const total = (list, ym) => list.reduce((t, r) => t + signed(r, ym), 0);
  const yearOf = (list) => data.months.reduce((t, ym) => t + total(list, ym), 0);
  const sectionRows = (s) => rows.filter((r) => r.section === s);
  const incomeTotal = yearOf(sectionRows('income'));
  const expenseTotal = yearOf(sectionRows('expense'));

  const labelOf = (r) => ({ ...r, dimensions: [
    data.choices.cost_centres.find((c) => c.id === r.cost_centre_id)?.name, data.choices.departments.find((d) => d.id === r.department_id)?.name,
    data.choices.locations.find((l) => l.id === r.location_id)?.name, data.choices.initiatives.find((i) => i.id === r.initiative_id)?.name].filter(Boolean) });
  const shown = useMemo(() => rows.map(labelOf), [rows, data.choices]);   // eslint-disable-line react-hooks/exhaustive-deps -- labelOf only reads data.choices

  const add = () => {
    if (!pick) return;
    const [type, id] = pick.split(':');
    const g = type === 'group' ? data.choices.groups.find((x) => x.id === Number(id)) : data.choices.ledgers.find((x) => x.id === Number(id));
    const key = `n${++counter}`;
    setRows((rs) => [...rs, { key, id: null, row_id: null, type, target_id: Number(id), name: type === 'group' ? g.path : g.name, section: g.section, nature: g.nature, cost_centre_id: null, department_id: null, location_id: null, initiative_id: null,
      is_recovery: false, method: 'manual', method_params: null, note: '', months: {}, dirty: true }]);
    setOpen(key); setPick('');
  };
  const duplicate = (r) => { const key = `n${++counter}`; setRows((rs) => [...rs, { ...r, key, id: null, row_id: null, months: { ...r.months }, dirty: true }]); setOpen(key); };
  const remove = async (r) => {
    if (!r.id) { setRows((rs) => rs.filter((x) => x.key !== r.key)); return; }
    try { await booksAPI.removeBudget(r.id); toast.success('Removed'); reload(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await booksAPI.saveBudgets(versionId, rows.filter((r) => r.dirty).map((r) => ({
        row_id: r.id, type: r.type, target_id: r.target_id, cost_centre_id: r.cost_centre_id, department_id: r.department_id, location_id: r.location_id, initiative_id: r.initiative_id,
        is_recovery: r.is_recovery, method: r.method, method_params: r.method_params, note: r.note || null,
        months: Object.fromEntries(data.months.map((ym) => [ym, r.months[ym] === '' || r.months[ym] == null ? 0 : Number(r.months[ym])])),
      })));
      toast.success('Budget saved');
      reload();
    } catch (e) {
      const first = Object.values(e?.response?.data?.errors ?? {})[0]?.[0];
      toast.error(first ?? errMsg(e, 'Could not save the budget'));
    } finally { setBusy(false); }
  };

  const cols = data.months.length + 4;
  const body = (list) => list.map((r) => {
    const sr = shown.find((x) => x.key === r.key);
    return (
      <Fragment key={r.key}>
        <tr>
          <td style={{ padding: '3px 6px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            <button type="button" aria-expanded={open === r.key} aria-label={`Details of ${r.name}`} onClick={() => setOpen(open === r.key ? null : r.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, padding: 0, marginRight: 4, verticalAlign: 'middle' }}>
              {open === r.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {r.name}
            {r.is_recovery && <span style={{ marginLeft: 6, fontSize: '0.64rem', fontWeight: 700, color: colors.successText }}>recovery</span>}
            {sr.dimensions.length > 0 && <span style={{ marginLeft: 6, fontSize: '0.64rem', color: colors.textFaint }}>{sr.dimensions.join(' › ')}</span>}
            {r.method !== 'manual' && <span style={{ marginLeft: 6, fontSize: '0.62rem', color: colors.primaryDeep }}>{r.method}</span>}
          </td>
          {data.months.map((ym) => (
            <td key={ym} style={{ padding: '2px 2px' }}>
              <input type="number" min="0" step="0.01" disabled={!canEdit} value={r.months[ym] ?? ''} onChange={(e) => setCell(r.key, ym, e.target.value)} aria-label={`${r.name} ${ym}`}
                style={{ width: 84, padding: '4px 6px', fontSize: '0.74rem', textAlign: 'right', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, background: 'var(--bg-primary)', color: colors.text }} />
            </td>
          ))}
          <td style={{ padding: '3px 6px', fontSize: '0.76rem', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(data.months.reduce((t, ym) => t + val(r, ym), 0))}</td>
          <td style={{ whiteSpace: 'nowrap' }}>{canEdit && <>
            <button type="button" aria-label={`Duplicate ${r.name}`} title="Duplicate (for another cost centre, branch or initiative)" onClick={() => duplicate(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><Copy size={14} /></button>
            <button type="button" aria-label={`Remove ${r.name}`} onClick={() => remove(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><Trash2 size={14} /></button>
          </>}</td>
        </tr>
        {open === r.key && (
          <tr><td colSpan={cols} style={{ padding: 0 }}>
            <BudgetRowDetails row={sr} rows={shown} choices={data.choices} months={data.months} year={year} canEdit={canEdit} onChange={(patch) => change(r.key, patch)}
              onApply={(filled, method, params) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, months: Object.fromEntries(Object.entries(filled).map(([ym, v]) => [ym, v === 0 ? '' : String(v)])), method, method_params: params, dirty: true } : x)))} />
          </td></tr>
        )}
      </Fragment>
    );
  });

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>Budgets</p>
      <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 680, lineHeight: 1.5 }}>
        What you plan to earn, spend and hold, month by month, for an account (a group counts everything under it) and, if you wish, for one cost centre, department, branch or initiative.
        Open a row to set those and to fill its months a faster way. The Visual reports chart 'Budget against actual' sets the expenses against what the books show. Leave a month empty for no budget.
      </p>
      {!data.budgets_ready && <p style={{ color: colors.warningText, fontSize: '0.8rem' }}>Run database scripts 237_planning.sql, 239_budgeting.sql and 240_budget_versions.sql to turn budgets on.</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btnGhost} onClick={() => setYear((y) => y - 1)} aria-label="Previous year">‹</button><b>{year}</b><button type="button" style={btnGhost} onClick={() => setYear((y) => y + 1)} aria-label="Next year">›</button>
        {canEdit && data.budgets_ready && (
          <>
            <SelectInput aria-label="Add a budget row" value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 300 }}>
              <option value="">Add an account…</option>
              {SECTIONS.map(([s, name]) => (
                <optgroup key={s} label={name}>
                  {data.choices.groups.filter((g) => g.section === s).map((g) => <option key={`g${g.id}`} value={`group:${g.id}`}>{g.path} (group)</option>)}
                  {data.choices.ledgers.filter((l) => l.section === s).map((l) => <option key={`l${l.id}`} value={`ledger:${l.id}`}>{l.name} ({l.group})</option>)}
                </optgroup>
              ))}
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
            <thead><tr><th style={th}>Account</th>{data.months.map((ym) => <th key={ym} style={{ ...th, textAlign: 'right' }}>{monthName(ym)}</th>)}<th style={{ ...th, textAlign: 'right' }}>Year</th><th style={th} /></tr></thead>
            <tbody>
              {SECTIONS.map(([s, name]) => {
                const list = sectionRows(s);
                if (!list.length) return null;
                return (
                  <Fragment key={s}>
                    <tr><td colSpan={cols} style={{ padding: '10px 6px 2px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint }}>{name}</td></tr>
                    {body(list)}
                    <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                      <td style={{ padding: '4px 6px', fontSize: '0.74rem' }}>Total {name.toLowerCase().replace(/ \(.*/, '')}</td>
                      {data.months.map((ym) => <td key={ym} style={{ padding: '4px 6px', textAlign: 'right', fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }}>{money(total(list, ym))}</td>)}
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontSize: '0.74rem' }}>{money(yearOf(list))}</td><td />
                    </tr>
                  </Fragment>
                );
              })}
              {sectionRows('income').length > 0 && sectionRows('expense').length > 0 && (
                <tr style={{ fontWeight: 800 }}>
                  <td style={{ padding: '8px 6px', fontSize: '0.78rem' }}>Planned result (income less expenses)</td>
                  {data.months.map((ym) => <td key={ym} style={{ padding: '8px 6px', textAlign: 'right', fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums', color: total(sectionRows('income'), ym) - total(sectionRows('expense'), ym) < 0 ? colors.dangerText : colors.successText }}>{money(total(sectionRows('income'), ym) - total(sectionRows('expense'), ym))}</td>)}
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontSize: '0.76rem', color: incomeTotal - expenseTotal < 0 ? colors.dangerText : colors.successText }}>{money(incomeTotal - expenseTotal)}</td><td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>A group and one of its own ledgers should not both be budgeted for the same cost centre: the ledger's amount would be counted twice in the totals.</p>
    </div>
  );
}
