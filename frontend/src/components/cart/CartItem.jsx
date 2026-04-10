import { Minus, Plus, Trash2 } from 'lucide-react';
import useCartStore from '../../store/cartStore';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

export default function CartItem({ item }) {
  const { updateQuantity, removeItem } = useCartStore();

  const handleQuantityChange = (newQty) => {
    if (newQty < 1) removeItem(item.id);
    else updateQuantity(item.id, newQty);
  };

  const hasDiscount = item.original_price && parseFloat(item.original_price) > parseFloat(item.price);
  const saved       = hasDiscount ? (parseFloat(item.original_price) - parseFloat(item.price)) * item.quantity : 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '16px 0', borderBottom: '1px solid #f3f4f6',
    }}>

      {/* Product image */}
      {item.main_image && (
        <img
          src={item.main_image} alt={item.name}
          style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }}
        />
      )}

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </p>

        {/* Brand + SKU */}
        {(item.brand || item.sku) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#9ca3af', marginBottom: 6 }}>
            {item.brand && <span>Brand: {typeof item.brand === 'object' ? item.brand.name : item.brand}</span>}
            {item.brand && item.sku && <span>·</span>}
            {item.sku  && <span>SKU: {item.sku}</span>}
          </div>
        )}

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#a855f7' }}>
            {fmt(item.price)}
          </span>
          {hasDiscount && (
            <span style={{ fontSize: '0.72rem', color: '#ef4444', textDecoration: 'line-through' }}>
              {fmt(item.original_price)}
            </span>
          )}
        </div>

        {/* Quantity controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => handleQuantityChange(item.quantity - 1)}
            aria-label="Decrease quantity"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#f3f4f6', color: '#6b7280', transition: 'background 120ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
          >
            <Minus size={14} />
          </button>

          <span style={{
            minWidth: 32, textAlign: 'center', fontSize: '0.875rem', fontWeight: 700,
          }}>
            {item.quantity}
          </span>

          <button
            onClick={() => handleQuantityChange(item.quantity + 1)}
            aria-label="Increase quantity"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#f3f4f6', color: '#6b7280', transition: 'background 120ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
          >
            <Plus size={14} />
          </button>

          <button
            onClick={() => removeItem(item.id)}
            aria-label="Remove item"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', cursor: 'pointer', marginLeft: 4,
              background: 'transparent', color: '#fca5a5', transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#fca5a5'; }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Subtotal + savings */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#a855f7' }}>
          {fmt(parseFloat(item.price) * item.quantity)}
        </span>
        {hasDiscount && saved > 0 && (
          <span style={{
            fontSize: '0.68rem', fontWeight: 700, color: '#065f46',
            background: '#d1fae5', padding: '2px 8px', borderRadius: 99,
          }}>
            Saved {fmt(saved)}
          </span>
        )}
      </div>
    </div>
  );
}