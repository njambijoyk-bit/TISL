import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Save, Eye, Upload, X, Plus, Trash2, Info,
} from 'lucide-react';
import useServiceStore from '../../store/serviceStore';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import { getAvailableServices, getAvailableProducts } from '../../api/services';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};
const hintStyle = { fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 };

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
  padding: 20,
};

const sectionHeader = {
  fontSize: '0.875rem', fontWeight: 700, color: '#7c3aed',
  margin: '0 0 16px', paddingBottom: 12,
  borderBottom: '1px solid rgba(168,85,247,0.08)',
};

// ── Atom components ───────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      {children}
      {hint && <p style={hintStyle}>{hint}</p>}
    </div>
  );
}

function SI({ style: extra = {}, ...props }) {
  return (
    <input {...props} style={{ ...inputStyle, ...extra }}
      onFocus={inputFocus} onBlur={inputBlur} />
  );
}

function SS({ children, style: extra = {}, ...props }) {
  return (
    <select {...props} style={{ ...inputStyle, ...extra }}
      onFocus={inputFocus} onBlur={inputBlur}>
      {children}
    </select>
  );
}

function ST({ rows = 4, style: extra = {}, ...props }) {
  return (
    <textarea {...props} rows={rows}
      style={{ ...inputStyle, resize: 'none', ...extra }}
      onFocus={inputFocus} onBlur={inputBlur} />
  );
}

function Toggle({ checked, onChange, label, sub }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
      background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.1)',
      userSelect: 'none',
    }}>
      <div>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: '0 0 1px' }}>{label}</p>
        {sub && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{sub}</p>}
      </div>
      <div style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
        background: checked ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.15)',
        transition: 'background 200ms',
      }}>
        <span style={{
          position: 'absolute', top: 3, width: 14, height: 14, borderRadius: '50%',
          background: checked ? 'white' : '#c4b5fd',
          left: checked ? 19 : 3, transition: 'left 200ms',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={card}>
      <p style={sectionHeader}>{title}</p>
      {children}
    </div>
  );
}

function GhostBtn({ onClick, children, danger }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 600,
      fontFamily: 'inherit', cursor: 'pointer', border: 'none', transition: 'background 120ms',
      background: danger ? 'rgba(239,68,68,0.07)' : 'transparent',
      color: danger ? '#ef4444' : '#9ca3af',
    }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.14)' : 'rgba(168,85,247,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.07)' : 'transparent'}
    >
      {children}
    </button>
  );
}

function OutlineBtn({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
      fontFamily: 'inherit', cursor: 'pointer',
      border: '1.5px solid rgba(168,85,247,0.25)', color: '#7c3aed',
      background: 'rgba(168,85,247,0.04)', transition: 'background 150ms',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.1)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.04)'}
    >
      {children}
    </button>
  );
}

