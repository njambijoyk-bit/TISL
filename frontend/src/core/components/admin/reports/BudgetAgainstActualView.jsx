import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '7px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const SECTIONS = [['income', 'Income'], ['expense', 'Expenses'], ['balance', 'Balance sheet']];
const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
const STATUS = { draft: 'Draft', submitted: 'Waiting for approval', approved: 'Approved', locked: 'Locked' };

/** A gap as news: green when good (spending under budget, earnings above it), red when not. */
const Gap = ({ v, pct, A }) => (
  <span style={{ color: v > 0.004 ? colors.successText : v < -0.004 ? colors.dangerText : colors.textMuted, fontWeight: 600 }}>
    {v > 0.004 ? '▲ ' : v < -0.004 ? '▼ ' : ''}{A(Math.abs(v))}{pct !== null && pct !== undefined && Math.abs(v) > 0.004 ? <span style={{ fontWeight: 400 }}> ({Math.abs(pct)}%)</span> : null}
  </span>
);

/** How much of the budget is used: a bar that turns red past the whole. */
const Used = ({ pct, section }) => {
  if (pct === null || pct === undefined) return <span style={{ color: colors.textFaint }}>no budget</span>;
  const over = section === 'expense' && pct > 100;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 54, height: 6, borderRadius: 999, background: colors.tint(0.1), overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: over ? colors.dangerText : colors.primary }} /></span>
      <span style={{ fontSize: '0.72rem', color: over ? colors.dangerText : colors.textMuted }}>{pct}%</span>
    </span>
  );
};

/**
 * Budget against actual: every budgeted line against what the books show, grouped as chosen. A group opens to what it is made of (the accounts, or the cost centres), a line
 * with ledgers opens to them and each ledger opens its statement, and "By month" lays the group out month by month.
 */
