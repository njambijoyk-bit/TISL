import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/** Profit and loss by cost centre: what each cost centre earned and spent itself (first two columns) and in total with everything beneath it (last three). */
export default function ProfitLossByCostCentreView({ result }) {
  const d = result.data;
  const A = (v) => formatAmount(v, result.format);
  if (d.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{d.message}</p>;

  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: colors.textMuted }}>The first two columns are what a cost centre earned and spent itself; the last three add everything beneath it, so a branch's line covers its utilities, stock, payroll and departments. Entries with no cost centre are not counted.</p>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Cost centre</th>{['Own income', 'Own expenses', 'Income', 'Expenses', 'Profit'].map((h) => <th key={h} style={{ ...th, ...num }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.rows.length ? d.rows.map((r) => (
                <tr key={r.cost_centre_id}>
                  <td style={{ ...td, paddingLeft: 12 + r.depth * 18, fontWeight: r.depth === 0 ? 700 : 500 }}>{r.name}{r.purpose && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: colors.textFaint }}>{r.purpose}</span>}</td>
                  <td style={{ ...td, ...num }}>{r.own_income ? A(r.own_income) : ''}</td>
                  <td style={{ ...td, ...num }}>{r.own_expense ? A(r.own_expense) : ''}</td>
                  <td style={{ ...td, ...num }}>{A(r.income)}</td>
                  <td style={{ ...td, ...num }}>{A(r.expense)}</td>
                  <td style={{ ...td, ...num, color: r.profit < 0 ? colors.danger : colors.successText }}>{A(r.profit)}</td>
                </tr>
              )) : <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>Nothing posted to a cost centre in this period.</td></tr>}
              {d.rows.length > 0 && (
                <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                  <td style={td}>Whole business</td><td style={td} /><td style={td} />
                  <td style={{ ...td, ...num }}>{A(d.totals.income)}</td><td style={{ ...td, ...num }}>{A(d.totals.expense)}</td><td style={{ ...td, ...num }}>{A(d.totals.profit)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
