import { useNavigate } from 'react-router-dom';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount, formatBalance, UNIT_WORD } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/** The trial balance on the engine: every ledger with a balance or movement. A ledger opens its statement. */
export default function TrialBalanceView({ result }) {
  const nav = useNavigate();
  const d = result.data;
  const fmt = result.format;
  const shown = fmt.show_zero_balances ? d.rows : d.rows.filter((r) => r.placeholder || Math.abs(r.closing) >= 0.005 || Math.abs(r.debit) >= 0.005 || Math.abs(r.credit) >= 0.005 || Math.abs(r.opening) >= 0.005);
  const openLedger = (r) => r.ledger_id && nav(`/admin/books?tab=reports&report=ledger&ledger=${r.ledger_id}`);
  const unit = UNIT_WORD[fmt.units];

  return (
    <>
      {unit && <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: colors.textFaint }}>Amounts {unit}.</p>}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Group</th><th style={th}>Ledger</th><th style={{ ...th, ...num }}>Opening</th><th style={{ ...th, ...num }}>Debit</th><th style={{ ...th, ...num }}>Credit</th><th style={{ ...th, ...num }}>Closing</th>
            </tr></thead>
            <tbody>
              {shown.length ? shown.map((r, i) => (
                <tr key={r.ledger_id ?? `p${i}`} onClick={() => openLedger(r)} style={{ cursor: r.ledger_id ? 'pointer' : 'default', fontStyle: r.placeholder ? 'italic' : undefined }}>
                  <td style={td}>{r.group}</td><td style={td}>{r.ledger}</td>
                  <td style={{ ...td, ...num }}>{formatBalance(r.opening, fmt)}</td>
                  <td style={{ ...td, ...num }}>{formatAmount(r.debit, fmt, { blankZero: true })}</td>
                  <td style={{ ...td, ...num }}>{formatAmount(r.credit, fmt, { blankZero: true })}</td>
                  <td style={{ ...td, ...num }}>{formatBalance(r.closing, fmt)}</td>
                </tr>
              )) : <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>Nothing posted for this period.</td></tr>}
              {shown.length > 0 && (
                <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                  <td style={td} colSpan={4}>Closing totals</td>
                  <td style={{ ...td, ...num }}>Dr {formatAmount(d.total_debit, fmt)}</td><td style={{ ...td, ...num }}>Cr {formatAmount(d.total_credit, fmt)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {d.opening_difference ? (
        <div style={{ ...card, padding: 12, marginTop: 10, fontSize: '0.8rem', color: colors.text }}>
          <strong>Difference in opening balances: {formatAmount(Math.abs(d.opening_difference), fmt)} {d.opening_difference > 0 ? 'Cr' : 'Dr'}.</strong>{' '}
          It is a placeholder, not a ledger: the opening balances on the ledgers are {formatAmount(Math.abs(d.opening_difference), fmt)} {d.opening_difference > 0 ? 'heavy on the debit side' : 'heavy on the credit side'}, so it is held here to keep the books in step. It clears when the opposite opening balance (usually Capital) is entered. The ledgers carrying openings:
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{d.opening_balances.map((o) => <li key={o.ledger_id}>{o.ledger} <span style={{ color: colors.textMuted }}>({o.group})</span> — {formatAmount(o.amount, fmt)} {o.side}</li>)}</ul>
        </div>
      ) : null}
      {!d.balanced && !d.filtered && (
        <div role="alert" style={{ ...card, padding: 12, marginTop: 10, fontSize: '0.8rem', color: colors.dangerText }}>
          <strong>The trial balance does not balance: debits are {formatAmount(Math.abs(d.total_debit - d.total_credit), fmt)} {d.total_debit > d.total_credit ? 'more' : 'less'} than credits.</strong>
          <div style={{ marginTop: 4, color: colors.text }}>The difference is in the postings, not the opening balances.</div>
        </div>
      )}
    </>
  );
}
