import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, Package, Zap, Award, Sparkles, ShoppingCart, FileText, Heart, Gavel, Star } from 'lucide-react';
import useCartStore from '../../store/cartStore';
import useWishlistStore from '../../store/wishlistStore';
import useQuoteListStore from '../../store/quoteListStore';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
// ProductPolaroidCard
//
// Polaroid-style card for the Products page.
// Adapts to light / dark theme via CSS classes.
// Type is derived from product flags — no prop needed.
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  deal: {
    tape:       'rgba(239,68,68,0.75)',
    accent:     '#ef4444',
    accentDim:  'rgba(239,68,68,0.12)',
    accentDimD: 'rgba(239,68,68,0.22)',
    stamp:      'SALE',
    Icon:       Zap,
  },
  featured: {
    tape:       'rgba(168,85,247,0.75)',
    accent:     '#a855f7',
    accentDim:  'rgba(168,85,247,0.10)',
    accentDimD: 'rgba(168,85,247,0.22)',
    stamp:      'FEATURED',
    Icon:       Award,
  },
  new: {
    tape:       'rgba(16,185,129,0.75)',
    accent:     '#10b981',
    accentDim:  'rgba(16,185,129,0.10)',
    accentDimD: 'rgba(16,185,129,0.22)',
    stamp:      'NEW IN',
    Icon:       Sparkles,
  },
};

const BOOST_BADGE = {
  promo:        { label: 'Promo',        bg: '#f97316', text: '#fff' },
  social_proof: { label: 'Social Proof', bg: '#3b82f6', text: '#fff' },
  bundle:       { label: 'Bundle',       bg: '#8b5cf6', text: '#fff' },
  urgency:      { label: 'Urgency',      bg: '#ef4444', text: '#fff' },
  tip:          { label: 'Tip',          bg: '#10b981', text: '#fff' },
};

function deriveType(product) {
  const onSale     = Number(product?.on_sale     ?? product?.onsale     ?? 0) === 1;
  const isNew      = Number(product?.is_new      ?? product?.isnew      ?? 0) === 1;
  const isFeatured = Number(product?.is_featured ?? product?.isfeatured ?? 0) === 1;
  if (onSale)     return 'deal';
  if (isNew)      return 'new';
  if (isFeatured) return 'featured';
  return 'featured';
}

function stableRot(id, spread = 4) {
  const n = parseInt(String(id).replace(/\D/g, '').slice(-4) || '1234', 10);
  return ((n % (spread * 2 + 1)) - spread) * 0.85;
}

function discountPct(price, original) {
  const p = Number(price), o = Number(original);
  if (!p || !o || o <= p) return null;
  return Math.round((1 - p / o) * 100);
}