// Searchable picker — type to filter, selected shown as removable pills
function SearchPicker({ items, selected, onToggle, emptyMsg, placeholder = 'Search…' }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);

  const filtered = query.trim()
    ? items.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        (i.sku  && i.sku.toLowerCase().includes(query.toLowerCase()))
      )
    : items;

  const selectedItems = items.filter(i => selected.includes(i.id));

  return (
    <div>
      {/* Selected pills */}
      {selectedItems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {selectedItems.map(item => (
            <span key={item.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
              background: 'rgba(168,85,247,0.08)', color: '#7c3aed',
              border: '1px solid rgba(168,85,247,0.22)',
            }}>
              {item.name}
              {item.sku && <span style={{ fontSize: '0.62rem', color: '#c4b5fd', fontFamily: 'monospace' }}>{item.sku}</span>}
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                style={{
                  width: 16, height: 16, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: 'rgba(168,85,247,0.15)', color: '#7c3aed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, padding: 0, transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.15)'}
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{ ...inputStyle }}
          onBlur={e => {
            // small delay so click on dropdown item registers first
            setTimeout(() => setOpen(false), 150);
            e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
        />
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
            background: 'white', borderRadius: 10,
            border: '1.5px solid rgba(168,85,247,0.2)',
            boxShadow: '0 8px 24px rgba(168,85,247,0.12)',
            maxHeight: 220, overflowY: 'auto',
          }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', padding: '10px 14px', margin: 0 }}>
                {items.length === 0 ? emptyMsg : 'No matches'}
              </p>
            ) : filtered.map(item => {
              const isSelected = selected.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={() => { onToggle(item.id); setQuery(''); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', background: isSelected ? 'rgba(168,85,247,0.06)' : 'none',
                    border: 'none', borderBottom: '1px solid rgba(168,85,247,0.05)',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'rgba(168,85,247,0.06)' : 'none'}
                >
                  {/* Checkmark */}
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: isSelected ? '2px solid #a855f7' : '2px solid rgba(168,85,247,0.3)',
                    background: isSelected ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: isSelected ? 600 : 400, flex: 1 }}>
                    {item.name}
                  </span>
                  {item.sku && (
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace', flexShrink: 0 }}>
                      {item.sku}
                    </span>
                  )}
                  {item.price != null && (
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', flexShrink: 0 }}>
                      KES {Number(item.price).toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Count hint */}
      {selectedItems.length > 0 && (
        <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 5 }}>
          {selectedItems.length} selected
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ServiceForm = () => {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const isEditMode  = !!id;

  const {
    currentService, categories = [], loading, error,
    fetchServiceById, fetchCategories, createService, updateService,
    clearCurrentService, clearError,
  } = useServiceStore();

  const [formData, setFormData] = useState({
    name: '', sku: '', category_id: '', type: 'standard',
    short_description: '', description: '',
    pricing_model: 'fixed', base_price: '', hourly_rate: '', daily_rate: '',
    minimum_charge: '', price_is_negotiable: false,
    estimated_duration: '', lead_time: '', service_area: '',
    unit_of_measure: 'project', requires_site_visit: false,
    is_remote_available: true, booking_required: false,
    max_concurrent_bookings: '', is_available: true, is_visible: true,
    is_featured: false, status: 'draft',
    brochure_url: '', video_url: '', badge: '', admin_notes: '',
  });

  const [features,     setFeatures]     = useState(['']);
  const [requirements, setRequirements] = useState(['']);
  const [deliverables, setDeliverables] = useState(['']);
  const [pricingTiers, setPricingTiers] = useState([]);

  const [relatedServices,  setRelatedServices]  = useState([]);
  const [requiredProducts, setRequiredProducts] = useState([]);
  const [optionalProducts, setOptionalProducts] = useState([]);

  const [mainImageFile,    setMainImageFile]    = useState(null);
  const [mainImagePreview, setMainImagePreview] = useState('');
  const [mainImageUrl,     setMainImageUrl]     = useState('');
  const [galleryFiles,     setGalleryFiles]     = useState([]);
  const [galleryUrls,      setGalleryUrls]      = useState(['']);
  const [galleryPreviews,  setGalleryPreviews]  = useState([]);

  const [availableServices, setAvailableServices] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories({ all: true });
    loadAvailableServicesAndProducts();
    if (isEditMode && id) fetchServiceById(id);
    return () => { clearCurrentService(); clearError(); };
  }, [id]);

  const loadAvailableServicesAndProducts = async () => {
    try {
      const [svc, prd] = await Promise.all([getAvailableServices(), getAvailableProducts()]);
      setAvailableServices(svc || []); setAvailableProducts(prd || []);
    } catch { setAvailableServices([]); setAvailableProducts([]); }
  };

  useEffect(() => {
    if (!isEditMode || !currentService) return;
    const cs = currentService;
    setFormData({
      name: cs.name || '', sku: cs.sku || '', category_id: cs.category_id || '',
      type: cs.type || 'standard', short_description: cs.short_description || '',
      description: cs.description || '', pricing_model: cs.pricing_model || 'fixed',
      base_price: cs.base_price || '', hourly_rate: cs.hourly_rate || '',
      daily_rate: cs.daily_rate || '', minimum_charge: cs.minimum_charge || '',
      price_is_negotiable: cs.price_is_negotiable || false,
      estimated_duration: cs.estimated_duration || '', lead_time: cs.lead_time || '',
      service_area: cs.service_area || '', unit_of_measure: cs.unit_of_measure || 'project',
      requires_site_visit: cs.requires_site_visit || false,
      is_remote_available: cs.is_remote_available !== undefined ? cs.is_remote_available : true,
      booking_required: cs.booking_required || false,
      max_concurrent_bookings: cs.max_concurrent_bookings || '',
      is_available: cs.is_available !== undefined ? cs.is_available : true,
      is_visible: cs.is_visible !== undefined ? cs.is_visible : true,
      is_featured: cs.is_featured || false, status: cs.status || 'draft',
      brochure_url: cs.brochure_url || '', video_url: cs.video_url || '',
      badge: cs.badge || '', admin_notes: cs.admin_notes || '',
    });
    setFeatures(cs.features?.length > 0 ? cs.features : ['']);
    setRequirements(cs.requirements?.length > 0 ? cs.requirements : ['']);
    setDeliverables(cs.deliverables?.length > 0 ? cs.deliverables : ['']);
    setPricingTiers(cs.pricing_tiers || []);
    setRelatedServices(cs.related_services || []);
    setRequiredProducts(cs.required_products || []);
    setOptionalProducts(cs.optional_products || []);
    if (cs.main_image) { setMainImagePreview(cs.main_image); if (cs.main_image.startsWith('http')) setMainImageUrl(cs.main_image); }
    if (Array.isArray(cs.images) && cs.images.length > 0) {
      const urls = cs.images.filter(i => typeof i === 'string');
      setGalleryUrls(urls.length > 0 ? urls : ['']);
    }
  }, [currentService, isEditMode]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const setF = (k) => (v) => setFormData(p => ({ ...p, [k]: v }));

  // Array fields
  const arrChange = (i, v, setter, arr) => { const u = [...arr]; u[i] = v; setter(u); };
  const arrAdd    = (setter, arr) => setter([...arr, '']);
  const arrRemove = (i, setter, arr) => { if (arr.length > 1) setter(arr.filter((_, j) => j !== i)); };

  // Pricing tiers
  const addTier    = () => setPricingTiers(p => [...p, { min_quantity: '', max_quantity: '', price: '', description: '' }]);
  const removeTier = (i) => setPricingTiers(p => p.filter((_, j) => j !== i));
  const updateTier = (i, f, v) => { const u = [...pricingTiers]; u[i][f] = v; setPricingTiers(u); };

  // Images
  const handleMainImageChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setMainImageFile(file); setMainImageUrl('');
    const r = new FileReader(); r.onloadend = () => setMainImagePreview(r.result); r.readAsDataURL(file);
  };
  const handleGalleryFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setGalleryFiles(files);
    const previews = []; files.forEach(f => { const r = new FileReader(); r.onloadend = () => { previews.push(r.result); if (previews.length === files.length) setGalleryPreviews([...previews]); }; r.readAsDataURL(f); });
  };

  // Related toggles
  const toggleRelated  = (sid) => setRelatedServices(p => p.includes(sid) ? p.filter(x => x !== sid) : [...p, sid]);
  const toggleRequired = (pid) => {
    setRequiredProducts(p => {
      if (!p.includes(pid)) { setOptionalProducts(o => o.filter(x => x !== pid)); return [...p, pid]; }
      return p.filter(x => x !== pid);
    });
  };
  const toggleOptional = (pid) => setOptionalProducts(p => p.includes(pid) ? p.filter(x => x !== pid) : [...p, pid]);

  const validateForm = () => {
    if (!formData.name.trim()) return 'Service name is required';
    if (!formData.category_id) return 'Category is required';
    if (!formData.pricing_model) return 'Pricing model is required';
    if (formData.pricing_model === 'fixed' && !formData.base_price) return 'Base price is required for fixed pricing';
    if (formData.pricing_model === 'hourly' && !formData.hourly_rate) return 'Hourly rate is required';
    if (formData.pricing_model === 'daily'  && !formData.daily_rate)  return 'Daily rate is required';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateForm(); if (err) { alert(err); return; }
    setSubmitting(true);
    try {
      const data = {
        ...formData,
        features:     features.filter(f => f.trim()),
        requirements: requirements.filter(r => r.trim()),
        deliverables: deliverables.filter(d => d.trim()),
        pricing_tiers:    pricingTiers.length > 0 ? pricingTiers.map(t => ({ ...t, min_quantity: t.min_quantity ? parseInt(t.min_quantity) : null, max_quantity: t.max_quantity ? parseInt(t.max_quantity) : null, price: t.price ? parseFloat(t.price) : null })) : null,
        related_services:  relatedServices,
        required_products: requiredProducts,
        optional_products: optionalProducts,
        mainImageFile,
        mainImageUrl: mainImageUrl && !mainImageFile ? mainImageUrl : null,
        galleryFiles,
        galleryUrls: galleryUrls.filter(u => u?.trim()),
      };
      if (data.base_price) data.base_price = parseFloat(data.base_price);
      if (data.hourly_rate) data.hourly_rate = parseFloat(data.hourly_rate);
      if (data.daily_rate)  data.daily_rate  = parseFloat(data.daily_rate);
      if (data.minimum_charge) data.minimum_charge = parseFloat(data.minimum_charge);
      if (data.max_concurrent_bookings) data.max_concurrent_bookings = parseInt(data.max_concurrent_bookings);

      if (isEditMode) await updateService(id, data);
      else await createService(data);
      navigate('/admin/services');
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to save service');
    } finally { setSubmitting(false); }
  };

  const submitWithStatus = (status) => {
    setFormData(p => ({ ...p, status }));
    setTimeout(() => document.getElementById('service-form').requestSubmit(), 100);
  };

  if (loading && isEditMode) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoadingSpinner size="lg" />
      </div>
    </AdminLayout>
  );

  const showBasePrice  = ['fixed','project_based','subscription'].includes(formData.pricing_model);
  const showHourly     = formData.pricing_model === 'hourly';
  const showDaily      = formData.pricing_model === 'daily';

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <button onClick={() => navigate('/admin/services')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.78rem', color: '#9ca3af', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, transition: 'color 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
            >
              <ChevronLeft size={14} /> Services
            </button>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 3px' }}>
              {isEditMode ? 'Edit service' : 'New service'}
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              {isEditMode ? 'Update service information' : 'Add a new service to your catalogue'}
            </p>
          </div>
          <button onClick={() => navigate('/admin/services')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 600,
            background: 'transparent', color: '#9ca3af',
            border: '1.5px solid rgba(168,85,247,0.2)', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'border-color 150ms, color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#a855f7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)';  e.currentTarget.style.color = '#9ca3af'; }}
          >
            <ChevronLeft size={13} /> Back
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
            fontSize: '0.82rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <X size={14} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}

        <form id="service-form" onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'start' }}>

            {/* ── Left column ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Basic info */}
              <SectionCard title="Basic information">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Field label="Service name *">
                    <SI name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Network Installation & Configuration" required />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="SKU" hint="Leave blank to auto-generate">
                      <SI name="sku" value={formData.sku} onChange={handleChange} placeholder="SRV-001" style={{ fontFamily: 'monospace' }} />
                    </Field>
                    <Field label="Category *">
                      <SS name="category_id" value={formData.category_id} onChange={handleChange} required>
                        <option value="">Select category</option>
                        {(Array.isArray(categories) ? categories : []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </SS>
                    </Field>
                    <Field label="Service type">
                      <SS name="type" value={formData.type} onChange={handleChange}>
                        <option value="standard">Standard</option>
                        <option value="custom">Custom</option>
                        <option value="consultation">Consultation</option>
                        <option value="maintenance">Maintenance</option>
                      </SS>
                    </Field>
                    <Field label="Unit of measure">
                      <SS name="unit_of_measure" value={formData.unit_of_measure} onChange={handleChange}>
                        <option value="project">Per project</option>
                        <option value="hour">Per hour</option>
                        <option value="day">Per day</option>
                        <option value="month">Per month</option>
                        <option value="year">Per year</option>
                      </SS>
                    </Field>
                  </div>
                  <Field label="Short description" hint="2–3 sentences — used for meta description and listings">
                    <ST name="short_description" value={formData.short_description} onChange={handleChange} rows={2} placeholder="Brief description" />
                  </Field>
                  <Field label="Full description">
                    <ST name="description" value={formData.description} onChange={handleChange} rows={7} placeholder="Detailed description of the service…" />
                  </Field>
                </div>
              </SectionCard>

              {/* Pricing */}
              <SectionCard title="Pricing">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Pricing model *">
                    <SS name="pricing_model" value={formData.pricing_model} onChange={handleChange} required>
                      <option value="fixed">Fixed price</option>
                      <option value="hourly">Hourly rate</option>
                      <option value="daily">Daily rate</option>
                      <option value="project_based">Project based</option>
                      <option value="subscription">Subscription</option>
                    </SS>
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {showBasePrice && (
                      <Field label="Base price (KES) *">
                        <SI type="number" name="base_price" value={formData.base_price} onChange={handleChange} placeholder="0.00" step="0.01" min="0" required={formData.pricing_model === 'fixed'} />
                      </Field>
                    )}
                    {showHourly && (
                      <Field label="Hourly rate (KES) *">
                        <SI type="number" name="hourly_rate" value={formData.hourly_rate} onChange={handleChange} placeholder="0.00" step="0.01" min="0" required />
                      </Field>
                    )}
                    {showDaily && (
                      <Field label="Daily rate (KES) *">
                        <SI type="number" name="daily_rate" value={formData.daily_rate} onChange={handleChange} placeholder="0.00" step="0.01" min="0" required />
                      </Field>
                    )}
                    <Field label="Minimum charge (optional)">
                      <SI type="number" name="minimum_charge" value={formData.minimum_charge} onChange={handleChange} placeholder="0.00" step="0.01" min="0" />
                    </Field>
                  </div>
                  <Toggle checked={formData.price_is_negotiable} onChange={setF('price_is_negotiable')} label="Price is negotiable" />
                </div>
              </SectionCard>

              {/* Pricing tiers */}
              <SectionCard title="Pricing tiers (optional)">
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: -8, marginBottom: 14 }}>
                  Offer volume discounts or tiered pricing.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pricingTiers.map((tier, i) => (
                    <div key={i} style={{ padding: 14, borderRadius: 10, border: '1.5px solid rgba(168,85,247,0.12)', background: 'rgba(168,85,247,0.02)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed' }}>Tier {i + 1}</span>
                        <GhostBtn onClick={() => removeTier(i)} danger><Trash2 size={13} /></GhostBtn>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                        {[['min_quantity','Min qty','1'],['max_quantity','Max qty','10'],['price','Price (KES)','0.00']].map(([f, lbl, ph]) => (
                          <Field key={f} label={lbl}>
                            <SI type="number" value={tier[f]} onChange={e => updateTier(i, f, e.target.value)} placeholder={ph} min="0" step={f === 'price' ? '0.01' : '1'} />
                          </Field>
                        ))}
                      </div>
                      <Field label="Description">
                        <SI value={tier.description} onChange={e => updateTier(i, 'description', e.target.value)} placeholder="e.g. Bulk discount for 10+" />
                      </Field>
                    </div>
                  ))}
                  <OutlineBtn onClick={addTier}><Plus size={13} /> Add pricing tier</OutlineBtn>
                </div>
              </SectionCard>

              {/* Service details */}
              <SectionCard title="Service details">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Estimated duration">
                      <SI name="estimated_duration" value={formData.estimated_duration} onChange={handleChange} placeholder="e.g. 2–3 days" />
                    </Field>
                    <Field label="Lead time">
                      <SI name="lead_time" value={formData.lead_time} onChange={handleChange} placeholder="e.g. 1 week" />
                    </Field>
                    <Field label="Service area">
                      <SI name="service_area" value={formData.service_area} onChange={handleChange} placeholder="e.g. Nairobi & surrounding areas" />
                    </Field>
                    <Field label="Max concurrent bookings" hint="Leave blank for unlimited">
                      <SI type="number" name="max_concurrent_bookings" value={formData.max_concurrent_bookings} onChange={handleChange} placeholder="Unlimited" min="1" />
                    </Field>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Toggle checked={formData.requires_site_visit}  onChange={setF('requires_site_visit')}  label="Requires site visit" />
                    <Toggle checked={formData.is_remote_available}  onChange={setF('is_remote_available')}  label="Remote service available" />
                    <Toggle checked={formData.booking_required}     onChange={setF('booking_required')}     label="Booking required" />
                  </div>
                </div>
              </SectionCard>

              {/* Array fields: features, requirements, deliverables */}
              {[
                { title: 'Features',      state: features,     setter: setFeatures,     ph: 'Enter a feature…'          },
                { title: 'Requirements',  state: requirements, setter: setRequirements, ph: 'Enter a requirement…'      },
                { title: 'Deliverables',  state: deliverables, setter: setDeliverables, ph: 'What will the customer receive…' },
              ].map(({ title, state, setter, ph }) => (
                <SectionCard key={title} title={title}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {state.map((val, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <SI value={val} onChange={e => arrChange(i, e.target.value, setter, state)} placeholder={ph} style={{ flex: 1 }} />
                        {state.length > 1 && (
                          <GhostBtn onClick={() => arrRemove(i, setter, state)} danger><Trash2 size={13} /></GhostBtn>
                        )}
                      </div>
                    ))}
                    <OutlineBtn onClick={() => arrAdd(setter, state)}><Plus size={13} /> Add</OutlineBtn>
                  </div>
                </SectionCard>
              ))}

              {/* Related services & products */}
              <SectionCard title="Related services & products (optional)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <Field label="Related services" hint="Commonly purchased together — type to search">
                    <SearchPicker
                      items={availableServices.filter(s => s.id !== parseInt(id))}
                      selected={relatedServices}
                      onToggle={toggleRelated}
                      emptyMsg="No other services available"
                      placeholder="Search services…"
                    />
                  </Field>
                  <Field label="Required products" hint="Must be purchased with this service — type to search">
                    <SearchPicker
                      items={availableProducts}
                      selected={requiredProducts}
                      onToggle={toggleRequired}
                      emptyMsg="No products available"
                      placeholder="Search products…"
                    />
                  </Field>
                  <Field label="Optional products" hint="Recommended add-ons — type to search">
                    <SearchPicker
                      items={availableProducts.filter(p => !requiredProducts.includes(p.id))}
                      selected={optionalProducts}
                      onToggle={toggleOptional}
                      emptyMsg={requiredProducts.length > 0 ? 'All products are marked required' : 'No products available'}
                      placeholder="Search products…"
                    />
                  </Field>
                </div>
              </SectionCard>

              {/* Admin notes */}
              <SectionCard title="Admin notes">
                <ST name="admin_notes" value={formData.admin_notes} onChange={handleChange} rows={4} placeholder="Internal notes (not visible to customers)…" />
                <p style={{ ...hintStyle, display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
                  <Info size={11} style={{ flexShrink: 0 }} /> Only visible to admin users
                </p>
              </SectionCard>
            </div>

            {/* ── Right sidebar ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Publish actions */}
              <div style={card}>
                <p style={sectionHeader}>Publish</p>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                  background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)',
                }}>
                  <div>
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', margin: '0 0 1px' }}>Status</p>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>
                      {formData.status === 'active' ? 'Published' : 'Draft'}
                    </p>
                  </div>
                  <span style={{
                    padding: '2px 9px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700,
                    background: formData.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                    color: formData.status === 'active' ? '#065f46' : '#4b5563',
                    boxShadow: `0 0 0 1px ${formData.status === 'active' ? 'rgba(16,185,129,0.25)' : 'rgba(107,114,128,0.2)'}`,
                  }}>
                    {formData.status === 'active' ? 'Active' : 'Draft'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button type="button" onClick={() => submitWithStatus('draft')} disabled={submitting} style={{
                    width: '100%', padding: '10px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                    fontFamily: 'inherit', cursor: submitting ? 'not-allowed' : 'pointer',
                    border: '1.5px solid rgba(168,85,247,0.25)', color: '#7c3aed',
                    background: 'rgba(168,85,247,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    opacity: submitting ? 0.6 : 1, transition: 'background 150ms',
                  }}
                    onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.04)'}
                  >
                    <Save size={13} /> {submitting ? 'Saving…' : 'Save as draft'}
                  </button>
                  <button type="button" onClick={() => submitWithStatus('active')} disabled={submitting} style={{
                    width: '100%', padding: '10px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                    border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                    boxShadow: '0 4px 14px rgba(168,85,247,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    opacity: submitting ? 0.6 : 1, transition: 'box-shadow 150ms',
                  }}
                    onMouseEnter={e => { if (!submitting) e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'; }}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
                  >
                    <Eye size={13} /> {submitting ? 'Publishing…' : isEditMode ? 'Update & publish' : 'Publish service'}
                  </button>
                </div>
              </div>

              {/* Main image */}
              <div style={card}>
                <p style={sectionHeader}>Main image</p>
                {mainImagePreview && (
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <img src={mainImagePreview} alt="Preview" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 8, border: '1.5px solid rgba(168,85,247,0.15)', display: 'block' }} />
                    <button type="button" onClick={() => { setMainImageFile(null); setMainImagePreview(''); setMainImageUrl(''); }} style={{
                      position: 'absolute', top: -8, right: -8, width: 24, height: 24,
                      borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                    }}>
                      <X size={12} />
                    </button>
                  </div>
                )}
                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: 100, borderRadius: 9, cursor: 'pointer', gap: 6,
                  border: '1.5px dashed rgba(168,85,247,0.25)', background: 'rgba(168,85,247,0.03)',
                  transition: 'background 150ms',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                >
                  <Upload size={20} style={{ color: '#c4b5fd' }} />
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Click to upload</span>
                  <input type="file" accept="image/*" onChange={handleMainImageChange} style={{ display: 'none' }} />
                </label>
                <div style={{ marginTop: 12 }}>
                  <Field label="Or paste image URL">
                    <SI value={mainImageUrl} placeholder="https://example.com/image.jpg"
                      onChange={e => { setMainImageUrl(e.target.value); if (e.target.value) { setMainImagePreview(e.target.value); setMainImageFile(null); } }}
                    />
                  </Field>
                </div>
              </div>

              {/* Gallery images */}
              <div style={card}>
                <p style={sectionHeader}>Gallery images (optional)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Upload files">
                    <input type="file" accept="image/*" multiple onChange={handleGalleryFilesChange}
                      style={{ ...inputStyle, cursor: 'pointer', padding: '5px 10px' }} />
                  </Field>
                  {galleryPreviews.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {galleryPreviews.map((p, i) => (
                        <img key={i} src={p} alt={`Gallery ${i + 1}`} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(168,85,247,0.15)' }} />
                      ))}
                    </div>
                  )}
                  <Field label="Or add image URLs">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {galleryUrls.map((url, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6 }}>
                          <SI value={url} onChange={e => { const c = [...galleryUrls]; c[i] = e.target.value; setGalleryUrls(c); }} placeholder="https://…" style={{ flex: 1 }} />
                          {galleryUrls.length > 1 && (
                            <GhostBtn onClick={() => setGalleryUrls(galleryUrls.filter((_, j) => j !== i))} danger><Trash2 size={13} /></GhostBtn>
                          )}
                        </div>
                      ))}
                      <OutlineBtn onClick={() => setGalleryUrls(p => [...p, ''])}><Plus size={13} /> Add URL</OutlineBtn>
                    </div>
                  </Field>
                </div>
              </div>

              {/* Additional media */}
              <div style={card}>
                <p style={sectionHeader}>Additional media (optional)</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Brochure URL">
                    <SI name="brochure_url" value={formData.brochure_url} onChange={handleChange} placeholder="https://example.com/brochure.pdf" />
                  </Field>
                  <Field label="Video URL">
                    <SI name="video_url" value={formData.video_url} onChange={handleChange} placeholder="https://youtube.com/watch?v=…" />
                  </Field>
                </div>
              </div>

              {/* Visibility & badge */}
              <div style={card}>
                <p style={sectionHeader}>Visibility & badge</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Toggle checked={formData.is_available} onChange={setF('is_available')} label="Available for booking" />
                  <Toggle checked={formData.is_visible}   onChange={setF('is_visible')}   label="Visible to customers" />
                  <Toggle checked={formData.is_featured}  onChange={setF('is_featured')}  label="Featured service" />
                </div>
                <div style={{ marginTop: 12 }}>
                  <Field label="Badge" hint='e.g. "Popular", "New"'>
                    <SI name="badge" value={formData.badge} onChange={handleChange} placeholder="Optional badge text" />
                  </Field>
                </div>
              </div>

              {/* SEO note */}
              <div style={{ ...card, background: 'rgba(168,85,247,0.04)' }}>
                <p style={{ ...sectionHeader, marginBottom: 10 }}>SEO</p>
                <p style={{ fontSize: '0.75rem', color: '#7c3aed', margin: 0, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  Meta title, description and keywords are auto-generated from your service name and description.
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default ServiceForm;