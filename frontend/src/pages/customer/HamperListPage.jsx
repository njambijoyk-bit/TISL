import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ShoppingBag, Tag, Clock, AlertCircle } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import hampersAPI from '../../api/hampers';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

function HamperCard({ hamper, onClick }) {
  const accent     = hamper.accent_color || '#a855f7';
  const accentFade = `${accent}18`;
  const accentMid  = `${accent}35`;
  const soldOut    = hamper.is_sold_out && !hamper.is_backorderable;
  const atLimit    = hamper.at_purchase_limit;
  const unavailable = soldOut || atLimit;

  return (
    <div
      onClick={unavailable ? undefined : onClick}
      style={{
        borderRadius: 16,
        border: `1.5px solid ${accentMid}`,
        boxShadow: `0 2px 16px ${accentFade}`,
        overflow: 'hidden',
        cursor: unavailable ? 'not-allowed' : 'pointer',
        opacity: unavailable ? 0.7 : 1,
        transition: 'transform 150ms, box-shadow 150ms',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { if (!unavailable) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 28px ${accent}30`; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 2px 16px ${accentFade}`; }}
    >
      {/* Cover image */}
      <div style={{ position: 'relative', height: 200, background: accentFade, flexShrink: 0 }}>
        {hamper.cover_image ? (
          <img src={hamper.cover_image} alt={hamper.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={48} style={{ color: accent, opacity: 0.3 }} />
          </div>
        )}

        {/* Status overlays */}
        {soldOut && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ background: '#111827', color: 'white', padding: '6px 16px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em' }}>SOLD OUT</span>
          </div>
        )}
        {!soldOut && hamper.is_sold_out && hamper.is_backorderable && (
          <div style={{ position: 'absolute', top: 12, right: 12 }}>
            <span style={{ background: '#f59e0b', color: 'white', padding: '4px 10px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 800 }}>BACKORDER</span>
          </div>
        )}
        {atLimit && !soldOut && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ background: '#6b7280', color: 'white', padding: '6px 16px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800 }}>LIMIT REACHED</span>
          </div>
        )}

        {/* Accent dot */}
        <div style={{ position: 'absolute', top: 12, left: 12, width: 10, height: 10, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}` }} />
      </div>

      {/* Body */}
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', flex: 1, gap: 10 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800, color: accent }}>{hamper.name}</h3>
          {hamper.description && (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {hamper.description}
            </p>
          )}
        </div>

        {/* Items count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: accent }}>
          <ShoppingBag size={12} />
          {hamper.items?.length ?? 0} item{(hamper.items?.length ?? 0) !== 1 ? 's' : ''} included
        </div>

        {/* Validity */}
        {hamper.valid_until && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#f59e0b' }}>
            <Clock size={12} />
            Ends {new Date(hamper.valid_until).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}

        {/* Price + CTA */}
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: `1px solid ${accentFade}` }}>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, color: accent }}>{fmt(hamper.price)}</span>
          {!unavailable && (
            <button
              onClick={onClick}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: accent, color: 'white',
                boxShadow: `0 4px 12px ${accent}40`,
                transition: 'opacity 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              View Deal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HamperListPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [hampers, setHampers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login?redirect=/hampers'); return; }
    hampersAPI.getPublicHampers()
      .then(data => setHampers(Array.isArray(data) ? data : data.data ?? []))
      .catch(() => toast.error('Failed to load hampers'))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: '40px 24px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 20, background: 'rgba(168,85,247,0.08)', marginBottom: 12 }}>
            <Tag size={14} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Exclusive Deals</span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#a855f7', margin: '0 0 8px' }}>Hamper Deals</h1>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: 0 }}>Curated bundles selected just for you</p>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ width: 40, height: 40, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : hampers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <Package size={52} style={{ color: 'rgba(168,85,247,0.2)', display: 'block', margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#374151', margin: '0 0 6px' }}>No hampers available</h3>
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>Check back soon for exclusive deals</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {hampers.map(hamper => (
              <HamperCard
                key={hamper.id}
                hamper={hamper}
                onClick={() => navigate(`/hampers/${hamper.slug}`)}
              />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}