export default function ProductPolaroidCard({ product, index = 0 }) {
  const navigate   = useNavigate();
  const { addItem }                         = useCartStore();
  const { toggle, has }                     = useWishlistStore();
  const { addItem: addToQuoteList, has: inQuoteList } = useQuoteListStore();
  const [imageError, setImageError]         = useState(false);

  const type   = deriveType(product);
  const cfg    = TYPE_CONFIG[type];
  const imgRot = stableRot((product.id ?? index) + 77, 3);

  const imgSrc   = product?.main_image_url ?? product?.main_image ?? product?.image_url ?? null;
  const price    = Number(product?.price ?? 0);
  const origPrice = product?.original_price ?? product?.originalprice ?? null;
  const origNum  = origPrice != null ? Number(origPrice) : null;
  const pct      = discountPct(price, origNum);

  const negotiableValue = product?.price_is_negotiable ?? product?.priceisnegotiable ?? 0;
  const isNegotiable    = negotiableValue === true || Number(negotiableValue) === 1;

  const stockQty  = product?.stock_quantity != null ? Number(product.stock_quantity) : null;
  const inStock   = stockQty != null ? stockQty > 0 : Boolean(product?.in_stock ?? product?.instock);
  const lowStock  = stockQty != null && stockQty > 0 && stockQty <= 10;

  const rating      = Number(product?.average_rating ?? product?.rating ?? 0);
  const hasAuction  = product?.active_auction?.status === 'active';
  const auction     = product?.active_auction ?? null;

  const wished = product?.id ? has(product.id) : false;
  const inQL   = product?.id ? inQuoteList(product.id) : false;

  // ── Boost / catalogue badge ───────────────────────────────────────────────
  const boostType    = product?.boost_badge_type ?? null;
  const boostMessage = product?.boost_message    ?? null;
  const boostBadge   = boostType ? (BOOST_BADGE[boostType] ?? BOOST_BADGE.tip) : null;

  const handleCart = (e) => {
    e.stopPropagation();
    if (!inStock) { toast.error('Out of stock'); return; }
    addItem(product, 1);
    toast.success(`${product?.name} added to cart!`);
  };

  const handleQuote = (e) => {
    e.stopPropagation();
    if (inQL) { navigate('/quote-list'); return; }
    addToQuoteList(product, 1);
    toast.success(`${product?.name} added to quote list`, { icon: '📋' });
  };

  const handleWishlist = (e) => {
    e.stopPropagation();
    if (!product?.id) return;
    toggle(product.id);
    toast.success(wished ? 'Removed from wishlist' : 'Added to wishlist');
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap');

        @keyframes ppc-float {
          0%, 100% { transform: var(--ppc-rot) translateY(-3px); }
          50%       { transform: var(--ppc-rot) translateY(3px);  }
        }

        /* ── Outer wrapper ── */
        .ppc-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: filter 0.25s ease;
          text-decoration: none;
        }
        .ppc-wrap:hover { filter: brightness(1.05); }

        /* ── Polaroid frame — LIGHT ── */
        .ppc-polaroid {
          background: #fffef9;
          padding: 10px 10px 46px;
          box-shadow: 3px 5px 0 rgba(0,0,0,0.10), 6px 10px 24px rgba(0,0,0,0.13);
          position: relative;
          width: 100%;
          max-width: 210px;
          animation: ppc-float 5s ease-in-out infinite;
        }

        /* ── Polaroid frame — DARK ── */
        .dark .ppc-polaroid {
          background: #1c1c2e;
          box-shadow: 3px 5px 0 rgba(0,0,0,0.4), 6px 10px 28px rgba(0,0,0,0.5);
        }

        /* ── Washi tape ── */
        .ppc-tape {
          position: absolute;
          height: 20px; border-radius: 2px;
          opacity: 0.85; z-index: 10; width: 44px;
        }
        .ppc-tape-tl { top: -10px; left: 10px;  transform: rotate(-18deg); }
        .ppc-tape-tr { top: -10px; right: 10px; transform: rotate(18deg);  }

        /* ── Image area ── */
        .ppc-img-wrap {
          width: 100%; aspect-ratio: 1 / 1;
          overflow: hidden;
          background: #f0ede6;
          display: flex; align-items: center; justify-content: center;
          position: relative;
        }
        .dark .ppc-img-wrap { background: #2a2a3e; }
        .ppc-img-wrap img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }

        /* ── Stamp ── */
        .ppc-stamp {
          font-family: 'Caveat', cursive;
          font-weight: 700; font-size: 10px;
          letter-spacing: 2.5px; text-transform: uppercase;
          border: 2.5px solid; padding: 3px 8px; border-radius: 3px;
          opacity: 0.55; position: absolute;
          top: 10px; right: 8px;
          transform: rotate(-5deg);
          white-space: nowrap; z-index: 5;
        }

        /* ── Out of stock overlay ── */
        .ppc-oos {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 6;
        }
        .ppc-oos span {
          font-family: 'Caveat', cursive;
          font-size: 18px; font-weight: 700;
          color: #fff; letter-spacing: 2px;
          transform: rotate(-20deg);
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
          border: 2px solid rgba(255,255,255,0.6);
          padding: 4px 10px;
        }

        /* ── Caption bar ── */
        .ppc-caption {
          font-family: 'Caveat', cursive;
          font-size: 13px; color: #555;
          text-align: center;
          position: absolute; bottom: 8px; left: 0; right: 0;
          display: flex; align-items: center; justify-content: center;
          gap: 4px; padding: 0 8px; line-height: 1.25;
        }
        .dark .ppc-caption { color: #9b9bba; }

        /* ── Stars row ── */
        .ppc-stars {
          position: absolute; bottom: 28px; left: 0; right: 0;
          display: flex; align-items: center; justify-content: center; gap: 1px;
        }

        /* ── Info block below polaroid ── */
        .ppc-info {
          width: 100%; max-width: 210px;
          margin-top: 12px;
          display: flex; flex-direction: column; align-items: center; gap: 5px;
        }

        /* ── Price ── */
        .ppc-price {
          font-family: 'Caveat', cursive;
          font-weight: 700; font-size: 20px; line-height: 1;
        }
        .ppc-price-orig {
          font-size: 11px; color: #9ca3af;
          text-decoration: line-through;
        }
        .dark .ppc-price-orig { color: #6b7280; }

        .ppc-badge {
          font-size: 10px; font-weight: 900;
          padding: 2px 8px; border-radius: 6px;
          letter-spacing: 0.06em;
        }

        /* ── Stock indicator ── */
        .ppc-stock {
          font-size: 10px; font-weight: 600;
          display: flex; align-items: center; gap: 3px;
        }

        /* ── Action buttons ── */
        .ppc-actions {
          display: flex; align-items: center;
          justify-content: center; gap: 6px;
          width: 100%; margin-top: 2px;
        }
        .ppc-btn {
          display: flex; align-items: center; justify-content: center;
          gap: 4px; border: none; border-radius: 20px;
          font-size: 11px; font-weight: 700;
          padding: 5px 12px; cursor: pointer;
          transition: all 0.18s ease; white-space: nowrap;
        }
        .ppc-btn:hover { transform: translateY(-1px); }
        .ppc-btn-icon {
          width: 28px; height: 28px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          border: none; cursor: pointer; transition: all 0.18s ease;
          background: transparent;
          flex-shrink: 0;
        }
        .ppc-btn-icon:hover { transform: scale(1.15); }
      `}</style>

      <div
        className="ppc-wrap"
        onClick={() => navigate(`/products/${product?.id}`)}
      >
        {/* ── Polaroid ── */}
        <div
          className="ppc-polaroid"
          style={{
            '--ppc-rot': `rotate(${imgRot}deg)`,
            transform: `rotate(${imgRot}deg)`,
            ...(boostBadge ? { borderLeft: `3px solid ${boostBadge.bg}` } : {}),
          }}
        >
          {/* Washi tape */}
          <div className="ppc-tape ppc-tape-tl" style={{ background: cfg.tape }} />
          <div className="ppc-tape ppc-tape-tr" style={{ background: cfg.tape }} />

          {/* Stamp */}
          <div className="ppc-stamp" style={{ color: cfg.accent, borderColor: cfg.accent }}>
            {cfg.stamp}
          </div>

          {/* Image */}
          <div className="ppc-img-wrap">
            {!imageError && imgSrc
              ? <img src={imgSrc} alt={product?.name} onError={() => setImageError(true)} />
              : <Package size={36} color="rgba(128,128,128,0.3)" />
            }
            {!inStock && (
              <div className="ppc-oos"><span>SOLD OUT</span></div>
            )}

            {/* Boost ribbon — bottom of image */}
            {boostBadge && boostMessage && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 7,
                background: boostBadge.bg, padding: '4px 8px',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{
                  fontSize: 8, fontWeight: 800, color: boostBadge.text,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  background: 'rgba(255,255,255,0.2)',
                  padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                }}>
                  {boostBadge.label}
                </span>
                <span style={{
                  fontSize: 10, color: boostBadge.text, fontWeight: 500,
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>
                  {boostMessage}
                </span>
              </div>
            )}
          </div>

          {/* Stars inside frame */}
          {rating > 0 && (
            <div className="ppc-stars">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i} size={9}
                  style={{
                    color: i < Math.floor(rating) ? '#fbbf24' : '#d1d5db',
                    fill:  i < Math.floor(rating) ? '#fbbf24' : 'none',
                  }}
                />
              ))}
            </div>
          )}

          {/* Caption */}
          <div className="ppc-caption">
            <span style={{
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {product?.name}
            </span>
            <Pin size={11} strokeWidth={2.5} color={cfg.accent} style={{ flexShrink: 0 }} />
          </div>
        </div>

        {/* ── Info below ── */}
        <div className="ppc-info" onClick={e => e.stopPropagation()}>

          {/* Price row */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="ppc-price" style={{ color: cfg.accent }}>
              KSh {price.toLocaleString()}
            </span>
            {origNum && origNum > price && (
              <span className="ppc-price-orig">KSh {origNum.toLocaleString()}</span>
            )}
            {isNegotiable && (
              <button type="button" onClick={handleQuote}
                style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
                Negotiable
              </button>
            )}
          </div>

          {/* Discount badge */}
          {pct > 0 && (
            <span
              className="ppc-badge"
              style={{
                color: cfg.accent,
                background: cfg.accentDim,
                border: `1px solid ${cfg.accent}44`,
              }}
            >
              -{pct}% OFF
            </span>
          )}

          {/* Stock */}
          <div className="ppc-stock" style={{
            color: !inStock ? '#ef4444' : lowStock ? '#d97706' : '#16a34a',
          }}>
            <span>{!inStock ? '✕ Out of stock' : lowStock ? `⚠ ${stockQty} left` : '✓ In stock'}</span>
          </div>

          {/* Actions */}
          <div className="ppc-actions">
            {/* Wishlist */}
            <button
              className="ppc-btn-icon"
              onClick={handleWishlist}
              style={{ background: wished ? cfg.accentDim : 'transparent' }}
              title={wished ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Heart
                size={14}
                style={{ color: cfg.accent, fill: wished ? cfg.accent : 'none', transition: 'fill 150ms' }}
              />
            </button>

            {hasAuction ? (
              <button
                className="ppc-btn"
                onClick={e => { e.stopPropagation(); navigate(`/auctions/${auction.id}`); }}
                style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.35)' }}
              >
                <Gavel size={11} /> Bid
              </button>
            ) : (
              <>
                <button
                  className="ppc-btn"
                  onClick={handleCart}
                  disabled={!inStock}
                  style={{
                    background: inStock ? cfg.accent : '#e5e7eb',
                    color: inStock ? '#fff' : '#9ca3af',
                    opacity: inStock ? 1 : 0.7,
                  }}
                >
                  <ShoppingCart size={11} /> {inStock ? 'Add' : 'N/A'}
                </button>
                <button
                  className="ppc-btn-icon"
                  onClick={handleQuote}
                  title={inQL ? (isNegotiable ? 'In quote list — click to view' : 'In quote list') : isNegotiable ? 'Get Quote' : 'Add to quote list'}
                  style={{
                    background: inQL ? cfg.accentDim : isNegotiable ? 'rgba(59,130,246,0.08)' : 'transparent',
                    border: `1px solid ${inQL ? cfg.accent : isNegotiable ? 'rgba(59,130,246,0.4)' : 'rgba(128,128,128,0.2)'}`,
                    borderRadius: 8,
                    color: inQL ? cfg.accent : isNegotiable ? '#3b82f6' : '#9ca3af',
                  }}
                >
                  <FileText size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}