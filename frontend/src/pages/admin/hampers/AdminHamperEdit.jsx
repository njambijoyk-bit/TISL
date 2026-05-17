import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, Upload, X, Search, Check } from 'lucide-react';
import AdminLayout from '../../../components/layout/AdminLayout';
import hampersAPI from '../../../api/hampers';
import api from '../../../api/axios';
import toast from 'react-hot-toast';

// ── Shared tokens (same as Create) ────────────────────────────────────────────

const card = {
  background: 'white',
  border: '1px solid #dfbeff',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  padding: 24,
};

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  fontSize: '0.875rem', border: '1px solid #dfbeff',
  background: 'white',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms, box-shadow 150ms',
};

const labelStyle = {
  fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--color-text-secondary)',
  display: 'block', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const sectionTitle = {
  margin: '0 0 20px', fontSize: '0.82rem', fontWeight: 700,
  color: '#a855f7', paddingBottom: 12,
  borderBottom: '1px solid #f3ecfa',
};

// ── Atoms (same as Create) ────────────────────────────────────────────────────

function Field({ label, error, hint, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint  && <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#a855f7' }}>{hint}</p>}
      {error && <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: '#ef4444' }}>{error}</p>}
    </div>
  );
}

function Input({ name, type = 'text', value, onChange, placeholder, error, min, max, step }) {
  return (
    <input
      type={type} name={name} value={value} onChange={onChange}
      placeholder={placeholder} min={min} max={max} step={step}
      style={{ ...inputStyle, borderColor: error ? '#ef4444' : '#dfbeff' }}
      onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
      onBlur={e  => { e.currentTarget.style.borderColor = error ? '#ef4444' : '#dfbeff'; e.currentTarget.style.boxShadow = 'none'; }}
    />
  );
}

