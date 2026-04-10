import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Package, Wrench, Layers, Search, DollarSign } from 'lucide-react';
import Modal from '../common/Modal';
import LoadingSpinner from '../layout/LoadingSpinner';
import useProductStore from '../../store/productStore';
import useServiceStore from '../../store/serviceStore';

// ─── Design tokens (mirrors QuoteDetail / system) ────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Shared input base ────────────────────────────────────────────────────────
const iBase = {
  width: '100%', padding: '9px 12px', borderRadius: 9,
  border: '1.5px solid var(--border,#e5e7eb)', fontSize: '0.83rem',
  outline: 'none', color: 'var(--text,#111827)', boxSizing: 'border-box',
  fontWeight: 500, background: 'var(--input-bg,white)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
const fIn  = e => { e.currentTarget.style.borderColor = purple;    e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut = e => { e.currentTarget.style.borderColor = 'var(--border,#e5e7eb)'; e.currentTarget.style.boxShadow = 'none'; };

// ─── Atoms ────────────────────────────────────────────────────────────────────
const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
    {Icon && <Icon size={14} color={purple} />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>
      {children}
    </p>
  </div>
);

const FieldLabel = ({ children, required }) => (
  <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: 8 }}>
    {children}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
  </p>
);

const StatCell = ({ label, value, accent }) => (
  <div style={{
    padding: '10px 12px', borderRadius: 10,
    background: accent ? purpleLt : 'var(--row-bg,rgba(249,250,251,0.7))',
    border: `1px solid ${accent ? purpleBd : 'var(--border,#f3f4f6)'}`,
  }}>
    <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', margin: '0 0 3px' }}>{label}</p>
    <p style={{ fontSize: '0.88rem', fontWeight: 800, color: accent ? purple : 'var(--text,#111827)', margin: 0 }}>{value}</p>
  </div>
);

const Pill = ({ children, color = purple }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 9999,
    fontSize: '0.7rem', fontWeight: 700,
    color, background: `${color}18`, border: `1px solid ${color}30`,
  }}>
    <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
    {children}
  </span>
);

const Btn = ({ children, onClick, disabled, variant = 'primary', icon, size = 'md', fullWidth, type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    success: { background: 'linear-gradient(135deg,#10b981,#059669)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' },
    danger:  { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' },
    outline: { background: 'transparent', color: 'var(--text-muted,#6b7280)', border: '1.5px solid var(--border,#e5e7eb)', boxShadow: 'none' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
    warning: { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' },
  };
  const pad = size === 'sm' ? '6px 14px' : '9px 20px';
  const fs  = size === 'sm' ? '0.78rem' : '0.83rem';
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 10, fontSize: fs,
      fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s, transform 0.1s',
      width: fullWidth ? '100%' : undefined,
      justifyContent: fullWidth ? 'center' : undefined,
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

// Matches fmt / money from QuoteDetail
const fmt   = (n, d = 2) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));
const money = (v)        => `KSh ${fmt(v)}`;

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'products', label: 'Products',    icon: Package },
  { id: 'services', label: 'Services',    icon: Wrench  },
  { id: 'custom',   label: 'Custom Item', icon: Layers  },
];

