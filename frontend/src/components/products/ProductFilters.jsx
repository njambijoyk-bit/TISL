import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, X, ChevronDown, Tag, Award,
  ArrowUpDown, Sparkles, Flame, PackageCheck, Star,
} from 'lucide-react';
import { categoriesAPI, brandsAPI } from '../../api';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'created_at_desc', label: 'Newest First' },
  { value: 'created_at_asc',  label: 'Oldest First' },
  { value: 'price_asc',       label: 'Price: Low → High' },
  { value: 'price_desc',      label: 'Price: High → Low' },
  { value: 'name_asc',        label: 'Name: A → Z' },
  { value: 'name_desc',       label: 'Name: Z → A' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Dropdown({ label, icon: Icon, active, onClear, children, minWidth = 220 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 13px', borderRadius: 9999, cursor: 'pointer',
          fontSize: '0.775rem', fontWeight: 700, whiteSpace: 'nowrap',
          transition: 'all 150ms ease',
          background: active ? 'rgba(168,85,247,0.12)' : 'white',
          border: `1px solid ${active ? 'rgba(168,85,247,0.45)' : '#e5e7eb'}`,
          color: active ? '#a855f7' : '#4b5563',
          boxShadow: active
            ? '0 0 0 3px rgba(168,85,247,0.08), 0 0 8px rgba(168,85,247,0.12)'
            : '0 1px 2px rgba(0,0,0,0.05)',
        }}
      >
        {Icon && <Icon size={13} />}
        <span>{label}</span>
        {active && onClear ? (
          <span
            onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
            style={{ display: 'flex', alignItems: 'center', marginLeft: 1, color: '#a855f7', opacity: 0.65 }}
          >
            <X size={11} />
          </span>
        ) : (
          <ChevronDown size={12} style={{ opacity: 0.45, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', marginLeft: 1 }} />
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 7px)', left: 0, zIndex: 200,
          background: 'white', border: '1px solid #f0e8ff',
          borderRadius: 14, boxShadow: '0 12px 32px rgba(168,85,247,0.12), 0 2px 8px rgba(0,0,0,0.08)',
          minWidth, padding: '6px 0', overflow: 'hidden',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Option row
// ─────────────────────────────────────────────────────────────────────────────
function Option({ label, selected, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 14px', border: 'none', cursor: 'pointer',
        fontSize: '0.8rem', fontWeight: selected ? 700 : 400, textAlign: 'left',
        background: selected ? 'rgba(168,85,247,0.08)' : hovered ? '#faf5ff' : 'transparent',
        color: selected ? '#a855f7' : '#374151', transition: 'background 100ms',
      }}
    >
      {label}
      {selected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }} />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick-toggle pill
// ─────────────────────────────────────────────────────────────────────────────
function QuickToggle({ label, icon: Icon, active, onClick }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '7px 13px', borderRadius: 9999, cursor: 'pointer',
        fontSize: '0.775rem', fontWeight: 700, whiteSpace: 'nowrap',
        transition: 'all 150ms ease', border: 'none', flexShrink: 0,
        background: active ? 'rgba(168,85,247,0.12)' : '#f3f4f6',
        color: active ? '#a855f7' : '#6b7280',
        boxShadow: active ? '0 0 0 1.5px rgba(168,85,247,0.4), 0 0 10px rgba(168,85,247,0.15)' : 'none',
      }}
    >
      {Icon && <Icon size={12} />}
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active filter chip
// ─────────────────────────────────────────────────────────────────────────────
function Chip({ label, onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px 3px 11px', borderRadius: 9999,
      fontSize: '0.72rem', fontWeight: 700,
      background: 'rgba(168,85,247,0.09)',
      border: '1px solid rgba(168,85,247,0.28)', color: '#a855f7',
    }}>
      {label}
      <button
        type="button" onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#a855f7', opacity: 0.55 }}
        onMouseEnter={e => e.currentTarget.style.opacity = 1}
        onMouseLeave={e => e.currentTarget.style.opacity = 0.55}
      >
        <X size={10} />
      </button>
    </span>
  );
}

