import useMoney from '../../hooks/useMoney';

/**
 * Exclusive amount, tax and total for an item sold under a taxed sales account.
 * `parts` is { net, tax, gross, info } in the shopper's currency (from useMoney().withTax / breakdown()).
 * Items with no tax treatment show just the price.
 */
export default function PriceBreakdown({ parts, style, onLight = false }) {
  const money = useMoney();
  if (!parts) return null;
  const { net, tax, gross, info } = parts;
  const f = (n) => money.formatIn(n, parts.symbol);
  // onLight: the box sits on a fixed white surface, so use fixed dark text instead of the theme's
  const ink = onLight ? '#111827' : 'var(--text-primary)';
  const soft = onLight ? '#4b5563' : 'var(--text-secondary)';
  const rule = onLight ? '#e5e7eb' : 'var(--line)';
  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.85rem', color: soft };
  const taxed = info && info.nature === 'taxable' && tax > 0;
  return (
    <div style={{ border: `1px solid ${rule}`, borderRadius: 12, padding: '10px 14px', background: onLight ? '#fff' : 'var(--surface-input)', ...style }}>
      <div style={row}><span>{taxed || info ? 'Price (excl. tax)' : 'Price'}</span><span>{f(net)}</span></div>
      {info && (
        <div style={row}>
          <span>{info.category}{taxed ? '' : info.nature === 'zero_rated' ? ' — no VAT charged' : info.nature === 'exempt' ? ' — no VAT charged' : ''}</span>
          <span>{taxed ? f(tax) : f(0)}</span>
        </div>
      )}
      <div style={{ ...row, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${rule}`, fontWeight: 800, color: ink }}>
        <span>Total</span><span>{f(gross)}</span>
      </div>
    </div>
  );
}
