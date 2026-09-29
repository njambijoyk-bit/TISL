import useMoney from '../../hooks/useMoney';

/**
 * Exclusive amount, tax and total for an item sold under a taxed sales account.
 * `parts` is { net, tax, gross, info } in the shopper's currency (from useMoney().withTax / breakdown()).
 * Items with no tax treatment show just the price.
 */
export default function PriceBreakdown({ parts, style }) {
  const money = useMoney();
  if (!parts) return null;
  const { net, tax, gross, info } = parts;
  const f = (n) => money.formatIn(n, parts.symbol);
  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.85rem', color: '#4b5563' };
  const taxed = info && info.nature === 'taxable' && tax > 0;
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px 14px', background: '#f9fafb', ...style }}>
      <div style={row}><span>{taxed || info ? 'Price (excl. tax)' : 'Price'}</span><span>{f(net)}</span></div>
      {info && (
        <div style={row}>
          <span>{info.category}{taxed ? '' : info.nature === 'zero_rated' ? ' — no VAT charged' : info.nature === 'exempt' ? ' — no VAT charged' : ''}</span>
          <span>{taxed ? f(tax) : f(0)}</span>
        </div>
      )}
      <div style={{ ...row, marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb', fontWeight: 800, color: '#111827' }}>
        <span>Total</span><span>{f(gross)}</span>
      </div>
    </div>
  );
}
