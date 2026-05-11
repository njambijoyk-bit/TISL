import { useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';

import './customer.css';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumb from '../../components/layout/Breadcrumb';
import CartItem from '../../components/cart/CartItem';
import CartSummary from '../../components/cart/CartSummary';
import EmptyCart from '../../components/cart/EmptyCart';
import Button from '../../components/common/Button';
import { useCartStore } from '../../store';

export default function Cart() {
  const navigate = useNavigate();
  const { items, clearCart } = useCartStore();

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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-4">
                {items.map((item) => (
                  <CartItem key={item.id} item={item} />
                ))}
              </div>

              {/* Cart Summary */}
              <div className="lg:col-span-1">
                <CartSummary />
              </div>
            </div>

            <div className="mt-8 text-center">
              <button
                onClick={() => navigate('/products')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 24px',
                  borderRadius: '12px',
                  border: '1px solid rgba(168,85,247,0.4)',
                  background: 'transparent',
                  color: '#a855f7',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(168,85,247,0.08)';
                  e.currentTarget.style.borderColor = '#a855f7';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)';
                }}
              >
                <ShoppingBag size={18} />
                Continue Shopping
              </button>
            </div>
          </>
        )}
      </div>

      <Footer />

    </div>
  );
}
