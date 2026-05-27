import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Monitor, Clock, FileText } from 'lucide-react';
import useQuoteListStore from '../../store/quoteListStore';
import toast from 'react-hot-toast';

/**
 * CollapsedServiceCard
 * Apple App Store–style horizontal card:
 * left: eyebrow + title + short description + CTA
 * right: circular service image
 */
const BOOST_BADGE = {
  promo:        { label: 'Promo',        bg: '#f97316', text: '#fff' },
  social_proof: { label: 'Social Proof', bg: '#3b82f6', text: '#fff' },
  bundle:       { label: 'Bundle',       bg: '#8b5cf6', text: '#fff' },
  urgency:      { label: 'Urgency',      bg: '#ef4444', text: '#fff' },
  tip:          { label: 'Tip',          bg: '#10b981', text: '#fff' },
};
export default function CollapsedServiceCard({ service }) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);

  // ── Stores ────────────────────────────────────────────────────────────────
  const { addItem: addToQuoteList, has: inQuoteList } = useQuoteListStore();

  const inQL   = service?.id ? inQuoteList(service.id) : false;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCardClick = () => navigate(`/services/${service?.id}`);

  const handleAddToQuoteList = (e) => {
    e.stopPropagation();
    if (inQL) { navigate('/quote-list'); return; }
    addToQuoteList(service, 1);
    toast.success(`${service?.name} added to quote list`, { icon: '📋' });
  };

  // ── Normalise fields ──────────────────────────────────────────────────────
  const imageUrl = service?.main_image_url ?? service?.main_image ?? service?.image_url ?? null;
  const description =
    service?.short_description ?? service?.shortdescription ?? service?.description ?? '';
  const categoryName = service?.category?.name ?? service?.categoryname ?? null;

  const isRemote       = service?.is_remote_available && !service?.requires_site_visit;
  const isSiteVisit    = service?.requires_site_visit;
  const isFeatured     = service?.is_featured ?? false;

  // ── Pricing ───────────────────────────────────────────────────────────────
  const getPricingDisplay = () => {
    if (service?.price_is_negotiable) return 'Negotiable';
    switch (service?.pricing_model) {
      case 'hourly':       return `KES ${service.hourly_rate?.toLocaleString()}/hr`;
      case 'daily':        return `KES ${service.daily_rate?.toLocaleString()}/day`;
      case 'fixed':
      case 'project_based': return `From KES ${service.base_price?.toLocaleString()}`;
      case 'subscription': return `KES ${service.base_price?.toLocaleString()}/mo`;
      default:             return service?.base_price ? `KES ${service.base_price.toLocaleString()}` : null;
    }
  };
  const pricingDisplay = getPricingDisplay();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleQuote = (e) => {
    e.stopPropagation();
    navigate(`/request-quote?service=${service?.id}`);
  };

  // ── Badge pill ────────────────────────────────────────────────────────────
  const eyebrow = isFeatured
    ? 'FEATURED'
    : isRemote
    ? 'REMOTE'
    : isSiteVisit
    ? 'ON-SITE'
    : categoryName
    ? categoryName.toUpperCase()
    : 'GET STARTED';

  return (
    <div className="csc-card" 
      onClick={handleCardClick}
      style={service.boost_badge_type ? {
      borderLeft: `3px solid ${BOOST_BADGE[service.boost_badge_type]?.bg ?? '#10b981'}`,
    } : {}}>
      {/* ── Left: text content ─────────────────────────────────────────── */}
      <div className="csc-content">
        <span className="csc-eyebrow">{eyebrow}</span>

        <h3 className="csc-title">
          {service?.name}
          {service.boost_badge_type && (() => {
            const badge = BOOST_BADGE[service.boost_badge_type] ?? BOOST_BADGE.tip;
            return (
              <span style={{
                marginLeft: 6, fontSize: 8, fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                background: badge.bg, color: badge.text,
                padding: '1px 5px', borderRadius: 3,
                verticalAlign: 'middle',
              }}>
                {badge.label}
              </span>
            );
          })()}
        </h3>

        {(service.boost_message || description) ? (
  <p className="csc-desc" style={service.boost_message ? {
    color: BOOST_BADGE[service.boost_badge_type]?.bg ?? '#10b981',
    fontWeight: 600,
  } : {}}>
    {service.boost_message || description}
  </p>
) : null}

        <div className="csc-footer">
          {pricingDisplay && (
            <span className="csc-price">{pricingDisplay}</span>
          )}
          {service?.estimated_duration && (
            <span className="csc-meta">
              <Clock size={11} />
              {service.estimated_duration}
            </span>
          )}
          {/* Quote list */}
          <button
            type="button"
            onClick={handleAddToQuoteList}
            className={`csc-quote-btn ${inQL ? 'in-list' : ''}`}
            aria-label={inQL ? 'View quote list' : 'Add to quote list'}
            title={inQL ? 'Already in quote list — click to view' : 'Add to quote list'}
          >
            <FileText size={11} />
            {inQL ? 'In List →' : 'Quote'}
          </button>
        </div>
      </div>

      {/* ── Right: circular image ──────────────────────────────────────── */}
      <div className="csc-image-wrap">
        {!imageError && imageUrl ? (
          <img
            src={imageUrl}
            alt={service?.name ?? 'Service'}
            className="csc-image"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="csc-image-fallback">
            {isRemote ? <Monitor size={26} /> : <MapPin size={26} />}
          </div>
        )}
      </div>

      <style>{`
        /* ── Card shell ───────────────────────────────────────────────── */
        .csc-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 18px 18px 20px;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.04);
          cursor: pointer;
          width: 100%;
          overflow: hidden;
          transition: box-shadow 180ms ease, transform 180ms ease;
          position: relative;
        }

        .csc-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 16px;
          border: 1px solid rgba(0,0,0,0.06);
          pointer-events: none;
        }

        .csc-card:hover {
          box-shadow: 0 6px 24px rgba(168,85,247,0.13), 0 2px 8px rgba(0,0,0,0.07);
          transform: translateY(-2px);
        }

        .dark .csc-card {
          background: #1f2937;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }

        .dark .csc-card::before {
          border-color: rgba(255,255,255,0.07);
        }

        /* ── Left content ────────────────────────────────────────────── */
        .csc-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .csc-eyebrow {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          color: #6b7280;
        }

        .dark .csc-eyebrow {
          color: #9ca3af;
        }

        .csc-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #a855f7;
          line-height: 1.25;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .dark .csc-title {
          color: #a855f7;
        }

        .csc-desc {
          font-size: 0.75rem;
          color: #6b7280;
          margin: 0;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .dark .csc-desc {
          color: #f9fafb;
        }

        /* ── Footer row ──────────────────────────────────────────────── */
        .csc-footer {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
          flex-wrap: wrap;
        }

        .csc-price {
          font-size: 0.72rem;
          font-weight: 700;
          color: #a855f7;
          white-space: nowrap;
        }

        .csc-meta {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 0.68rem;
          color: #9ca3af;
          white-space: nowrap;
        }

        /* ── Quote button ────────────────────────────────────────────── */
        .csc-quote-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          border: 1.5px solid #bfdbfe;
          background: #eff6ff;
          color: #3b82f6;
          transition: all 150ms ease;
          white-space: nowrap;
          margin-left: auto;
        }

        .csc-quote-btn:hover {
          background: #3b82f6;
          color: #ffffff;
          border-color: #3b82f6;
          transform: scale(1.04);
        }

        .dark .csc-quote-btn {
          background: #1e3a8a;
          color: #93c5fd;
          border-color: #1e40af;
        }

        .dark .csc-quote-btn:hover {
          background: #3b82f6;
          color: #ffffff;
        }

        /* ── Circular image ──────────────────────────────────────────── */
        .csc-image-wrap {
          flex-shrink: 0;
          width: 100px;
          height: 100px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: 0 4px 14px rgba(0,0,0,0.13);
          border: 2.5px solid rgba(255,255,255,0.9);
          background: #f3f4f6;
        }

        .dark .csc-image-wrap {
          border-color: rgba(255,255,255,0.1);
          background: #374151;
        }

        .csc-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .csc-image-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
        }
      `}</style>
    </div>
  );
}