import ServiceVideoField from '../../components/admin/services/ServiceVideoField';
import ItemPinButton from '../../../campaigns/components/ItemPinButton';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useCalculatorContext from '../../../_shared/hooks/useCalculatorContext';
import {
  ChevronLeft, Save, Eye, Upload, X, Plus, Trash2, Info,
} from 'lucide-react';
import useServiceStore from '../../../_shared/store/serviceStore';
import useUomStore from '../../../_shared/store/uomStore';
import ServiceSelectorModalAdmin from '../../../core/components/admin/pickers/ServiceSelectorModalAdmin';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import LoadingSpinner from '../../../_shared/components/layout/LoadingSpinner';
import CurrencySelect from '../../../_shared/components/common/currency/CurrencySelect';
import ServiceCatalogEditor from '../../components/admin/services/ServiceCatalogEditor';
import TaxOverridesPanel from '../../../core/components/admin/tax/TaxOverridesPanel';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import useCurrencyStore from '../../../_shared/store/currencyStore';
import { getAvailableServices, getAvailableProducts, nextServiceSku } from '../../../_shared/api/services';
import noSlash from '../../../_shared/lib/noSlash';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'var(--surface-card, #fff)',
  border: '1.5px solid var(--line)',
  color: 'var(--text-primary)', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5,
};
const hintStyle = { fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 4 };

const card = {
  background: 'var(--surface-card, #fff)', borderRadius: 12,
  border: '1px solid var(--line)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
  padding: 20,
};

const sectionHeader = {
  fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary-600)',
  margin: '0 0 16px', paddingBottom: 12,
  borderBottom: '1px solid var(--line)',
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
      background: 'var(--surface-card, #fff)', border: '1.5px solid var(--line)',
      userSelect: 'none',
    }}>
      <div>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1px' }}>{label}</p>
        {sub && <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: 0 }}>{sub}</p>}
      </div>
      <div style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
        background: checked ? 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))' : 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
        transition: 'background 200ms',
      }}>
        <span style={{
          position: 'absolute', top: 3, width: 14, height: 14, borderRadius: '50%',
          background: checked ? 'var(--surface-card, #fff)' : '#c4b5fd',
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
      color: danger ? '#ef4444' : 'var(--text-tertiary)',
    }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.14)' : 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'}
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
      border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', color: 'var(--color-primary-600)',
      background: 'var(--surface-card, #fff)', transition: 'background 150ms',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'}
      onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)'}
    >
      {children}
    </button>
  );
}

