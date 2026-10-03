import { formatMoney } from '../../lib/money';

const n2 = (v) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SOURCE = { tier: 'Tier discount', customer_type: 'Customer discount', personal: 'Personal discount', referral: 'Referral discount', promo: 'Promo code' };

/**
 * The money, laid out like a voucher: Particulars on the left, amounts in a right-hand column, the total ruled off at the
 * bottom. Everything comes from the checkout quote, so it is always what the books will post.
 */
export default function SummaryLedger({ quote, showCustomer = true }) {
  if (!quote) return null;
  const sym = quote.currency?.symbol || quote.currency?.code || '';
  const charges = (quote.lines ?? []).filter((l) => l.item_type === 'charge');
  const chargeTotal = charges.reduce((t, l) => t + Number(l.amount || 0), 0);
  const net = Number(quote.subtotal) - chargeTotal;
  const off = (quote.discounts ?? []).reduce((t, d) => t + Number(d.amount || 0), 0);
  const gross = net + off;
  const c = quote.customer;
  // name the goods by what is actually on the order: products, services, or both
  const kinds = new Set((quote.lines ?? []).filter((l) => l.item_type !== 'charge').map((l) => (String(l.item_type).includes('service') ? 'service' : 'product')));
  const goods = kinds.size === 0 ? 'Goods' : kinds.size === 2 ? 'Goods and services' : kinds.has('service') ? 'Services' : 'Goods';
  const cell = { padding: '8px 14px', fontSize: '0.86rem', color: 'var(--text-primary)' };
  const amt = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const row = (key, label, value, extra = {}) => (
    <tr key={key} style={extra.rule ? { borderTop: '1.5px solid var(--text-tertiary)' } : undefined}>
      <td style={{ ...cell, paddingLeft: extra.indent ? 30 : 14, color: extra.color ?? (extra.total ? 'var(--color-primary-500)' : 'var(--text-primary)'), fontWeight: extra.bold ? 800 : 400, fontStyle: extra.italic ? 'italic' : 'normal' }}>{label}</td>
      <td style={{ ...amt, color: extra.color ?? (extra.total ? 'var(--color-primary-500)' : 'var(--text-primary)'), fontWeight: extra.bold ? 800 : 400 }}>{value}</td>
    </tr>
  );
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', overflow: 'hidden' }}>
      {showCustomer && c && (
        <div style={{ padding: '10px 14px', background: 'var(--surface-input)', borderBottom: '1px solid var(--line)', fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span><strong style={{ color: 'var(--text-primary)' }}>{c.name}</strong></span>
          {c.tier && <span>Tier <strong>{c.tier}</strong>{c.tier_discount > 0 && ` · ${c.tier_discount}% off`}{c.points_multiplier > 1 && ` · ${c.points_multiplier}× points`}</span>}
          {c.customer_type && <span>{c.customer_type}</span>}
          <span>{c.points} points</span>
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}><th style={{ ...cell, textAlign: 'left', fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>Particulars</th><th style={{ ...amt, fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>Amount</th></tr>
        </thead>
        <tbody>
          {off > 0 ? row('gross', `${goods} at list price`, n2(gross)) : null}
          {(quote.discounts ?? []).map((d, i) => row(`d${i}`, d.source === 'customer_type' && !d.ref ? 'Less: Personal discount' : `Less: ${SOURCE[d.source] ?? d.source}${d.ref ? ` (${d.ref})` : ''}`, `−${n2(d.amount)}`, { indent: true, color: '#059669' }))}
          {row('net', off > 0 ? `${goods} after discounts` : goods, n2(net), { rule: off > 0, bold: off > 0 })}
          {charges.map((l, i) => row(`c${i}`, l.description, Number(l.amount) === 0 ? 'Free' : n2(l.amount)))}
          {(quote.tax_breakdown ?? []).map((t, i) => row(`t${i}`, t.percent != null && !String(t.label).includes('%') ? `${t.label} ${Number(t.percent)}%` : t.label, n2(t.amount)))}
          {row('total', 'Total', formatMoney(quote.total, sym), { rule: true, bold: true, total: true })}
          {quote.gift && row('gift', `Less: gift voucher (${quote.gift.code})`, `−${n2(quote.gift.applied)}`, { indent: true, color: '#059669' })}
          {quote.gift && row('due', 'To pay now', formatMoney(quote.due_now, sym), { rule: true, bold: true })}
        </tbody>
      </table>
    </div>
  );
}