function ToggleRow({ label, hint, name, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-border-tertiary)' }}>
      <div>
        <p style={{ margin: '0 0 2px', fontSize: '0.82rem', fontWeight: 600, color: '#a855f7' }}>{label}</p>
        {hint && <p style={{ margin: 0, fontSize: '0.72rem', color: '#000' }}>{hint}</p>}
      </div>
      <button type="button" onClick={() => onChange(name, !value)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: value ? '#a855f7' : '#dfbeff',
        position: 'relative', transition: 'background 200ms',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: 'white', transition: 'left 200ms',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}

function MultiSelect({ label, hint, options, selected, onChange, placeholder }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref               = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase()) ||
    o.slug.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (slug) => onChange(selected.includes(slug) ? selected.filter(s => s !== slug) : [...selected, slug]);
  const selectedLabels = selected.map(s => options.find(o => o.slug === s)?.name || s);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          ...inputStyle, minHeight: 40,
          display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
          cursor: 'pointer', padding: selected.length > 0 ? '6px 12px' : '9px 12px',
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{placeholder || 'Select…'}</span>
        ) : selectedLabels.map(name => (
          <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, background: 'rgba(168,85,247,0.1)', color: '#7c3aed' }}>
            {name}
            <span onClick={e => { e.stopPropagation(); toggle(options.find(o => o.name === name)?.slug); }} style={{ cursor: 'pointer', lineHeight: 1 }}>×</span>
          </span>
        ))}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--color-background-primary)', border: '1px solid var(--color-border-tertiary)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--color-border-tertiary)', position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" style={{ ...inputStyle, paddingLeft: 28, padding: '6px 8px 6px 28px', fontSize: '0.78rem' }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <p style={{ padding: '12px 14px', margin: 0, fontSize: '0.78rem', color: '#9ca3af' }}>No results</p>
            ) : filtered.map(opt => {
              const isSel = selected.includes(opt.slug);
              return (
                <div key={opt.slug} onClick={() => toggle(opt.slug)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', cursor: 'pointer', fontSize: '0.82rem', color: '#111827', background: isSel ? 'rgba(168,85,247,0.06)' : 'transparent', transition: 'background 100ms' }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--color-background-secondary)'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontWeight: isSel ? 700 : 400 }}>{opt.name}</span>
                  {isSel && <Check size={13} style={{ color: '#a855f7', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hint && <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>{hint}</p>}
    </div>
  );
}

function CoverImageUpload({ preview, onFileChange, onClear }) {
  const inputRef = useRef(null);
  return (
    <div>
      <label style={labelStyle}>Cover Image</label>
      {preview ? (
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #dfbeff' }}>
          <img src={preview} alt="Cover preview" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
          <button type="button" onClick={onClear} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="white" />
          </button>
        </div>
      ) : (
        <div onClick={() => inputRef.current?.click()} style={{ border: '2px dashed #dfbeff', borderRadius: 10, height: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', transition: 'border-color 150ms' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#a855f7'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#dfbeff'}
        >
          <Upload size={24} style={{ color: '#a855f7' }} />
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#9ca3af' }}>Click to replace cover image</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AdminHamperEdit() {
  const { id }              = useParams();
  const navigate            = useNavigate();
  const [form, setForm]     = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [coverFile, setCoverFile]       = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);

  const [tiers, setTiers]                 = useState([]);
  const [customerTypes, setCustomerTypes] = useState([]);
  const [selectedTiers, setSelectedTiers] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);

  useEffect(() => {
    api.get('/admin/customer-tiers').then(r  => setTiers(r.data || [])).catch(() => {});
    api.get('/admin/customer-type-discounts').then(r => setCustomerTypes(r.data || [])).catch(() => {});

    hampersAPI.getHamper(id).then(data => {
      // format datetime-local values
      const fmtDt = (v) => v ? new Date(v).toISOString().slice(0, 16) : '';
      setForm({
        name:                       data.name || '',
        description:                data.description || '',
        accent_color:               data.accent_color || '#a855f7',
        price:                      data.price || '',
        status:                     data.status || 'draft',
        apply_vat:                  !!data.apply_vat,
        allow_promo_codes:          !!data.allow_promo_codes,
        allow_store_credit:         !!data.allow_store_credit,
        earn_loyalty_points:        !!data.earn_loyalty_points,
        is_visible:                 !!data.is_visible,
        max_purchases_per_customer: data.max_purchases_per_customer ?? '',
        total_stock:                data.total_stock ?? '',
        eligibility_type:           data.eligibility_type || 'all',
        valid_from:                 fmtDt(data.valid_from),
        valid_until:                fmtDt(data.valid_until),
      });
      setSelectedTiers(data.eligible_tiers || []);
      setSelectedTypes(data.eligible_customer_types || []);
      if (data.cover_image) setCoverPreview(data.cover_image);
    }).catch(() => {
      toast.error('Failed to load hamper');
      navigate('/admin/hampers');
    }).finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  const handleToggle = (name, value) => setForm(f => ({ ...f, [name]: value }));

  const handleCoverChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const validate = () => {
    const e = {};
    if (!form?.name?.trim()) e.name = 'Name is required';
    if (!form?.price || isNaN(form.price) || Number(form.price) <= 0) e.price = 'Enter a valid price';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);

    try {
      const payload = {
        name:                       form.name.trim(),
        description:                form.description || undefined,
        accent_color:               form.accent_color,
        price:                      Number(form.price),
        status:                     form.status,
        apply_vat:                  form.apply_vat,
        allow_promo_codes:          form.allow_promo_codes,
        allow_store_credit:         form.allow_store_credit,
        earn_loyalty_points:        form.earn_loyalty_points,
        is_visible:                 form.is_visible,
        max_purchases_per_customer: form.max_purchases_per_customer ? Number(form.max_purchases_per_customer) : null,
        total_stock:                form.total_stock ? Number(form.total_stock) : null,
        eligibility_type:           form.eligibility_type,
        eligible_tiers:             form.eligibility_type === 'tier' ? selectedTiers : [],
        eligible_customer_types:    form.eligibility_type === 'customer_type' ? selectedTypes : [],
        valid_from:                 form.valid_from || null,
        valid_until:                form.valid_until || null,
      };

      await hampersAPI.updateHamper(id, payload);

      if (coverFile) {
        const fd = new FormData();
        fd.append('cover_image', coverFile);
        await hampersAPI.uploadCoverImage(id, fd).catch(() => {});
      }

      toast.success('Hamper updated');
      navigate(`/admin/hampers/${id}`);
    } catch (err) {
      const apiErrors = err?.response?.data?.errors;
      if (apiErrors) {
        const mapped = {};
        Object.entries(apiErrors).forEach(([k, v]) => { mapped[k] = Array.isArray(v) ? v[0] : v; });
        setErrors(mapped);
      } else {
        toast.error(err?.response?.data?.message || 'Failed to update hamper');
      }
    } finally { setSaving(false); }
  };

  if (loading || !form) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" onClick={() => navigate(`/admin/hampers/${id}`)} style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                <ChevronLeft size={15} />
              </button>
              <div>
                <h1 style={{ margin: '0 0 2px', fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>Edit Hamper</h1>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{form.name}</p>
              </div>
            </div>
            <button type="submit" disabled={saving} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', borderRadius: 9, fontSize: '0.875rem', fontWeight: 700,
              border: 'none', background: saving ? 'rgba(168,85,247,0.5)' : 'linear-gradient(135deg,#a855f7,#7c3aed)',
              color: 'white', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              <Save size={15} /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

            {/* ── Left ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={card}>
                <p style={sectionTitle}>Basic Information</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Field label="Hamper Name *" error={errors.name}>
                    <Input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Student Tool Kit" error={errors.name} />
                  </Field>
                  <Field label="Description">
                    <textarea name="description" value={form.description} onChange={handleChange} placeholder="Describe this hamper…" rows={4}
                      style={{ ...inputStyle, resize: 'vertical' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
                      onBlur={e  => { e.currentTarget.style.borderColor = '#dfbeff'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <Field label="Price (KES) *" error={errors.price}>
                      <Input name="price" type="number" min="0" step="0.01" value={form.price} onChange={handleChange} placeholder="0.00" error={errors.price} />
                    </Field>
                    <Field label="Status">
                      <select name="status" value={form.status} onChange={handleChange} style={{ ...inputStyle, cursor: 'pointer', color: '#111827' }}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </div>

              <div style={card}>
                <p style={sectionTitle}>Purchase Limits & Stock</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Max Per Customer" hint="Leave empty for unlimited">
                    <Input name="max_purchases_per_customer" type="number" min="1" value={form.max_purchases_per_customer} onChange={handleChange} placeholder="Unlimited" />
                  </Field>
                  <Field label="Total Stock" hint="Backorders allowed up to +100 units">
                    <Input name="total_stock" type="number" min="1" value={form.total_stock} onChange={handleChange} placeholder="Unlimited" />
                  </Field>
                </div>
              </div>

              <div style={card}>
                <p style={sectionTitle}>Eligibility</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Field label="Eligibility Type">
                    <select name="eligibility_type" value={form.eligibility_type} onChange={handleChange} style={{ ...inputStyle, cursor: 'pointer', color: '#111827' }}>
                      <option value="all">All Customers</option>
                      <option value="tier">By Tier</option>
                      <option value="customer_type">By Customer Type</option>
                      <option value="manual">Manual — select customers individually</option>
                    </select>
                  </Field>
                  {form.eligibility_type === 'tier' && (
                    <MultiSelect label="Eligible Tiers" hint="Customers must be in one of these tiers" options={tiers} selected={selectedTiers} onChange={setSelectedTiers} placeholder="Search and select tiers…" />
                  )}
                  {form.eligibility_type === 'customer_type' && (
                    <MultiSelect label="Eligible Customer Types" hint="Customers must have one of these types" options={customerTypes} selected={selectedTypes} onChange={setSelectedTypes} placeholder="Search and select customer types…" />
                  )}
                  {form.eligibility_type === 'manual' && (
                    <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)', fontSize: '0.78rem', color: '#7c3aed' }}>
                      Manage individual customers from the <strong>Eligibility tab</strong> on the detail page.
                    </div>
                  )}
                </div>
              </div>

              <div style={card}>
                <p style={sectionTitle}>Validity Period</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field label="Valid From"><Input name="valid_from" type="datetime-local" value={form.valid_from} onChange={handleChange} /></Field>
                  <Field label="Valid Until"><Input name="valid_until" type="datetime-local" value={form.valid_until} onChange={handleChange} /></Field>
                </div>
              </div>
            </div>

            {/* ── Right ────────────────────────────────────────────── */}
            <div style={{ position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={card}>
                <p style={sectionTitle}>Cover Image</p>
                <CoverImageUpload preview={coverPreview} onFileChange={handleCoverChange} onClear={() => { setCoverFile(null); setCoverPreview(null); }} />
              </div>

              <div style={card}>
                <p style={sectionTitle}>Checkout Accent Color</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input type="color" name="accent_color" value={form.accent_color} onChange={handleChange}
                    style={{ width: 52, height: 52, borderRadius: 10, border: '2px solid var(--color-border-tertiary)', cursor: 'pointer', padding: 3, background: 'none' }} />
                  <div>
                    <p style={{ margin: '0 0 4px', fontSize: '0.82rem', fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{form.accent_color}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>Customer checkout accent</p>
                    <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${form.accent_color}, ${form.accent_color}80)` }} />
                  </div>
                </div>
              </div>

              <div style={card}>
                <p style={sectionTitle}>Feature Toggles</p>
                <div>
                  <ToggleRow name="apply_vat"           value={form.apply_vat}           onChange={handleToggle} label="Apply VAT (16%)"      hint="Tax applied at checkout" />
                  <ToggleRow name="allow_promo_codes"   value={form.allow_promo_codes}   onChange={handleToggle} label="Allow Promo Codes"    hint="Referral/promo codes accepted" />
                  <ToggleRow name="allow_store_credit"  value={form.allow_store_credit}  onChange={handleToggle} label="Allow Store Credit"   hint="Customers can redeem store credit" />
                  <ToggleRow name="earn_loyalty_points" value={form.earn_loyalty_points} onChange={handleToggle} label="Earn Loyalty Points"  hint="1pt per KES 100 spent" />
                  <ToggleRow name="is_visible"          value={form.is_visible}          onChange={handleToggle} label="Visible to Customers" hint="Show on the hampers page" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </AdminLayout>
  );
}
