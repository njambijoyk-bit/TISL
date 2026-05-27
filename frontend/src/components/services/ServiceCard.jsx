import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Clock, 
  MapPin, 
  DollarSign, 
  Star, 
  TrendingUp,
  Calendar,
  Wrench,
  Monitor,
  FileText,
  Heart,
  Images,
  MessageSquare,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '../common/Badge';
import useQuoteListStore from '../../store/quoteListStore';

/**
 * ServiceCard Component
 * Compact card for displaying service information
 */

const BOOST_BADGE = {
  promo:        { label: 'Promo',        bg: '#f97316', text: '#fff' },
  social_proof: { label: 'Social Proof', bg: '#3b82f6', text: '#fff' },
  bundle:       { label: 'Bundle',       bg: '#8b5cf6', text: '#fff' },
  urgency:      { label: 'Urgency',      bg: '#ef4444', text: '#fff' },
  tip:          { label: 'Tip',          bg: '#10b981', text: '#fff' },
};

const ServiceCard = ({ service, onClick }) => {
  const allImages = [
    service.main_image_url || service.main_image,
    ...(service.images_url || []),
  ].filter(Boolean);

  const [activeIndex, setActiveIndex] = useState(0);
  const [imgError, setImgError] = useState(false);

  const handlePrev = (e) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % allImages.length);
  };

  const activeImage = (!imgError && allImages[activeIndex]) || null;

  // Determine pricing display
  const getPricingDisplay = () => {
    if (service.price_is_negotiable) {
      return 'Negotiable';
    }

    switch (service.pricing_model) {
      case 'hourly':
        return `KES ${service.hourly_rate?.toLocaleString()}/hr`;
      case 'daily':
        return `KES ${service.daily_rate?.toLocaleString()}/day`;
      case 'fixed':
      case 'project_based':
        return `From KES ${service.base_price?.toLocaleString()}`;
      case 'subscription':
        return `KES ${service.base_price?.toLocaleString()}/mo`;
      default:
        return service.base_price ? `KES ${service.base_price.toLocaleString()}` : 'Contact for price';
    }
  };

  // Get pricing model label
  const getPricingModelLabel = () => {
    const labels = {
      hourly: 'Hourly Rate',
      daily: 'Daily Rate',
      fixed: 'Fixed Price',
      project_based: 'Project Based',
      subscription: 'Subscription',
    };
    return labels[service.pricing_model] || 'Custom Pricing';
  };

  // Handle quick quote
  const handleQuickQuote = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Quick quote for:', service.name);
    // TODO: Open quick quote modal
  };

  
