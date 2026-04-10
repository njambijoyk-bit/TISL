import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Heart, Trash2 } from 'lucide-react';

import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import WishlistItem from '../../components/wishlist/WishlistItem';
import EmptyWishlist from '../../components/wishlist/EmptyWishlist';
import useWishlistStore from '../../store/wishlistStore';

// ── Shared styles ─────────────────────────────────────────────────────────────

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  padding: 24,
};

export default function Wishlist() {
  const navigate = useNavigate();
  const { items, clearWishlist, fetchWishlistItems, loading, ids } = useWishlistStore();

  useEffect(() => {
    fetchWishlistItems();
  }, [fetchWishlistItems, ids.length]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <div style={{ flex: 1, maxWidth: 1100, margin: '0 auto', padding: '32px 20px', width: '100%' }}>

        {/* Breadcrumb */}
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: 24 }}>Wishlist</p>

        {items.length === 0 ? (
          <EmptyWishlist loading={loading} />
        ) : (
          <>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Heart size={22} style={{ color: '#ef4444' }} />
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: 0 }}>
                  Wishlist
                </h1>
                <span style={{
                  padding: '2px 9px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                  background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
                }}>
                  {items.length}
                </span>
              </div>

              <button
                onClick={() => { if (confirm('Clear your wishlist?')) clearWishlist(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
                  background: 'rgba(239,68,68,0.06)', color: '#b91c1c',
                  border: '1.5px solid rgba(239,68,68,0.2)', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
              >
                <Trash2 size={13} /> Clear wishlist
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 24, alignItems: 'start' }}>

              {/* Wishlist items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.map(item => (
                  <WishlistItem key={item.id} item={item} />
                ))}
              </div>

              {/* Sidebar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={card}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', margin: '0 0 12px', paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
                    Wishlist summary
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 16 }}>
                    <span style={{ color: '#6b7280' }}>Saved items</span>
                    <span style={{ fontWeight: 700, color: '#111827' }}>{items.length}</span>
                  </div>
                  <button
                    onClick={() => navigate('/products')}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      padding: '10px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                      border: '1.5px solid rgba(168,85,247,0.3)', color: '#7c3aed',
                      background: 'rgba(168,85,247,0.05)', cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.05)'}
                  >
                    <ShoppingBag size={15} /> Continue shopping
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}