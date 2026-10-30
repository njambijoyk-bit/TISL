import { useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { hasPermission } from '../../../../_shared/lib/roles';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { Field, FormGrid, NumberInput, SelectInput, TextInput } from '../ui/Form';

const STATUS = { pending: ['Waiting', colors.warningText], approved: ['Approved', colors.successText], rejected: ['Turned down', colors.dangerText] };
const th = { padding: '5px 8px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', fontSize: '0.78rem', borderTop: `1px solid ${colors.tint(0.06)}` };
const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Moving budget between lines once a version is approved: it is not edited, so a transfer asks to move an amount of one month from one line to another, with a reason. When it is
 * accepted the plan is read with it in, and the request stays as the record.
 */
export default function BudgetTransfers({ data, version, reload }) {
  const canPlan = hasPermission(null, 'books.planning');
  const canApprove = hasPermission(null, 'books.budget.approve');
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  if (!version || !data.transfers_ready || (version.status !== 'approved' && data.transfers.length === 0)) return null;
  const rows = data.lines.filter((l) => l.section === 'expense' || l.section === 'income');
  const label = (l) => `${l.name}${l.is_recovery ? ' (recovery)' : ''}${l.dimensions?.length ? `, ${l.dimensions.join(' › ')}` : ''}`;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const run = async (fn, ok) => {
    setBusy(true); setErrs({});
    try { await fn(); toast.success(ok); reload(); return true; } catch (e) {
      setErrs(Object.fromEntries(Object.entries(e?.response?.data?.errors ?? {}).map(([k, v]) => [k, v[0]])));
      toast.error(Object.values(e?.response?.data?.errors ?? {})[0]?.[0] ?? errMsg(e, 'That did not work')); return false;
    } finally { setBusy(false); }
  };
  const turnDown = (t) => { const note = window.prompt('Why is it turned down?'); if (note) run(() => booksAPI.decideBudgetTransfer(t.id, 'reject', { note }), 'Turned down'); };

  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
      <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>Moving budget between lines</p>
      <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 660, lineHeight: 1.5 }}>
        An approved version is not edited. To give one line more room, ask to move an amount of one month's budget from another line, with a reason. When a second person accepts it, the plan is read with the move in; nothing is made or lost, and the request stays as the record.
      </p>
      {canPlan && version.status === 'approved' && !form && <button type="button" style={{ ...btnGhost, marginBottom: 10 }} onClick={() => setForm({ from_row_id: '', to_row_id: '', period: data.months[0], amount: '', note: '' })}>Ask to move budget</button>}
      {form && (
        <div style={{ border: `1px solid ${colors.tint(0.15)}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <FormGrid min={190}>
            <Field label="Take it from" htmlFor="tf-from" error={errs.from_row_id}><SelectInput id="tf-from" value={form.from_row_id} onChange={set('from_row_id')}><option value="">Choose a line…</option>{rows.map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}</SelectInput></Field>
            <Field label="Give it to" htmlFor="tf-to" error={errs.to_row_id}><SelectInput id="tf-to" value={form.to_row_id} onChange={set('to_row_id')}><option value="">Choose a line…</option>{rows.filter((l) => String(l.id) !== String(form.from_row_id)).map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}</SelectInput></Field>
            <Field label="Month" htmlFor="tf-period" error={errs.period}><SelectInput id="tf-period" value={form.period} onChange={set('period')}>{data.months.map((m) => <option key={m} value={m}>{m}</option>)}</SelectInput></Field>
            <Field label="Amount" htmlFor="tf-amount" error={errs.amount}><NumberInput id="tf-amount" min="0" step="0.01" value={form.amount} onChange={set('amount')} /></Field>
            <Field label="Why" htmlFor="tf-note"><TextInput id="tf-note" maxLength={255} value={form.note} onChange={set('note')} /></Field>
          </FormGrid>
          {errs.version && <p style={{ color: colors.dangerText, fontSize: '0.74rem' }}>{errs.version}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" style={btnPrimary} disabled={busy} onClick={async () => { if (await run(() => booksAPI.requestBudgetTransfer({ ...form, from_row_id: Number(form.from_row_id), to_row_id: Number(form.to_row_id), amount: Number(form.amount) }), 'Asked for approval')) setForm(null); }}>{busy ? 'Asking…' : 'Ask for approval'}</button>
            <button type="button" style={btnGhost} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
      {data.transfers.length === 0 ? <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>No transfers yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Month</th><th style={th}>From</th><th style={th}>To</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Status</th><th style={th}>Asked by</th><th style={th} /></tr></thead>
            <tbody>{data.transfers.map((t) => {
              const [lab, tone] = STATUS[t.status] ?? [t.status, colors.textMuted];
              return (
                <tr key={t.id}>
                  <td style={td}>{t.period}</td><td style={td}>{t.from}</td><td style={td}>{t.to}</td><td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(t.amount)}</td>
                  <td style={{ ...td, color: tone, fontWeight: 700 }}>{lab}{t.note && <div style={{ fontWeight: 400, color: colors.textMuted }}>{t.note}</div>}{t.decision_note && <div style={{ fontWeight: 400, color: colors.textMuted }}>{t.decided_by}: {t.decision_note}</div>}</td>
                  <td style={td}>{t.requested_by}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{t.status === 'pending' && <>
                    {canPlan && <button type="button" style={{ ...btnGhost, padding: '3px 8px', fontSize: '0.7rem' }} disabled={busy} onClick={() => run(() => booksAPI.withdrawBudgetTransfer(t.id), 'Taken back')}>Take back</button>}{' '}
                    {canApprove && <><button type="button" style={{ ...btnGhost, padding: '3px 8px', fontSize: '0.7rem' }} disabled={busy} onClick={() => turnDown(t)}>Turn down</button>{' '}
                      <button type="button" style={{ ...btnPrimary, padding: '3px 8px', fontSize: '0.7rem' }} disabled={busy} onClick={() => run(() => booksAPI.decideBudgetTransfer(t.id, 'approve'), 'Accepted')}>Accept</button></>}
                  </>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
