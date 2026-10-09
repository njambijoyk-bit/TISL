import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
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
  FileText,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Check,
  Info,
  Heart,
  Play,
} from 'lucide-react';
import useServiceStore from '../../../_shared/store/serviceStore';
import useRequestListStore from '../../../_shared/store/requestListStore';
import useWishlistStore from '../../../_shared/store/wishlistStore';
import useServicePackages from '../../components/storefront/services/useServicePackages';
import ServicePackagePicker from '../../components/storefront/services/ServicePackagePicker';
import BrochureButton from '../../components/storefront/services/BrochureButton';
import BookServicePanel from '../../components/storefront/services/BookServicePanel';
import { formatMoney } from '../../../_shared/lib/money';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import { DetailVideo } from '../../components/storefront/services/ServiceVideoPlayer';
import ServiceGrid from '../../components/storefront/services/ServiceGrid';
import CollapsedServiceCard from '../../components/storefront/services/CollapsedServiceCard';
import LoadingSpinner from '../../../_shared/components/layout/LoadingSpinner';
import Button from '../../../_shared/components/common/Button';
import Badge from '../../../_shared/components/common/Badge';
import PriceBreakdown from '../../../_shared/components/common/PriceBreakdown';
import useMoney from '../../../_shared/hooks/useMoney';
import { servicePath, idFromParam, itemSlug } from '../../../_shared/lib/itemPath';
import Discussion from '../../../extras/components/engagement/Discussion';
import useEngagement from '../../../_shared/lib/engagementConfig';

