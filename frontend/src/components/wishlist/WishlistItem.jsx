import { Trash2, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useWishlistStore from '../../store/wishlistStore';
import useCartStore from '../../store/cartStore';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

export default function WishlistItem({ item }) {
  const navigate    = useNavigate();
  const { remove }  = useWishlistStore();
  const { addItem } = useCartStore();

  const hasDiscount = item.originalprice && parseFloat(item.originalprice) > parseFloat(item.price);

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

        {/* Name — clickable */}
        <button
          onClick={() => navigate(`/products/${item.id}`)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            textAlign: 'left', fontFamily: 'inherit', width: '100%',
          }}
        >
          <p style={{
            fontSize: '0.875rem', fontWeight: 600, color: '#a855f7', margin: '0 0 4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            transition: 'color 150ms',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#34065f'}
            onMouseLeave={e => e.currentTarget.style.color = '#a855f7'}
          >
            {item.name}
          </p>
        </button>

        {/* Brand + SKU */}
        {(item.brand || item.sku) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#9ca3af', marginBottom: 6 }}>
            {item.brand && <span>Brand: {item.brand?.name ?? item.brand}</span>}
            {item.brand && item.sku && <span>·</span>}
            {item.sku  && <span>SKU: {item.sku}</span>}
          </div>
        )}

        {/* Price */}
        {item.price != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#a855f7' }}>
              {fmt(item.price)}
            </span>
            {hasDiscount && (
              <span style={{ fontSize: '0.72rem', color: '#ef4444', textDecoration: 'line-through' }}>
                {fmt(item.originalprice)}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => addItem(item, 1)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600,
              border: '1.5px solid rgba(168,85,247,0.25)', color: '#7c3aed',
              background: 'rgba(168,85,247,0.05)', cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 150ms, border-color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.12)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.05)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)'; }}
          >
            <ShoppingCart size={14} /> Add to cart
          </button>

          <button
            onClick={() => remove(item.id)}
            aria-label="Remove from wishlist"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'transparent', color: '#fca5a5', transition: 'background 120ms, color 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#fca5a5'; }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}