export default function BudgetAgainstActualView({ result }) {
  const d = result.data;
  const A = (v) => formatAmount(v, result.format);
  const nav = useNavigate();
  const [open, setOpen] = useState({});
  const [months, setMonths] = useState({});
  if (d.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{d.message}</p>;
  const flip = (setter, k) => setter((o) => ({ ...o, [k]: !o[k] }));
  const openLedger = (id) => nav(`/admin/books?tab=reports&report=ledger&ledger=${id}`);
  const cols = 7;

  return (
    <>
      <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: colors.textMuted }}>
        <b style={{ color: colors.text }}>{d.budget}</b>: {d.version} <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: colors.tint(0.08), marginLeft: 4 }}>{STATUS[d.status] ?? d.status}</span>
        {d.status !== 'approved' && d.status !== 'locked' && <span style={{ marginLeft: 8, color: colors.warningText }}>This version is not approved yet.</span>}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 12 }}>
        {[['Income', d.totals.income], ['Expenses', d.totals.expense], ['Planned result', d.totals.result]].map(([name, t]) => (
          <div key={name} style={{ ...card, padding: '10px 14px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{name}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{A(t.actual)}</div>
            <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>of {A(t.budget)} budgeted · <Gap v={t.variance} A={A} /></div>
          </div>
        ))}
      </div>
      {d.pending && <p style={{ margin: '0 0 8px', fontSize: '0.74rem', color: colors.warningText }}>Lines for an initiative show no actual yet: the posted entries do not carry an initiative.</p>}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>{d.by_label}</th>{['Budget', 'Actual'].map((h) => <th key={h} style={{ ...th, ...num }}>{h}</th>)}<th style={{ ...th, ...num }}>Variance</th><th style={th}>Used</th><th style={{ ...th, ...num }}>Remaining</th><th style={th} />
            </tr></thead>
            <tbody>
              {d.groups.length === 0 && <tr><td colSpan={cols + 1} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>This budget has no lines with amounts in these dates.</td></tr>}
              {SECTIONS.map(([s, name]) => {
                const list = d.groups.filter((g) => g.section === s);
                if (!list.length) return null;
                return (
                  <Fragment key={s}>
                    <tr><td colSpan={cols + 1} style={{ padding: '10px 10px 2px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.textFaint }}>{name}</td></tr>
                    {list.map((g) => {
                      const k = `${s}:${g.name}`;
                      return (
                        <Fragment key={k}>
                          <tr style={{ background: open[k] ? colors.tint(0.025) : undefined }}>
                            <td style={{ ...td, fontWeight: 600 }}>
                              <button type="button" aria-expanded={Boolean(open[k])} aria-label={`Details of ${g.name}`} onClick={() => flip(setOpen, k)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, padding: 0, marginRight: 4, verticalAlign: 'middle' }}>{open[k] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                              {g.name}{g.actual_pending && <span style={{ marginLeft: 6, fontSize: '0.64rem', color: colors.warningText }}>actual pending</span>}
                            </td>
                            <td style={{ ...td, ...num }}>{A(g.budget)}</td><td style={{ ...td, ...num }}>{g.actual_pending ? '' : A(g.actual)}</td>
                            <td style={{ ...td, ...num }}>{g.actual_pending ? '' : <Gap v={g.variance} pct={g.variance_pct} A={A} />}</td>
                            <td style={td}>{g.actual_pending ? '' : <Used pct={g.used_pct} section={s} />}</td>
                            <td style={{ ...td, ...num }}>{g.actual_pending ? '' : A(g.remaining)}</td>
                            <td style={td}>{open[k] && <button type="button" onClick={() => flip(setMonths, k)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.primary, fontFamily: 'inherit', fontSize: '0.7rem' }}>{months[k] ? 'Hide months' : 'By month'}</button>}</td>
                          </tr>
                          {open[k] && g.children.map((c, i) => (
                            <Fragment key={`${k}:${i}`}>
                              <tr>
                                <td style={{ ...td, paddingLeft: 36, color: colors.textBody }}>{c.name}</td>
                                <td style={{ ...td, ...num }}>{A(c.budget)}</td><td style={{ ...td, ...num }}>{c.actual_pending ? '' : A(c.actual)}</td>
                                <td style={{ ...td, ...num }}>{c.actual_pending ? '' : <Gap v={c.variance} pct={c.variance_pct} A={A} />}</td>
                                <td style={td}>{c.actual_pending ? '' : <Used pct={c.used_pct} section={s} />}</td><td style={{ ...td, ...num }}>{c.actual_pending ? '' : A(c.remaining)}</td><td style={td} />
                              </tr>
                              {c.ledgers.filter(() => c.type === 'group' || c.ledgers.length > 0).map((l) => (
                                <tr key={`${k}:${i}:${l.id}`}>
                                  <td style={{ ...td, paddingLeft: 60, fontSize: '0.76rem' }}>
                                    <button type="button" onClick={() => openLedger(l.id)} title="Open this ledger's statement" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.primary, fontFamily: 'inherit', fontSize: 'inherit', padding: 0, textAlign: 'left' }}>{l.name}</button>
                                  </td>
                                  <td style={td} /><td style={{ ...td, ...num, fontSize: '0.76rem' }}>{A(l.actual)}</td><td colSpan={4} style={td} />
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                          {open[k] && months[k] && (
                            <tr><td colSpan={cols + 1} style={{ padding: '4px 10px 10px 36px' }}>
                              <table style={{ borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                                <thead><tr><th style={th}>Month</th><th style={{ ...th, ...num }}>Budget</th>{g.months.some((m) => m.carried_in > 0) && <><th style={{ ...th, ...num }}>Carried in</th><th style={{ ...th, ...num }}>Room</th></>}<th style={{ ...th, ...num }}>Actual</th><th style={{ ...th, ...num }}>Variance</th></tr></thead>
                                <tbody>{g.months.filter((m) => m.budget || m.actual).map((m) => {
                                  const carried = g.months.some((x) => x.carried_in > 0);
                                  const room = carried ? m.available : m.budget;
                                  return (
                                    <tr key={m.month}><td style={td}>{monthName(m.month)}</td><td style={{ ...td, ...num }}>{A(m.budget)}</td>{carried && <><td style={{ ...td, ...num }}>{m.carried_in ? A(m.carried_in) : ''}</td><td style={{ ...td, ...num }}>{A(m.available)}</td></>}<td style={{ ...td, ...num }}>{g.actual_pending ? '' : A(m.actual)}</td>
                                      <td style={{ ...td, ...num }}>{g.actual_pending ? '' : <Gap v={s === 'expense' ? room - m.actual : m.actual - room} A={A} />}</td></tr>
                                  );
                                })}</tbody>
                              </table>
                            </td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>▲ is good news (spending under budget, earnings above it); ▼ is not. Open a line to see what it is made of; click a ledger to open its statement.</p>
    </>
  );
}
