import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { brandsAPI } from '../../api';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import { ChevronLeft, Save, Edit2, X, Trash2, AlertTriangle } from 'lucide-react';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputDisabled = {
  ...inputStyle,
  background: 'rgba(168,85,247,0.02)',
  borderColor: 'rgba(168,85,247,0.08)',
  color: '#9ca3af', cursor: 'not-allowed',
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
  padding: 24,
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

function SI({ disabled, style: extra = {}, ...props }) {
  return (
    <input {...props} disabled={disabled}
      style={{ ...(disabled ? inputDisabled : inputStyle), ...extra }}
      onFocus={disabled ? undefined : inputFocus}
      onBlur={disabled  ? undefined : inputBlur}
    />
  );
}

function ST({ disabled, rows = 4, style: extra = {}, ...props }) {
  return (
    <textarea {...props} rows={rows} disabled={disabled}
      style={{ ...(disabled ? inputDisabled : inputStyle), resize: 'none', ...extra }}
      onFocus={disabled ? undefined : inputFocus}
      onBlur={disabled  ? undefined : inputBlur}
    />
  );
}

function Toggle({ checked, onChange, disabled, label, sub }) {
  return (
    <div onClick={() => !disabled && onChange(!checked)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
      background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.1)',
      opacity: disabled ? 0.6 : 1, userSelect: 'none',
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

// ── Main component ────────────────────────────────────────────────────────────

export default function BrandForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const mode    = searchParams.get('mode');
  const isView  = mode === 'view';
  const isEdit  = !!id && !isView;
  const isCreate = !id;

  const [loading,      setLoading]      = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  const [formData, setFormData] = useState({
    name: '', slug: '', description: '', logo_url: '',
    website: '', sort_order: 0, is_active: true, is_featured: false,
  });

  useEffect(() => { if (id) fetchBrand(); }, [id]);

  useEffect(() => {
    if (isCreate && formData.name && !formData.slug) {
      setFormData(p => ({ ...p, slug: generateSlug(p.name) }));
    }
  }, [formData.name, isCreate]);

  const generateSlug = (name) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const fetchBrand = async () => {
    try {
      setLoading(true);
      const brand = await brandsAPI.getAdminBrand(id) || {};
      setFormData({
        name:        brand.name        || '',
        slug:        brand.slug        || '',
        description: brand.description || '',
        logo_url:    brand.logo_url    || '',
        website:     brand.website     || '',
        sort_order:  brand.sort_order  || 0,
        is_active:   brand.is_active   !== undefined ? Boolean(brand.is_active)   : true,
        is_featured: brand.is_featured !== undefined ? Boolean(brand.is_featured) : false,
      });
      if (brand.logo_url) {
        setImagePreview(
          brand.logo_url.startsWith('/storage')
            ? `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${brand.logo_url}`
            : brand.logo_url
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load brand');
      navigate('/admin/brands');
    } finally { setLoading(false); }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024)    { toast.error('Image must be < 5MB'); return; }
    setImageFile(file);
    const r = new FileReader(); r.onloadend = () => setImagePreview(r.result); r.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null); setImagePreview('');
    setFormData(p => ({ ...p, logo_url: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.slug) { toast.error('Name and slug are required'); return; }
    try {
      setLoading(true);
      const fd = new FormData();
      fd.append('name',        formData.name);
      fd.append('slug',        formData.slug);
      fd.append('description', formData.description || '');
      fd.append('website',     formData.website     || '');
      fd.append('sort_order',  formData.sort_order);
      fd.append('is_active',   formData.is_active   ? '1' : '0');
      fd.append('is_featured', formData.is_featured ? '1' : '0');
      if (imageFile) {
        fd.append('logo', imageFile);
      } else if (formData.logo_url && !formData.logo_url.includes('/storage/')) {
        fd.append('logo_url', formData.logo_url);
      }
      if (isEdit) { await brandsAPI.updateBrand(id, fd); toast.success('Brand updated!'); }
      else        { await brandsAPI.createBrand(fd);     toast.success('Brand created!'); }
      navigate('/admin/brands');
    } catch (err) {
      const errs = err.response?.data?.errors;
      if (errs) { Object.keys(errs).forEach(k => toast.error(`${k}: ${errs[k][0]}`)); }
      else {
        const msg = err.response?.data?.message || err.message || 'Failed to save';
        if (msg.includes('slug') && msg.includes('taken'))   toast.error('This slug is already taken.');
        else if (msg.includes('name') && msg.includes('taken')) toast.error('A brand with this name already exists.');
        else toast.error(msg);
      }
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${formData.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      await brandsAPI.deleteBrand(id);
      toast.success(`"${formData.name}" deleted`);
      navigate('/admin/brands');
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      if (msg?.includes('products'))
        toast.error('Cannot delete — this brand has products assigned to it.');
      else toast.error(msg || 'Failed to delete brand');
    } finally { setDeleting(false); }
  };

  if (loading && (isEdit || isView)) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoadingSpinner />
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <button onClick={() => navigate('/admin/brands')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.78rem', color: '#9ca3af', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, transition: 'color 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
            >
              <ChevronLeft size={14} /> Brands
            </button>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 3px' }}>
              {isView ? 'View brand' : isEdit ? 'Edit brand' : 'New brand'}
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              {isView ? 'View brand details' : isEdit ? 'Update brand information' : 'Add a new brand to your store'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {isView ? (
              <button onClick={() => navigate(`/admin/brands/${id}/edit`)} disabled={deleting} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                boxShadow: '0 3px 10px rgba(168,85,247,0.3)',
              }}>
                <Edit2 size={13} /> Edit
              </button>
            ) : (
              <>
                <button onClick={() => navigate('/admin/brands')} disabled={loading || deleting} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 600,
                  background: 'transparent', color: '#9ca3af',
                  border: '1.5px solid rgba(168,85,247,0.2)', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color 150ms, color 150ms',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#a855f7'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)';  e.currentTarget.style.color = '#9ca3af'; }}
                >
                  <X size={13} /> Cancel
                </button>
                <button type="submit" form="brand-form" disabled={loading} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                  boxShadow: '0 3px 10px rgba(168,85,247,0.3)', opacity: loading ? 0.7 : 1,
                  transition: 'box-shadow 150ms',
                }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 5px 18px rgba(168,85,247,0.45)'; }}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 3px 10px rgba(168,85,247,0.3)'}
                >
                  <Save size={13} /> {loading ? 'Saving…' : isEdit ? 'Update' : 'Create'}
                </button>
              </>
            )}
          </div>
        </div>

        <form id="brand-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Brand info ── */}
          <div style={card}>
            <p style={sectionHeader}>Brand information</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <Field label="Brand name *">
                <SI name="name" value={formData.name} onChange={handleChange} disabled={isView}
                  placeholder="Enter brand name" required={!isView} />
              </Field>

              <Field label="Slug *" hint={!isView ? 'Auto-generated from name — URL-friendly identifier' : undefined}>
                <SI name="slug" value={formData.slug} onChange={handleChange} disabled={isView}
                  placeholder="brand-slug" required={!isView} style={{ fontFamily: 'monospace' }} />
              </Field>

              <Field label="Description">
                <ST name="description" value={formData.description} onChange={handleChange}
                  disabled={isView} rows={4} placeholder="Brief description of this brand" />
              </Field>

              <Field label="Website">
                <SI type="url" name="website" value={formData.website} onChange={handleChange}
                  disabled={isView} placeholder="https://www.brand-website.com" />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Sort order" hint={!isView ? 'Lower numbers appear first' : undefined}>
                  <SI type="number" name="sort_order" value={formData.sort_order}
                    onChange={handleChange} disabled={isView} min="0" />
                </Field>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Toggle
                  checked={formData.is_active}
                  onChange={v => setFormData(p => ({ ...p, is_active: v }))}
                  disabled={isView}
                  label="Active"
                  sub="Brand is visible on the website"
                />
                <Toggle
                  checked={formData.is_featured}
                  onChange={v => setFormData(p => ({ ...p, is_featured: v }))}
                  disabled={isView}
                  label="Featured"
                  sub="Show on homepage and featured brands section"
                />
              </div>
            </div>
          </div>

          {/* ── Logo ── */}
          <div style={card}>
            <p style={sectionHeader}>Brand logo</p>

            {imagePreview && (
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
                <img src={imagePreview} alt="Logo preview" style={{
                  width: 120, height: 120, objectFit: 'cover', borderRadius: 10,
                  border: '1.5px solid rgba(168,85,247,0.2)', display: 'block',
                }} />
                {!isView && (
                  <button type="button" onClick={handleRemoveImage} style={{
                    position: 'absolute', top: -8, right: -8, width: 24, height: 24,
                    borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                  }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {isView && !imagePreview && (
              <p style={{ fontSize: '0.78rem', color: '#d1d5db', margin: 0 }}>No logo set</p>
            )}

            {!isView && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Upload from computer" hint="Max 5MB">
                  <SI type="file" accept="image/*" onChange={handleImageChange} style={{ cursor: 'pointer' }} />
                </Field>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(168,85,247,0.12)' }} />
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(168,85,247,0.12)' }} />
                </div>

                <Field label="Logo URL">
                  <SI type="url" name="logo_url" value={formData.logo_url}
                    placeholder="https://example.com/logo.png"
                    onChange={e => {
                      handleChange(e);
                      if (e.target.value) { setImagePreview(e.target.value); setImageFile(null); }
                    }}
                  />
                </Field>
              </div>
            )}
          </div>

          {/* ── Danger zone (view only) ── */}
          {isView && (
            <div style={{
              padding: '20px 24px', borderRadius: 12,
              background: 'rgba(239,68,68,0.05)', border: '1.5px solid rgba(239,68,68,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#b91c1c', margin: 0 }}>Danger zone</p>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#ef4444', margin: '0 0 14px' }}>
                Once deleted, this brand cannot be recovered.
              </p>
              <button type="button" onClick={handleDelete} disabled={deleting} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 18px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                background: 'rgba(239,68,68,0.9)', color: 'white', opacity: deleting ? 0.6 : 1,
              }}>
                {deleting ? <LoadingSpinner /> : <Trash2 size={14} />}
                {deleting ? 'Deleting…' : 'Delete this brand'}
              </button>
            </div>
          )}
        </form>
      </div>
    </AdminLayout>
  );
}