// ─── Main component ───────────────────────────────────────────────────────────
const AddQuoteItemModal = ({ onClose, onAdd }) => {
  const [activeTab,      setActiveTab]      = useState('products');
  const [selectedItem,   setSelectedItem]   = useState(null);
  const [searchTerm,     setSearchTerm]     = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [submitting,     setSubmitting]     = useState(false);

  const [formData, setFormData] = useState({
    quantity: 1, unit_price: 0, discount_amount: 0, notes: '',
    name: '', description: '', estimated_hours: null,
  });

  const { products, categories: productCategories, fetchProducts, fetchCategories: fetchProductCategories } = useProductStore();
  const { services, categories: serviceCategories, fetchServices, fetchCategories: fetchServiceCategories } = useServiceStore();

  useEffect(() => {
    if (activeTab === 'products') { fetchProducts({ per_page: 100 }); fetchProductCategories(); }
    else if (activeTab === 'services') { fetchServices({ per_page: 100 }); fetchServiceCategories(); }
  }, [activeTab]);

  const filteredItems = useMemo(() => {
    let items = activeTab === 'products' ? (products || []) : (services || []);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      items = items.filter(i => i.name?.toLowerCase().includes(s) || i.sku?.toLowerCase().includes(s) || i.short_description?.toLowerCase().includes(s));
    }
    if (categoryFilter) items = items.filter(i => i.category_id === parseInt(categoryFilter));
    return items.filter(i => i.is_available && i.is_visible);
  }, [activeTab, products, services, searchTerm, categoryFilter]);

  const handleSelectItem = (item) => {
    setSelectedItem(item);
    setFormData(p => ({
      ...p,
      quantity:        activeTab === 'products' ? 1 : (item.estimated_hours || 1),
      unit_price:      item.price || item.hourly_rate || item.base_price || 0,
      discount_amount: 0,
      notes:           '',
      estimated_hours: activeTab === 'services' ? (item.estimated_hours || 1) : null,
    }));
  };

  const set = (field, value) => setFormData(p => ({ ...p, [field]: value }));

  const qty      = parseFloat(formData.quantity)        || 0;
  const price    = parseFloat(formData.unit_price)      || 0;
  const discount = parseFloat(formData.discount_amount) || 0;
  const lineTotal              = qty * price;
  const lineTotalAfterDiscount = Math.max(0, lineTotal - discount);
  const discountPct            = lineTotal > 0 ? ((discount / lineTotal) * 100).toFixed(1) : 0;

  const isService = activeTab === 'services';

  const handleAdd = async () => {
    setSubmitting(true);
    try {
      let itemData;
      if (activeTab === 'custom') {
        itemData = {
          item_type: 'custom', name: formData.name, description: formData.description,
          quantity: qty, unit_price: price, discount_amount: discount, notes: formData.notes,
          estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        };
      } else {
        itemData = {
          item_type:   isService ? 'service' : 'product',
          product_id:  !isService ? selectedItem.id : null,
          service_id:  isService  ? selectedItem.id : null,
          quantity: qty, unit_price: price, discount_amount: discount, notes: formData.notes,
          estimated_hours: isService ? qty   : null,
          hourly_rate:     isService ? price : null,
        };
      }
      await onAdd(itemData);
      onClose();
    } catch (err) {
      console.error('Failed to add item:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const canAdd = activeTab === 'custom'
    ? formData.name && qty > 0 && price >= 0
    : selectedItem && qty > 0 && price >= 0;

  const handleTabChange = (id) => {
    setActiveTab(id);
    setSelectedItem(null);
    setSearchTerm('');
    setCategoryFilter('');
    setFormData({ quantity: 1, unit_price: 0, discount_amount: 0, notes: '', name: '', description: '', estimated_hours: null });
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={<span style={{ color: purple }}>Add Item to Quote</span>} size="2xl">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .aqi-body  { animation: fadeUp 0.25s ease both; }
        .aqi-item  { transition: border-color 0.15s, background 0.15s; }
        .aqi-panel { animation: fadeUp 0.2s ease both; animation-delay: 0.06s; }
      `}</style>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: `1px solid var(--border,#f3f4f6)` }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => handleTabChange(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: '8px 8px 0 0',
            fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', border: 'none',
            transition: 'all 0.15s',
            borderBottom: `2px solid ${activeTab === id ? purple : 'transparent'}`,
            color: activeTab === id ? purple : '#9ca3af',
            background: activeTab === id ? purpleLt : 'transparent',
            marginBottom: -1,
          }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── Body: 2-col grid ─────────────────────────────────────── */}
      <div className="aqi-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, minHeight: 400 }}>

        {/* LEFT — catalog or custom form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeTab !== 'custom' ? (
            <>
              <SectionLabel icon={activeTab === 'products' ? Package : Wrench}>
                {activeTab === 'products' ? 'Product Catalog' : 'Service Catalog'}
              </SectionLabel>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={14} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}…`}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ ...iBase, paddingLeft: 36 }}
                  onFocus={fIn} onBlur={fOut}
                />
              </div>

              {/* Category filter */}
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{ ...iBase, appearance: 'auto' }}
                onFocus={fIn} onBlur={fOut}
              >
                <option value="">All Categories</option>
                {(activeTab === 'products' ? productCategories : serviceCategories)?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Item count */}
              {filteredItems.length > 0 && (
                <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, fontWeight: 600 }}>
                  {filteredItems.length} {activeTab} found
                </p>
              )}

              {/* Items list */}
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
                {filteredItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    {activeTab === 'products'
                      ? <Package size={32} color="#e5e7eb" style={{ margin: '0 auto 10px' }} />
                      : <Wrench  size={32} color="#e5e7eb" style={{ margin: '0 auto 10px' }} />
                    }
                    <p style={{ color: '#9ca3af', fontSize: '0.83rem', margin: 0 }}>No {activeTab} found</p>
                  </div>
                ) : filteredItems.map(item => {
                  const selected = selectedItem?.id === item.id;
                  return (
                    <div key={item.id} className="aqi-item" onClick={() => handleSelectItem(item)} style={{
                      display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px',
                      borderRadius: 10, cursor: 'pointer',
                      border: `1.5px solid ${selected ? purple : 'var(--border,#f3f4f6)'}`,
                      background: selected ? purpleLt : 'var(--row-bg,rgba(249,250,251,0.5))',
                    }}
                      onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = purpleBd; e.currentTarget.style.background = 'var(--row-bg,rgba(249,250,251,0.9))'; } }}
                      onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = 'var(--border,#f3f4f6)'; e.currentTarget.style.background = 'var(--row-bg,rgba(249,250,251,0.5))'; } }}
                    >
                      {item.main_image_url && activeTab === 'products' ? (
                        <img src={item.main_image_url} alt={item.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                      ) : (
                        <div style={{
                          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                          background: isService ? 'rgba(59,130,246,0.08)' : purpleLt,
                          border: `1px solid ${isService ? 'rgba(59,130,246,0.2)' : purpleBd}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isService ? <Wrench size={16} color="#3b82f6" /> : <Package size={16} color={purple} />}
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text,#111827)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.name}
                        </p>
                        {item.sku && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0 0 2px' }}>SKU: {item.sku}</p>}
                        <p style={{ fontSize: '0.78rem', fontWeight: 800, color: purple, margin: 0 }}>
                          {money(item.price || item.hourly_rate || item.base_price || 0)}
                          {isService && <span style={{ fontWeight: 500, color: '#9ca3af', fontSize: '0.7rem' }}>/hr</span>}
                        </p>
                      </div>

                      {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: purple, flexShrink: 0 }} />}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Custom item form */
            <>
              <SectionLabel icon={Layers}>Custom Item Details</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <FieldLabel required>Item Name</FieldLabel>
                  <input type="text" placeholder="e.g. Custom Fabrication" value={formData.name} onChange={e => set('name', e.target.value)} style={iBase} onFocus={fIn} onBlur={fOut} />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={formData.description}
                    onChange={e => set('description', e.target.value)}
                    rows={5}
                    placeholder="Describe the item or service…"
                    style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                    onFocus={fIn} onBlur={fOut}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT — pricing panel */}
        <div className="aqi-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(selectedItem || activeTab === 'custom') ? (
            <>
              <SectionLabel icon={DollarSign}>Pricing</SectionLabel>

              {/* Item name header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--row-bg,rgba(249,250,251,0.8))', border: '1px solid var(--border,#f3f4f6)' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: isService ? 'rgba(59,130,246,0.08)' : activeTab === 'custom' ? 'rgba(107,114,128,0.08)' : purpleLt,
                  border: `1px solid ${isService ? 'rgba(59,130,246,0.2)' : activeTab === 'custom' ? 'rgba(107,114,128,0.2)' : purpleBd}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isService
                    ? <Wrench  size={14} color="#3b82f6" />
                    : activeTab === 'custom'
                      ? <Layers  size={14} color="#6b7280" />
                      : <Package size={14} color={purple} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text,#111827)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeTab === 'custom' ? (formData.name || 'Custom Item') : selectedItem?.name}
                  </p>
                  <Pill color={isService ? '#3b82f6' : activeTab === 'custom' ? '#6b7280' : purple}>
                    {isService ? 'Service' : activeTab === 'custom' ? 'Custom' : 'Product'}
                  </Pill>
                </div>
              </div>

              {/* Qty + unit price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FieldLabel required>{isService ? 'Hours' : 'Quantity'}</FieldLabel>
                  <input type="number" min="0.01" step="0.01" value={formData.quantity} onChange={e => set('quantity', e.target.value)} style={iBase} onFocus={fIn} onBlur={fOut} />
                </div>
                <div>
                  <FieldLabel required>{isService ? 'Rate / Hour' : 'Unit Price'}</FieldLabel>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, pointerEvents: 'none' }}>KSh</span>
                    <input type="number" min="0" step="0.01" value={formData.unit_price} onChange={e => set('unit_price', e.target.value)} style={{ ...iBase, paddingLeft: 42 }} onFocus={fIn} onBlur={fOut} />
                  </div>
                </div>
              </div>

              {/* Live totals */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatCell label="Line Total"     value={money(lineTotal)} />
                <StatCell label="After Discount" value={money(lineTotalAfterDiscount)} accent />
              </div>

              {/* Discount */}
              <div>
                <FieldLabel>Discount Amount</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, pointerEvents: 'none' }}>KSh</span>
                  <input type="number" min="0" step="0.01" value={formData.discount_amount} onChange={e => set('discount_amount', e.target.value)} style={{ ...iBase, paddingLeft: 42 }} onFocus={fIn} onBlur={fOut} />
                </div>
                {discount > 0 && (
                  <p style={{ fontSize: '0.7rem', color: '#10b981', marginTop: 5, fontWeight: 700 }}>{discountPct}% off</p>
                )}
              </div>

              {/* Final total callout — matches EditQuoteItemModal */}
              <div style={{
                padding: '12px 16px', borderRadius: 12,
                background: purpleLt, border: `1px solid ${purpleBd}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <DollarSign size={14} color={purple} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: purple }}>Final Total</span>
                  {discount > 0 && (
                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700, background: 'rgba(16,185,129,0.1)', padding: '2px 7px', borderRadius: 9999 }}>
                      saving {money(discount)}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '1.05rem', fontWeight: 900, color: purple }}>{money(lineTotalAfterDiscount)}</span>
              </div>

              {/* Notes */}
              <div>
                <FieldLabel>Notes</FieldLabel>
                <textarea
                  value={formData.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={3}
                  placeholder="Any special requirements…"
                  style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                  onFocus={fIn} onBlur={fOut}
                />
              </div>
            </>
          ) : (
            /* Empty state */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, padding: '40px 20px' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: purpleLt, border: `1px solid ${purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {activeTab === 'services'
                  ? <Wrench  size={24} color={purple} style={{ opacity: 0.4 }} />
                  : <Package size={24} color={purple} style={{ opacity: 0.4 }} />
                }
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#9ca3af', margin: '0 0 4px' }}>No item selected</p>
                <p style={{ fontSize: '0.78rem', color: '#d1d5db', lineHeight: 1.5, margin: 0 }}>
                  Select an item from the list<br />to configure pricing
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 16, marginTop: 20, borderTop: '1px solid var(--border,#f3f4f6)' }}>
        <Btn variant="outline" onClick={onClose} disabled={submitting}>Cancel</Btn>
        <Btn onClick={handleAdd} disabled={!canAdd || submitting} icon={submitting ? <LoadingSpinner size="sm" /> : <Plus size={15} />}>
          {submitting ? 'Adding…' : 'Add to Quote'}
        </Btn>
      </div>
    </Modal>
  );
};

export default AddQuoteItemModal;