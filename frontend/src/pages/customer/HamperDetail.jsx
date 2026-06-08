import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Package, ShoppingBag, Clock, Lock, ChevronLeft, AlertCircle, CheckCircle } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import hampersAPI from '../../api/hampers';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

export default function HamperDetail() {
  const { slug }              = useParams();
  const navigate              = useNavigate();
  const { isAuthenticated }   = useAuthStore();
  const [hamper, setHamper]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) { navigate(`/login?redirect=/hampers/${slug}`); return; }
    hampersAPI.getPublicHamper(slug)
      .then(data => setHamper(data))
      .catch(err => {
        if (err?.response?.status === 403) {
          setBlocked({ message: err.response.data.message, status: err.response.data.status });
        } else {
          toast.error('Failed to load hamper');
          navigate('/hampers');
        }
      })
      .finally(() => setLoading(false));
  }, [slug, isAuthenticated]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (blocked) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock size={28} style={{ color: '#ef4444' }} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Offer Not Available</h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
            {blocked.message || 'This offer is not available to your account.'}
          </p>
          <button
            onClick={() => navigate('/hampers')}
            style={{ padding: '10px 24px', borderRadius: 10, fontSize: '0.875rem', fontWeight: 700, border: 'none', background: '#111827', color: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Browse Other Deals
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );

  if (!hamper) return null;

  const accent      = hamper.accent_color || '#a855f7';
  const accentFade  = `${accent}12`;
  const accentMid   = `${accent}30`;
  const soldOut     = hamper.is_sold_out && !hamper.is_backorderable;
  const atLimit     = hamper.at_purchase_limit;
  const canPurchase = hamper.can_purchase;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <style>{`
        .hamper-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 32px;
          align-items: start;
        }
        .hamper-sticky {
          position: sticky;
          top: 96px;
        }
        @media (max-width: 768px) {
          .hamper-grid {
            grid-template-columns: 1fr;
          }
          .hamper-sticky {
            position: static;
          }
        }
      `}</style>

      <div style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '32px 24px' }}>

        {/* Breadcrumb */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 600, marginBottom: 24 }}>
          <button
            onClick={() => navigate('/hampers')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onMouseEnter={e => e.currentTarget.style.color = accent}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          >
            <ChevronLeft size={14} /> Deals
          </button>
          <span style={{ color: '#d1d5db' }}>/</span>
          <span style={{ color: accent }}>{hamper.name}</span>
        </nav>

        <div className="hamper-grid">

          {/* ── Left col ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Cover image */}
            <div style={{ borderRadius: 20, overflow: 'hidden', border: `2px solid ${accentMid}`, background: accentFade, aspectRatio: '16/9', position: 'relative' }}>
              {hamper.cover_image ? (
                <img src={hamper.cover_image} alt={hamper.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={64} style={{ color: accent, opacity: 0.2 }} />
                </div>
              )}
              {soldOut && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ background: '#111827', color: 'white', padding: '8px 20px', borderRadius: 20, fontSize: '0.875rem', fontWeight: 800, letterSpacing: '0.06em' }}>SOLD OUT</span>
                </div>
              )}
            </div>

            {/* What's included */}
            <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${accentMid}`, padding: 24 }}>
              <h2 style={{ margin: '0 0 18px', fontSize: '1rem', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, borderBottom: `1px solid ${accentFade}` }}>
                <ShoppingBag size={18} style={{ color: accent }} />
                What's Included
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(hamper.items ?? []).map((item, i) => {
                  const snap = item.snapshot || {};
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, background: accentFade, border: `1px solid ${accentMid}` }}>
                      {snap.main_image ? (
                        <img src={snap.main_image} alt={snap.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 48, height: 48, borderRadius: 8, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Package size={20} style={{ color: accent, opacity: 0.4 }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 2px', fontSize: '0.875rem', fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snap.name || 'Product'}</p>
                        {snap.description && <p style={{ margin: 0, fontSize: '0.72rem', color: '#6b7280' }}>{snap.description}</p>}
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: accent }}>x{item.quantity}</span>
                        {snap.price && <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{fmt(snap.price)} each</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right col (sticky on desktop) ─────────────────────────────── */}
          <div className="hamper-sticky">
            <div style={{ background: 'white', borderRadius: 20, border: `1.5px solid ${accentMid}`, boxShadow: `0 4px 24px ${accentFade}`, padding: 28 }}>

              {/* Accent bar */}
              <div style={{ height: 4, borderRadius: 4, background: `linear-gradient(90deg, ${accent}, ${accent}80)`, marginBottom: 20 }} />

              <h1 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: 900, color: '#111827' }}>{hamper.name}</h1>

              {hamper.description && (
                <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6 }}>{hamper.description}</p>
              )}

              {/* Price */}
              <div style={{ margin: '0 0 20px', padding: '16px 20px', borderRadius: 12, background: accentFade, border: `1px solid ${accentMid}` }}>
                <p style={{ margin: '0 0 2px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>Bundle Price</p>
                <p style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: accent, lineHeight: 1 }}>{fmt(hamper.price)}</p>
              </div>

              {/* Validity */}
              {hamper.valid_until && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <Clock size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#92400e' }}>
                    Deal ends {new Date(hamper.valid_until).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              )}

              {/* Backorder notice */}
              {hamper.is_sold_out && hamper.is_backorderable && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <AlertCircle size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#92400e' }}>Currently on backorder — order now to reserve yours</p>
                </div>
              )}

              {/* Perks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 24 }}>
                {[
                  hamper.allow_promo_codes   && 'Promo codes accepted',
                  hamper.allow_store_credit  && 'Store credit accepted',
                  hamper.earn_loyalty_points && 'Earn loyalty points',
                  hamper.apply_vat           && 'VAT inclusive pricing',
                ].filter(Boolean).map(perk => (
                  <div key={perk} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#374151' }}>
                    <CheckCircle size={13} style={{ color: accent, flexShrink: 0 }} />
                    {perk}
                  </div>
                ))}
              </div>

              {/* CTA */}
              {canPurchase ? (
                <button
                  onClick={() => navigate(`/hampers/${hamper.slug}/checkout`)}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 12, fontSize: '0.9rem', fontWeight: 800,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: accent, color: 'white',
                    boxShadow: `0 4px 18px ${accent}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'opacity 150ms, box-shadow 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.boxShadow = `0 8px 28px ${accent}55`; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = `0 4px 18px ${accent}40`; }}
                >
                  <Lock size={16} /> Get This Hamper
                </button>
              ) : (
                <div style={{ padding: '14px', borderRadius: 12, background: '#f3f4f6', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: '#6b7280' }}>
                    {soldOut ? 'Sold Out' : atLimit ? 'Purchase Limit Reached' : 'Unavailable'}
                  </p>
                </div>
              )}

              <p style={{ fontSize: '0.68rem', color: '#9ca3af', textAlign: 'center', margin: '12px 0 0' }}>
                {(hamper.items?.length ?? 0)} items included in this bundle
              </p>
            </div>
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}