import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Star,
  Clock,
  MapPin,
  Calendar,
  CheckCircle,
  AlertCircle,
  Monitor,
  Package,
  TrendingUp,
  FileText,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import useServiceStore from '../../store/serviceStore';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import ServiceGrid from '../../components/services/ServiceGrid';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';

const ServiceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    currentService,
    relatedServices,
    loading,
    error,
    fetchServiceById,
    fetchRelatedServices,
    clearCurrentService,
  } = useServiceStore();

  const [activeTab, setActiveTab] = useState('description');
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [imageErrors, setImageErrors] = useState({});
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (id) {
      setImageErrors({});
      setSelectedImageIdx(0);
      setInitializing(true);
      Promise.all([
        fetchServiceById(id),
        fetchRelatedServices(id),
      ]).finally(() => setInitializing(false));
    }
    return () => clearCurrentService();
  }, [id]);

  const handleImageError = (idx) => setImageErrors(prev => ({ ...prev, [idx]: true }));

  const formatCurrency = (amount) =>
    `KES ${parseFloat(amount || 0).toLocaleString()}`;

  const getPricingDisplay = () => {
    if (!currentService) return '';
    if (currentService.price_is_negotiable) return 'Negotiable';
    switch (currentService.pricing_model) {
      case 'hourly':      return `${formatCurrency(currentService.hourly_rate)}/hr`;
      case 'daily':       return `${formatCurrency(currentService.daily_rate)}/day`;
      case 'fixed':
      case 'project_based': return `From ${formatCurrency(currentService.base_price)}`;
      case 'subscription':  return `${formatCurrency(currentService.base_price)}/month`;
      default: return currentService.base_price ? formatCurrency(currentService.base_price) : 'Contact for pricing';
    }
  };

  const handleRequestQuote = () => {
    navigate('/request-quote', { state: { preselectedService: currentService } });
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (initializing || loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <LoadingSpinner size="lg" />
        </div>
        <Footer />
      </>
    );
  }

  // ── Error state — only shown after loading is done ─────────────────────────
  if (error || !currentService) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Service Not Found</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {error || 'The service you are looking for does not exist.'}
            </p>
            <Button onClick={() => navigate('/services')}>Browse All Services</Button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const service = currentService;
  const requiredProducts = service.required_products_full || [];
  const optionalProducts = service.optional_products_full || [];

  const allImages = [
    service.main_image_url || service.main_image,
    ...(service.images_url || []),
  ].filter(Boolean);

  const hasVariants = service.features && service.features.length > 0;
  const hasRequirements = service.requirements && service.requirements.length > 0;
  const hasDeliverables = service.deliverables && service.deliverables.length > 0;

  const tabs = [
    { id: 'description', label: 'Description' },
    ...(hasVariants     ? [{ id: 'features',     label: 'Features'     }] : []),
    ...(hasRequirements ? [{ id: 'requirements', label: 'Requirements' }] : []),
  ];

  return (
    <>
      <Header />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-6 text-sm">
            <button
              onClick={() => navigate('/services')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <ArrowLeft size={14} /> Back to Services
            </button>
            <span style={{ color: '#d1d5db' }}>·</span>
            <nav style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link to="/" style={{ color: '#9ca3af', textDecoration: 'none' }} className="hover:text-gray-700 dark:hover:text-gray-300">Home</Link>
              <span>/</span>
              <Link to="/services" style={{ color: '#9ca3af', textDecoration: 'none' }} className="hover:text-gray-700 dark:hover:text-gray-300">Services</Link>
              <span>/</span>
              <span className="text-primary" style={{ fontWeight: 600 }}>{service.name}</span>
            </nav>
          </div>

          {/* ── MAIN GRID ─────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', marginBottom: '3rem', alignItems: 'start' }}>

            {/* ── LEFT: IMAGE GALLERY ──────────────────────────────────────── */}
            <div>
              <div style={{ position: 'sticky', top: 24 }}>
                {/* Main image */}
                <div style={{ position: 'relative', background: 'white', borderRadius: 16, overflow: 'hidden', aspectRatio: '1 / 1', border: '1px solid #f3f4f6' }}>

                  {/* Badges */}
                  <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {service.is_featured && (
                      <span style={pill('#7c3aed', '#ede9fe')}><Star size={10} /> Featured</span>
                    )}
                    {service.is_remote_available && !service.requires_site_visit && (
                      <span style={pill('#059669', '#d1fae5')}><Monitor size={10} /> Remote</span>
                    )}
                    {service.requires_site_visit && (
                      <span style={pill('#2563eb', '#dbeafe')}><MapPin size={10} /> On-site</span>
                    )}
                  </div>

                  {/* Arrow nav */}
                  {allImages.length > 1 && (
                    <>
                      <button
                        onClick={() => setSelectedImageIdx(i => (i - 1 + allImages.length) % allImages.length)}
                        style={{ ...arrowBtn, left: 12 }}
                      ><ChevronLeft size={18} /></button>
                      <button
                        onClick={() => setSelectedImageIdx(i => (i + 1) % allImages.length)}
                        style={{ ...arrowBtn, right: 12 }}
                      ><ChevronRight size={18} /></button>
                    </>
                  )}

                  {/* Image or placeholder */}
                  {allImages.length === 0 || imageErrors[selectedImageIdx] ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', gap: 12 }}>
                      <Package size={64} style={{ color: '#d1d5db' }} />
                      <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>No image available</span>
                    </div>
                  ) : (
                    <img
                      src={allImages[selectedImageIdx]}
                      alt={service.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'opacity 200ms ease' }}
                      onError={() => handleImageError(selectedImageIdx)}
                    />
                  )}
                </div>

                {/* Thumbnails */}
                {allImages.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    {allImages.map((img, idx) => {
                      const hasError = imageErrors[idx];
                      return hasError ? (
                        <div key={idx} style={{ width: 64, height: 64, borderRadius: 10, border: '2px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Package size={22} style={{ color: '#d1d5db' }} />
                        </div>
                      ) : (
                        <button
                          key={idx}
                          onClick={() => setSelectedImageIdx(idx)}
                          style={{
                            width: 64, height: 64, borderRadius: 10, overflow: 'hidden', padding: 0,
                            border: selectedImageIdx === idx ? '2px solid #a855f7' : '2px solid transparent',
                            background: 'white', cursor: 'pointer', flexShrink: 0,
                            boxShadow: selectedImageIdx === idx ? '0 0 0 3px rgba(168,85,247,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
                            transition: 'all 150ms ease',
                          }}
                        >
                          <img
                            src={img}
                            alt={`View ${idx + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={() => handleImageError(idx)}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT: SERVICE INFO ───────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Category + type pills */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {service.category?.name && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 20, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {service.category.name}
                  </span>
                )}
                {service.badge && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: '#374151', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 20, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {service.badge}
                  </span>
                )}
              </div>

              {/* Title */}
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.2, margin: 0, letterSpacing: '-0.02em' }} className="dark:text-white">
                  {service.name}
                </h1>
                {service.short_description && (
                  <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: 8, lineHeight: 1.6 }}>
                    {service.short_description}
                  </p>
                )}
              </div>

              {/* Rating */}
              {service.rating > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={15} style={{ color: i < Math.round(service.rating) ? '#f59e0b' : '#e5e7eb', fill: i < Math.round(service.rating) ? '#f59e0b' : '#e5e7eb' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{service.rating.toFixed(1)}</span>
                  <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>({service.review_count} reviews)</span>
                  {service.order_count > 0 && (
                    <>
                      <span style={{ color: '#e5e7eb' }}>·</span>
                      <span style={{ fontSize: '0.82rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingUp size={13} /> {service.order_count} completed
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Price block */}
              <div style={{ padding: '16px 20px', background: 'white', borderRadius: 12, border: '1px solid #f3f4f6' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
                  {service.pricing_model_label || 'Pricing'}
                </p>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.03em' }}>
                  {getPricingDisplay()}
                </span>
                {service.minimum_charge && (
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 4 }}>
                    Minimum charge: {formatCurrency(service.minimum_charge)}
                  </p>
                )}
              </div>

              {/* Service meta details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {service.estimated_duration && (
                  <div style={{ padding: '10px 14px', background: 'white', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Clock size={13} style={{ color: '#a855f7' }} />
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Duration</span>
                    </div>
                    <span style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151' }}>{service.estimated_duration}</span>
                  </div>
                )}
                {service.lead_time && (
                  <div style={{ padding: '10px 14px', background: 'white', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Calendar size={13} style={{ color: '#a855f7' }} />
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lead Time</span>
                    </div>
                    <span style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151' }}>{service.lead_time}</span>
                  </div>
                )}
                {service.service_area && (
                  <div style={{ padding: '10px 14px', background: 'white', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <MapPin size={13} style={{ color: '#a855f7' }} />
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Area</span>
                    </div>
                    <span style={{ fontSize: '0.83rem', fontWeight: 700, color: '#374151' }}>{service.service_area}</span>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={handleRequestQuote}
                  type="button"
                  style={{
                    width: '100%', height: 50, borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                    color: 'white', fontSize: '0.9rem', fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 15px rgba(168,85,247,0.35)', transition: 'all 200ms ease',
                    letterSpacing: '0.04em',
                  }}
                >
                  <FileText size={17} /> Request a Quote
                </button>
                {service.booking_required && (
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', margin: 0 }}>
                    Booking required for this service
                  </p>
                )}
              </div>

              {/* Deliverables */}
              {hasDeliverables && (
                <div style={{ background: 'white', borderRadius: 12, padding: '16px 18px', border: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Package size={13} style={{ color: '#a855f7' }} /> What You'll Get
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {service.deliverables.map((d, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <Check size={10} style={{ color: '#a855f7' }} />
                        </span>
                        <span style={{ fontSize: '0.83rem', color: '#374151', lineHeight: 1.4 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Required products */}
              {(requiredProducts.length > 0 || true) && (
                <div style={{ background: '#fff7f7', borderRadius: 12, padding: '16px 18px', border: '1px solid #fecaca' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wrench size={13} /> Required Products
                  </p>
                  {requiredProducts.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {requiredProducts.map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <AlertCircle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                            <div>
                              <p style={{ fontSize: '0.83rem', fontWeight: 600, color: '#374151', margin: 0 }}>{item.name}</p>
                              {item.description && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>{item.description}</p>}
                            </div>
                          </div>
                          {item.price && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>{formatCurrency(item.price)}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>No specific products listed, but requirements may apply.</p>
                  )}
                  <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: 10, marginBottom: 0 }}>
                    These items must be available before the service can be delivered.
                  </p>
                </div>
              )}

              {/* Optional products */}
              {optionalProducts.length > 0 && (
                <div style={{ background: '#eff6ff', borderRadius: 12, padding: '16px 18px', border: '1px solid #bfdbfe' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Package size={13} /> Optional Add-ons
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {optionalProducts.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <CheckCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
                          <div>
                            <p style={{ fontSize: '0.83rem', fontWeight: 600, color: '#374151', margin: 0 }}>{typeof item === 'string' ? item : item.name}</p>
                            {item.description && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>{item.description}</p>}
                          </div>
                        </div>
                        {item.price && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>+ {formatCurrency(item.price)}</span>}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.72rem', color: '#2563eb', marginTop: 10, marginBottom: 0 }}>
                    Optional items that can enhance or speed up the service.
                  </p>
                </div>
              )}

            </div>
          </div>

          {/* ── TABS: Description / Features / Requirements ───────────────── */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: 48 }}>
            {/* Tab headers */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '0 24px' }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                  style={{
                    padding: '16px 20px', fontSize: '0.85rem', fontWeight: 700,
                    color: activeTab === tab.id ? '#a855f7' : '#6b7280',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: activeTab === tab.id ? '2px solid #a855f7' : '2px solid transparent',
                    marginBottom: -1, transition: 'all 150ms ease', letterSpacing: '0.02em',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ padding: '32px', maxWidth: 720 }}>
              {activeTab === 'description' && (
                <div style={{ fontSize: '0.95rem', color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-line' }} className="dark:text-gray-300">
                  {service.description || 'No description available.'}
                </div>
              )}

              {activeTab === 'features' && service.features && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {service.features.map((feature, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <Check size={11} style={{ color: '#a855f7' }} />
                      </span>
                      <span style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.5 }} className="dark:text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'requirements' && service.requirements && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {service.requirements.map((req, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <AlertCircle size={11} style={{ color: '#3b82f6' }} />
                      </span>
                      <span style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.5 }} className="dark:text-gray-300">{req}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── RELATED SERVICES ──────────────────────────────────────────── */}
          {relatedServices && relatedServices.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', margin: 0 }} className="dark:text-white">
                  Related Services
                </h2>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{relatedServices.length} items</span>
              </div>
              <ServiceGrid services={relatedServices} columns={4} />
            </div>
          )}

        </div>
      </div>

      <Footer />
    </>
  );
};

export default ServiceDetail;

// ── Helpers ────────────────────────────────────────────────────────────────────
const pill = (color, bg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em',
  color, background: bg, padding: '4px 10px', borderRadius: 20,
  textTransform: 'uppercase',
});

const arrowBtn = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 10,
  width: 36, height: 36, borderRadius: '50%', background: 'white',
  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)', color: '#374151',
  transition: 'transform 150ms ease',
};