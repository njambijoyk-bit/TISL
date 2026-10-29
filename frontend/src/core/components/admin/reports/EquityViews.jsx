import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/** Changes in equity: each equity ledger and retained earnings, opening + profit + other movements = closing. Equity is shown as a positive amount. */
export function ChangesInEquityView({ result }) {
  const d = result.data;
  const fmt = result.format;
  if (d.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{d.message}</p>;
  const A = (v) => formatAmount(v, fmt, { blankZero: true });

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: colors.tint(0.02) }}>
            <th style={th}>Particulars</th><th style={{ ...th, ...num }}>Opening</th><th style={{ ...th, ...num }}>Profit (loss) for the period</th><th style={{ ...th, ...num }}>Other movements</th><th style={{ ...th, ...num }}>Closing</th>
          </tr></thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.key}><td style={td}>{r.name}</td><td style={{ ...td, ...num }}>{A(r.opening)}</td><td style={{ ...td, ...num }}>{A(r.profit)}</td><td style={{ ...td, ...num }}>{A(r.other)}</td><td style={{ ...td, ...num, fontWeight: 700 }}>{A(r.closing)}</td></tr>
            ))}
            <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
              <td style={td}>Total equity</td><td style={{ ...td, ...num }}>{A(d.totals.opening)}</td><td style={{ ...td, ...num }}>{A(d.totals.profit)}</td><td style={{ ...td, ...num }}>{A(d.totals.other)}</td><td style={{ ...td, ...num }}>{A(d.totals.closing)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Adjusted trial balance: the balance-sheet ledgers with the profit and loss of all years as one retained earnings line. */
export function AdjustedTrialBalanceView({ result }) {
  const d = result.data;
  const fmt = result.format;
  const A = (v) => formatAmount(v, fmt, { blankZero: true });

  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: colors.textMuted }}>As of {d.as_of}. Income and expense ledgers are closed into retained earnings, so only balance-sheet ledgers are listed.</p>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}><th style={th}>Ledger</th><th style={th}>Group</th><th style={{ ...th, ...num }}>Debit</th><th style={{ ...th, ...num }}>Credit</th></tr></thead>
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={`${r.ledger_id}-${i}`} style={r.placeholder ? { fontStyle: 'italic' } : undefined}><td style={td}>{r.name}</td><td style={{ ...td, color: colors.textMuted }}>{r.group}</td><td style={{ ...td, ...num }}>{A(r.debit)}</td><td style={{ ...td, ...num }}>{A(r.credit)}</td></tr>
              ))}
              <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}><td style={td} colSpan={2}>Total</td><td style={{ ...td, ...num }}>{formatAmount(d.totals.debit, fmt)}</td><td style={{ ...td, ...num }}>{formatAmount(d.totals.credit, fmt)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
