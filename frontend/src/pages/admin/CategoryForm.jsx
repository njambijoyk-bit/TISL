import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { categoriesAPI } from '../../api';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import { ChevronLeft, Save, Edit2, X, Trash2, AlertTriangle, AlertCircle } from 'lucide-react';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const buildCategoryTree = (categories) => {
  const map = new Map();
  categories.forEach(cat => {
    if (!map.has(cat.parent_id)) map.set(cat.parent_id, []);
    map.get(cat.parent_id).push(cat);
  });
  const walk = (parentId = null, level = 0) =>
    (map.get(parentId) || [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap(cat => [{ ...cat, level }, ...walk(cat.id, level + 1)]);
  return walk(null, 0);
};

const getDescendantIds = (categories = [], parentId) => {
  if (!Array.isArray(categories) || !parentId) return [];
  const ids = [];
  const walk = (id) => categories.forEach(cat => { if (cat.parent_id === id) { ids.push(cat.id); walk(cat.id); } });
  walk(parentId);
  return ids;
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

function SS({ disabled, children, style: extra = {}, ...props }) {
  return (
    <select {...props} disabled={disabled}
      style={{ ...(disabled ? inputDisabled : inputStyle), ...extra }}
      onFocus={disabled ? undefined : inputFocus}
      onBlur={disabled  ? undefined : inputBlur}
    >
      {children}
    </select>
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

export default function CategoryForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const mode    = searchParams.get('mode');
  const isView  = mode === 'view';
  const isEdit  = !!id && !isView;
  const isCreate = !id;

  const [loading,      setLoading]      = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [categories,   setCategories]   = useState([]);
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  const [formData, setFormData] = useState({
    name: '', slug: '', description: '', image_url: '',
    parent_id: '', sort_order: 0, is_active: true,
    meta_data: { keywords: '', seo_title: '', seo_description: '' },
  });

  useEffect(() => { fetchCategories(); if (id) fetchCategory(); }, [id]);

  useEffect(() => {
    if (isCreate && formData.name && !formData.slug) {
      setFormData(p => ({ ...p, slug: generateSlug(p.name) }));
    }
  }, [formData.name, isCreate]);

  const generateSlug = (name) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const currentCategoryId = id ? parseInt(id) : null;
  const disabledCategoryIds = currentCategoryId && categories.length
    ? [currentCategoryId, ...getDescendantIds(categories, currentCategoryId)]
    : [];

  const fetchCategories = async () => {
    try {
      const res = await categoriesAPI.getCategories();
      setCategories(res.data || res || []);
    } catch {}
  };

  const fetchCategory = async () => {
    try {
      setLoading(true);
      const res      = await categoriesAPI.getCategory(id);
      const category = res.data || res;

      let parsedMeta = { keywords: '', seo_title: '', seo_description: '' };
      if (category.meta_data) {
        parsedMeta = typeof category.meta_data === 'string'
          ? JSON.parse(category.meta_data)
          : category.meta_data;
      }

      setFormData({
        name:        category.name        || '',
        slug:        category.slug        || '',
        description: category.description || '',
        image_url:   category.image_url   || '',
        parent_id:   category.parent_id   || '',
        sort_order:  category.sort_order  || 0,
        is_active:   category.is_active !== undefined ? Boolean(category.is_active) : true,
        meta_data:   parsedMeta,
      });

      if (category.image_url) {
        const preview = category.image_url.startsWith('/storage')
          ? `${import.meta.env.VITE_API_URL}${category.image_url}`
          : category.image_url;
        setImagePreview(preview);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load category');
      navigate('/admin/categories');
    } finally { setLoading(false); }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleMetaChange = (e) => {
    const { name, value } = e.target;
    setFormData(p => ({ ...p, meta_data: { ...p.meta_data, [name]: value } }));
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
    setFormData(p => ({ ...p, image_url: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.slug) { toast.error('Name and slug are required'); return; }
    try {
      setLoading(true);
      const fd = new FormData();
      fd.append('name', formData.name);
      fd.append('slug', formData.slug);
      fd.append('description', formData.description || '');
      if (formData.parent_id !== '') fd.append('parent_id', formData.parent_id);
      fd.append('sort_order', formData.sort_order);
      fd.append('is_active', formData.is_active ? '1' : '0');
      fd.append('meta_data', JSON.stringify(formData.meta_data));
      if (imageFile) {
        fd.append('image', imageFile);
      } else if (formData.image_url && !formData.image_url.includes('/storage/')) {
        fd.append('image_url', formData.image_url);
      }
      if (isEdit) { await categoriesAPI.updateCategory(id, fd); toast.success('Category updated!'); }
      else        { await categoriesAPI.createCategory(fd);     toast.success('Category created!'); }
      navigate('/admin/categories');
    } catch (err) {
      const errs = err.response?.data?.errors;
      if (errs) { Object.keys(errs).forEach(k => toast.error(`${k}: ${errs[k][0]}`)); }
      else {
        const msg = err.response?.data?.message || err.message || 'Failed to save';
        if (msg.includes('slug') && msg.includes('taken')) toast.error('This slug is already taken.');
        else if (msg.includes('name') && msg.includes('taken')) toast.error('A category with this name already exists.');
        else toast.error(msg);
      }
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${formData.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      await categoriesAPI.deleteCategory(id);
      toast.success(`"${formData.name}" deleted`);
      navigate('/admin/categories');
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      if (msg?.includes('subcategories') || msg?.includes('children'))
        toast.error('Cannot delete — this category has subcategories. Delete them first.');
      else if (msg?.includes('products'))
        toast.error('Cannot delete — this category has products assigned to it.');
      else toast.error(msg || 'Failed to delete category');
    } finally { setDeleting(false); }
  };

  if (loading && (isEdit || isView)) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoadingSpinner />
      </div>
    </AdminLayout>
  );

  const childrenCount = categories.filter(c => c.parent_id === parseInt(id)).length;

  return (
    <AdminLayout>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <button onClick={() => navigate('/admin/categories')} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.78rem', color: '#9ca3af', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, transition: 'color 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
            >
              <ChevronLeft size={14} /> Categories
            </button>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 3px' }}>
              {isView ? 'View category' : isEdit ? 'Edit category' : 'New category'}
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              {isView ? 'View category details' : isEdit ? 'Update category information' : 'Add a new category to organise your products'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {isView ? (
              <button onClick={() => navigate(`/admin/categories/${id}/edit`)} disabled={deleting} style={{
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
                <button onClick={() => navigate('/admin/categories')} disabled={loading || deleting} style={{
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
                <button type="submit" form="category-form" disabled={loading} style={{
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

        <form id="category-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Core fields ── */}
          <div style={card}>
            <p style={sectionHeader}>Category information</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <Field label="Category name *">
                <SI name="name" value={formData.name} onChange={handleChange} disabled={isView}
                  placeholder="Enter category name" required={!isView} />
              </Field>

              <Field label="Slug *" hint={!isView ? 'Auto-generated from name — URL-friendly identifier' : undefined}>
                <SI name="slug" value={formData.slug} onChange={handleChange} disabled={isView}
                  placeholder="category-slug" required={!isView} style={{ fontFamily: 'monospace' }} />
              </Field>

              <Field label="Description">
                <ST name="description" value={formData.description} onChange={handleChange}
                  disabled={isView} rows={4} placeholder="Brief description of this category" />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Parent category" hint={!isView ? 'Leave empty for a top-level category' : undefined}>
                  <SS name="parent_id" value={formData.parent_id} onChange={handleChange} disabled={isView}>
                    <option value="">None (top-level)</option>
                    {buildCategoryTree(categories).map(cat => {
                      const isDisabled = disabledCategoryIds.includes(cat.id);
                      return (
                        <option key={cat.id} value={cat.id} disabled={isDisabled}>
                          {'— '.repeat(cat.level)}{cat.name}{isDisabled ? ' (not selectable)' : ''}
                        </option>
                      );
                    })}
                  </SS>
                </Field>

                <Field label="Sort order" hint={!isView ? 'Lower numbers appear first' : undefined}>
                  <SI type="number" name="sort_order" value={formData.sort_order}
                    onChange={handleChange} disabled={isView} min="0" />
                </Field>
              </div>

              <Toggle
                checked={formData.is_active}
                onChange={v => setFormData(p => ({ ...p, is_active: v }))}
                disabled={isView}
                label="Active"
                sub="Category is visible on the website"
              />
            </div>
          </div>

          {/* ── Image ── */}
          <div style={card}>
            <p style={sectionHeader}>Category image</p>

            {imagePreview && (
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
                <img src={imagePreview} alt="Category preview"
                  style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, border: '1.5px solid rgba(168,85,247,0.2)', display: 'block' }}
                />
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

                <Field label="Image URL">
                  <SI type="url" name="image_url" value={formData.image_url}
                    placeholder="https://example.com/image.jpg"
                    onChange={e => {
                      handleChange(e);
                      if (e.target.value) { setImagePreview(e.target.value); setImageFile(null); }
                    }}
                  />
                </Field>
              </div>
            )}

            {isView && !imagePreview && (
              <p style={{ fontSize: '0.78rem', color: '#d1d5db', margin: 0 }}>No image set</p>
            )}
          </div>

          {/* ── SEO ── */}
          <div style={card}>
            <p style={sectionHeader}>SEO & metadata</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="SEO title" hint={!isView ? 'Leave empty to use the category name' : undefined}>
                <SI type="text" name="seo_title" value={formData.meta_data.seo_title}
                  onChange={handleMetaChange} disabled={isView}
                  placeholder="Leave empty to use category name" />
              </Field>

              <Field
                label="SEO description"
                hint={!isView ? `${formData.meta_data.seo_description.length}/160 characters` : undefined}
              >
                <ST name="seo_description" value={formData.meta_data.seo_description}
                  onChange={handleMetaChange} disabled={isView} rows={3} maxLength={160}
                  placeholder="Brief description for search engines (max 160 characters)" />
              </Field>

              <Field label="Keywords" hint={!isView ? 'Comma-separated' : undefined}>
                <SI type="text" name="keywords" value={formData.meta_data.keywords}
                  onChange={handleMetaChange} disabled={isView}
                  placeholder="tools, hardware, equipment" />
              </Field>
            </div>
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
                Once deleted, this category cannot be recovered.
              </p>

              {childrenCount > 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '10px 14px', borderRadius: 9,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                }}>
                  <AlertCircle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: '0.78rem', color: '#b45309', margin: 0 }}>
                    Cannot delete — this category has <strong>{childrenCount}</strong> subcategor{childrenCount === 1 ? 'y' : 'ies'}.
                    Delete them first.
                  </p>
                </div>
              ) : (
                <button type="button" onClick={handleDelete} disabled={deleting} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '9px 18px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                  border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  background: 'rgba(239,68,68,0.9)', color: 'white', opacity: deleting ? 0.6 : 1,
                }}>
                  {deleting ? <LoadingSpinner /> : <Trash2 size={14} />}
                  {deleting ? 'Deleting…' : 'Delete this category'}
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </AdminLayout>
  );
}