const ServiceDetail = () => {
  const { id: idParam } = useParams();
  const [searchParams] = useSearchParams();
  const id = idFromParam(idParam);   // the address is id-SKU (12-ANG-001); the id is what is looked up
  const navigate = useNavigate();
  const reviewsOn = useEngagement().on('service', 'review');

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
  // tidy the address to the current id-SKU once the service is known (an old link, a bare id or an edited SKU)
  useEffect(() => { if (currentService?.id && String(currentService.id) === String(id) && idParam !== itemSlug(currentService)) navigate(servicePath(currentService), { replace: true }); }, [currentService]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Prices in the shopper's chosen currency. (Hook sits above the early
  // returns below, as hooks must.)
  const money = useMoney();

  // Options + packages (each with its own price, duration, unit) chosen by the shopper
  const picker = useServicePackages(id, searchParams.get('variant'));
  const pkg = picker.variant;
  const dispCode = picker.data?.display_currency;
  const fmtDisp = (n) => formatMoney(n ?? 0, dispCode, { decimals: 'auto' });
  const { hasService, toggleService } = useWishlistStore();
  const saved = currentService?.id ? hasService(currentService.id) : false;
  const addToRequest = useRequestListStore((s) => s.add);
  const handleRequestQuote = () => {
    addToRequest({ kind: 'service', service_id: currentService.id, service_variant_id: pkg?.id ?? null, name: currentService.name, variant_label: pkg ? (picker.label || pkg.name) : null, unit_code: null, quantity: 1 });
    toast.success(`${currentService?.name} added to your quote request`, { action: { label: 'View', onClick: () => navigate('/request-quote') } });
  };
  const trimNum = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const pkgDuration = pkg?.duration_value
    ? `${trimNum(pkg.duration_value)} ${(pkg.duration_unit?.name ?? '').toLowerCase()}${pkg.duration_value > 1 && pkg.duration_unit ? 's' : ''}`.trim()
    : null;

  const getPricingDisplay = () => {
    if (!currentService) return '';
    return money.servicePrice(currentService, { contactLabel: 'Contact for pricing' });
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
  

  const allImages = [
    service.main_image_url || service.main_image,
    ...(service.images_url || []),
  ].filter(Boolean);

  // The gallery runs: video (if any), main image, other images, then round to the video again.
  const media = [...(service.video ? [{ type: 'video', video: service.video }] : []), ...allImages.map((src) => ({ type: 'image', src }))];
  const current = media[selectedImageIdx] ?? media[0];

  const hasVariants = service.features && service.features.length > 0;
  const requirementFields = picker.data?.requirements ?? [];
  const hasRequirements = requirementFields.length > 0;
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary-500)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '3rem' }}>

            <div>
              {/* Title + Pills row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-primary-500)', lineHeight: 1.15, margin: 0, letterSpacing: '-0.03em', flex: '1 1 auto' }}>
                  {service.name}
                </h1>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0, paddingTop: 6 }}>
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
              </div>
            </div>
              
            {/* ── IMAGE GALLERY ── */}
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', maxHeight: 480, border: '1px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 8%, transparent), 0 0 20px color-mix(in srgb, var(--color-primary-500) 15%, transparent)' }}>

              {/* Main image — zoom on hover */}
              <div
                style={{ position: 'relative', background: 'white', aspectRatio: '16 / 9', overflow: 'hidden', cursor: 'zoom-in' }}
                onMouseEnter={e => e.currentTarget.querySelector('img')?.style && (e.currentTarget.querySelector('img').style.transform = 'scale(1.06)')}
                onMouseLeave={e => e.currentTarget.querySelector('img')?.style && (e.currentTarget.querySelector('img').style.transform = 'scale(1)')}
              >
                {/* Badges */}
                <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {service.is_featured && (
                    <span style={pill('var(--color-primary-600)', 'color-mix(in srgb, var(--color-primary-500) 10%, var(--bg-primary))')}><Star size={10} /> Featured</span>
                  )}
                  {service.is_remote_available && !service.requires_site_visit && (
                    <span style={pill('#059669', '#d1fae5')}><Monitor size={10} /> Remote</span>
                  )}
                  {service.requires_site_visit && (
                    <span style={pill('#2563eb', '#dbeafe')}><MapPin size={10} /> On-site</span>
                  )}
                </div>

                {/* Image counter */}
                {media.length > 1 && (
                  <div style={{
                    position: 'absolute', top: 14, right: 14, zIndex: 10,
                    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
                    color: '#fff', fontSize: '0.72rem', fontWeight: 700,
                    padding: '4px 10px', borderRadius: 20, letterSpacing: '0.05em',
                  }}>
                    {selectedImageIdx + 1} / {media.length}
                  </div>
                )}

                {/* Arrow nav */}
                {media.length > 1 && (
                  <>
                    <button onClick={() => setSelectedImageIdx(i => (i - 1 + media.length) % media.length)}
                      style={{ ...arrowBtn, left: 12 }}><ChevronLeft size={18} /></button>
                    <button onClick={() => setSelectedImageIdx(i => (i + 1) % media.length)}
                      style={{ ...arrowBtn, right: 12 }}><ChevronRight size={18} /></button>
                  </>
                )}

                {/* Video, image or placeholder */}
                {media.length === 0 || (current?.type === 'image' && imageErrors[selectedImageIdx]) ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', gap: 12 }}>
                    <Package size={56} style={{ color: '#d1d5db' }} />
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>No image available</span>
                  </div>
                ) : (
                  <>
                    {current.type === 'image' && (
                      <img
                        src={current.src}
                        alt={service.name}
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                          transition: 'transform 400ms ease, opacity 200ms ease',
                        }}
                        onError={() => handleImageError(selectedImageIdx)}
                      />
                    )}
                    {/* the video stays mounted so it keeps its place; it only plays when it is the chosen item and in view */}
                    {service.video && <div style={{ position: 'absolute', inset: 0, visibility: current.type === 'video' ? 'visible' : 'hidden' }}><DetailVideo video={service.video} active={current.type === 'video'} poster={allImages[0]} /></div>}
                  </>
                )}

                {/* Thumbnail strip — floats inside image at bottom */}
                {media.length > 1 && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)',
                    padding: '32px 14px 14px',
                    display: 'flex', gap: 8, overflowX: 'auto',
                  }}>
                    {media.map((m, idx) => {
                      const img = m.type === 'video' ? (m.video.thumb || allImages[0]) : m.src;
                      const hasError = m.type === 'image' && imageErrors[idx];
                      return hasError ? (
                        <div key={idx} style={{ width: 52, height: 52, borderRadius: 8, border: '2px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Package size={18} style={{ color: 'rgba(255,255,255,0.5)' }} />
                        </div>
                      ) : (
                        <button
                          key={idx}
                          onClick={() => setSelectedImageIdx(idx)}
                          style={{
                            width: 52, height: 52, borderRadius: 8, overflow: 'hidden', padding: 0, position: 'relative',
                            border: selectedImageIdx === idx ? '2px solid #fff' : '2px solid rgba(255,255,255,0.35)',
                            background: 'transparent', cursor: 'pointer', flexShrink: 0,
                            opacity: selectedImageIdx === idx ? 1 : 0.65,
                            transform: selectedImageIdx === idx ? 'scale(1.08)' : 'scale(1)',
                            transition: 'all 150ms ease',
                            boxShadow: selectedImageIdx === idx ? '0 0 0 2px color-mix(in srgb, var(--color-primary-500) 70%, transparent)' : 'none',
                          }}
                        >
                          {img ? <img src={img} alt={m.type === 'video' ? 'Video' : `View ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => handleImageError(idx)} /> : <span style={{ display: 'block', width: '100%', height: '100%', background: '#111827' }} />}
                          {m.type === 'video' && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(0,0,0,0.35)' }}><Play size={16} fill="#fff" /></span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── SERVICE INFO ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>             
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary-500)', lineHeight: 1.15, margin: 0, letterSpacing: '-0.03em', flex: '1 1 auto' }}>
                {service.name}
              </h1>
              {service.short_description && (
                <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: 8, lineHeight: 1.6, margin: '8px 0 0' }}>
                  {service.short_description}
                </p>
              )}
            </div>

              {/* Rating */}
              {reviewsOn && service.rating > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={15} style={{ color: i < Math.round(service.rating) ? '#f59e0b' : '#e5e7eb', fill: i < Math.round(service.rating) ? '#f59e0b' : '#e5e7eb' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>{Number(service.rating).toFixed(1)}</span>
                  <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>({service.review_count} reviews)</span>
                </div>
              )}

              {/* ── Pricing + Meta card ── */}
              <div style={{ borderRadius: 16, border: '1px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', overflow: 'hidden' }}>

                {/* Price row */}
                <div style={{ padding: '20px 20px 16px', background: 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-primary-500)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>
                    {service.price_unit_label ? `Starting price ${service.price_unit_label}` : 'Starting price'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--color-primary-500)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                      {pkg && pkg.display_price != null ? fmtDisp(pkg.display_price_incl ?? pkg.display_price) : getPricingDisplay()}
                    </span>
                    {pkg?.display_compare_at != null && pkg.display_compare_at > pkg.display_price && (
                      <span style={{ fontSize: '0.95rem', color: '#9ca3af', textDecoration: 'line-through' }}>{fmtDisp(pkg.display_compare_at)}</span>
                    )}
                    {pkg?.price_unit && (
                      <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>per {pkg.price_unit.name.toLowerCase()}</span>
                    )}
                    {service.minimum_charge && (
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500 }}>
                        min. {money.itemAmount(service.minimum_charge, service)}
                      </span>
                    )}
                  </div>
                </div>

                {pkg && picker.data?.tax_info && pkg.display_price != null && (
                  <div style={{ padding: '10px 20px', background: 'var(--surface-card, #fff)', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)' }}>
                    <PriceBreakdown parts={{ net: pkg.display_price, tax: pkg.display_tax ?? 0, gross: pkg.display_price_incl ?? pkg.display_price, info: picker.data.tax_info }} />
                  </div>
                )}

                {/* Meta row */}
                {(pkgDuration || service.estimated_duration || service.lead_time || service.service_area) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--surface-card, #fff)' }}>
                    {[
                      (pkgDuration || service.estimated_duration) && { icon: <Clock size={14} />, label: 'Duration', value: pkgDuration || service.estimated_duration },
                      service.lead_time        && { icon: <Calendar size={14} />, label: 'Lead Time', value: service.lead_time },
                      service.service_area     && { icon: <MapPin size={14} />, label: 'Area', value: service.service_area },
                    ].filter(Boolean).map((item, i, arr) => (
                      <div key={i} style={{
                        flex: '1 1 100px', padding: '14px 18px',
                        borderRight: i < arr.length - 1 ? '1px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, color: 'var(--color-primary-500)' }}>
                          {item.icon}
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {item.label}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <ServicePackagePicker picker={picker} />

              <div><BrochureButton service={service} /></div>
              <BookServicePanel serviceId={service.id} variantId={pkg?.id ?? null} money={formatMoney} />

              {/* CTA buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button" onClick={handleRequestQuote}
                  style={{ flex: '1 1 160px', height: 50, borderRadius: 12, cursor: 'pointer', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', border: 'none', color: '#ffffff', fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '0.04em' }}
                >
                  <FileText size={16} /> Request a quote
                </button>

                <button
                  type="button"
                  onClick={() => { toggleService(service.id); toast.success(saved ? 'Removed from wishlist' : 'Saved to wishlist'); }}
                  aria-pressed={saved}
                  aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                  style={{
                    width: 50, height: 50, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1.5px solid ' + (saved ? '#ef4444' : 'var(--line)'), background: saved ? 'rgba(239,68,68,0.06)' : 'white',
                  }}
                >
                  <Heart size={18} style={{ color: saved ? '#ef4444' : '#9ca3af', fill: saved ? '#ef4444' : 'none' }} />
                </button>

                {/* "Book this service" returns with the new booking system */}
              </div>


            </div>
          </div>

          {/* ── TABS: Description / Features / Requirements ───────────────── */}
          <div style={{ background: 'var(--surface-card, #fff)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden', marginBottom: 48 }}>
            {/* Deliverables */}
              {hasDeliverables && (
                <div style={{ background: 'var(--surface-card, #fff)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--line)' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Package size={13} style={{ color: 'var(--color-primary-500)' }} /> What You'll Get
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {service.deliverables.map((d, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <Check size={10} style={{ color: 'var(--color-primary-500)' }} />
                        </span>
                        <span style={{ fontSize: '0.83rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Tab headers */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 24px' }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                  style={{
                    padding: '16px 20px', fontSize: '0.85rem', fontWeight: 700,
                    color: activeTab === tab.id ? 'var(--color-primary-500)' : '#6b7280',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: activeTab === tab.id ? '2px solid var(--color-primary-500)' : '2px solid transparent',
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
                <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-line' }} className="dark:text-gray-300">
                  {service.description || 'No description available.'}
                </div>
              )}

              {activeTab === 'features' && service.features && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {service.features.map((feature, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <Check size={11} style={{ color: 'var(--color-primary-500)' }} />
                      </span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }} className="dark:text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'requirements' && hasRequirements && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>What we'll need from you for this service.</p>
                  {requirementFields.map((req) => (
                    <div key={req.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                        <AlertCircle size={11} style={{ color: '#3b82f6' }} />
                      </span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }} className="dark:text-gray-300">{req.label}{req.is_required ? ' *' : ''}{req.help_text ? <span style={{ color: 'var(--text-tertiary)' }}> — {req.help_text}</span> : null}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── REVIEWS (the Engagement Engine; nothing shows when it is off) ── */}
          {reviewsOn && service?.id && (
            <div style={{ background: 'var(--surface-card, #fff)', borderRadius: 16, border: '1px solid var(--line)', padding: '22px 24px', marginBottom: 48 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 14px' }}>Reviews</h2>
              <Discussion type="service" id={service.id} />
            </div>
          )}

          {/* ── RELATED SERVICES ──────────────────────────────────────────── */}
          {relatedServices && relatedServices.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-600)', letterSpacing: '-0.02em', margin: 0 }} className="dark:text-white">
                  Related Services
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{relatedServices.length} items</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {relatedServices.map(s => (
                  <CollapsedServiceCard key={s?.id} service={s} />
                ))}
            </div>
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