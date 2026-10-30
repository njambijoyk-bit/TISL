import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const th = { padding: '7px 10px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', fontSize: '0.78rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
const STATUS = { draft: 'Draft', submitted: 'Waiting for approval', approved: 'Approved', locked: 'Locked' };
const compact = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v)));

/**
 * Master budget and cash: every budget that covers the dates brought into one plan (the result by month and by ledger group) and, under it, the cash budget: from the cash held at the
 * start, month by month, does the plan leave enough cash? Money lines are in the money columns; a red month is a month that ends below nothing.
 */
export default function MasterBudgetView({ result }) {
  const d = result.data;
  const A = (v) => formatAmount(v, result.format);
  if (d.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{d.message}</p>;
  const c = d.cash;
  const neg = (v) => (v < -0.004 ? colors.dangerText : undefined);
  const series = d.months.map((m) => ({ month: monthName(m.month), closing: m.closing }));

  return (
    <>
      <div role="status" style={{ ...card, padding: '12px 16px', marginBottom: 12, borderLeft: `4px solid ${c.can_finance ? colors.successText : colors.dangerText}` }}>
        <b style={{ color: c.can_finance ? colors.successText : colors.dangerText }}>{c.can_finance ? 'The plan can be financed from the cash.' : `The plan runs out of cash in ${c.short_months.map(monthName).join(', ')}.`}</b>
        <div style={{ fontSize: '0.78rem', color: colors.textMuted, marginTop: 2 }}>
          Starting with {A(c.opening)}, the lowest point is {A(c.lowest.balance)} at the end of {monthName(c.lowest.month)}, and the plan ends with {A(c.closing)}.
          {!c.can_finance && ' Raise cash, delay spending, or collect sooner: the assumptions below show what the timing rests on.'}
        </div>
      </div>
      {d.not_approved && <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: colors.warningText }}>At least one budget here is planned from a version that is not approved yet.</p>}

      <div style={{ ...card, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint, marginBottom: 4 }}>Cash at month end</div>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e1e0d9" vertical={false} /><XAxis dataKey="month" tick={{ fill: '#898781', fontSize: 11 }} tickLine={false} /><YAxis tick={{ fill: '#898781', fontSize: 11 }} tickFormatter={compact} width={48} tickLine={false} />
              <Tooltip formatter={(v) => [A(v), 'Cash']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <ReferenceLine y={0} stroke={colors.dangerText} strokeDasharray="4 3" />
              <Area type="monotone" dataKey="closing" stroke="#2a6ad0" strokeWidth={2} fill="#2a6ad0" fillOpacity={0.12} isAnimationActive />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ ...card, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Month</th>{['Income', 'Expenses', 'Result', 'Cash in', 'Cash out', 'Assets', 'Loans & capital', 'Net cash', 'Cash at end'].map((h) => <th key={h} style={{ ...th, ...num }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.month}>
                  <td style={td}>{monthName(m.month)}</td><td style={{ ...td, ...num }}>{A(m.income)}</td><td style={{ ...td, ...num }}>{A(m.expense)}</td><td style={{ ...td, ...num, color: neg(m.result) }}>{A(m.result)}</td>
                  <td style={{ ...td, ...num }}>{A(m.receipts)}</td><td style={{ ...td, ...num }}>{A(m.payments)}</td><td style={{ ...td, ...num }}>{m.assets ? A(m.assets) : ''}</td><td style={{ ...td, ...num }}>{m.financing ? A(m.financing) : ''}</td>
                  <td style={{ ...td, ...num, color: neg(m.net_cash) }}>{A(m.net_cash)}</td><td style={{ ...td, ...num, fontWeight: 700, color: neg(m.closing) }}>{A(m.closing)}</td>
                </tr>
              ))}
              <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                <td style={td}>Whole period</td>{['income', 'expense', 'result', 'receipts', 'payments', 'assets', 'financing', 'net_cash'].map((k) => <td key={k} style={{ ...td, ...num, color: neg(d.totals[k]) }}>{A(d.totals[k])}</td>)}<td style={{ ...td, ...num }}>{A(c.closing)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {(c.after_budget.receipts > 0.004 || c.after_budget.payments > 0.004) && (
        <p style={{ margin: '0 0 12px', fontSize: '0.74rem', color: colors.textMuted }}>After the budget ends: {A(c.after_budget.receipts)} still to come in from customers and {A(c.after_budget.payments)} still to pay suppliers.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 12 }}>
        {[['Income by group', d.income_lines], ['Expenses by group', d.expense_lines]].map(([name, lines]) => (
          <div key={name} style={{ ...card, padding: 14 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint, marginBottom: 6 }}>{name}</div>
            {lines.length === 0 ? <span style={{ fontSize: '0.78rem', color: colors.textFaint }}>None planned.</span> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{lines.map((l) => <tr key={l.name}><td style={td}>{l.name}</td><td style={{ ...td, ...num }}>{A(l.total)}</td></tr>)}</tbody></table>
            )}
          </div>
        ))}
        <div style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint, marginBottom: 6 }}>Budgets in this plan</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{d.budgets.map((b) => (
            <tr key={b.id}><td style={td}>{b.name}<div style={{ fontSize: '0.66rem', color: colors.textFaint }}>{b.type} · {b.version} · {STATUS[b.status] ?? b.status}</div></td><td style={{ ...td, ...num, color: neg(b.result) }}>{A(b.result)}</td></tr>
          ))}</tbody></table>
        </div>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint, marginBottom: 6 }}>What the cash figures assume</div>
        <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '0.76rem', color: colors.textBody, display: 'grid', gap: 4 }}>
          {d.assumptions.map((a) => <li key={a.label}><b>{a.label}:</b> {a.value}. <span style={{ color: colors.textMuted }}>{a.detail}</span></li>)}
        </ul>
      </div>
    </>
  );
}