const { addItem: addToQuoteList, has: inQuoteList } = useQuoteListStore();

  const inQL   = service?.id ? inQuoteList(service.id) : false;

  const handleAddToQuoteList = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inQL) { window.location.href = '/quote-list'; return; }
    addToQuoteList(service, 1);
    toast.success(`${service?.name} added to quote list`, { icon: '📋' });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden w-full"
    style={service.boost_badge_type ? {
      borderLeft: `3px solid ${BOOST_BADGE[service.boost_badge_type]?.bg ?? '#10b981'}`,
    } : {}}>
      {/* Smaller Image - Changed from h-48 to h-40 */}
      <div className="relative h-40 overflow-hidden bg-gray-200 dark:bg-gray-700">
        {/* Arrows */}
        {allImages.length > 1 && (
          <>
            <button
              onClick={handleNext}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full z-10 transition-colors"
              style={{ background: 'none', border: 'none', color: '#a855f7' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
        
        {activeImage ? (
          <img
            src={activeImage}
            alt={service.name}
            className="w-full h-full object-cover transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700" style={{ color: '#9ca3af' }}>
            <Images size={64} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}

        {/* Smaller Badges */}
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
          {service.is_featured && (
            <Badge variant="warning" className="text-xs px-1.5 py-0.5">
              <Star className="w-2.5 h-2.5 mr-0.5" />
              Featured
            </Badge>
          )}
          {service.badge && (
            <Badge variant="primary" className="text-xs px-1.5 py-0.5">
              {service.badge}
            </Badge>
          )}
        </div>

        {/* Remote/Site Visit Badge */}
        <div className="absolute top-1.5 right-1.5">
          {service.is_remote_available && !service.requires_site_visit ? (
            <Badge variant="success" className="text-xs px-1.5 py-0.5">
              <Monitor className="w-2.5 h-2.5 mr-0.5" />
              Remote
            </Badge>
          ) : service.requires_site_visit ? (
            <Badge variant="info" className="text-xs px-1.5 py-0.5">
              <MapPin className="w-2.5 h-2.5 mr-0.5" />
              On-site
            </Badge>
          ) : null}
        </div>
        {/* Top-right controls — quotelist */}
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 50,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
        }}>

          <button
            onClick={handleAddToQuoteList}
            title={inQL ? 'Already in quote list — click to view' : 'Add to quote list'}
            type="button"
            style={{
              padding: '0.4rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
              transition: 'all 200ms', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: inQL ? 'rgba(168,85,247,0.15)' : 'white',
              boxShadow: inQL ? '0 0 0 1.5px rgba(124,58,237,0.5)' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = inQL ? 'rgba(124,58,237,0.25)' : '#faf5ff'; e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = inQL ? 'rgba(168,85,247,0.15)' : 'white'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <FileText size={16} style={{ color: inQL ? '#7c3aed' : '#a855f7', transition: 'color 150ms ease' }} />
          </button>
        </div>
        {/* Boost badge strip */}
        {service.boost_message && service.boost_badge_type && (() => {
          const badge = BOOST_BADGE[service.boost_badge_type] ?? BOOST_BADGE.tip;
          return (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: badge.bg,
              padding: '4px 10px',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 800, color: badge.text,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                background: 'rgba(255,255,255,0.2)',
                padding: '1px 5px', borderRadius: 3, flexShrink: 0,
              }}>
                {badge.label}
              </span>
              <span style={{
                fontSize: 11, color: badge.text, fontWeight: 500,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {service.boost_message}
              </span>
            </div>
          );
        })()}
      </div>

      {/* Compact Content - Reduced padding */}
      <div className="p-3">
        {/* Category */}
        {service.category?.name && (
          <div className="text-xs text-accent dark:text-primary-400 font-semibold mb-1">
            {service.category.name}
          </div>
        )}

        {/* Title - Smaller font */}
        <h3 className="text-base font-bold text-primary mb-1.5 line-clamp-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
          {service.name}
        </h3>

        {/* Short Description - Smaller, line-clamp-1 */}
        {service.short_description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-1">
            {service.short_description}
          </p>
        )}

        {/* Compact Pricing */}
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-primary">
              <span className="text-base font-bold">{getPricingDisplay()}</span>
            </div>
            <span className="text-xs text-accent">
              {getPricingModelLabel()}
            </span>
          </div>
        </div>

        {/* Compact Service Details */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, fontSize: '0.72rem', color: '#6b7280' }}>
          {service.estimated_duration && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={11} style={{ color: '#a855f7' }} />
              <span>{service.estimated_duration}</span>
            </div>
          )}
          {service.lead_time && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Calendar size={11} style={{ color: '#a855f7' }} />
              <span>{service.lead_time}</span>
            </div>
          )}
          {service.service_area && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={11} style={{ color: '#a855f7' }} />
              <span>{service.service_area}</span>
            </div>
          )}
        </div>

        {/* Compact Rating & Stats */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.72rem' }}>
          {service.rating > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Star size={12} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
              <span style={{ fontWeight: 700, color: '#111827' }}>{service.rating.toFixed(1)}</span>
              <span style={{ color: '#9ca3af' }}>({service.review_count || 0})</span>
            </div>
          )}
          {service.order_count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6b7280' }}>
              <TrendingUp size={12} style={{ color: '#a855f7' }} />
              <span>{service.order_count}</span>
            </div>
          )}
        </div>

        {/* Compact Features */}
        {service.features && service.features.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {service.features.slice(0, 2).map((feature, index) => (
                <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.72rem', color: '#6b7280' }}>
                  <span style={{ color: '#d97706', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{feature}</span>
                </li>
              ))}
            </ul>
            {service.features.length > 2 && (
              <span style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 600 }}>
                +{service.features.length - 2} more
              </span>
            )}
          </div>
        )}

        {/* Compact Action Buttons */}
        <div className="flex gap-1.5">
          {onClick ? (
            <button
              onClick={() => onClick(service)}
              className="flex-1 font-regular py-1.5 px-3 rounded-lg text-s transition-all duration-200 text-center"
              style={{ backgroundColor: '#a855f7', color: '#ffffff', border: '1.5px solid #a855f7' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#a855f7'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#a855f7'; e.currentTarget.style.color = '#ffffff'; }}
            >
              View Details
            </button>
          ) : (
            <Link
              to={`/services/${service.id}`}
              className="flex-1 font-regular py-1.5 px-3 rounded-lg text-lg transition-all duration-200 text-center"
              style={{ backgroundColor: '#a855f7', color: '#ffffff', border: '1.5px solid #a855f7' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#a855f7'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#a855f7'; e.currentTarget.style.color = '#ffffff'; }}
            >
              View Details
            </Link>
          )}
          <button
            onClick={handleAddToQuoteList}
            title={inQL ? 'In quote list — click to view' : 'Add to quote list'}
            type="button"
            style={{
              padding: '0.375rem 0.625rem', borderRadius: '0.5rem', cursor: 'pointer',
              transition: 'all 200ms', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
              backgroundColor: inQL ? 'rgba(124,58,237,0.15)' : 'rgba(168,85,247,0.08)',
              color: inQL ? '#7c3aed' : '#a855f7',
              border: `1px solid ${inQL ? '#7c3aed' : 'rgba(168,85,247,0.25)'}`,
              fontWeight: inQL ? 700 : 500, fontSize: '0.75rem',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = inQL ? '#7c3aed' : '#a855f7'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = inQL ? 'rgba(124,58,237,0.15)' : 'rgba(168,85,247,0.08)'; e.currentTarget.style.color = inQL ? '#7c3aed' : '#a855f7'; }}
          >
            <FileText size={14} />
            {inQL ? '✓' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceCard;