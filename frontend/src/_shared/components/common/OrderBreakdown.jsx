import { formatMoney } from '../../lib/money';

/**
 * An order as the voucher shows it: Item | Variant | Qty | Rate | Amount | Tax (with the ledger's tax rate), then
 * Subtotal / tax / total and the Total with the operating currency's symbol. `quote` is the checkout quote.
 * Optional rows (discounts, gift vouchers) come from the quote too.
 */
const n2 = (v) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrderBreakdown({ quote, children }) {
  if (!quote) return null;
  const sym = quote.currency?.symbol || quote.currency?.code || '';
  const lines = (quote.lines ?? []).filter((l) => !l.is_header || l.amount != null);
  const th = { textAlign: 'left', padding: '10px 14px', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af' };
  const r = { textAlign: 'right' };
  const td = { padding: '13px 14px', fontSize: '0.9rem', color: '#111827', borderTop: '1px solid #f3f4f6', verticalAlign: 'top' };
  const foot = { ...td, fontWeight: 800, background: '#faf9ff' };
  const taxCell = (l) => (Number(l.tax_amount) ? `${n2(l.tax_amount)}${l.tax_rate_percent != null ? ` (${Number(l.tax_rate_percent)}%)` : ''}` : '');
  return (
    <div style={{ overflowX: 'auto', borderRadius: 14, background: 'white', border: '1px solid #e5e7eb' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead>
          <tr><th style={th}>Item</th><th style={th}>Variant</th><th style={{ ...th, ...r }}>Qty</th><th style={{ ...th, ...r }}>Rate</th><th style={{ ...th, ...r }}>Amount</th><th style={{ ...th, ...r }}>Tax</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={td}>{l.description}</td>
              <td style={td}>{l.variant_label && l.variant_label !== 'Standard' ? l.variant_label : ''}</td>
              <td style={{ ...td, ...r }}>{l.item_type === 'charge' ? '' : `${Number(l.quantity)}${l.unit_code ? ` ${l.unit_code}` : ''}`}</td>
              <td style={{ ...td, ...r }}>{l.item_type === 'charge' ? '' : n2(l.rate)}</td>
              <td style={{ ...td, ...r }}>{Number(l.amount) === 0 && l.item_type === 'charge' ? 'Free' : n2(l.amount)}</td>
              <td style={{ ...td, ...r }}>{taxCell(l)}</td>
            </tr>
          ))}
          {(quote.discounts ?? []).map((d, i) => (
            <tr key={`d${i}`}><td style={{ ...td, color: '#059669' }} colSpan={4}>Discount — {String(d.source).replace('_', ' ')}{d.ref ? ` (${d.ref})` : ''}</td><td style={{ ...td, ...r, color: '#059669' }}>−{n2(d.amount)}</td><td style={td} /></tr>
          ))}
          <tr>
            <td style={foot} colSpan={4}>Subtotal / tax / total</td>
            <td style={{ ...foot, ...r }}>{n2(quote.subtotal)}</td>
            <td style={{ ...foot, ...r }}>{n2(quote.tax_total)}</td>
          </tr>
          {quote.gift && (
            <tr><td style={{ ...td, color: '#059669' }} colSpan={4}>Gift voucher{quote.gift.vouchers?.length > 1 ? 's' : ''} ({quote.gift.code})</td><td style={{ ...td, ...r, color: '#059669' }}>−{n2(quote.gift.applied)}</td><td style={td} /></tr>
          )}
          <tr>
            <td style={{ ...foot, fontSize: '1rem' }} colSpan={4}>{quote.gift ? 'To pay now' : 'Total'}</td>
            <td style={{ ...foot, ...r, fontSize: '1rem' }} colSpan={2}>{formatMoney(quote.gift ? quote.due_now : quote.total, sym)}</td>
          </tr>
        </tbody>
      </table>
      {children}
    </div>
  );
}
