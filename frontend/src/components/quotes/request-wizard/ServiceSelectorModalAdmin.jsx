import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Wrench, Check, Star, Clock, X } from 'lucide-react';
import AdminPagination from '../../common/AdminPagination';
import useServiceStore from '../../../store/serviceStore';
import { servicesAPI } from '../../../api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, disabled, variant = 'outline', size = 'md', type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb', boxShadow: 'none' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: size === 'sm' ? '5px 12px' : '8px 18px',
      borderRadius: 10, fontSize: size === 'sm' ? '0.75rem' : '0.83rem', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      transition: 'transform 0.1s',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {children}
    </button>
  );
};

const StyledInput = ({ icon, ...props }) => (
  <div style={{ position: 'relative' }}>
    {icon && <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>{icon}</div>}
    <input {...props} style={{
      width: '100%', padding: icon ? '9px 12px 9px 36px' : '9px 12px', borderRadius: 10,
      border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
      color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
      transition: 'border-color 0.15s',
    }}
      onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
      onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
    />
  </div>
);

const StyledSelect = ({ children, style = {}, ...props }) => (
  <select {...props} style={{
    flex: 1, padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', cursor: 'pointer',
    ...style,
  }}
    onFocus={e => { e.target.style.borderColor = purple; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; }}
  >
    {children}
  </select>
);

const Pill = ({ children, color = '#6b7280', bg = '#f3f4f6' }) => (
  <span style={{ display: 'inline-block', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, background: bg, color, whiteSpace: 'nowrap' }}>{children}</span>
);

const fmt = (amount) => `KES ${parseFloat(amount || 0).toLocaleString()}`;

const getPricingDisplay = (service) => {
  if (service.price_is_negotiable) return 'Negotiable';
  switch (service.pricing_model) {
    case 'hourly':       return service.hourly_rate  ? `${fmt(service.hourly_rate)}/hr`   : 'Contact for pricing';
    case 'daily':        return service.daily_rate   ? `${fmt(service.daily_rate)}/day`   : 'Contact for pricing';
    case 'subscription': return service.base_price   ? `${fmt(service.base_price)}/mo`    : 'Contact for pricing';
    case 'fixed':
    case 'project_based':return service.base_price   ? `From ${fmt(service.base_price)}`  : 'Contact for pricing';
    default:             return 'Contact for pricing';
  }
};

