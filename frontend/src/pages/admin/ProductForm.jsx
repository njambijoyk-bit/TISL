import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { productsAPI, categoriesAPI, brandsAPI } from '../../api';
import toast from 'react-hot-toast';
import ProductSelectorModalAdmin from '../../components/quotes/request-wizard/ProductSelectorModalAdmin';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import {
  Save, X, Trash2, Edit2, ChevronLeft, Plus, AlertTriangle,
} from 'lucide-react';

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
const hintStyle = {
  fontSize: '0.68rem', color: '#9ca3af', marginTop: 4,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const sectionHeader = {
  fontSize: '0.875rem', fontWeight: 700, color: '#7c3aed',
  margin: '0 0 20px', paddingBottom: 12,
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

function StyledInput({ disabled, style: extra = {}, ...props }) {
  return (
    <input
      {...props}
      disabled={disabled}
      style={{ ...(disabled ? inputDisabled : inputStyle), ...extra }}
      onFocus={disabled ? undefined : inputFocus}
      onBlur={disabled  ? undefined : inputBlur}
    />
  );
}

function StyledSelect({ disabled, children, style: extra = {}, ...props }) {
  return (
    <select
      {...props}
      disabled={disabled}
      style={{ ...(disabled ? inputDisabled : inputStyle), ...extra }}
      onFocus={disabled ? undefined : inputFocus}
      onBlur={disabled  ? undefined : inputBlur}
    >
      {children}
    </select>
  );
}

function StyledTextarea({ disabled, rows = 4, style: extra = {}, ...props }) {
  return (
    <textarea
      {...props}
      rows={rows}
      disabled={disabled}
      style={{ ...(disabled ? inputDisabled : inputStyle), resize: 'none', ...extra }}
      onFocus={disabled ? undefined : inputFocus}
      onBlur={disabled  ? undefined : inputBlur}
    />
  );
}

function Toggle({ checked, onChange, disabled, label, sub }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.1)',
        opacity: disabled ? 0.6 : 1, userSelect: 'none',
      }}
    >
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
          left: checked ? 19 : 3,
          transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
  );
}

