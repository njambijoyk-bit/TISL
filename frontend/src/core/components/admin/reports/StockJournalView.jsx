import { Link } from 'react-router-dom';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}` };

/** The stock journal on the engine: every movement of stock, newest first, with what caused it; a document opens. Totals are for the rows that match. */
export default function StockJournalView({ result }) {
  const d = result.data;
  const fmt = result.format;
  if (!d.rows.length) return <p style={{ ...card, padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No movements match.</p>;

  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: colors.textMuted }}>{d.totals.movements} movement{d.totals.movements === 1 ? '' : 's'} · value {formatAmount(d.totals.value, fmt)}</p>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Date</th><th style={th}>Item</th><th style={th}>Kind</th><th style={th}>Branch</th><th style={th}>Batch</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Document</th></tr></thead>
          <tbody>{d.rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>{String(r.date).slice(0, 10)}</td>
              <td style={td}>{r.product}{r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}{r.sku ? <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{r.sku}</div> : null}</td>
              <td style={td}>{r.label}</td><td style={td}>{r.location}</td><td style={td}>{r.batch_no ?? '—'}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.quantity < 0 ? '#b91c1c' : '#15803d' }}>{r.quantity > 0 ? '+' : ''}{r.quantity}{r.unit ? ` ${r.unit}` : ''}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(r.value, fmt)}</td>
              <td style={td}>{r.voucher_id ? <Link to={`/admin/books/vouchers/${r.voucher_id}`}>{r.voucher_number}</Link> : (r.ref_type ? `${r.ref_type} #${r.ref_id}` : '—')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
