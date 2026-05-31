import { Link } from 'react-router-dom';
import { Pin, Package, Zap, Award, Sparkles } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SpecialsPolaroidCard
//
// A polaroid-style product card for the Specials page fun view.
// Inherits the mv-* aesthetic from sections.jsx MissionVisionSection.
//
// Props:
//   product  — product object (same shape as CollapsedProductCard)
//   type     — 'deal' | 'featured' | 'new'  (drives tape/accent color)
//   index    — position in list (drives rotation direction)
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  deal: {
    tape:    'rgba(239,68,68,0.72)',
    accent:  '#f87171',
    accentDim: 'rgba(248,113,113,0.18)',
    stamp:   'SALE',
    Icon:    Zap,
  },
  featured: {
    tape:    'rgba(168,85,247,0.72)',
    accent:  '#a855f7',
    accentDim: 'rgba(168,85,247,0.18)',
    stamp:   'FEATURED',
    Icon:    Award,
  },
  new: {
    tape:    'rgba(16,185,129,0.72)',
    accent:  '#34d399',
    accentDim: 'rgba(52,211,153,0.18)',
    stamp:   'NEW IN',
    Icon:    Sparkles,
  },
};

const FALLBACK = TYPE_CONFIG.featured;

// Stable pseudo-random rotation from product id — same value every render
function stableRot(id, spread = 5) {
  const n = parseInt(String(id).replace(/\D/g, '').slice(-4) || '1234', 10);
  return ((n % (spread * 2 + 1)) - spread) * 0.9;
}

function discountPct(price, original) {
  const p = Number(price), o = Number(original);
  if (!p || !o || o <= p) return null;
  return Math.round((1 - p / o) * 100);
}

export default function SpecialsPolaroidCard({ product, type = 'featured', index = 0 }) {
  const cfg    = TYPE_CONFIG[type] || FALLBACK;
  const rot    = stableRot(product.id ?? index);
  const imgRot = stableRot((product.id ?? index) + 99, 3);
  const imgSrc = product.main_image_url || product.main_image || product.image_url || product.images?.[0];
  const pct    = discountPct(product.price, product.original_price);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap');

        @keyframes spc-float {
          0%, 100% { transform: var(--spc-base-rot) translateY(-4px); }
          50%       { transform: var(--spc-base-rot) translateY(4px); }
        }

        .spc-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: filter 0.25s ease;
        }
        .spc-wrap:hover { filter: brightness(1.08); }

        /* ── Polaroid frame ── */
        .spc-polaroid {
          background: #fffef9;
          padding: 10px 10px 44px;
          box-shadow: 3px 4px 0 rgba(0,0,0,0.12), 6px 9px 22px rgba(0,0,0,0.18);
          position: relative;
          display: inline-block;
          width: 100%;
          max-width: 220px;
          animation: spc-float 4.8s ease-in-out infinite;
        }

        /* ── Washi tape ── */
        .spc-tape {
          position: absolute;
          height: 20px;
          border-radius: 2px;
          opacity: 0.85;
          z-index: 10;
          width: 44px;
        }
        .spc-tape-tl { top: -10px; left: 10px;  transform: rotate(-18deg); }
        .spc-tape-tr { top: -10px; right: 10px; transform: rotate(18deg);  }

        /* ── Product image ── */
        .spc-img-wrap {
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          background: #f3f0ea;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .spc-img-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          filter: drop-shadow(1px 3px 5px rgba(0,0,0,0.12));
        }

        /* ── Handwritten caption bar ── */
        .spc-caption {
          font-family: 'Caveat', cursive;
          font-size: 14px;
          color: #555;
          text-align: center;
          position: absolute;
          bottom: 8px;
          left: 0; right: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 0 8px;
          line-height: 1.2;
        }

        /* ── Rubber stamp ── */
        .spc-stamp {
          font-family: 'Caveat', cursive;
          font-weight: 700;
          font-size: 10px;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          border: 2.5px solid;
          padding: 3px 8px;
          border-radius: 3px;
          opacity: 0.55;
          position: absolute;
          top: 10px; right: 8px;
          transform: rotate(-5deg);
          white-space: nowrap;
          z-index: 5;
        }

        /* ── Price tag below polaroid ── */
        .spc-price-tag {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .spc-price-main {
          font-family: 'Caveat', cursive;
          font-weight: 700;
          font-size: 22px;
          line-height: 1;
        }
        .spc-price-original {
          font-size: 11px;
          color: rgba(255,255,255,0.35);
          text-decoration: line-through;
        }
        .spc-discount-badge {
          font-size: 10px;
          font-weight: 900;
          padding: 2px 8px;
          border-radius: 6px;
          letter-spacing: 0.06em;
        }
      `}</style>

      <Link
        to={`/products/${product.id}`}
        className="spc-wrap"
        style={{ textDecoration: 'none' }}
      >
        {/* ── Polaroid ── */}
        <div
          className="spc-polaroid"
          style={{
            '--spc-base-rot': `rotate(${imgRot}deg)`,
            transform: `rotate(${imgRot}deg)`,
          }}
        >
          {/* Washi tape */}
          <div className="spc-tape spc-tape-tl" style={{ background: cfg.tape }} />
          <div className="spc-tape spc-tape-tr" style={{ background: cfg.tape }} />

          {/* Stamp */}
          <div className="spc-stamp" style={{ color: cfg.accent, borderColor: cfg.accent }}>
            {cfg.stamp}
          </div>

          {/* Image */}
          <div className="spc-img-wrap">
            {imgSrc
              ? <img src={imgSrc} alt={product.name} />
              : <Package size={40} color="rgba(0,0,0,0.15)" />
            }
          </div>

          {/* Caption */}
          <div className="spc-caption">
            <span style={{
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {product.name}
            </span>
            <Pin size={11} strokeWidth={2.5} color="#888" style={{ flexShrink: 0 }} />
          </div>
        </div>

        {/* ── Price tag ── */}
        <div className="spc-price-tag">
          <span className="spc-price-main" style={{ color: cfg.accent }}>
            KSh {Number(product.price).toLocaleString()}
          </span>

          {product.original_price && (
            <span className="spc-price-original">
              KSh {Number(product.original_price).toLocaleString()}
            </span>
          )}

          {pct > 0 && (
            <span
              className="spc-discount-badge"
              style={{ color: cfg.accent, background: cfg.accentDim, border: `1px solid ${cfg.accent}44` }}
            >
              -{pct}% OFF
            </span>
          )}
        </div>
      </Link>
    </>
  );
}