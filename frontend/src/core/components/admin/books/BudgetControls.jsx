import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { Field, SelectInput } from '../ui/Form';
import ReportsSettings from './ReportsSettings';

const MODE = { off: 'Not checked', warn: 'Warn and post', approval: 'Post, then wait for approval', block: 'Block' };
const SCOPES = { ledger: 'Ledger', group: 'Ledger group', department: 'Department', cost_centre: 'Cost centre' };
const th = { padding: '5px 8px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', fontSize: '0.78rem', borderTop: `1px solid ${colors.tint(0.06)}` };

/**
 * Budget controls: what happens when a purchase, payment or journal would take an expense past its budget (set here, in Reports settings' own control) and exceptions for one account,
 * department or cost centre. The overspends themselves are on the Budgets tab (BudgetOverspends).
 */
export default function BudgetControls({ data, canEdit, reload }) {
  const c = data.controls;
  const [form, setForm] = useState({ scope_type: 'ledger', scope_id: '', mode: 'warn' });
  const [busy, setBusy] = useState(false);
  const targets = {
    ledger: data.choices.ledgers.filter((l) => l.section === 'expense').map((l) => [l.id, `${l.name} (${l.group})`]),
    group: data.choices.groups.filter((g) => g.section === 'expense').map((g) => [g.id, g.path]),
    department: data.choices.departments.map((d) => [d.id, `${d.name}${d.location ? ` (${d.location})` : ''}`]),
    cost_centre: data.choices.cost_centres.map((x) => [x.id, x.path]),
  };
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reload(); return true; } catch (e) { toast.error(Object.values(e?.response?.data?.errors ?? {})[0]?.[0] ?? errMsg(e, 'That did not work')); return false; } finally { setBusy(false); }
  };

  return (
    <>
      <ReportsSettings only="budget_control" />
      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>Exceptions to the budget control</p>
        <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 660, lineHeight: 1.5 }}>
          One account, department or cost centre can behave differently from the company-wide choice above: rent might only warn while travel is blocked, or a department can be left unchecked. The most specific one wins: the account, then the department, then the cost centre.
          People who hold the permission to exceed budgets are never stopped, whatever is set here.
        </p>
        {!c.ready && <p style={{ color: colors.warningText, fontSize: '0.8rem' }}>Run database script 242_budget_controls.sql to turn budget controls on.</p>}
        {c.rules.length > 0 && (
          <table style={{ borderCollapse: 'collapse', marginBottom: 12, minWidth: 420 }}>
            <thead><tr><th style={th}>For</th><th style={th}>Name</th><th style={th}>Then</th><th style={th} /></tr></thead>
            <tbody>{c.rules.map((r) => (
              <tr key={r.id}><td style={td}>{SCOPES[r.scope_type]}</td><td style={td}>{r.name}</td><td style={td}>{MODE[r.mode]}</td>
                <td style={td}>{canEdit && <button type="button" aria-label={`Remove the exception for ${r.name}`} onClick={() => run(() => booksAPI.deleteBudgetRule(r.id), 'Removed')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><Trash2 size={14} /></button>}</td></tr>
            ))}</tbody>
          </table>
        )}
        {canEdit && c.ready && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Exception for" htmlFor="bc-type"><SelectInput id="bc-type" value={form.scope_type} onChange={(e) => setForm({ scope_type: e.target.value, scope_id: '', mode: form.mode })}>{Object.entries(SCOPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
            <Field label="Which one" htmlFor="bc-id"><SelectInput id="bc-id" value={form.scope_id} onChange={(e) => setForm((f) => ({ ...f, scope_id: e.target.value }))}><option value="">Choose…</option>{targets[form.scope_type].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</SelectInput></Field>
            <Field label="Then" htmlFor="bc-mode"><SelectInput id="bc-mode" value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>{c.modes.map((m) => <option key={m} value={m}>{MODE[m]}</option>)}</SelectInput></Field>
            <button type="button" style={btnPrimary} disabled={busy || !form.scope_id} onClick={() => run(() => booksAPI.saveBudgetRule({ ...form, scope_id: Number(form.scope_id) }), 'Saved')}>Add the exception</button>
          </div>
        )}
      </div>
    </>
  );
}
