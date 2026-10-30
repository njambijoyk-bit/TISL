import { useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { hasPermission } from '../../../../_shared/lib/roles';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { Field, FormGrid, SelectInput, TextInput } from '../ui/Form';

const TONE = { draft: ['Draft', colors.textMuted], submitted: ['Waiting for approval', colors.warningText], approved: ['Approved', colors.successText], locked: ['Locked', colors.primaryDeep] };
const KIND = { original: 'Original', revision: 'Revision', forecast: 'Forecast', scenario: 'Scenario' };
const TYPES = { operating: 'Operating', sales: 'Sales', purchases: 'Purchases', payroll: 'Payroll', capex: 'Capital expenditure', cash: 'Cash', project: 'Project', departmental: 'Departmental', master: 'Master' };
const when = (t) => (t ? new Date(String(t).replace(' ', 'T')).toLocaleString() : '');
const ACTION_WORDS = { created: 'Made', submitted: 'Submitted', approved: 'Approved', rejected: 'Sent back', locked: 'Locked', reopened: 'Reopened' };

/**
 * The budget being worked on, its version and where that version stands: Draft (can be edited) → Waiting for approval → Approved → Locked. An approved or locked version is
 * never edited: "Make a revision" copies it into a new draft. Submitting needs the Planning permission; approving, sending back, locking and reopening need the approve permission.
 */
export default function BudgetBar({ data, versionId, setVersionId, setYear, reload }) {
  const canPlan = hasPermission(null, 'books.planning');
  const canApprove = hasPermission(null, 'books.budget.approve');
  const [form, setForm] = useState(null);   // 'budget' | 'version' | null
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [showLog, setShowLog] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [compare, setCompare] = useState(null);   // the versions side by side, once asked for

  const budget = data.budgets.find((b) => b.versions.some((v) => v.id === versionId)) ?? data.budgets[0] ?? null;
  const version = budget?.versions.find((v) => v.id === versionId) ?? null;
  const [label, tone] = TONE[version?.status] ?? TONE.draft;
  const pickBudget = (id) => {
    const b = data.budgets.find((x) => x.id === Number(id));
    if (!b) return;
    const good = [...b.versions].reverse().find((v) => v.status === 'approved' || v.status === 'locked') ?? b.versions[b.versions.length - 1];
    setVersionId(good.id);
    setYear(Number(b.from_month.slice(0, 4)));
  };
  const run = async (fn, ok) => {
    setBusy(true); setErrs({});
    try { const r = await fn(); if (ok) toast.success(ok); return r; } catch (e) {
      setErrs(Object.fromEntries(Object.entries(e?.response?.data?.errors ?? {}).map(([k, v]) => [k, v[0]])));
      toast.error(Object.values(e?.response?.data?.errors ?? {})[0]?.[0] ?? errMsg(e, 'That did not work'));
      return null;
    } finally { setBusy(false); }
  };
  const act = async (action, note) => { const r = await run(() => booksAPI.budgetVersionAction(version.id, action, note ? { note } : {}), 'Done'); if (r) reload(); };
  const sendBack = () => { const note = window.prompt('Why is it sent back?'); if (note) act('reject', note); };
  const createBudget = async () => {
    const r = await run(() => booksAPI.createBudgetSet({ name: vals.name, from_month: vals.from, to_month: vals.to, budget_type: vals.type || 'operating', copy_from_version_id: vals.copy || undefined }), 'Budget made');
    if (r) { setForm(null); setVersionId(r.version_id); setYear(Number(String(vals.from).slice(0, 4)) || new Date().getFullYear()); reload(r.version_id); }
  };
  const createVersion = async () => {
    const clean = vals.kind === 'revision' ? [] : drivers.filter((d) => d.percent !== '' && (d.scope === 'all' || d.scope === 'income' || d.scope === 'expense' || d.id)).map((d) => ({ scope: d.scope, id: d.id ? Number(d.id) : undefined, percent: Number(d.percent) }));
    const r = await run(() => booksAPI.createBudgetVersion(budget.id, { kind: vals.kind || 'revision', name: vals.name || undefined, from_version_id: version.id, drivers: clean }), 'New draft made from a copy');
    if (r) { setForm(null); setVersionId(r.version_id); reload(r.version_id); }
  };
  const open = (kind) => { setForm(kind); setErrs({}); setDrivers([]); setVals(kind === 'budget' ? { name: '', from: `${new Date().getFullYear()}-01`, to: `${new Date().getFullYear()}-12`, type: 'operating' } : { kind: 'revision', name: '' }); };
  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e.target.value }));

  return (
    <div style={{ ...card, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Budget" htmlFor="bb-budget">
          <SelectInput id="bb-budget" value={budget?.id ?? ''} onChange={(e) => pickBudget(e.target.value)} disabled={!data.budgets.length}>
            {!data.budgets.length && <option value="">No budget yet</option>}
            {data.budgets.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.from_month} to {b.to_month})</option>)}
          </SelectInput>
        </Field>
        {budget && (
          <Field label="Version" htmlFor="bb-version">
            <SelectInput id="bb-version" value={versionId ?? ''} onChange={(e) => setVersionId(Number(e.target.value))}>
              {budget.versions.map((v) => <option key={v.id} value={v.id}>{v.name} · {TONE[v.status][0]}</option>)}
            </SelectInput>
          </Field>
        )}
        {version && <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '4px 10px', borderRadius: 999, color: tone, background: colors.tint(0.08), marginBottom: 6 }}>{label}</span>}
        <span style={{ flex: 1 }} />
        {budget && budget.versions.length > 1 && <button type="button" style={btnGhost} onClick={async () => { if (compare) { setCompare(null); return; } try { setCompare((await booksAPI.budgetCompare(budget.id)).versions); } catch (e) { toast.error(errMsg(e, 'Could not compare the versions')); } }}>{compare ? 'Hide comparison' : 'Compare versions'}</button>}
        {canPlan && <button type="button" style={btnGhost} onClick={() => open('budget')}>New budget</button>}
        {canPlan && version && <button type="button" style={btnGhost} onClick={() => open('version')}>{version.status === 'draft' ? 'New version from this' : 'Make a revision'}</button>}
        {version?.status === 'draft' && canPlan && <button type="button" style={btnPrimary} disabled={busy} onClick={() => act('submit')}>Submit for approval</button>}
        {version?.status === 'submitted' && canApprove && <>
          <button type="button" style={btnGhost} disabled={busy} onClick={sendBack}>Send back</button>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => act('approve')}>Approve</button>
        </>}
        {version?.status === 'approved' && canApprove && <button type="button" style={btnGhost} disabled={busy} onClick={() => act('lock')}>Lock</button>}
        {version?.status === 'locked' && canApprove && <button type="button" style={btnGhost} disabled={busy} onClick={() => act('reopen')}>Reopen</button>}
      </div>
      {version && version.status !== 'draft' && (
        <p style={{ margin: '10px 0 0', fontSize: '0.76rem', color: colors.textMuted }}>
          {version.status === 'submitted' ? 'This version is waiting for approval and cannot be changed. An approver can send it back.' : 'This version is the plan as agreed, so it cannot be changed. To change the plan, make a revision: it starts as a copy and the approved one stays as it was.'}
        </p>
      )}
      {version && (
        <p style={{ margin: '8px 0 0', fontSize: '0.7rem', color: colors.textFaint }}>
          {version.prepared_by ? `Prepared by ${version.prepared_by}. ` : ''}{version.submitted_by ? `Submitted by ${version.submitted_by}. ` : ''}{version.approved_by ? `Approved by ${version.approved_by}. ` : ''}
          {data.approvals.length > 0 && <button type="button" onClick={() => setShowLog((x) => !x)} style={{ background: 'none', border: 'none', color: colors.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', padding: 0 }}>{showLog ? 'Hide history' : 'History'}</button>}
        </p>
      )}
      {showLog && <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px', fontSize: '0.72rem', color: colors.textMuted }}>{data.approvals.map((a, i) => <li key={i}>{ACTION_WORDS[a.action] ?? a.action} by {a.by ?? 'the system'}, {when(a.created_at)}{a.note ? `: ${a.note}` : ''}</li>)}</ul>}
      {compare && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.78rem' }}>
            <thead><tr>{['Version', 'Income', 'Expenses', 'Result', 'Result against the first'].map((h, i) => <th key={h} style={{ padding: '5px 8px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{compare.map((v) => (
              <tr key={v.id} style={{ borderTop: `1px solid ${colors.tint(0.06)}` }}>
                <td style={{ padding: '5px 8px' }}><b>{v.name}</b> <span style={{ color: colors.textFaint, fontSize: '0.68rem' }}>{KIND[v.kind]} · {TONE[v.status][0]}</span>{v.note && <div style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{v.note}</div>}</td>
                {[v.income, v.expense, v.result].map((x, i) => <td key={i} style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: i === 2 ? 700 : 400 }}>{Number(x).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>)}
                <td style={{ padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: v.result_change == null ? colors.textFaint : v.result_change >= 0 ? colors.successText : colors.dangerText }}>{v.result_change == null ? '' : `${v.result_change >= 0 ? '+' : ''}${Number(v.result_change).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {form === 'budget' && (
        <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14, marginTop: 12 }}>
          <FormGrid min={170}>
            <Field label="Name" htmlFor="nb-name" error={errs.name}><TextInput id="nb-name" value={vals.name} onChange={set('name')} placeholder="2027 operating budget" maxLength={120} /></Field>
            <Field label="Type" htmlFor="nb-type" error={errs.budget_type}><SelectInput id="nb-type" value={vals.type} onChange={set('type')}>{data.budget_types.map((t) => <option key={t} value={t}>{TYPES[t] ?? t}</option>)}</SelectInput></Field>
            <Field label="From month" htmlFor="nb-from" error={errs.from_month}><TextInput id="nb-from" type="month" value={vals.from} onChange={set('from')} /></Field>
            <Field label="To month" htmlFor="nb-to" error={errs.to_month}><TextInput id="nb-to" type="month" value={vals.to} onChange={set('to')} /></Field>
            <Field label="Start from" htmlFor="nb-copy" hint="Copy the rows of an existing version, or start empty.">
              <SelectInput id="nb-copy" value={vals.copy ?? ''} onChange={set('copy')}><option value="">An empty budget</option>{data.budgets.flatMap((b) => b.versions.map((v) => <option key={v.id} value={v.id}>{b.name}: {v.name}</option>))}</SelectInput>
            </Field>
          </FormGrid>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button type="button" style={btnPrimary} disabled={busy} onClick={createBudget}>{busy ? 'Making…' : 'Make the budget'}</button><button type="button" style={btnGhost} onClick={() => setForm(null)}>Cancel</button></div>
        </div>
      )}
      {form === 'version' && version && (
        <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14, marginTop: 12 }}>
          <FormGrid min={170}>
            <Field label="What is it" htmlFor="nv-kind" error={errs.kind}><SelectInput id="nv-kind" value={vals.kind} onChange={set('kind')}>{['revision', 'forecast', 'scenario'].map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</SelectInput></Field>
            <Field label="Name" htmlFor="nv-name" error={errs.name} hint={`Left empty it is called ${KIND[vals.kind]} and the next number.`}><TextInput id="nv-name" value={vals.name} onChange={set('name')} placeholder="Worst case, sales down 15%" maxLength={60} /></Field>
          </FormGrid>
          {vals.kind !== 'revision' && (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: '0 0 6px', fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted }}>What changes (optional): each applies on top of the last</p>
              {drivers.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <SelectInput aria-label={`Change ${i + 1} applies to`} value={d.scope} onChange={(e) => setDrivers((x) => x.map((y, k) => (k === i ? { ...y, scope: e.target.value, id: '' } : y)))} style={{ maxWidth: 190 }}>
                    <option value="all">Everything</option><option value="income">All income</option><option value="expense">All expenses</option><option value="group">One ledger group</option><option value="ledger">One ledger</option>
                  </SelectInput>
                  {(d.scope === 'group' || d.scope === 'ledger') && (
                    <SelectInput aria-label={`Change ${i + 1} account`} value={d.id} onChange={(e) => setDrivers((x) => x.map((y, k) => (k === i ? { ...y, id: e.target.value } : y)))} style={{ maxWidth: 260 }}>
                      <option value="">Choose…</option>
                      {d.scope === 'group' ? data.choices.groups.map((g) => <option key={g.id} value={g.id}>{g.path}</option>) : data.choices.ledgers.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.group})</option>)}
                    </SelectInput>
                  )}
                  <input type="number" step="0.1" aria-label={`Change ${i + 1} percent`} placeholder="% (-15 or 10)" value={d.percent} onChange={(e) => setDrivers((x) => x.map((y, k) => (k === i ? { ...y, percent: e.target.value } : y)))}
                    style={{ width: 110, padding: '6px 8px', fontSize: '0.78rem', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, background: 'var(--bg-primary)', color: colors.text }} />
                  <button type="button" style={btnGhost} onClick={() => setDrivers((x) => x.filter((_, k) => k !== i))}>Remove</button>
                </div>
              ))}
              <button type="button" style={btnGhost} onClick={() => setDrivers((x) => [...x, { scope: 'income', id: '', percent: '' }])}>Add a change (sales down 15%, rent up 10% …)</button>
              {errs['drivers.0.percent'] && <div style={{ color: colors.dangerText, fontSize: '0.72rem' }}>{errs['drivers.0.percent']}</div>}
            </div>
          )}
          <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: colors.textMuted }}>It starts as a copy of "{version.name}" and is a draft you can change.{vals.kind !== 'revision' && ' Any changes above are applied to the amounts once, when the copy is made.'}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button type="button" style={btnPrimary} disabled={busy} onClick={createVersion}>{busy ? 'Making…' : 'Make the copy'}</button><button type="button" style={btnGhost} onClick={() => setForm(null)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}
