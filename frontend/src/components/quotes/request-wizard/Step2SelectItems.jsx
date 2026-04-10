import React, { useState, useEffect } from 'react';
import { Package, Wrench, Plus, Trash2, X } from 'lucide-react';
import ProductSelectorModal from './ProductSelectorModal';
import ServiceSelectorModal from './ServiceSelectorModal';
import CustomItemModal from './CustomItemModal';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = 'outline', icon, size = 'md', type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb', boxShadow: 'none' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
  };
  return (
    <button type={type} onClick={onClick} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: size === 'sm' ? '5px 12px' : '8px 16px',
      borderRadius: 10, fontSize: size === 'sm' ? '0.75rem' : '0.83rem', fontWeight: 700,
      cursor: 'pointer', transition: 'transform 0.1s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

const StyledInput = (props) => (
  <input {...props} style={{
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.83rem', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  />
);

const StyledTextarea = ({ rows = 2, ...props }) => (
  <textarea rows={rows} {...props} style={{
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.83rem', outline: 'none', resize: 'vertical',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  />
);

const StyledSelect = ({ children, ...props }) => (
  <select {...props} style={{
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.83rem', outline: 'none', cursor: 'pointer',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; }}
  >
    {children}
  </select>
);

const FieldLabel = ({ children }) => (
  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{children}</label>
);

const Grid2 = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
);

const PRODUCT_UNITS = ['each','unit','piece','box','pack','set','dozen','kg','g','liter','ml','meter','cm','sqm','sqft'];
const SERVICE_UNITS = ['hour','day','week','month','session','visit','project','job','each'];

const fmt = (amount) => `KES ${parseFloat(amount || 0).toLocaleString()}`;

// ─── Component ────────────────────────────────────────────────────────────────
const Step2SelectItems = ({ formData, updateFormData }) => {
  const [activeTab,          setActiveTab]          = useState('products');
  const [showProductSelector,setShowProductSelector] = useState(false);
  const [showServiceSelector,setShowServiceSelector] = useState(false);
  const [showCustomModal,    setShowCustomModal]    = useState(false);
  const [editingItem,        setEditingItem]        = useState(null);
  const [previewImage,       setPreviewImage]       = useState(null);

  // Auto-switch to services tab if pre-populated with services only
  useEffect(() => {
    if (formData.selectedServices.length > 0 && formData.selectedProducts.length === 0) {
      setActiveTab('services');
    }
  }, []); // intentionally runs once on mount

  const toNumberOrNull = (v) => (v === '' || v === null || v === undefined ? null : (parseFloat(v) || null));

  const getServiceUnitPrice = (service) => {
    if (!service || service.price_is_negotiable) return null;
    switch (service.pricing_model) {
      case 'hourly': return service.hourly_rate ?? null;
      case 'daily': return service.daily_rate ?? null;
      default: return service.base_price ?? service.hourly_rate ?? service.daily_rate ?? null;
    }
  };

  const getServicePriceSuffix = (service) => {
    if (!service) return '';
    switch (service.pricing_model) {
      case 'hourly': return '/hour'; case 'daily': return '/day';
      case 'subscription': return '/subscription'; case 'project_based': return '/project';
      default: return '';
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleProductsSelected = (products) => {
    updateFormData({
      selectedProducts: [...formData.selectedProducts, ...products.map(p => ({
        product_id: p.id, product: p, quantity: 1, notes: '', is_custom: false,
        specifications: '', unit_of_measure: p.unit_of_measure ?? 'each',
        lead_time: p.lead_time ?? '', budget_per_unit: p.price ?? null,
      }))]
    });
    setShowProductSelector(false);
  };

  const handleServicesSelected = (services) => {
    updateFormData({
      selectedServices: [...formData.selectedServices, ...services.map(s => ({
        service_id: s.id, service: s, quantity: 1, estimated_hours: null, notes: '', is_custom: false,
        specifications: '', unit_of_measure: s.unit_of_measure ?? 'hour',
        lead_time: s.lead_time ?? '', budget_per_unit: getServiceUnitPrice(s),
      }))]
    });
    setShowServiceSelector(false);
  };

  const handleCustomItemCreated = (item) => {
    if (item.type === 'product') {
      updateFormData({
        selectedProducts: [...formData.selectedProducts, {
          product_id: null, product: null, quantity: item.quantity || 1,
          notes: item.notes || '', is_custom: true, budget_per_unit: item.price ?? null,
          custom_details: { description: item.name, specifications: item.pricing_notes, budget: item.price, unit_of_measure: item.unit_of_measure ?? null, lead_time: item.lead_time ?? null },
        }]
      });
    } else {
      updateFormData({
        selectedServices: [...formData.selectedServices, {
          service_id: null, service: null, quantity: item.quantity || 1,
          estimated_hours: item.estimated_hours, notes: item.notes || '', is_custom: true, budget_per_unit: item.price ?? null,
          custom_details: { description: item.name, specifications: item.pricing_notes, budget: item.price, unit_of_measure: item.unit_of_measure ?? null, lead_time: item.lead_time ?? null, estimated_hours: item.estimated_hours ?? null, quantity: item.quantity || 1 },
        }]
      });
    }
    setShowCustomModal(false);
  };

  const updateProduct = (index, updates) => {
    const updated = [...formData.selectedProducts];
    updated[index] = { ...updated[index], ...updates };
    updateFormData({ selectedProducts: updated });
  };

  const updateService = (index, updates) => {
    const updated = [...formData.selectedServices];
    updated[index] = { ...updated[index], ...updates };
    updateFormData({ selectedServices: updated });
  };

  const removeProduct = (index) => updateFormData({ selectedProducts: formData.selectedProducts.filter((_, i) => i !== index) });
  const removeService = (index) => updateFormData({ selectedServices: formData.selectedServices.filter((_, i) => i !== index) });

  // ── Item card helper ───────────────────────────────────────────────────────
  const ItemCard = ({ children, onRemove }) => (
    <div style={{ borderRadius: 12, border: '1.5px solid var(--border,#f3f4f6)', overflow: 'hidden', background: 'var(--panel-bg,white)' }}>
      {children}
    </div>
  );

  const ItemCardHeader = ({ name, subname, badge, isCustom, imageUrl, onRemove }) => (
    <div style={{ padding: '12px 14px', background: 'var(--row-bg,rgba(249,250,251,0.7))', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      {imageUrl && (
        <div onClick={e => { e.stopPropagation(); setPreviewImage(imageUrl); }} style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0, cursor: 'zoom-in', background: '#f3f4f6' }}>
          <img src={imageUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.85rem', fontWeight: 800, color: purple, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        {subname && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{subname}</p>}
        {isCustom && <span style={{ display: 'inline-block', fontSize: '0.65rem', fontWeight: 800, padding: '1px 7px', borderRadius: 9999, background: purpleLt, color: purple, marginTop: 3 }}>Custom</span>}
        {badge && !isCustom && <span style={{ display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: 9999, background: '#f3f4f6', color: '#6b7280', marginTop: 3 }}>{badge}</span>}
      </div>
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', display: 'flex', borderRadius: 6, flexShrink: 0 }}>
        <Trash2 size={15} />
      </button>
    </div>
  );

  const ItemCardBody = ({ children }) => (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {children}
    </div>
  );

  // ── Tab button ─────────────────────────────────────────────────────────────
  const TabBtn = ({ tabKey, icon: Icon, label, count }) => {
    const active = activeTab === tabKey;
    return (
      <button onClick={() => setActiveTab(tabKey)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 14px', border: 'none', background: 'transparent',
        borderBottom: active ? `2px solid ${purple}` : '2px solid transparent',
        marginBottom: -2, cursor: 'pointer',
        fontSize: '0.82rem', fontWeight: active ? 800 : 600,
        color: active ? purple : '#9ca3af',
        transition: 'color 0.15s',
      }}>
        <Icon size={15} />
        {label}
        {count > 0 && (
          <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: 9999, background: active ? purple : '#f3f4f6', color: active ? 'white' : '#9ca3af' }}>{count}</span>
        )}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`@media(max-width:520px){ .s2-grid2 { grid-template-columns:1fr !important; } }`}</style>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.02em', color: purple, margin: '0 0 5px' }}>Select Items</h2>
        <p style={{ fontSize: '0.83rem', color: '#9ca3af', margin: 0 }}>Choose products and services from our catalog or add custom items</p>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '2px solid var(--border,#f3f4f6)', display: 'flex', gap: 2 }}>
        <TabBtn tabKey="products" icon={Package} label="Products" count={formData.selectedProducts.length} />
        <TabBtn tabKey="services" icon={Wrench}  label="Services" count={formData.selectedServices.length} />
      </div>

      {/* ── PRODUCTS TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn variant="primary" icon={<Package size={14} />} onClick={() => setShowProductSelector(true)}>Browse Products</Btn>
            <Btn variant="ghost" icon={<Plus size={14} />} onClick={() => { setEditingItem({ type: 'product' }); setShowCustomModal(true); }}>Add Custom Product</Btn>
          </div>

          {formData.selectedProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', border: `2px dashed ${purpleBd}`, borderRadius: 14, background: purpleLt }}>
              <Package size={40} style={{ margin: '0 auto 10px', opacity: 0.3, color: purple }} />
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '0 0 4px' }}>No products selected yet</p>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Browse our catalog or add a custom product to get started</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: purple, margin: 0 }}>Selected Products ({formData.selectedProducts.length})</p>

              {formData.selectedProducts.map((item, index) => (
                <ItemCard key={index}>
                  <ItemCardHeader
                    name={item.is_custom ? item.custom_details.description : item.product?.name}
                    subname={!item.is_custom && item.product?.sku ? `SKU: ${item.product.sku}` : (!item.is_custom && item.product?.price ? `Catalog: ${fmt(item.product.price)}` : null)}
                    isCustom={item.is_custom}
                    badge={item.is_custom && item.custom_details.specifications ? item.custom_details.specifications : null}
                    imageUrl={item.product?.main_image_url}
                    onRemove={() => removeProduct(index)}
                  />
                  <ItemCardBody>
                    <div className="s2-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <FieldLabel>Quantity</FieldLabel>
                        <StyledInput type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => updateProduct(index, { quantity: parseFloat(e.target.value) || 1 })} />
                      </div>
                      <div>
                        <FieldLabel>Budget per Unit{(item.is_custom ? item.custom_details?.unit_of_measure : item.unit_of_measure) ? ` (${item.is_custom ? item.custom_details?.unit_of_measure : item.unit_of_measure})` : ''}</FieldLabel>
                        <StyledInput type="number" min="0" step="0.01" placeholder="e.g., 5000"
                          value={item.is_custom ? (item.custom_details?.budget ?? item.budget_per_unit ?? '') : (item.budget_per_unit ?? '')}
                          onChange={e => {
                            const val = toNumberOrNull(e.target.value);
                            item.is_custom
                              ? updateProduct(index, { budget_per_unit: val, custom_details: { ...(item.custom_details || {}), budget: val } })
                              : updateProduct(index, { budget_per_unit: val });
                          }}
                        />
                      </div>
                    </div>

                    <div className="s2-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <FieldLabel>Unit of Measure</FieldLabel>
                        <StyledSelect
                          value={item.is_custom ? (item.custom_details.unit_of_measure || '') : (item.unit_of_measure || '')}
                          onChange={e => item.is_custom
                            ? updateProduct(index, { custom_details: { ...item.custom_details, unit_of_measure: e.target.value } })
                            : updateProduct(index, { unit_of_measure: e.target.value })}
                        >
                          <option value="">Select unit</option>
                          {PRODUCT_UNITS.map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                        </StyledSelect>
                      </div>
                      <div>
                        <FieldLabel>Lead Time</FieldLabel>
                        <StyledInput type="text" placeholder="e.g., 3-5 days"
                          value={item.is_custom ? (item.custom_details.lead_time || '') : (item.lead_time || '')}
                          onChange={e => item.is_custom
                            ? updateProduct(index, { custom_details: { ...item.custom_details, lead_time: e.target.value } })
                            : updateProduct(index, { lead_time: e.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel>Specifications</FieldLabel>
                      <StyledTextarea placeholder="Specs, model, size, color…"
                        value={item.is_custom ? (item.custom_details.specifications || '') : (item.specifications || '')}
                        onChange={e => item.is_custom
                          ? updateProduct(index, { custom_details: { ...item.custom_details, specifications: e.target.value } })
                          : updateProduct(index, { specifications: e.target.value })}
                      />
                    </div>

                    <div>
                      <FieldLabel>Notes</FieldLabel>
                      <StyledTextarea placeholder="Any specific requirements for this product…" value={item.notes} onChange={e => updateProduct(index, { notes: e.target.value })} />
                    </div>
                  </ItemCardBody>
                </ItemCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SERVICES TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'services' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Btn variant="primary" icon={<Wrench size={14} />} onClick={() => setShowServiceSelector(true)}>Browse Services</Btn>
            <Btn variant="ghost" icon={<Plus size={14} />} onClick={() => { setEditingItem({ type: 'service' }); setShowCustomModal(true); }}>Add Custom Service</Btn>
          </div>

          {formData.selectedServices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', border: `2px dashed ${purpleBd}`, borderRadius: 14, background: purpleLt }}>
              <Wrench size={40} style={{ margin: '0 auto 10px', opacity: 0.3, color: purple }} />
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: '0 0 4px' }}>No services selected yet</p>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Browse our catalog or add a custom service to get started</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 700, color: purple, margin: 0 }}>Selected Services ({formData.selectedServices.length})</p>

              {formData.selectedServices.map((item, index) => (
                <ItemCard key={index}>
                  <ItemCardHeader
                    name={item.is_custom ? item.custom_details.description : (item.service?.name || 'Service')}
                    subname={!item.is_custom && item.service?.short_description ? item.service.short_description : (() => { const cp = getServiceUnitPrice(item.service); return cp ? `Catalog: ${fmt(cp)}${getServicePriceSuffix(item.service)}` : null; })()}
                    isCustom={item.is_custom}
                    imageUrl={item.service?.main_image_url}
                    onRemove={() => removeService(index)}
                  />
                  <ItemCardBody>
                    <div className="s2-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <FieldLabel>Quantity</FieldLabel>
                        <StyledInput type="number" min="0.01" step="0.01"
                          value={item.is_custom ? (item.custom_details?.quantity ?? item.quantity ?? 1) : (item.quantity ?? 1)}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 1;
                            item.is_custom
                              ? updateService(index, { quantity: val, custom_details: { ...(item.custom_details || {}), quantity: val } })
                              : updateService(index, { quantity: val });
                          }}
                        />
                      </div>
                      <div>
                        <FieldLabel>Unit of Measure</FieldLabel>
                        <StyledSelect
                          value={item.is_custom ? (item.custom_details?.unit_of_measure || '') : (item.unit_of_measure || '')}
                          onChange={e => item.is_custom
                            ? updateService(index, { custom_details: { ...(item.custom_details || {}), unit_of_measure: e.target.value } })
                            : updateService(index, { unit_of_measure: e.target.value })}
                        >
                          <option value="">Select unit</option>
                          {SERVICE_UNITS.map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                        </StyledSelect>
                      </div>
                    </div>

                    <div className="s2-grid2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <FieldLabel>Budget per Unit{(item.is_custom ? item.custom_details?.unit_of_measure : item.unit_of_measure) ? ` (${item.is_custom ? item.custom_details?.unit_of_measure : item.unit_of_measure})` : ''}</FieldLabel>
                        <StyledInput type="number" min="0" step="0.01" placeholder="e.g., 2500"
                          value={item.is_custom ? (item.custom_details?.budget ?? item.budget_per_unit ?? '') : (item.budget_per_unit ?? '')}
                          onChange={e => {
                            const val = toNumberOrNull(e.target.value);
                            item.is_custom
                              ? updateService(index, { budget_per_unit: val, custom_details: { ...(item.custom_details || {}), budget: val } })
                              : updateService(index, { budget_per_unit: val });
                          }}
                        />
                      </div>
                      <div>
                        <FieldLabel>Estimated Hours</FieldLabel>
                        <StyledInput type="number" min="0" step="0.5" placeholder="e.g., 8"
                          value={item.is_custom ? (item.custom_details?.estimated_hours ?? item.estimated_hours ?? '') : (item.estimated_hours ?? '')}
                          onChange={e => {
                            const val = e.target.value === '' ? null : (parseFloat(e.target.value) || null);
                            item.is_custom
                              ? updateService(index, { estimated_hours: val, custom_details: { ...(item.custom_details || {}), estimated_hours: val } })
                              : updateService(index, { estimated_hours: val });
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel>Lead Time</FieldLabel>
                      <StyledInput type="text" placeholder="e.g., 2 weeks"
                        value={item.is_custom ? (item.custom_details?.lead_time || '') : (item.lead_time || '')}
                        onChange={e => item.is_custom
                          ? updateService(index, { custom_details: { ...(item.custom_details || {}), lead_time: e.target.value } })
                          : updateService(index, { lead_time: e.target.value })}
                      />
                    </div>

                    <div>
                      <FieldLabel>Specifications</FieldLabel>
                      <StyledTextarea placeholder="Scope, requirements, tools, location constraints…"
                        value={item.is_custom ? (item.custom_details?.specifications || '') : (item.specifications || '')}
                        onChange={e => item.is_custom
                          ? updateService(index, { custom_details: { ...(item.custom_details || {}), specifications: e.target.value } })
                          : updateService(index, { specifications: e.target.value })}
                      />
                    </div>

                    <div>
                      <FieldLabel>Notes</FieldLabel>
                      <StyledTextarea placeholder="Any specific requirements for this service…" value={item.notes} onChange={e => updateService(index, { notes: e.target.value })} />
                    </div>
                  </ItemCardBody>
                </ItemCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary bar */}
      {(formData.selectedProducts.length > 0 || formData.selectedServices.length > 0) && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: purpleLt, border: `1.5px solid ${purpleBd}`, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <span style={{ fontSize: '0.78rem', color: purple, fontWeight: 700 }}>
            {formData.selectedProducts.length} Product{formData.selectedProducts.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '0.78rem', color: purple, fontWeight: 700 }}>
            {formData.selectedServices.length} Service{formData.selectedServices.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
            {formData.selectedProducts.length + formData.selectedServices.length} Total
          </span>
        </div>
      )}

      {/* Modals */}
      {showProductSelector && <ProductSelectorModal onClose={() => setShowProductSelector(false)} onSelect={handleProductsSelected} selectedProducts={formData.selectedProducts} />}
      {showServiceSelector && <ServiceSelectorModal onClose={() => setShowServiceSelector(false)} onSelect={handleServicesSelected} selectedServices={formData.selectedServices} />}
      {showCustomModal && <CustomItemModal type={editingItem?.type} onClose={() => { setShowCustomModal(false); setEditingItem(null); }} onSave={handleCustomItemCreated} />}

      {/* Image preview */}
      {previewImage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPreviewImage(null)}>
          <button onClick={() => setPreviewImage(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', padding: 8, cursor: 'pointer', display: 'flex' }}>
            <X size={22} color="white" />
          </button>
          <img src={previewImage} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default Step2SelectItems;