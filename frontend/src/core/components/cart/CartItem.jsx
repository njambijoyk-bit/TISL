import { Minus, Plus, Trash2 } from 'lucide-react';
import useCartStore, { lineKey } from '../../../_shared/store/cartStore';

import { formatMoney } from '../../../_shared/lib/money';

// each line shows in the currency of the item itself, never converted
const fmtIn = (n, currency) => formatMoney(n ?? 0, currency ?? 'KES', { decimals: 'auto' });

export default function CartItem({ item }) {
  const { updateQuantity, removeItem } = useCartStore();

  const handleQuantityChange = (newQty) => {
    if (newQty < 1) removeItem(lineKey(item));
    else updateQuantity(lineKey(item), newQty);
  };

  const hasDiscount = item.original_price && parseFloat(item.original_price) > parseFloat(item.price);
  const saved       = hasDiscount ? (parseFloat(item.original_price) - parseFloat(item.price)) * item.quantity : 0;

  const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/api\/?$/, '');

  const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path; // already absolute (Unsplash etc.)
    return `${API_BASE}${path}`;
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '16px 0', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', boxShadow: '0 1px 0 color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
    }}>

      {/* Product image */}
      {item.main_image && (
        <img
          src={getImageUrl(item.main_image)} alt={item.name}
          style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }}
        />
      )}

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
          {item.preorder && <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)', color: 'var(--color-primary-600)', verticalAlign: 2 }}>Preorder{item.preorder_expected ? ` · expected by ${item.preorder_expected}` : ''}</span>}
        </p>

        {/* Chosen variant / unit */}
        {item.selectedVariant?.name && (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-primary-500)', fontWeight: 600, margin: '0 0 4px' }}>
            {item.selectedVariant.name}{item.selectedVariant.unit ? ` · ${item.selectedVariant.unit}` : ''}
          </p>
        )}

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
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primary-500)' }}>
            {fmtIn(item.price, item.currency)}
          </span>
          {hasDiscount && (
            <span style={{ fontSize: '0.72rem', color: '#ef4444', textDecoration: 'line-through' }}>
              {fmtIn(item.original_price, item.currency)}
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
              borderRadius: 8, border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)', cursor: 'pointer',
              background: 'transparent', color: 'var(--color-primary-500)', transition: 'background 120ms, border-color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)'; e.currentTarget.style.borderColor = 'var(--color-primary-500)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 30%, transparent)'; }}
          >
            <Minus size={14} />
          </button>

          <span style={{
            minWidth: 32, textAlign: 'center', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary-500)',
          }}>
            {item.quantity}
          </span>

          <button
            onClick={() => handleQuantityChange(item.quantity + 1)}
            aria-label="Increase quantity"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)', cursor: 'pointer',
              background: 'transparent', color: 'var(--color-primary-500)', transition: 'background 120ms, border-color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)'; e.currentTarget.style.borderColor = 'var(--color-primary-500)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 30%, transparent)'; }}
          >
            <Plus size={14} />
          </button>

          <button
            onClick={() => removeItem(lineKey(item))}
            aria-label="Remove item"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: '1px solid transparent', cursor: 'pointer', marginLeft: 4,
              background: 'transparent', color: '#fca5a5', transition: 'background 120ms, color 120ms, border-color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fca5a5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.borderColor = 'transparent'; }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Subtotal + savings */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary-500)' }}>
          {fmtIn(parseFloat(item.price) * item.quantity, item.currency)}
        </span>
        {hasDiscount && saved > 0 && (
          <span style={{
            fontSize: '0.68rem', fontWeight: 700, color: '#065f46',
            background: '#d1fae5', padding: '2px 8px', borderRadius: 99,
          }}>
            Saved {fmtIn(saved, item.currency)}
          </span>
        )}
      </div>
    </div>
  );
}