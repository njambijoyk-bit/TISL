import { useNavigate } from 'react-router-dom';
import { X, ShoppingBag, Lock } from 'lucide-react';
import useCartStore from '../../store/cartStore';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

export default function MiniCart({ isOpen, onClose }) {
  const navigate            = useNavigate();
  const { items, getTotal, removeItem } = useCartStore();

  const handleViewCart  = () => { navigate('/cart');     onClose(); };
  const handleCheckout  = () => { navigate('/checkout'); onClose(); };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,0.5)', zIndex: 40, backdropFilter: 'blur(2px)' }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: '100%', maxWidth: 420,
        background: 'white', zIndex: 50,
        boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={18} style={{ color: '#a855f7' }} />
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Cart
            </h2>
            {items.length > 0 && (
              <span style={{
                padding: '1px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
              }}>
                {items.length}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'none', color: '#9ca3af', transition: 'background 120ms, color 120ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {items.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', paddingTop: 60, gap: 12 }}>
              <ShoppingBag size={44} style={{ color: 'rgba(168,85,247,0.2)' }} />
              <p style={{ fontSize: '0.875rem', color: '#9ca3af', margin: 0 }}>Your cart is empty</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10,
                  background: '#fafafa', border: '1px solid #f3f4f6',
                }}>
                  <img
                    src={item.main_image || '/placeholder-product.png'}
                    alt={item.name}
                    style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 2px' }}>
                      Qty: {item.quantity}
                    </p>
                    <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a855f7', margin: 0 }}>
                      {fmt(item.price * item.quantity)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 7, border: 'none', cursor: 'pointer', flexShrink: 0,
                      background: 'none', color: '#fca5a5', transition: 'background 120ms, color 120ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#fca5a5'; }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>Subtotal</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#111827' }}>{fmt(getTotal())}</span>
            </div>

            <button onClick={handleCheckout} style={{
              width: '100%', padding: '12px', borderRadius: 10, fontSize: '0.875rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              boxShadow: '0 4px 14px rgba(168,85,247,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'box-shadow 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
            >
              <Lock size={14} /> Checkout
            </button>

            <button onClick={handleViewCart} style={{
              width: '100%', padding: '11px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
              border: '1.5px solid rgba(168,85,247,0.25)', color: '#7c3aed',
              background: 'rgba(168,85,247,0.04)', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.04)'}
            >
              View cart
            </button>
          </div>
        )}
      </div>
    </>
  );
}