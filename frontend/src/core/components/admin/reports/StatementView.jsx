import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount, UNIT_WORD } from './engineFmt';
import { foldableKeys, initiallyFolded, variance, visibleRows } from './statementRows';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '7px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const btn = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left' };

const monthLabel = (c) => (c === 'total' ? 'Total' : c);

/**
 * The P&L and the balance sheet on the engine: rows that fold (sections, lines, ledgers), one column for the period or one per month, and, when a
 * comparison is asked for, the earlier figure with the change and the percentage. A ledger opens its statement.
 */
export default function StatementView({ result }) {
  const nav = useNavigate();
  const d = result.data;
  const fmt = result.format;
  const rows = useMemo(() => d.rows ?? [], [d.rows]);
  const before = useMemoMap(result.compare?.data?.rows);
  const [collapsed, setCollapsed] = useState(() => initiallyFolded(rows));
  const [seen, setSeen] = useState(rows);
  if (seen !== rows) { setSeen(rows); setCollapsed(initiallyFolded(rows)); }   // a new run starts folded the same way

  if (d.ready === false) return <div role="note" style={{ ...card, padding: 14, fontSize: '0.8rem', color: colors.warningText }}>{d.message}</div>;

  const cols = d.columns ?? ['total'];
  const comparing = !!result.compare && cols.length === 1;
  const shown = visibleRows(rows, collapsed);
  const unit = UNIT_WORD[fmt.units];
  const toggle = (key) => setCollapsed((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const allOpen = collapsed.size === 0;
  const open = (r) => r.ledger_id && nav(`/admin/books?tab=reports&report=ledger&ledger=${r.ledger_id}`);
  const strong = (r) => r.type === 'heading' || r.type === 'subtotal' || r.type === 'total';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {unit && <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>Amounts {unit}.</span>}
        <span style={{ flex: 1 }} />
        <button type="button" style={{ ...btn, fontSize: '0.75rem', color: colors.primaryDeep }} onClick={() => setCollapsed(allOpen ? new Set(foldableKeys(rows)) : new Set())}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
      </div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Particulars</th>
              {cols.map((c) => <th key={c} style={{ ...th, ...num }}>{monthLabel(c)}</th>)}
              {comparing && <><th style={{ ...th, ...num }}>{compareLabel(result.compare)}</th><th style={{ ...th, ...num }}>Change</th><th style={{ ...th, ...num }}>%</th></>}
            </tr></thead>
            <tbody>
              {shown.length ? shown.map((r) => {
                const foldable = r.expandable;
                const prev = before.get(r.key)?.amounts?.total ?? 0;
                const v = comparing ? variance(r.amounts.total, prev) : null;
                return (
                  <tr key={r.key} onClick={() => open(r)} style={{ cursor: r.ledger_id ? 'pointer' : 'default', fontWeight: strong(r) ? 700 : 400, background: r.type === 'total' ? colors.tint(0.05) : r.type === 'subtotal' ? colors.tint(0.03) : undefined, fontStyle: r.placeholder ? 'italic' : undefined }}>
                    <td style={{ ...td, paddingLeft: 12 + r.depth * 18 }}>
                      {foldable
                        ? <button type="button" style={btn} aria-expanded={!collapsed.has(r.key)} onClick={(e) => { e.stopPropagation(); toggle(r.key); }}>{collapsed.has(r.key) ? '▸' : '▾'} {r.name}</button>
                        : r.name}
                    </td>
                    {cols.map((c) => <td key={c} style={{ ...td, ...num }}>{formatAmount(r.amounts[c], fmt)}</td>)}
                    {comparing && <>
                      <td style={{ ...td, ...num }}>{formatAmount(prev, fmt)}</td>
                      <td style={{ ...td, ...num }}>{formatAmount(v.change, fmt)}</td>
                      <td style={{ ...td, ...num }}>{v.pct === null ? '—' : `${v.pct}%`}</td>
                    </>}
                  </tr>
                );
              }) : <tr><td colSpan={cols.length + 1} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>Nothing posted for this period.</td></tr>}
              {d.totals?.liabilities_and_equity !== undefined && cols.length === 1 && [['Total assets', 'assets'], ['Total liabilities and equity', 'liabilities_and_equity']].map(([label, k]) => {
                const prev = result.compare?.data?.totals?.[k] ?? 0;
                const v = comparing ? variance(d.totals[k], prev) : null;
                return (
                  <tr key={k} style={{ fontWeight: 700, background: colors.tint(0.05) }}>
                    <td style={td}>{label}</td><td style={{ ...td, ...num }}>{formatAmount(d.totals[k], fmt)}</td>
                    {comparing && <><td style={{ ...td, ...num }}>{formatAmount(prev, fmt)}</td><td style={{ ...td, ...num }}>{formatAmount(v.change, fmt)}</td><td style={{ ...td, ...num }}>{v.pct === null ? '—' : `${v.pct}%`}</td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {d.margins && (
        <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: colors.textMuted }}>
          Gross margin {pct(d.margins.gross.total)} · Net margin {pct(d.margins.net.total)}
        </p>
      )}
      {d.retained && (
        <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: colors.textMuted }}>
          Retained earnings: {formatAmount(d.retained.prior, fmt)} from previous years and {formatAmount(d.retained.current, fmt)} this year (financial year starts {d.year_start}).
        </p>
      )}
      {d.opening_difference ? (
        <div role="note" style={{ ...card, padding: 12, marginTop: 10, fontSize: '0.8rem' }}>
          Opening balances differ by {formatAmount(Math.abs(d.opening_difference), fmt)}. The difference sits on the {d.opening_difference > 0 ? 'liabilities' : 'assets'} side as a placeholder, so the sheet can balance, until the opposite opening balance is entered.
        </div>
      ) : null}
      {d.unclassified > 0 && (
        <div role="note" style={{ ...card, padding: 12, marginTop: 10, fontSize: '0.8rem', color: colors.warningText }}>
          {d.unclassified} ledger{d.unclassified === 1 ? ' is' : 's are'} on no statement line, shown apart and still counted in the totals. Give {d.unclassified === 1 ? 'it' : 'them'} a line in Books → Accounts.
        </div>
      )}
      {d.balanced === false && (
        <div role="alert" style={{ ...card, padding: 12, marginTop: 10, fontSize: '0.8rem', color: colors.dangerText }}>
          <strong>The balance sheet does not balance: assets are {formatAmount(d.totals.assets, fmt)} and liabilities with equity are {formatAmount(d.totals.liabilities_and_equity, fmt)}.</strong>
        </div>
      )}
      {d.paid_not_delivered && (
        <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: colors.textMuted }}>
          {d.paid_not_delivered.lines} pre-order line{d.paid_not_delivered.lines === 1 ? ' is' : 's are'} paid but not yet delivered, so not counted as revenue.
        </p>
      )}
    </>
  );
}

function useMemoMap(rows) {
  return useMemo(() => new Map((rows ?? []).map((r) => [r.key, r])), [rows]);
}

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

function compareLabel(c) {
  const when = c.from ? `${c.from} to ${c.to}` : c.to;
  return c.mode === 'previous_year' ? `Last year (${when})` : `Before (${when})`;
}
