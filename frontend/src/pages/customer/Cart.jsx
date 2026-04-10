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

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <Breadcrumb
          items={[
            { label: 'Shopping Cart' },
          ]}
        />

        {items.length === 0 ? (
          <EmptyCart />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4 sm:mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Shopping Cart
              </h1>
              <button
                className="clear-cart-btn px-4 py-2 rounded-lg font-medium transition-all duration-200 self-start sm:self-auto text-sm"
                onClick={() => {
                  if (confirm('Are you sure you want to clear your cart?')) {
                    clearCart();
                  }
                }}
              >
                Clear Cart
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-3 sm:space-y-4">
                {items.map((item) => (
                  <CartItem key={item.id} item={item} />
                ))}
              </div>

              {/* Cart Summary */}
              <div className="lg:col-span-1 mt-4 lg:mt-0">
                <CartSummary />
              </div>
            </div>

            {/* Continue Shopping */}
            <div className="mt-8 text-center">
              <Button
                variant="outline"
                onClick={() => navigate('/products')}
                icon={<ShoppingBag size={18} />}
              >
                Continue Shopping
              </Button>
            </div>
          </>
        )}
      </div>

      <Footer />

    </div>
  );
}
