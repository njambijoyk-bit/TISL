import { Trash2, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useWishlistStore from '../../../../_shared/store/wishlistStore';
import useMoney from '../../../../_shared/hooks/useMoney';
import { servicePath } from '../../../../_shared/lib/itemPath';

/** A saved service. Services are quoted rather than carted, so the action is "View & request a quote". */
export default function ServiceWishlistItem({ item }) {
  const navigate = useNavigate();
  const { removeService } = useWishlistStore();
  const money = useMoney();
  const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/api\/?$/, '');
  const img = item.main_image_url || item.main_image;
  const src = img && (img.startsWith('http') ? img : `${API_BASE}${img}`);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 0', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
      {src && <img src={src} alt={item.name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <button onClick={() => navigate(servicePath(item))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primary-500)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name} <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 99, padding: '1px 7px', marginLeft: 6 }}>Service</span>
          </p>
        </button>
        {item.service_category && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 6px' }}>{item.service_category}</p>}
        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', margin: 0 }}>
          {money.servicePrice(item, { contactLabel: 'Contact for pricing', fromModels: ['fixed', 'project_based'], suffixes: { subscription: '/month' } })}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <button onClick={() => navigate(servicePath(item))}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'var(--color-primary-500)', color: 'white' }}>
          <FileText size={13} /> Request a quote
        </button>
        <button onClick={() => removeService(item.id)} aria-label="Remove from wishlist"
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.72rem', fontFamily: 'inherit' }}>
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </div>
  );
}
