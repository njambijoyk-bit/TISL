import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { hasPermission } from '../../../../_shared/lib/roles';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

const STATUS = { noted: ['Noted', colors.textMuted], pending: ['Waiting for approval', colors.warningText], approved: ['Approved', colors.successText], rejected: ['Turned down', colors.dangerText] };
const th = { padding: '5px 8px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', fontSize: '0.78rem', borderTop: `1px solid ${colors.tint(0.06)}` };
const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The vouchers that took a budget line over its budget, and the ones waiting for an approver to accept the overspend. How the system reacts is set under Configuration → Budget settings. */
export default function BudgetOverspends({ data, reload }) {
  const c = data.controls;
  const canApprove = hasPermission(null, 'books.budget.approve');
  const [busy, setBusy] = useState(false);
  if (!c.ready) return null;
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(Object.values(e?.response?.data?.errors ?? {})[0]?.[0] ?? errMsg(e, 'That did not work')); } finally { setBusy(false); }
  };
  const reject = (o) => { const note = window.prompt('Why is it turned down?'); if (note) run(() => booksAPI.decideBudgetOverride(o.id, 'reject', { note }), 'Turned down'); };
  return (
    <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <p style={{ margin: 0, fontWeight: 700, color: colors.text }}>Overspends</p>
        <p style={{ margin: '3px 0 12px', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 660, lineHeight: 1.5 }}>
          Every voucher that took a budget line over its budget. Under "post, then wait for approval" the voucher is already posted; an approver accepts or turns down the overspend, and a turned-down one is for the person who made the voucher to cancel or change. Accepting needs the permission to approve budgets, and a second person when that rule is on.
        </p>
        {c.overrides.length === 0 ? <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>No voucher has gone over a budget.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={th}>Voucher</th><th style={th}>Line</th><th style={{ ...th, textAlign: 'right' }}>Budget</th><th style={{ ...th, textAlign: 'right' }}>Spent</th><th style={{ ...th, textAlign: 'right' }}>This voucher</th><th style={{ ...th, textAlign: 'right' }}>Over by</th><th style={th}>Status</th><th style={th}>By</th><th style={th} /></tr></thead>
              <tbody>{c.overrides.map((o) => {
                const [label, tone] = STATUS[o.status] ?? [o.status, colors.textMuted];
                return (
                  <tr key={o.id}>
                    <td style={td}><Link to={`/admin/books/vouchers/${o.voucher_id}`} style={{ color: colors.primary }}>{o.voucher_number ?? `#${o.voucher_id}`}</Link></td>
                    <td style={td}>{o.line_label}</td>
                    {[o.budget, o.spent_before, o.amount, o.over_by].map((v, i) => <td key={i} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(v)}</td>)}
                    <td style={{ ...td, color: tone, fontWeight: 700 }}>{label}{o.permitted ? <span style={{ fontWeight: 400, color: colors.textFaint }}> (may exceed)</span> : null}{o.note ? <div style={{ fontWeight: 400, color: colors.textMuted }}>{o.note}</div> : null}</td>
                    <td style={td}>{o.requested_by ?? ''}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{o.status === 'pending' && canApprove && <>
                      <button type="button" style={{ ...btnGhost, padding: '3px 8px', fontSize: '0.7rem' }} disabled={busy} onClick={() => reject(o)}>Turn down</button>{' '}
                      <button type="button" style={{ ...btnPrimary, padding: '3px 8px', fontSize: '0.7rem' }} disabled={busy} onClick={() => run(() => booksAPI.decideBudgetOverride(o.id, 'approve'), 'Accepted')}>Accept</button>
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