// ─── Main component ───────────────────────────────────────────────────────────
const ServiceSelectorModalAdmin = ({ onClose, onSelect, selectedServices = [] }) => {
  const { services, categories, types, loading, fetchServices, fetchCategories, fetchTypes } = useServiceStore();

  const [searchTerm,       setSearchTerm]       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedType,     setSelectedType]     = useState('');
  const [localSelected,    setLocalSelected]    = useState([]);

  const [localServices,  setLocalServices]  = useState([]);
  const [localLoading,   setLocalLoading]   = useState(false);
  const [pagination,     setPagination]     = useState({ 
    current_page: 1, last_page: 1, per_page: 20, total: 0 
  });
  const [page, setPage] = useState(1);
  const perPage = 20;

  const fetchModalServices = useCallback(async (pageNum = 1, search = '', categoryId = '', type = '') => {
    setLocalLoading(true);
    try {
      const params = {
        page: pageNum,
        per_page: perPage,
        ...(search     ? { search }      : {}),
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(type       ? { type }        : {}),
      };
      // Clean empty params
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      
      // Use ADMIN endpoint (confirm this matches your Laravel route)
      const res = await servicesAPI.getAdminServices(params);
      
      setLocalServices(res.data || []);
      setPagination({
        current_page: res.current_page || 1,
        last_page:    res.last_page    || 1,
        per_page:     res.per_page     || perPage,
        total:        res.total        || 0,
      });
    } catch (err) {
      console.error('Failed to fetch modal services', err);
    } finally {
      setLocalLoading(false);
    }
  }, [perPage]);

  const alreadySelectedIds = useMemo(() =>
    selectedServices.filter(s => !s.is_custom && s.service_id).map(s => s.service_id),
    [selectedServices]
  );

  const displayServices = useMemo(() => {
    return localServices.filter(s => !alreadySelectedIds.includes(s?.id));
  }, [localServices, alreadySelectedIds]);

  useEffect(() => {
    fetchCategories();
    fetchTypes();
  }, [fetchCategories, fetchTypes]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    fetchModalServices(1, searchTerm, selectedCategory, selectedType);
  }, [searchTerm, selectedCategory, selectedType]); // eslint-disable-line

  // Fetch when page changes
  useEffect(() => {
    fetchModalServices(page, searchTerm, selectedCategory, selectedType);
  }, [page]); // eslint-disable-line

  const filteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter(s => {
      if (alreadySelectedIds.includes(s.id)) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!s.name?.toLowerCase().includes(q) && !s.short_description?.toLowerCase().includes(q) && !s.category?.name?.toLowerCase().includes(q)) return false;
      }
      if (selectedCategory && s.category_id !== parseInt(selectedCategory)) return false;
      if (selectedType && s.type !== selectedType) return false;
      return s.is_available && s.is_visible && s.status === 'active';
    });
  }, [services, searchTerm, selectedCategory, selectedType, alreadySelectedIds]);

  const toggleService = (service) => {
    setLocalSelected(prev =>
      prev.find(s => s.id === service.id) ? prev.filter(s => s.id !== service.id) : [...prev, service]
    );
  };

  const isSelected = (id) => localSelected.some(s => s.id === id);

  return (
    <>
      <style>{`
        @keyframes ssmFadeIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes ssmSlideUp { from { opacity:0; transform:translateY(20px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes ssmSpin    { to { transform:rotate(360deg); } }
        .ssm-overlay { animation: ssmFadeIn 0.2s ease both; }
        .ssm-modal   { animation: ssmSlideUp 0.25s ease both; }
        .ssm-card { border-radius:12px; border:1.5px solid var(--border,#f3f4f6); padding:14px; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s; background:var(--panel-bg,white); }
        .ssm-card:hover { border-color:${purpleBd}; }
        .ssm-card.sel  { border-color:${purple}; box-shadow:0 0 0 2px ${purpleBd}; background:${purpleLt}; }
      `}</style>

      {/* Backdrop */}
      <div className="ssm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }} onClick={onClose}>
        <div className="ssm-modal" style={{ width: '100%', maxWidth: 760, background: 'var(--panel-bg,white)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: purpleLt }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 900, color: purple, margin: 0 }}>Select Services</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#9ca3af', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>

          {/* Filters */}
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <StyledInput type="text" placeholder="Search services by name, description, or category…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} icon={<Search size={16} />} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StyledSelect value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                <option value="">All Categories</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </StyledSelect>
              <StyledSelect value={selectedType} onChange={e => setSelectedType(e.target.value)}>
                <option value="">All Types</option>
                {types?.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')}</option>)}
              </StyledSelect>
              {(searchTerm || selectedCategory || selectedType) && (
                <Btn variant="outline" size="sm" onClick={() => { setSearchTerm(''); setSelectedCategory(''); setSelectedType(''); }}>Clear</Btn>
              )}
            </div>
            {localSelected.length > 0 && (
              <div style={{ padding: '8px 12px', borderRadius: 10, background: purpleLt, border: `1.5px solid ${purpleBd}` }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: purple, margin: 0 }}>{localSelected.length} service{localSelected.length !== 1 ? 's' : ''} selected</p>
              </div>
            )}
          </div>

          {/* Services list */}
          <div style={{ padding: '14px 24px', maxHeight: '52vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
                <div style={{ width: 32, height: 32, border: `3px solid ${purpleLt}`, borderTopColor: purple, borderRadius: '50%', animation: 'ssmSpin 0.8s linear infinite' }} />
              </div>
            ) : displayServices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af' }}>
                <Wrench size={48} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
                <p style={{ fontSize: '0.85rem' }}>{searchTerm || selectedCategory || selectedType ? 'No services match your filters' : 'Loading services...'}</p>
              </div>
            ) : displayServices.map(service => {
              const sel = isSelected(service.id);
              return (
                <div key={service.id} className={`ssm-card${sel ? ' sel' : ''}`} onClick={() => toggleService(service)}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    {/* Check */}
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: sel ? purple : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, transition: 'background 0.15s' }}>
                      <Check size={13} color={sel ? 'white' : '#d1d5db'} strokeWidth={3} />
                    </div>

                    {/* Image */}
                    {service.main_image_url && (
                      <img src={service.main_image_url} alt={service.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                    )}

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                        <div>
                          <p style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 5px' }}>{service.name}</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {service.category?.name   && <Pill bg={purpleLt} color={purple}>{service.category.name}</Pill>}
                            {service.is_featured       && <Pill bg="rgba(245,158,11,0.1)" color="#d97706">⭐ Featured</Pill>}
                            {service.is_remote_available && <Pill bg="rgba(16,185,129,0.1)" color="#10b981">Remote</Pill>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: '0.88rem', fontWeight: 800, color: purple, margin: '0 0 2px' }}>{getPricingDisplay(service)}</p>
                          {service.minimum_charge && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>Min: {fmt(service.minimum_charge)}</p>}
                        </div>
                      </div>

                      {service.short_description && (
                        <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{service.short_description}</p>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {service.estimated_duration && <span style={{ fontSize: '0.72rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} />{service.estimated_duration}</span>}
                        {service.rating > 0 && <span style={{ fontSize: '0.72rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}><Star size={11} color="#f59e0b" fill="#f59e0b" />{service.rating.toFixed(1)} ({service.review_count})</span>}
                        {service.lead_time && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Lead: {service.lead_time}</span>}
                      </div>

                      {service.features?.length > 0 && (
                        <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {service.features.slice(0, 3).map((f, i) => <span key={i}>• {f}</span>)}
                          {service.features.length > 3 && <span style={{ fontStyle: 'italic' }}>+ {service.features.length - 3} more</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>{displayServices.length} service{displayServices.length !== 1 ? 's' : ''} available</p>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              {pagination.total} service{pagination.total !== 1 ? 's' : ''} available
            </p>
            
            <AdminPagination
              pagination={pagination}
              onPageChange={(newPage) => setPage(newPage)}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="outline" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={() => onSelect(localSelected)} disabled={localSelected.length === 0}>
                Add{localSelected.length > 0 ? ` (${localSelected.length})` : ''} Service{localSelected.length !== 1 ? 's' : ''}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ServiceSelectorModalAdmin;