// Searchable picker — type to filter, selected shown as removable pills
function SearchPicker({ items, selected, onToggle, emptyMsg, placeholder = 'Search…' }) {
  const adminCurrencies = useCurrencyStore(st => st.adminCurrencies);
  const currencyCode = (cid) => adminCurrencies.find(c => c.id === cid)?.code;
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
              background: 'var(--surface-card, #fff)', color: 'var(--color-primary-600)',
              border: '1px solid color-mix(in srgb, var(--color-primary-500) 22%, transparent)',
            }}>
              {item.name}
              {item.sku && <span style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{item.sku}</span>}
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                style={{
                  width: 16, height: 16, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', color: 'var(--color-primary-600)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, padding: 0, transition: 'background 120ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)'}
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
            e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
        />
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
            background: 'var(--surface-card, #fff)', borderRadius: 10,
            border: '1.5px solid var(--line)',
            boxShadow: '0 8px 24px color-mix(in srgb, var(--color-primary-500) 12%, transparent)',
            maxHeight: 220, overflowY: 'auto',
          }}>
            {filtered.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', padding: '10px 14px', margin: 0 }}>
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
                    padding: '9px 14px', background: isSelected ? 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)' : 'none',
                    border: 'none', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 5%, transparent)',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)'}
                  onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)' : 'none'}
                >
                  {/* Checkmark */}
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: isSelected ? '2px solid var(--color-primary-500)' : '2px solid color-mix(in srgb, var(--color-primary-500) 30%, transparent)',
                    background: isSelected ? 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: isSelected ? 600 : 400, flex: 1 }}>
                    {item.name}
                  </span>
                  {item.sku && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {item.sku}
                    </span>
                  )}
                  {item.price != null && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                      {currencyCode(item.currency_id) ?? 'KES'} {Number(item.price).toLocaleString()}
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
        <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 5 }}>
          {selectedItems.length} selected
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ServiceForm = () => {
  const { id }      = useParams();
  useCalculatorContext(id ? { type: 'service', id: Number(id) } : null);   // Alt+C: what did this service earn
  const navigate    = useNavigate();
  const isEditMode  = !!id;
  const [video, setVideo] = useState(null);   // the service's saved video, set from its own field

  const {
    currentService, categories = [], loading, error,
    fetchServiceById, fetchCategories, createService, updateService,
    clearCurrentService, clearError,
  } = useServiceStore();

  const { fetchUnits, unitsByDimension } = useUomStore();
  useEffect(() => { fetchUnits().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const serviceUnits = unitsByDimension('service_unit');

  const [formData, setFormData] = useState({
    name: '', sku: '', category_id: '', type: 'standard',
    short_description: '', description: '',
    base_price: '',
    minimum_charge: '', price_is_negotiable: false, currency_id: '',
    estimated_duration: '', lead_time: '', service_area: '',
    price_unit_id: '', delivery_mode: '', requires_site_visit: false,
    is_remote_available: true, booking_required: false,
    max_concurrent_bookings: '', is_available: true, is_visible: true,
    is_featured: false, status: 'draft',
    badge: '', admin_notes: '',
    sales_ledger_id: '',
  });

  const [features,     setFeatures]     = useState(['']);
  const [deliverables, setDeliverables] = useState(['']);

  const [relatedServices,  setRelatedServices]  = useState([]);

  const [mainImageFile,    setMainImageFile]    = useState(null);
  const [mainImagePreview, setMainImagePreview] = useState('');
  const [mainImageUrl,     setMainImageUrl]     = useState('');
  const [galleryFiles,     setGalleryFiles]     = useState([]);
  const [galleryUrls,      setGalleryUrls]      = useState(['']);
  const [galleryPreviews,  setGalleryPreviews]  = useState([]);

  const [showServiceSelector, setShowServiceSelector] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const adminCurrencies = useCurrencyStore(s => s.adminCurrencies);

  useEffect(() => {
    fetchCategories({ all: true });
    if (isEditMode && id) fetchServiceById(id);
    return () => { clearCurrentService(); clearError(); };
  }, [id]);

  // A new service (or an old one that never had a SKU) gets a unique SKU from the server as soon as the form is ready; still editable.
  useEffect(() => {
    if (formData.sku || (isEditMode && (!currentService || currentService.sku))) return undefined;
    let live = true;
    nextServiceSku().then((sku) => { if (live) setFormData((p) => (p.sku ? p : { ...p, sku })); }).catch(() => {});
    return () => { live = false; };
  }, [isEditMode, currentService, formData.sku]);

  useEffect(() => {
    if (!isEditMode || !currentService) return;
    const cs = currentService;
    setFormData({
      name: cs.name || '', sku: cs.sku || '', category_id: cs.category_id || '',
      type: cs.type || 'standard', short_description: cs.short_description || '',
      description: cs.description || '',
      base_price: cs.base_price || '',
      minimum_charge: cs.minimum_charge || '',
      price_is_negotiable: cs.price_is_negotiable || false,
      currency_id: cs.currency_id ?? cs.currency?.id ?? '',
      estimated_duration: cs.estimated_duration || '', lead_time: cs.lead_time || '',
      service_area: cs.service_area || '', price_unit_id: cs.price_unit_id ?? '', delivery_mode: cs.delivery_mode || '',
      requires_site_visit: cs.requires_site_visit || false,
      is_remote_available: cs.is_remote_available !== undefined ? cs.is_remote_available : true,
      booking_required: cs.booking_required || false,
      max_concurrent_bookings: cs.max_concurrent_bookings || '',
      is_available: cs.is_available !== undefined ? cs.is_available : true,
      is_visible: cs.is_visible !== undefined ? cs.is_visible : true,
      is_featured: cs.is_featured || false, status: cs.status || 'draft',
      badge: cs.badge || '', admin_notes: cs.admin_notes || '',
      sales_ledger_id: cs.sales_ledger_id ?? '',
    });
    setVideo(cs.video ?? null);
    setFeatures(cs.features?.length > 0 ? cs.features : ['']);
    setDeliverables(cs.deliverables?.length > 0 ? cs.deliverables : ['']);
    const normalizeItems = arr => (arr || []).map(s =>
      typeof s === 'object' ? { id: s.id, name: s.name } : { id: s, name: `Service #${s}` }
    );
    setRelatedServices(normalizeItems(cs.related_services_data ?? cs.related_services));

    
    if (cs.main_image) { setMainImagePreview(cs.main_image); if (cs.main_image.startsWith('http')) setMainImageUrl(cs.main_image); }
    if (Array.isArray(cs.images) && cs.images.length > 0) {
      const urls = cs.images.filter(i => typeof i === 'string');
      setGalleryUrls(urls.length > 0 ? urls : ['']);
    }
  }, [currentService, isEditMode]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : (name === 'sku' ? noSlash(value, 'A SKU') : value) }));
  };

  const setF = (k) => (v) => setFormData(p => ({ ...p, [k]: v }));

  // Array fields
  const arrChange = (i, v, setter, arr) => { const u = [...arr]; u[i] = v; setter(u); };
  const arrAdd    = (setter, arr) => setter([...arr, '']);
  const arrRemove = (i, setter, arr) => { if (arr.length > 1) setter(arr.filter((_, j) => j !== i)); };

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

  // Related toggles dead codes
  //const toggleRelated  = (sid) => setRelatedServices(p => p.includes(sid) ? p.filter(x => x !== sid) : [...p, sid]);

  const validateForm = () => {
    if (!formData.name.trim()) return 'Service name is required';
    if (!formData.category_id) return 'Category is required';
    if (!formData.price_is_negotiable && !formData.base_price) return 'A starting price is required (or mark the price as negotiable)';
    if (!formData.sales_ledger_id) return 'Service income account is required (Tax section)';
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
        deliverables: deliverables.filter(d => d.trim()),
        related_services: relatedServices.map(s => s.id ?? s),
        mainImageFile,
        mainImageUrl: mainImageUrl && !mainImageFile ? mainImageUrl : null,
        galleryFiles,
        galleryUrls: galleryUrls.filter(u => u?.trim()),
      };
      if (data.base_price) data.base_price = parseFloat(data.base_price);
      if (data.minimum_charge) data.minimum_charge = parseFloat(data.minimum_charge);
      if (data.max_concurrent_bookings) data.max_concurrent_bookings = parseInt(data.max_concurrent_bookings);

      if (isEditMode) { await updateService(id, data); navigate('/admin/services'); }
      else {
        // a new service goes straight to its edit page, where its options, packages and tax exemptions can now be added
        const created = await createService(data);
        if (created?.id) { toast.success('Service saved. Add its options and packages below.'); navigate(`/admin/services/${created.id}/edit`); }
        else navigate('/admin/services');
      }
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

  // Code shown in price labels: the chosen currency, else the base.
  const priceCurrencyCode =
    adminCurrencies.find(c => String(c.id) === String(formData.currency_id))?.code
    ?? adminCurrencies.find(c => c.is_base)?.code
    ?? 'KES';

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <button onClick={() => navigate('/admin/services')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.78rem', color: 'var(--text-tertiary)', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, transition: 'color 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-600)'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
            >
              <ChevronLeft size={14} /> Services
            </button>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary-500)', letterSpacing: '-0.02em', margin: '0 0 3px' }}>
              {isEditMode ? 'Edit service' : 'New service'}
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: 0 }}>
              {isEditMode ? 'Update service information' : 'Add a new service to your catalogue'}
            </p>
          </div>
          <button onClick={() => navigate('/admin/services')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 600,
            background: 'transparent', color: 'var(--text-tertiary)',
            border: '1.5px solid var(--line)', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'border-color 150ms, color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 45%, transparent)'; e.currentTarget.style.color = 'var(--color-primary-500)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)';  e.currentTarget.style.color = '#9ca3af'; }}
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
                    <Field label="SKU *" hint="Auto-generated, editable">
                      <SI name="sku" value={formData.sku} onChange={handleChange} placeholder="Generated for you" required style={{ fontFamily: 'monospace' }} />
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
                  <Field label="Currency" hint="Every rate below is in this currency. Shoppers see it converted to theirs.">
                    <CurrencySelect
                      value={formData.currency_id}
                      onChange={v => setFormData(p => ({ ...p, currency_id: v }))}
                      allowEmpty={!isEditMode}
                      emptyLabel="Base currency"
                    />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label={`Starting price (${priceCurrencyCode}, excl. tax)${formData.price_is_negotiable ? '' : ' *'}`} hint="Customers see it as 'From ...'. Each package below has its own exact price.">
                      <SI type="number" name="base_price" value={formData.base_price} onChange={handleChange} placeholder="0.00" step="0.01" min="0" required={!formData.price_is_negotiable} />
                    </Field>
                    <Field label="The price is per" hint="Service units come from Settings, Units of measure">
                      <SS name="price_unit_id" value={formData.price_unit_id} onChange={handleChange}>
                        <option value="">Not set</option>
                        {serviceUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </SS>
                    </Field>
                    <Field label={`Minimum charge (${priceCurrencyCode}, excl. tax, optional)`}>
                      <SI type="number" name="minimum_charge" value={formData.minimum_charge} onChange={handleChange} placeholder="0.00" step="0.01" min="0" />
                    </Field>
                  </div>
                  <Toggle checked={formData.price_is_negotiable} onChange={setF('price_is_negotiable')} label="Price is negotiable" />
                </div>
              </SectionCard>

              {/* Options, packages and requirements — once the service exists */}
              {isEditMode && id ? (
                <ServiceCatalogEditor serviceId={Number(id)} currencyCode={priceCurrencyCode} />
              ) : (
                <SectionCard title="Options & packages">
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: 0 }}>
                    Save the service first. It starts with a "Standard" package at the starting price; then add options and packages here.
                  </p>
                </SectionCard>
              )}

              {/* Tax: the sales account decides it (required); overrides need a saved service */}
              <SectionCard title="Tax">
                <SalesAccountSelect kind="sales" scope="service" required amount={formData.base_price} currencyCode={priceCurrencyCode} value={formData.sales_ledger_id}
                  onChange={(v) => setFormData((f) => ({ ...f, sales_ledger_id: v }))}
                  hint="The account decides the tax: an exempt service goes on an exempt account, a VAT-able one on a VAT-able account." />
              </SectionCard>
              {isEditMode && id
                ? <TaxOverridesPanel taxableType="service" taxableId={Number(id)} />
                : <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: '0 0 16px' }}>Exemptions for a single customer or district can be added once the service is saved.</p>}

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
                    <Field label="How it is delivered">
                      <SS name="delivery_mode" value={formData.delivery_mode} onChange={handleChange}>
                        <option value="">Not specified</option>
                        <option value="on_site">On-site (we come to you)</option>
                        <option value="in_branch">In a branch</option>
                        <option value="remote">Remote</option>
                        <option value="hybrid">Hybrid</option>
                      </SS>
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

                  <Field label="Related services" hint="Commonly purchased together">
                    {relatedServices.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {relatedServices.map(s => (
                          <span key={s.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                            background: 'var(--surface-card, #fff)', color: 'var(--color-primary-600)',
                            border: '1px solid color-mix(in srgb, var(--color-primary-500) 22%, transparent)',
                          }}>
                            {s.name}
                            <button type="button" onClick={() => setRelatedServices(prev => prev.filter(x => x.id !== s.id))}
                              style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                background: 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)', color: 'var(--color-primary-600)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 15%, transparent)'}
                            >
                              <X size={9} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => setShowServiceSelector(true)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 700,
                      background: 'var(--surface-card, #fff)', color: 'var(--color-primary-600)',
                      border: '1.5px dashed color-mix(in srgb, var(--color-primary-500) 30%, transparent)', cursor: 'pointer',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)'}
                    >
                      <Plus size={13} /> Browse services{relatedServices.length > 0 ? ` (${relatedServices.length} selected)` : ''}
                    </button>
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
                  background: 'var(--surface-card, #fff)', border: '1px solid var(--line)',
                }}>
                  <div>
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 1px' }}>Status</p>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', margin: 0 }}>
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
                    border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', color: 'var(--color-primary-600)',
                    background: 'var(--surface-card, #fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    opacity: submitting ? 0.6 : 1, transition: 'background 150ms',
                  }}
                    onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; }}
                    onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)'}
                  >
                    <Save size={13} /> {submitting ? 'Saving…' : 'Save as draft'}
                  </button>
                  <button type="button" onClick={() => submitWithStatus('active')} disabled={submitting} style={{
                    width: '100%', padding: '10px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                    border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
                    boxShadow: '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    opacity: submitting ? 0.6 : 1, transition: 'box-shadow 150ms',
                  }}
                    onMouseEnter={e => { if (!submitting) e.currentTarget.style.boxShadow = '0 6px 20px color-mix(in srgb, var(--color-primary-500) 50%, transparent)'; }}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)'}
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
                    <img src={mainImagePreview} alt="Preview" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--line)', display: 'block' }} />
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
                  border: '1.5px dashed color-mix(in srgb, var(--color-primary-500) 25%, transparent)', background: 'var(--surface-card, #fff)',
                  transition: 'background 150ms',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 7%, transparent)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)'}
                >
                  <Upload size={20} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Click to upload</span>
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
                        <img key={i} src={p} alt={`Gallery ${i + 1}`} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
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
                  <Field label="Video">
                    <ServiceVideoField serviceId={isEditMode ? Number(id) : null} video={video} onChange={setVideo} />
                  </Field>
                  <Field label="Brochure">
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>What the brochure shows, which template it uses and whether customers can download it are set on the <Link to="/admin/brochures" style={{ color: 'var(--color-primary-500)', fontWeight: 600 }}>Brochures</Link> tab.</span>
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
              <div style={{ ...card, background: 'var(--surface-card, #fff)' }}>
                <p style={{ ...sectionHeader, marginBottom: 10 }}>SEO</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-primary-600)', margin: 0, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  Meta title, description and keywords are auto-generated from your service name and description.
                </p>
              </div>
              <ItemPinButton itemType="service" itemId={isEditMode ? Number(id) : null} name={formData.name} categoryName={categories.find((c) => String(c.id) === String(formData.category_id))?.name} />
            </div>
          </div>
        </form>
      </div>
      {showServiceSelector && (
        <ServiceSelectorModalAdmin
          onClose={() => setShowServiceSelector(false)}
          selectedServices={relatedServices.map(s => ({ service_id: s.id }))}
          onSelect={(newServices) => {
            setRelatedServices(prev => {
              const existingIds = new Set(prev.map(s => s.id));
              return [...prev, ...newServices.filter(s => !existingIds.has(s.id))];
            });
            setShowServiceSelector(false);
          }}
        />
      )}
    </AdminLayout>
  );
};

export default ServiceForm;