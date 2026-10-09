
import './customer.css';

import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import Breadcrumb from '../../../_shared/components/layout/Breadcrumb';
import CartItem from '../../components/cart/CartItem';
import CartSummary from '../../components/cart/CartSummary';
import EmptyCart from '../../components/cart/EmptyCart';
import Button from '../../../_shared/components/common/Button';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useCartStore } from '../../../_shared/store/index';
import useCartVariantCheck from '../../components/cart/useCartVariantCheck';

export default function Cart() {
  const { items, clearCart } = useCartStore();
  const variants = useCartVariantCheck();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const ready = items.filter((i) => !i.preorder);
  const pre = items.filter((i) => i.preorder);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumb
          items={[
            { label: 'Shopping Cart' },
          ]}
        />

        {items.length === 0 ? (
          <EmptyCart />
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Shopping Cart
              </h1>
              <button
                className="clear-cart-btn px-4 py-2 rounded-lg font-medium transition-all duration-200"
                onClick={() => {
                  if (confirm('Are you sure you want to clear your cart?')) {
                    clearCart();
                  }
                }}
              >
                Clear Cart
              </button>
            </div>

            {variants.unresolved.length > 0 && (
              <div role="alert" style={{ margin: '0 0 16px', padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
                <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.88rem' }}>Choose an option before you check out</p>
                {variants.unresolved.map((n) => (
                  <div key={n.item.line_key ?? n.item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: '0.85rem' }}>
                    <span>{n.item.name} has {n.data.variants.length} options.</span>
                    <button type="button" onClick={() => variants.choose(n)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, color: 'white', background: 'var(--color-primary-500)' }}>Choose</button>
                  </div>
                ))}
              </div>
            )}

            {ready.length > 0 && pre.length > 0 && (
              <div role="note" style={{ margin: '0 0 20px', padding: '14px 16px', borderRadius: 12, background: 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>Ready-now items and a preorder in one go</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>One checkout, one payment. You get two orders: the ready-now items are delivered first, the preorder when it arrives. Each is delivered and charged for on its own. (Gift vouchers and paying on account are for separate checkouts.)</span>
                </div>
                <button type="button" disabled={variants.blocked}
                  onClick={() => { if (variants.blocked) return; navigate(isAuthenticated ? '/checkout?together=1' : '/login?redirect=/checkout%3Ftogether%3D1'); }}
                  style={{ padding: '10px 18px', borderRadius: 10, border: 'none', fontWeight: 800, fontFamily: 'inherit', color: 'white', background: 'var(--color-primary-500)', cursor: variants.blocked ? 'not-allowed' : 'pointer', opacity: variants.blocked ? 0.6 : 1 }}>
                  Check out everything together
                </button>
              </div>
            )}

            {ready.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Cart Items */}
                <div className="lg:col-span-2 space-y-4">
                  {pre.length > 0 && <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ready now</h2>}
                  {ready.map((item) => (
                    <CartItem key={item.line_key ?? item.id} item={item} />
                  ))}
                </div>

                {/* Cart Summary */}
                <div className="lg:col-span-3">
                  <CartSummary blocked={variants.blocked} />
                </div>
              </div>
            )}

            {pre.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ marginTop: ready.length > 0 ? 40 : 0 }}>
                <div className="lg:col-span-2 space-y-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Preorder</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>These are not in stock yet. You pay in full when you order and we deliver as soon as they arrive. Check them out on their own below, or together with your ready-now items above.</p>
                  {pre.map((item) => (
                    <CartItem key={item.line_key ?? item.id} item={item} />
                  ))}
                </div>
                <div className="lg:col-span-3">
                  <CartSummary blocked={variants.blocked} preorder />
                </div>
              </div>
            )}

          </>
        )}
      </div>

      {variants.chooser}
      <Footer />

    </div>
  );
}