function SearchPicker({ items, selected, onToggle, disabled, placeholder = 'Search…' }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);

  const filtered = query.trim()
    ? items.filter(i =>
        i.name?.toLowerCase().includes(query.toLowerCase()) ||
        i.sku?.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  const selectedItems = items.filter(i => selected.includes(i.id));

  if (disabled) {
    return selectedItems.length === 0
      ? <p style={{ fontSize: '0.78rem', color: '#d1d5db', margin: 0 }}>No related products</p>
      : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {selectedItems.map(item => (
            <span key={item.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
              background: 'rgba(168,85,247,0.08)', color: '#7c3aed',
              border: '1px solid rgba(168,85,247,0.2)',
            }}>
              {item.name}
              {item.sku && <span style={{ fontSize: '0.62rem', color: '#c4b5fd', fontFamily: 'monospace' }}>{item.sku}</span>}
            </span>
          ))}
        </div>
      );
  }

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
              <button type="button" onClick={() => onToggle(item.id)} style={{
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
          type="text" value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); }, 150)}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
          placeholder={placeholder}
          style={inputStyle}
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
                {items.length === 0 ? 'No products available' : 'No matches'}
              </p>
            ) : filtered.map(item => {
              const isSel = selected.includes(item.id);
              return (
                <button key={item.id} type="button"
                  onMouseDown={() => { onToggle(item.id); setQuery(''); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 14px', background: isSel ? 'rgba(168,85,247,0.06)' : 'none',
                    border: 'none', borderBottom: '1px solid rgba(168,85,247,0.05)',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = isSel ? 'rgba(168,85,247,0.06)' : 'none'}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: isSel ? '2px solid #a855f7' : '2px solid rgba(168,85,247,0.3)',
                    background: isSel ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSel && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: isSel ? 600 : 400, flex: 1 }}>
                    {item.name}
                  </span>
                  {item.sku && (
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace', flexShrink: 0 }}>
                      {item.sku}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedItems.length > 0 && (
        <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 5 }}>
          {selectedItems.length} selected
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const mode    = searchParams.get('mode');
  const isView  = mode === 'view';
  const isEdit  = !!id && !isView;
  const isCreate = !id;

  const [loading,   setLoading]   = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [categories, setCategories] = useState([]);
  const [brands,     setBrands]     = useState([]);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [activeTab, setActiveTab]   = useState('basic');

  const [existingImageUrlsRaw, setExistingImageUrlsRaw] = useState([]);
  const [additionalImages,     setAdditionalImages]     = useState([]);
  const [additionalPreviews,   setAdditionalPreviews]   = useState([]);
  const [newFilePreviews,      setNewFilePreviews]      = useState([]);
  const [mainImage,            setMainImage]            = useState(null);
  const [mainImagePreview,     setMainImagePreview]     = useState('');

  const [featuresText,     setFeaturesText]     = useState('');
  const [metaKeywordsText, setMetaKeywordsText] = useState('');
  const [specifications,   setSpecifications]   = useState([{ key: '', value: '' }]);
  const [variantsText,     setVariantsText]     = useState('');
  const [selectedRelated,  setSelectedRelated]  = useState([]);

  const [formData, setFormData] = useState({
    name: '', sku: '', type: '', category_id: '', brand_id: '',
    price: '', original_price: '', price_is_negotiable: false,
    stock_quantity: '', in_stock: true, has_variants: false,
    short_description: '', description: '',
    badge: '', is_featured: false, is_new: false, on_sale: false,
    status: 'active', is_visible: true,
    meta_title: '', meta_description: '',
    admin_notes: '', main_image_url: '', additional_image_urls: '',
  });

  useEffect(() => { fetchCategoriesAndBrands(); if (id) fetchProduct(); }, [id]);

  useEffect(() => {
    if (isCreate && formData.name && !formData.sku) {
      setFormData(p => ({ ...p, sku: generateSKU(p.name) }));
    }
  }, [formData.name, isCreate]);

  const generateSKU = (name) => {
    const words = name.toUpperCase().split(' ').slice(0, 2);
    const prefix = words.map(w => w.substring(0, 4)).join('-');
    return `${prefix}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  };

  const normalizeImageUrl = (p) => {
    if (!p) return null;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    if (p.startsWith('/')) return `${window.location.origin}${p}`;
    return p;
  };
  const fetchCategoriesAndBrands = async () => {
    try {
      const [cRes, bRes] = await Promise.all([
        categoriesAPI.getCategories(),
        brandsAPI.getBrands(),
      ]);
      setCategories(cRes.data || cRes || []);
      setBrands(bRes.data || bRes || []);
    } catch { toast.error('Failed to load form data'); }
  };

  const fetchProduct = async () => {
    try {
      setLoading(true);
    const res = isEdit ? await productsAPI.getAdminProduct(id) : await productsAPI.getProduct(id);
    const product = res.product || res.data || res;
    console.log('type:', product.type);

      setFormData({
        name: product.name || '', sku: product.sku || '', type: product.type || '',
        category_id: product.category_id ?? product.category?.id ?? '',
        brand_id:    product.brand_id    ?? product.brand?.id    ?? '',
        price: product.price || '', original_price: product.original_price || '',
        price_is_negotiable: product.price_is_negotiable || false,
        stock_quantity: product.stock_quantity || '',
        in_stock: product.in_stock !== undefined ? Boolean(product.in_stock) : true,
        has_variants: product.has_variants || false,
        short_description: product.short_description || '',
        description: product.description || '',
        badge: product.badge || '', is_featured: product.is_featured || false,
        is_new: product.is_new || false, on_sale: product.on_sale || false,
        status: product.status || 'active',
        is_visible: product.is_visible !== undefined ? Boolean(product.is_visible) : true,
        meta_title: product.meta_title || '', meta_description: product.meta_description || '',
        admin_notes: product.admin_notes || '', main_image_url: '', additional_image_urls: '',
      });

      const mainPreview = normalizeImageUrl(
        product.main_image_url || product.main_image ||
        (Array.isArray(product.image_urls) && product.image_urls[0]) ||
        (Array.isArray(product.images) && product.images[0])
      );
      setMainImagePreview(mainPreview || '');
      setMainImage(null);

      let existing = [], previews = [];
      if (Array.isArray(product.image_urls) && product.image_urls.length) {
        existing = product.image_urls.slice(0, 5);
        previews = product.image_urls.map(normalizeImageUrl).filter(Boolean);
      } else if (Array.isArray(product.images) && product.images.length) {
        existing = product.images.slice(0, 5);
        previews = product.images.map(normalizeImageUrl).filter(Boolean);
      } else if (Array.isArray(product.additional_images)) {
        existing = product.additional_images.slice(0, 5);
        previews = product.additional_images.map(normalizeImageUrl).filter(Boolean);
      }
      setExistingImageUrlsRaw(existing);
      setAdditionalPreviews(previews);
      setAdditionalImages([]); setNewFilePreviews([]);

      if (Array.isArray(product.features)) setFeaturesText(product.features.join(', '));
      if (Array.isArray(product.meta_keywords)) setMetaKeywordsText(product.meta_keywords.join(', '));
      if (product.specifications && typeof product.specifications === 'object') {
        const specs = Object.entries(product.specifications).map(([key, value]) => ({ key, value }));
        setSpecifications(specs.length > 0 ? specs : [{ key: '', value: '' }]);
      }
      if (product.has_variants && product.variants) {
        setVariantsText(Array.isArray(product.variants) ? product.variants.join(', ') : product.variants);
      }
      
      const relatedSource = product.related_products_data     // adminShow: full objects inside product
        ?? res.related_products_data                          // future-proofing
        ?? product.related_products                           // raw IDs if somehow on product
        ?? res.related_products                               // show(): category-based array at top level
        ?? [];
      if (relatedSource.length > 0) {
        setSelectedRelated(
          relatedSource.map(p =>
            typeof p === 'object'
              ? { id: p.id, name: p.name, sku: p.sku }
              : { id: p, name: `Product #${p}` }
          )
        );
      }
    } catch { toast.error('Failed to load product'); navigate('/admin/products'); }
    finally { setLoading(false); }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleMainImageChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be < 5MB'); return; }
    setMainImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setMainImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleAdditionalImagesChange = (e) => {
    const files = Array.from(e.target.files);
    if (existingImageUrlsRaw.length + files.length > 5) {
      toast.error(`Max 5 images total. You have ${existingImageUrlsRaw.length} existing.`); return;
    }
    const valid = files.filter(f => {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name} is not an image`); return false; }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is too large (max 5MB)`); return false; }
      return true;
    });
    setAdditionalImages(p => [...p, ...valid]);
    const previews = [];
    valid.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        previews.push(reader.result);
        if (previews.length === valid.length) {
          const merged = [...existingImageUrlsRaw.map(normalizeImageUrl), ...newFilePreviews, ...previews];
          setAdditionalPreviews(merged);
          setNewFilePreviews(p => [...p, ...previews]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAdditionalImage = (index) => {
    const ec = existingImageUrlsRaw.length;
    if (index < ec) {
      const updated = existingImageUrlsRaw.filter((_, i) => i !== index);
      setExistingImageUrlsRaw(updated);
      setAdditionalPreviews([...updated.map(normalizeImageUrl), ...newFilePreviews]);
    } else {
      const ni = index - ec;
      const updatedFiles = additionalImages.filter((_, i) => i !== ni);
      const updatedPrev  = newFilePreviews.filter((_, i) => i !== ni);
      setAdditionalImages(updatedFiles); setNewFilePreviews(updatedPrev);
      setAdditionalPreviews([...existingImageUrlsRaw.map(normalizeImageUrl), ...updatedPrev]);
    }
  };

  const addSpecification    = () => setSpecifications(p => [...p, { key: '', value: '' }]);
  const removeSpecification = (i) => setSpecifications(p => p.filter((_, j) => j !== i));
  const updateSpecification = (i, f, v) => {
    const updated = [...specifications]; updated[i][f] = v; setSpecifications(updated);
  };
  //const removeRelated = (pid) => setSelectedRelated(p => p.filter(x => x !== pid));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.sku || !formData.price || !formData.category_id) {
      toast.error('Please fill in all required fields'); return;
    }
    try {
      setLoading(true);
      const fd = new FormData();
      const str = (k, v) => fd.append(k, v ?? '');
      const bool = (k, v) => fd.append(k, v ? '1' : '0');

      str('name', formData.name); str('sku', formData.sku);
      str('category_id', formData.category_id); str('brand_id', formData.brand_id);
      str('type', formData.type); str('price', formData.price);
      str('original_price', formData.original_price);
      bool('price_is_negotiable', formData.price_is_negotiable);
      str('stock_quantity', formData.stock_quantity || '0');
      bool('in_stock', formData.in_stock);
      str('description', formData.description); str('short_description', formData.short_description);
      str('status', formData.status); bool('is_visible', formData.is_visible);
      bool('is_featured', formData.is_featured); bool('is_new', formData.is_new);
      bool('on_sale', formData.on_sale); str('badge', formData.badge);
      str('meta_title', formData.meta_title); str('meta_description', formData.meta_description);
      str('admin_notes', formData.admin_notes);

      if (mainImage) {
        fd.append('main_image', mainImage);
      } else if (formData.main_image_url?.trim() && !formData.main_image_url.includes('/storage/')) {
        fd.append('main_image_url', formData.main_image_url);
      }

      let typedExternal = (formData.additional_image_urls || '').split('\n').map(u => u.trim()).filter(Boolean);
      const total = existingImageUrlsRaw.length + typedExternal.length + additionalImages.length;
      if (total > 5) { toast.error(`Max 5 images. Current: ${total}.`); setLoading(false); return; }
      const keepList = [...existingImageUrlsRaw, ...typedExternal];
      if (keepList.length > 0) fd.append('additional_image_urls', JSON.stringify(keepList.slice(0, 5)));
      additionalImages.forEach((file, i) => fd.append(`images[${i}]`, file));

      if (featuresText.trim()) fd.append('features', JSON.stringify(featuresText.split(',').map(f => f.trim()).filter(Boolean)));
      if (metaKeywordsText.trim()) fd.append('meta_keywords', JSON.stringify(metaKeywordsText.split(',').map(k => k.trim()).filter(Boolean)));

      const validSpecs = specifications.filter(s => s.key && s.value);
      if (validSpecs.length > 0) {
        const obj = {}; validSpecs.forEach(s => { obj[s.key] = s.value; });
        fd.append('specifications', JSON.stringify(obj));
      }

      if (formData.has_variants && variantsText.trim()) {
        fd.append('variants', JSON.stringify(variantsText.split(',').map(v => v.trim()).filter(Boolean)));
        fd.append('has_variants', '1');
      } else { fd.append('has_variants', '0'); }

      if (selectedRelated.length > 0)
        fd.append('related_products', JSON.stringify(selectedRelated.map(p => p.id ?? p)));

      if (isEdit) { await productsAPI.updateProduct(id, fd); toast.success('Product updated!'); }
      else        { await productsAPI.createProduct(fd);     toast.success('Product created!'); }
      navigate('/admin/products');
    } catch (err) {
      const errs = err.response?.data?.errors;
      if (errs) Object.keys(errs).forEach(k => toast.error(`${k}: ${errs[k][0]}`));
      else toast.error(err.response?.data?.message || 'Failed to save product');
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${formData.name}"? This cannot be undone.`)) return;
    try {
      setDeleting(true);
      await productsAPI.deleteProduct(id);
      toast.success(`"${formData.name}" deleted`);
      navigate('/admin/products');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete'); }
    finally { setDeleting(false); }
  };

  if (loading && (isEdit || isView)) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LoadingSpinner />
      </div>
    </AdminLayout>
  );

  const TABS = [
    { id: 'basic',    name: 'Basic info'      },
    { id: 'pricing',  name: 'Pricing & stock'  },
    { id: 'images',   name: 'Images'           },
    { id: 'details',  name: 'Details'          },
    { id: 'variants', name: 'Variants'         },
    { id: 'marketing',name: 'Marketing'        },
    { id: 'seo',      name: 'SEO & advanced'   },
  ];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <button
              onClick={() => navigate('/admin/products')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.78rem', color: '#9ca3af', background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, transition: 'color 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#7c3aed'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
            >
              <ChevronLeft size={14} /> Products
            </button>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 3px' }}>
              {isView ? 'View product' : isEdit ? 'Edit product' : 'New product'}
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
              {isView ? 'View product details' : isEdit ? 'Update product information' : 'Add a new product to your catalogue'}
            </p>
          </div>

          {/* Top actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            {isView ? (
              <button onClick={() => navigate(`/admin/products/${id}/edit`)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                boxShadow: '0 3px 10px rgba(168,85,247,0.3)',
              }}>
                <Edit2 size={13} /> Edit product
              </button>
            ) : (
              <>
                <button onClick={() => navigate('/admin/products')} disabled={loading || deleting} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 600,
                  background: 'transparent', color: '#9ca3af',
                  border: '1.5px solid rgba(168,85,247,0.2)', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color 150ms, color 150ms',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#a855f7'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.color = '#9ca3af'; }}
                >
                  <X size={13} /> Cancel
                </button>
                <button type="submit" form="product-form" disabled={loading} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                  boxShadow: '0 3px 10px rgba(168,85,247,0.3)', opacity: loading ? 0.7 : 1,
                }}>
                  <Save size={13} /> {loading ? 'Saving…' : isEdit ? 'Update' : 'Create'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{
          ...card, padding: 0, overflow: 'hidden',
          borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
          borderBottom: 'none',
        }}>
          <div style={{ display: 'flex', padding: '0 20px', borderBottom: '2px solid rgba(168,85,247,0.1)', overflowX: 'auto' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '12px 14px', fontSize: '0.8rem',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? '#a855f7' : '#9ca3af',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                borderBottom: `2px solid ${activeTab === tab.id ? '#a855f7' : 'transparent'}`,
                marginBottom: -2, whiteSpace: 'nowrap', transition: 'color 150ms',
              }}>
                {tab.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Form ── */}
        <form id="product-form" onSubmit={handleSubmit} style={{
          ...card, borderTopLeftRadius: 0, borderTopRightRadius: 0,
          padding: 28, display: 'flex', flexDirection: 'column', gap: 24,
        }}>

          {/* ── BASIC ── */}
          {activeTab === 'basic' && (
            <>
              <p style={sectionHeader}>Basic information</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Product name *">
                    <StyledInput name="name" value={formData.name} onChange={handleChange} disabled={isView} placeholder="Enter product name" required={!isView} />
                  </Field>
                </div>
                <Field label="SKU *" hint={!isView ? 'Auto-generated, editable' : undefined}>
                  <StyledInput name="sku" value={formData.sku} onChange={handleChange} disabled={isView} placeholder="PROD-001" required={!isView} style={{ fontFamily: 'monospace' }} />
                </Field>
                <Field label="Product type">
                  <StyledInput name="type" value={formData.type} onChange={handleChange} disabled={isView} placeholder="e.g. Equipment, Tool, Consumable" />
                </Field>
                <Field label="Category *">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <StyledSelect name="category_id" value={formData.category_id} onChange={handleChange} disabled={isView} required={!isView} style={{ flex: 1 }}>
                      <option value="">Select category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </StyledSelect>
                    {!isView && (
                      <button type="button" onClick={() => window.open('/admin/categories/create', '_blank')} style={{
                        padding: '0 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                      }}>
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                </Field>
                <Field label="Brand">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <StyledSelect name="brand_id" value={formData.brand_id} onChange={handleChange} disabled={isView} style={{ flex: 1 }}>
                      <option value="">Select brand</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </StyledSelect>
                    {!isView && (
                      <button type="button" onClick={() => window.open('/admin/brands/create', '_blank')} style={{
                        padding: '0 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                      }}>
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                </Field>
              </div>
            </>
          )}

          {/* ── PRICING ── */}
          {activeTab === 'pricing' && (
            <>
              <p style={sectionHeader}>Pricing & inventory</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                <Field label="Price (KES) *">
                  <StyledInput type="number" name="price" value={formData.price} onChange={handleChange} disabled={isView} placeholder="0.00" step="0.01" min="0" required={!isView} />
                </Field>
                <Field label="Original price (KES)" hint={!isView ? 'Used for showing discounts' : undefined}>
                  <StyledInput type="number" name="original_price" value={formData.original_price} onChange={handleChange} disabled={isView} placeholder="0.00" step="0.01" min="0" />
                </Field>
                <Field label="Stock quantity" hint={!isView ? 'Leave empty if not tracking' : undefined}>
                  <StyledInput type="number" name="stock_quantity" value={formData.stock_quantity} onChange={handleChange} disabled={isView} placeholder="Optional" min="0" />
                </Field>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Toggle
                    checked={formData.price_is_negotiable}
                    onChange={v => setFormData(p => ({ ...p, price_is_negotiable: v }))}
                    disabled={isView}
                    label="Price is negotiable"
                    sub='Shows "Request Quote" to customers'
                  />
                  <Toggle
                    checked={formData.in_stock}
                    onChange={v => setFormData(p => ({ ...p, in_stock: v }))}
                    disabled={isView}
                    label="In stock"
                  />
                </div>
              </div>
            </>
          )}

          {/* ── IMAGES ── */}
          {activeTab === 'images' && (
            <>
              <p style={sectionHeader}>Product images</p>

              {/* Main image */}
              <div>
                <label style={labelStyle}>Main image *</label>
                {mainImagePreview && (
                  <div style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
                    <img src={mainImagePreview} alt="Main" style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 10, border: '1.5px solid rgba(168,85,247,0.2)', display: 'block' }} />
                    {!isView && (
                      <button type="button" onClick={() => { setMainImage(null); setMainImagePreview(''); setFormData(p => ({ ...p, main_image_url: '' })); }} style={{
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
                      <StyledInput type="file" accept="image/*" onChange={handleMainImageChange} style={{ cursor: 'pointer' }} />
                    </Field>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(168,85,247,0.12)' }} />
                      <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 }}>OR</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(168,85,247,0.12)' }} />
                    </div>
                    <Field label="Image URL">
                      <StyledInput type="url" name="main_image_url" value={formData.main_image_url || ''} placeholder="https://example.com/image.jpg"
                        onChange={e => { handleChange(e); if (e.target.value) { setMainImagePreview(e.target.value); setMainImage(null); } }}
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Additional images */}
              <div>
                <label style={labelStyle}>Additional images (max 5)</label>
                {additionalPreviews.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
                    {additionalPreviews.map((preview, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={preview} alt={`Additional ${i + 1}`} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, border: '1.5px solid rgba(168,85,247,0.2)', display: 'block' }} />
                        {!isView && (
                          <button type="button" onClick={() => removeAdditionalImage(i)} style={{
                            position: 'absolute', top: -7, right: -7, width: 22, height: 22,
                            borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                          }}>
                            <X size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!isView && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="Upload files" hint="Max 5 images, 5MB each">
                      <StyledInput type="file" multiple accept="image/*" onChange={handleAdditionalImagesChange} style={{ cursor: 'pointer' }} />
                    </Field>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(168,85,247,0.12)' }} />
                      <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 }}>OR</span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(168,85,247,0.12)' }} />
                    </div>
                    <Field label="Image URLs" hint="One per line, max 5 total">
                      <StyledTextarea
                        name="additional_image_urls"
                        value={formData.additional_image_urls || ''}
                        rows={4}
                        placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
                        onChange={e => {
                          handleChange(e);
                          const urls = e.target.value.split('\n').map(u => u.trim()).filter(Boolean).slice(0, 5 - existingImageUrlsRaw.length);
                          setAdditionalPreviews([...existingImageUrlsRaw.map(normalizeImageUrl), ...urls]);
                          setAdditionalImages([]); setNewFilePreviews([]);
                        }}
                      />
                    </Field>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── DETAILS ── */}
          {activeTab === 'details' && (
            <>
              <p style={sectionHeader}>Product details</p>
              <Field label="Short description" hint={!isView ? `${formData.short_description.length}/500 characters — shown in product listings` : undefined}>
                <StyledTextarea name="short_description" value={formData.short_description} onChange={handleChange} disabled={isView} rows={3} maxLength={500} placeholder="Brief summary (max 500 characters)" />
              </Field>
              <Field label="Full description">
                <StyledTextarea name="description" value={formData.description} onChange={handleChange} disabled={isView} rows={8} placeholder="Detailed product description, features, usage instructions…" />
              </Field>
              <Field label="Features" hint={!isView ? 'Comma-separated, e.g. Heavy duty, Weather resistant, Ergonomic' : undefined}>
                <StyledTextarea value={featuresText} onChange={e => setFeaturesText(e.target.value)} disabled={isView} rows={3} placeholder="Heavy duty, Weather resistant, Ergonomic design" />
              </Field>

              {/* Specifications */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Specifications</label>
                  {!isView && (
                    <button type="button" onClick={addSpecification} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: '0.75rem', fontWeight: 700, color: '#a855f7',
                      background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <Plus size={12} /> Add row
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {specifications.map((spec, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <StyledInput value={spec.key} onChange={e => updateSpecification(i, 'key', e.target.value)} disabled={isView} placeholder="e.g. Weight" style={{ flex: 1 }} />
                      <StyledInput value={spec.value} onChange={e => updateSpecification(i, 'value', e.target.value)} disabled={isView} placeholder="e.g. 2.5 kg" style={{ flex: 1 }} />
                      {!isView && specifications.length > 1 && (
                        <button type="button" onClick={() => removeSpecification(i)} style={{
                          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 7, border: 'none', cursor: 'pointer', flexShrink: 0,
                          background: 'rgba(239,68,68,0.07)', color: '#ef4444', transition: 'background 120ms',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.14)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.07)'}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── VARIANTS ── */}
          {activeTab === 'variants' && (
            <>
              <p style={sectionHeader}>Product variants</p>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: -12 }}>
                Add size, colour, or other variations of this product.
              </p>
              <Toggle
                checked={formData.has_variants}
                onChange={v => setFormData(p => ({ ...p, has_variants: v }))}
                disabled={isView}
                label="This product has variants"
                sub="Size, colour, material, etc."
              />
              {formData.has_variants ? (
                <Field label="Variants" hint={!isView ? 'Comma-separated — e.g. 10mm, 12mm, 15mm or Red, Blue, Green' : undefined}>
                  <StyledInput value={variantsText} onChange={e => setVariantsText(e.target.value)} disabled={isView} placeholder="Small, Medium, Large, X-Large" />
                </Field>
              ) : (
                <div style={{
                  padding: '40px 24px', borderRadius: 10, textAlign: 'center',
                  border: '1.5px dashed rgba(168,85,247,0.2)', color: '#9ca3af', fontSize: '0.82rem',
                }}>
                  Enable variants above to add product variations
                </div>
              )}
            </>
          )}

          {/* ── MARKETING ── */}
          {activeTab === 'marketing' && (
            <>
              <p style={sectionHeader}>Marketing & display</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                <Field label="Product badge">
                  <StyledSelect name="badge" value={formData.badge} onChange={handleChange} disabled={isView}>
                    <option value="">No badge</option>
                    {['New','Sale','Hot','Featured','Best Seller'].map(b => <option key={b} value={b}>{b}</option>)}
                  </StyledSelect>
                </Field>
                <Field label="Status">
                  <StyledSelect name="status" value={formData.status} onChange={handleChange} disabled={isView}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="out_of_stock">Out of stock</option>
                    <option value="discontinued">Discontinued</option>
                  </StyledSelect>
                </Field>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Toggle checked={formData.is_featured} onChange={v => setFormData(p => ({ ...p, is_featured: v }))} disabled={isView} label="Featured product" sub="Show on homepage" />
                <Toggle checked={formData.is_new}      onChange={v => setFormData(p => ({ ...p, is_new: v }))}      disabled={isView} label="New arrival" />
                <Toggle checked={formData.on_sale}     onChange={v => setFormData(p => ({ ...p, on_sale: v }))}     disabled={isView} label="On sale" />
                <Toggle checked={formData.is_visible}  onChange={v => setFormData(p => ({ ...p, is_visible: v }))}  disabled={isView} label="Visible on frontend" sub="Customers can see this product" />
              </div>

              {/* Related products */}
              <Field label="Related products" hint={!isView ? 'Click to browse and add related products' : undefined}>
                {/* Selected pills */}
                {selectedRelated.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {selectedRelated.map(p => (
                      <span key={p.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
                        background: 'rgba(168,85,247,0.08)', color: '#7c3aed',
                        border: '1px solid rgba(168,85,247,0.22)',
                      }}>
                        {p.name}
                        {p.sku && <span style={{ fontSize: '0.62rem', color: '#c4b5fd', fontFamily: 'monospace' }}>{p.sku}</span>}
                        {!isView && (
                          <button type="button" onClick={() => setSelectedRelated(prev => prev.filter(x => x.id !== p.id))}
                            style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', cursor: 'pointer',
                              background: 'rgba(168,85,247,0.15)', color: '#7c3aed',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.15)'}
                          >
                            <X size={9} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {isView && selectedRelated.length === 0 && (
                  <p style={{ fontSize: '0.78rem', color: '#d1d5db', margin: 0 }}>No related products</p>
                )}

                {!isView && (
                  <button type="button" onClick={() => setShowProductSelector(true)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 9, fontSize: '0.78rem', fontWeight: 700,
                    background: 'rgba(168,85,247,0.08)', color: '#7c3aed',
                    border: '1.5px dashed rgba(168,85,247,0.3)', cursor: 'pointer',
                    transition: 'background 150ms',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.14)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}
                  >
                    <Plus size={13} /> Browse products{selectedRelated.length > 0 ? ` (${selectedRelated.length} selected)` : ''}
                  </button>
                )}
              </Field>
            </>
          )}

          {/* ── SEO ── */}
          {activeTab === 'seo' && (
            <>
              <p style={sectionHeader}>SEO & advanced</p>
              <Field label="Meta title" hint={!isView ? 'For search engines — leave empty to use product name' : undefined}>
                <StyledInput name="meta_title" value={formData.meta_title} onChange={handleChange} disabled={isView} placeholder="SEO title" />
              </Field>
              <Field label="Meta description" hint={!isView ? '155–160 characters recommended' : undefined}>
                <StyledTextarea name="meta_description" value={formData.meta_description} onChange={handleChange} disabled={isView} rows={3} placeholder="Brief description for search results" />
              </Field>
              <Field label="Meta keywords" hint={!isView ? 'Comma-separated' : undefined}>
                <StyledTextarea value={metaKeywordsText} onChange={e => setMetaKeywordsText(e.target.value)} disabled={isView} rows={2} placeholder="construction tools, hardware, building materials" />
              </Field>
              <Field label="Admin notes" hint={!isView ? 'Internal only — not visible to customers' : undefined}>
                <StyledTextarea name="admin_notes" value={formData.admin_notes} onChange={handleChange} disabled={isView} rows={4} placeholder="Supplier info, special handling, internal notes…" />
              </Field>
            </>
          )}

        </form>

        {/* ── Danger zone (view mode only) ── */}
        {isView && (
          <div style={{
            marginTop: 20, padding: '20px 24px', borderRadius: 12,
            background: 'rgba(239,68,68,0.05)', border: '1.5px solid rgba(239,68,68,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <AlertTriangle size={16} style={{ color: '#ef4444' }} />
              <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#b91c1c', margin: 0 }}>Danger zone</p>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#ef4444', margin: '0 0 14px' }}>
              Once deleted, this product cannot be recovered.
            </p>
            <button type="button" onClick={handleDelete} disabled={deleting} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              background: 'rgba(239,68,68,0.9)', color: 'white',
              opacity: deleting ? 0.6 : 1,
            }}>
              {deleting ? <LoadingSpinner /> : <Trash2 size={14} />}
              {deleting ? 'Deleting…' : 'Delete this product'}
            </button>
          </div>
        )}
      </div>
      {showProductSelector && (
        <ProductSelectorModalAdmin
          onClose={() => setShowProductSelector(false)}
          selectedProducts={selectedRelated.map(p => ({ product_id: p.id }))}
          onSelect={(newProducts) => {
            setSelectedRelated(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const merged = [...prev, ...newProducts.filter(p => !existingIds.has(p.id))];
              return merged;
            });
            setShowProductSelector(false);
          }}
        />
      )}
    </AdminLayout>
  );
}