import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const td = { padding: '7px 12px', fontSize: '0.82rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const TITLE = { operating: 'Operating activities', investing: 'Investing activities', financing: 'Financing activities', receipts: 'Money received', payments: 'Money paid' };

/** The cash flow statement: sections of rows, each with its total, then the change in cash and the opening and closing cash. */
export default function CashFlowView({ result }) {
  const d = result.data;
  const fmt = result.format;
  const A = (v) => formatAmount(v, fmt);
  const ok = d.reconciles && Math.abs(d.difference ?? 0) < 0.01;

  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: ok ? colors.successText : colors.dangerText }}>
        {ok ? 'Opening cash plus the net cash flow is the closing cash held in the cash and bank accounts.' : `The statement is out by ${A(d.difference)}: check the non-cash settings of the statement lines.`}
      </p>
      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {Object.entries(d.sections).map(([key, s]) => (
              <FragmentRows key={key} title={TITLE[key] ?? key} section={s} A={A} />
            ))}
            <tr style={{ background: colors.tint(0.04), fontWeight: 800 }}><td style={td}>Net change in cash</td><td style={{ ...td, ...num }}>{A(d.net_change)}</td></tr>
            <tr><td style={td}>Cash at the start ({d.from ?? 'the beginning'})</td><td style={{ ...td, ...num }}>{A(d.opening_cash)}</td></tr>
            <tr style={{ fontWeight: 800 }}><td style={td}>Cash at the end ({d.to})</td><td style={{ ...td, ...num }}>{A(d.closing_cash)}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function FragmentRows({ title, section, A }) {
  return (
    <>
      <tr style={{ background: colors.tint(0.03) }}><td style={{ ...td, fontWeight: 800 }} colSpan={2}>{title}</td></tr>
      {section.rows.map((r) => (
        <tr key={r.key}><td style={{ ...td, paddingLeft: 28, color: r.flag ? colors.dangerText : undefined }}>{r.name}</td><td style={{ ...td, ...num }}>{A(r.amount)}</td></tr>
      ))}
      <tr style={{ fontWeight: 700 }}><td style={{ ...td, paddingLeft: 28 }}>Net cash from {title.toLowerCase()}</td><td style={{ ...td, ...num }}>{A(section.total)}</td></tr>
    </>
  );
}