const Divider = () => (
  <div style={{ width: 1, height: 22, background: '#e9e4f0', flexShrink: 0 }} />
);

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function ProductFilters({ filters, onFilterChange, onReset }) {
  const [categories, setCategories] = useState([]);
  const [brands, setBrands]         = useState([]);
  const [priceMin, setPriceMin]     = useState(filters.min_price || '');
  const [priceMax, setPriceMax]     = useState(filters.max_price || '');
  const [searchVal, setSearchVal]   = useState(filters.search || '');
  const [priceOpen, setPriceOpen]   = useState(false);
  const priceRef = useRef(null);

  useEffect(() => {
    Promise.all([categoriesAPI.getCategories(), brandsAPI.getBrands()])
      .then(([catRes, brandRes]) => {
        setCategories(catRes?.data || catRes || []);
        setBrands(brandRes?.data || brandRes || []);
      })
      .catch(console.error);
  }, []);

  useEffect(() => { setSearchVal(filters.search || ''); }, [filters.search]);
  useEffect(() => { setPriceMin(filters.min_price || ''); }, [filters.min_price]);
  useEffect(() => { setPriceMax(filters.max_price || ''); }, [filters.max_price]);

  useEffect(() => {
    const handler = (e) => { if (priceRef.current && !priceRef.current.contains(e.target)) setPriceOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const activeCategory = categories.find((c) => String(c.id) === String(filters.category_id));
  const activeBrand    = brands.find((b) => String(b.id) === String(filters.brand_id));
  const activeSort     = SORT_OPTIONS.find((s) => s.value === filters.sort);
  const hasPriceFilter = !!(filters.min_price || filters.max_price);

  const activeCount = [
    filters.search, filters.category_id, filters.brand_id,
    hasPriceFilter, filters.featured, filters.on_sale, filters.new, filters.in_stock,
  ].filter(Boolean).length;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const applyPrice = useCallback(() => {
    onFilterChange('min_price', priceMin);
    onFilterChange('max_price', priceMax);
    setPriceOpen(false);
  }, [priceMin, priceMax, onFilterChange]);

  const clearPrice = useCallback(() => {
    setPriceMin(''); setPriceMax('');
    onFilterChange('min_price', '');
    onFilterChange('max_price', '');
  }, [onFilterChange]);

  const handleReset = useCallback(() => {
    setSearchVal(''); setPriceMin(''); setPriceMax('');
    onReset();
  }, [onReset]);

  const priceBtnLabel = hasPriceFilter
    ? `KSh ${filters.min_price || '0'} – ${filters.max_price || '∞'}`
    : 'Price';

  return (
    <div style={{ marginBottom: 16 }}>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '10px 0 8px' }}>

        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c084fc', pointerEvents: 'none' }} />
          <input
            type="text" placeholder="Search products…"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onFilterChange('search', searchVal); }}
            style={{
              paddingLeft: 30, paddingRight: searchVal ? 28 : 12, paddingTop: 7, paddingBottom: 7,
              borderRadius: 9999, fontSize: '0.775rem', width: 190, outline: 'none',
              border: '1px solid #e5e7eb', background: 'white', color: '#111827',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'border-color 150ms, box-shadow 150ms',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
            onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; }}
          />
          {searchVal && (
            <button type="button" onClick={() => { setSearchVal(''); onFilterChange('search', ''); }}
              style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#c084fc', padding: 0, display: 'flex' }}>
              <X size={11} />
            </button>
          )}
        </div>

        <Divider />

        {/* Category */}
        <Dropdown label={activeCategory?.name || 'Category'} icon={Tag} active={!!filters.category_id} onClear={() => onFilterChange('category_id', '')} minWidth={210}>
          <Option label="All Categories" selected={!filters.category_id} onClick={() => onFilterChange('category_id', '')} />
          {categories.length > 0 && <div style={{ height: 1, background: '#f3e8ff', margin: '4px 0' }} />}
          {categories.map((cat) => (
            <Option key={cat.id} label={cat.name} selected={String(filters.category_id) === String(cat.id)} onClick={() => onFilterChange('category_id', cat.id)} />
          ))}
        </Dropdown>

        {/* Brand */}
        <Dropdown label={activeBrand?.name || 'Brand'} icon={Award} active={!!filters.brand_id} onClear={() => onFilterChange('brand_id', '')} minWidth={200}>
          <Option label="All Brands" selected={!filters.brand_id} onClick={() => onFilterChange('brand_id', '')} />
          {brands.length > 0 && <div style={{ height: 1, background: '#f3e8ff', margin: '4px 0' }} />}
          {brands.map((brand) => (
            <Option key={brand.id} label={brand.name} selected={String(filters.brand_id) === String(brand.id)} onClick={() => onFilterChange('brand_id', brand.id)} />
          ))}
        </Dropdown>

        {/* Price range */}
        <div ref={priceRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button" onClick={() => setPriceOpen((v) => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 13px', borderRadius: 9999, cursor: 'pointer',
              fontSize: '0.775rem', fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 150ms ease',
              background: hasPriceFilter ? 'rgba(168,85,247,0.12)' : 'white',
              border: `1px solid ${hasPriceFilter ? 'rgba(168,85,247,0.45)' : '#e5e7eb'}`,
              color: hasPriceFilter ? '#a855f7' : '#4b5563',
              boxShadow: hasPriceFilter ? '0 0 0 3px rgba(168,85,247,0.08)' : '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <span style={{ fontSize: '0.75rem' }}></span>
            <span>{priceBtnLabel}</span>
            {hasPriceFilter ? (
              <span onClick={(e) => { e.stopPropagation(); clearPrice(); }} style={{ display: 'flex', alignItems: 'center', marginLeft: 1, color: '#a855f7', opacity: 0.65 }}>
                <X size={11} />
              </span>
            ) : (
              <ChevronDown size={12} style={{ opacity: 0.45, transform: priceOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', marginLeft: 1 }} />
            )}
          </button>

          {priceOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 7px)', left: 0, zIndex: 200,
              background: 'white', border: '1px solid #f0e8ff', borderRadius: 14,
              boxShadow: '0 12px 32px rgba(168,85,247,0.12), 0 2px 8px rgba(0,0,0,0.08)',
              width: 240, padding: 14,
            }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 800, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                Price Range (KSh)
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input type="number" placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: '0.78rem', outline: 'none', width: 0, color: '#111827' }}
                  onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 2px rgba(168,85,247,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                />
                <span style={{ color: '#d1d5db', fontSize: '0.8rem', flexShrink: 0 }}>–</span>
                <input type="number" placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: '0.78rem', outline: 'none', width: 0, color: '#111827' }}
                  onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 2px rgba(168,85,247,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              {/* Quick presets */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {[
                  { label: 'Under 1k',  min: '',      max: '1000'  },
                  { label: '1k – 5k',   min: '1000',  max: '5000'  },
                  { label: '5k – 20k',  min: '5000',  max: '20000' },
                  { label: '20k+',      min: '20000', max: ''       },
                ].map((p) => (
                  <button key={p.label} type="button"
                    onClick={() => { setPriceMin(p.min); setPriceMax(p.max); }}
                    style={{
                      padding: '3px 9px', borderRadius: 9999, border: '1px solid #e9e4f0',
                      fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                      background: priceMin === p.min && priceMax === p.max ? 'rgba(168,85,247,0.12)' : '#f9f5ff',
                      color: priceMin === p.min && priceMax === p.max ? '#a855f7' : '#7c3aed',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={applyPrice}
                style={{ width: '100%', padding: '8px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Sort */}
        <Dropdown
          label={activeSort?.label || 'Sort'} icon={ArrowUpDown}
          active={!!(filters.sort && filters.sort !== 'created_at_desc')}
          onClear={() => onFilterChange('sort', 'created_at_desc')}
          minWidth={200}
        >
          {SORT_OPTIONS.map((opt) => (
            <Option key={opt.value} label={opt.label} selected={filters.sort === opt.value} onClick={() => onFilterChange('sort', opt.value)} />
          ))}
        </Dropdown>

        <Divider />

        {/* Quick toggles */}
        <QuickToggle label="Featured"  icon={Star}         active={!!filters.featured}  onClick={() => onFilterChange('featured',  !filters.featured)} />
        <QuickToggle label="On Sale"   icon={Flame}        active={!!filters.on_sale}   onClick={() => onFilterChange('on_sale',   !filters.on_sale)} />
        <QuickToggle label="New"       icon={Sparkles}     active={!!filters.new}       onClick={() => onFilterChange('new',       !filters.new)} />
        <QuickToggle label="In Stock"  icon={PackageCheck} active={!!filters.in_stock}  onClick={() => onFilterChange('in_stock',  !filters.in_stock)} />

        {/* Clear all */}
        {activeCount > 0 && (
          <>
            <Divider />
            <button type="button" onClick={handleReset}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '7px 13px', borderRadius: 9999, border: 'none',
                fontSize: '0.775rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                background: 'rgba(239,68,68,0.07)', color: '#ef4444', transition: 'background 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.07)'}
            >
              <X size={12} />
              Clear {activeCount > 1 ? `(${activeCount})` : ''}
            </button>
          </>
        )}
      </div>

      {/* ── Active chips ───────────────────────────────────────────────────── */}
      {activeCount > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingBottom: 10 }}>
          {filters.search    && <Chip label={`"${filters.search}"`} onRemove={() => { setSearchVal(''); onFilterChange('search', ''); }} />}
          {activeCategory    && <Chip label={activeCategory.name}   onRemove={() => onFilterChange('category_id', '')} />}
          {activeBrand       && <Chip label={activeBrand.name}      onRemove={() => onFilterChange('brand_id', '')} />}
          {hasPriceFilter    && <Chip label={`KSh ${filters.min_price || '0'} – ${filters.max_price || '∞'}`} onRemove={clearPrice} />}
          {filters.featured  && <Chip label="Featured"  onRemove={() => onFilterChange('featured',  false)} />}
          {filters.on_sale   && <Chip label="On Sale"   onRemove={() => onFilterChange('on_sale',   false)} />}
          {filters.new       && <Chip label="New"       onRemove={() => onFilterChange('new',       false)} />}
          {filters.in_stock  && <Chip label="In Stock"  onRemove={() => onFilterChange('in_stock',  false)} />}
        </div>
      )}
    </div>
  );
}