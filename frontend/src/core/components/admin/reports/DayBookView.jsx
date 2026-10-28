import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount, UNIT_WORD } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const link = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: colors.primaryDeep };

/**
 * The day book on the engine. Each voucher once with its whole amount (one that is spread over cost centres opens to show the split), or, in the
 * cost-centre view, each allocation under its own cost centre. A voucher opens when its row is clicked. Cancelled and draft vouchers are dimmed and
 * left out of the posted total.
 */
export default function DayBookView({ result }) {
  const nav = useNavigate();
  const d = result.data;
  const fmt = result.format;
  const byCc = d.view === 'cost_centre';
  const [open, setOpen] = useState(() => new Set());
  const unit = UNIT_WORD[fmt.units];
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cols = byCc ? 8 : 7;

  return (
    <>
      {unit && <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: colors.textFaint }}>Amounts {unit}.</p>}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Date</th><th style={th}>Number</th><th style={th}>Type</th><th style={th}>Party</th>
              {byCc && <th style={th}>Cost centre</th>}
              <th style={th}>Details</th><th style={th}>Status</th><th style={{ ...th, ...num }}>Total</th>
            </tr></thead>
            <tbody>
              {d.rows.length ? d.rows.map((r, i) => {
                const split = r.split?.length ? r.split : null;
                const key = `${r.id}:${r.cost_centre_id ?? ''}:${i}`;
                return (
                  <Fragment key={key}>
                    <tr onClick={() => nav(`/admin/books/vouchers/${r.id}`)} style={{ cursor: 'pointer', opacity: r.status === 'posted' ? 1 : 0.5 }}>
                      <td style={td}>{r.date}</td>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{r.voucher_number}</td>
                      <td style={td}>{r.type}</td><td style={td}>{r.party ?? '—'}</td>
                      {byCc && <td style={td}>{r.cost_centre}</td>}
                      <td style={{ ...td, color: colors.textMuted }}>
                        {r.narration}
                        {r.identifiers?.length > 0 && <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{r.identifiers.join(' · ')}</div>}
                      </td>
                      <td style={td}>{r.status}</td>
                      <td style={{ ...td, ...num }}>
                        {split && <button type="button" style={{ ...link, marginRight: 8, fontSize: '0.72rem' }} aria-expanded={open.has(r.id)} onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>{open.has(r.id) ? '▾' : '▸'} {split.length} cost centres</button>}
                        {formatAmount(r.total, fmt)}
                      </td>
                    </tr>
                    {split && open.has(r.id) && split.map((p) => (
                      <tr key={`${key}:${p.cost_centre_id}`} style={{ background: colors.tint(0.02), opacity: r.status === 'posted' ? 1 : 0.5 }}>
                        <td style={td} /><td style={td} /><td style={td} /><td style={td} />
                        <td style={{ ...td, paddingLeft: 24 }} colSpan={2}>{p.cost_centre}</td><td style={td} />
                        <td style={{ ...td, ...num }}>{formatAmount(p.amount, fmt)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              }) : <tr><td colSpan={cols} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>No vouchers for this period.</td></tr>}
              {d.rows.length > 0 && (
                <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                  <td style={td} colSpan={cols - 1}>Posted total{d.paging?.pages > 1 ? ' (all pages)' : ''}</td>
                  <td style={{ ...td, ...num }}>{formatAmount(d.total, fmt)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {byCc && <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: colors.textMuted }}>Each row is what the debit lines of a voucher carry for that cost centre, so a voucher is never counted more than once.</p>}
    </>
  );
}
