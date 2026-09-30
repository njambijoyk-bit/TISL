import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShoppingBag, Truck } from 'lucide-react';
import useCartStore from '../../../_shared/store/cartStore';
import useAuthStore from '../../../_shared/store/authStore';
import useCurrencyStore from '../../../_shared/store/currencyStore';
import checkoutAPI from '../../../_shared/api/checkout';
import { toApiItem } from '../../../_shared/lib/cartItems';

const fmtIn = (n, code) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: code || 'KES', minimumFractionDigits: 0 });

export default function CartSummary() {
  const navigate        = useNavigate();
  const { items, getTotal } = useCartStore();
  const { isAuthenticated } = useAuthStore();

  const displayCurrency = useCurrencyStore((s) => s.displayCurrency);

  // The books price the cart: prices are tax-exclusive and the tax is whatever the item's sales ledger says ("VAT 16%").
  const [quote, setQuote] = useState(null);
  useEffect(() => {
    if (!items.length) { setQuote(null); return undefined; }
    const t = setTimeout(() => {
      checkoutAPI.quote({ items: items.map(toApiItem), currency: displayCurrency || undefined }).then(setQuote).catch(() => setQuote(null));
    }, 300);
    return () => clearTimeout(t);
  }, [items, displayCurrency]);

  const fmt = (n) => fmtIn(n, quote?.currency?.code);
  const subtotal     = quote ? Number(quote.subtotal) : getTotal();
  const freeShipping = subtotal >= 50000;
  const toFree       = 50000 - subtotal;

  const handleCheckout = () => {
    navigate(isAuthenticated ? '/checkout' : '/login?redirect=/checkout');
  };

  return (
    <div style={{
      background: 'white', borderRadius: 12,
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
      padding: 24, position: 'sticky', top: 96,
    }}>
      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', margin: '0 0 16px', paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
        Order summary
      </p>

      {/* Line items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {[
          { label: `Subtotal (${items.length} item${items.length !== 1 ? 's' : ''})`, value: fmt(subtotal) },
          ...(quote ? (quote.tax_breakdown ?? []).map((t) => ({ label: t.label, value: fmt(t.amount) })) : [{ label: 'Tax', value: '…' }]),
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
            <span style={{ color: '#6b7280' }}>{label}</span>
            <span style={{ fontWeight: 600, color: '#374151' }}>{value}</span>
          </div>
        ))}
        {/* Shipping row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
          <span style={{ color: '#6b7280' }}>Shipping</span>
          <span style={{ fontWeight: 600, color: freeShipping ? '#22c55e' : '#9ca3af', fontStyle: freeShipping ? 'normal' : 'italic' }}>
            {freeShipping ? 'FREE' : 'Calculated at checkout'}
          </span>
        </div>
      </div>

      {/* Free shipping progress */}
      {!freeShipping && toFree > 0 && (
        <div style={{
          padding: '9px 12px', borderRadius: 8, marginBottom: 14,
          background: 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Truck size={13} style={{ color: 'var(--color-primary-500)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.72rem', color: 'var(--color-primary-600)', margin: 0 }}>
            Add <strong>{fmt(toFree)}</strong> more for free shipping
          </p>
        </div>
      )}

      {/* Total */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        paddingTop: 12, marginBottom: 18, borderTop: '1px solid #e5e7eb',
      }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827' }}>Total</span>
        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>{quote ? fmt(quote.total) : '…'}</span>
      </div>

      {/* Checkout */}
      <button onClick={handleCheckout} style={{
        width: '100%', padding: '12px', borderRadius: 10, fontSize: '0.875rem', fontWeight: 700,
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
        boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transition: 'box-shadow 150ms',
      }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px color-mix(in srgb, var(--color-primary-500) 50%, transparent)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)'}
      >
        <Lock size={14} /> Proceed to checkout
      </button>

      {/* Continue shopping */}
      <button onClick={() => navigate('/products')} style={{
        width: '100%', marginTop: 10, padding: '11px',
        borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
        border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', color: 'var(--color-primary-600)',
        background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)', cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transition: 'background 150ms',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'}
        onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)'}
      >
        <ShoppingBag size={14} /> Continue shopping
      </button>
    </div>
  );
}