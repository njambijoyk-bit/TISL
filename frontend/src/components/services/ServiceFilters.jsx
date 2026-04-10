import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, X, ChevronDown, Tag, ArrowUpDown,
  Wifi, MapPin, Star, Wrench, DollarSign,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { value: 'created_at|desc', label: 'Newest First',        sortBy: 'created_at', sortOrder: 'desc' },
  { value: 'popular|desc',    label: 'Most Popular',        sortBy: 'popular',    sortOrder: 'desc' },
  { value: 'rating|desc',     label: 'Highest Rated',       sortBy: 'rating',     sortOrder: 'desc' },
  { value: 'price_low|asc',   label: 'Price: Low → High',   sortBy: 'price_low',  sortOrder: 'asc'  },
  { value: 'price_high|desc', label: 'Price: High → Low',   sortBy: 'price_high', sortOrder: 'desc' },
];

const PRICING_OPTIONS = [
  { value: '',               label: 'All Pricing' },
  { value: 'fixed',          label: 'Fixed Price' },
  { value: 'hourly',         label: 'Hourly Rate' },
  { value: 'daily',          label: 'Daily Rate' },
  { value: 'project_based',  label: 'Project Based' },
  { value: 'subscription',   label: 'Subscription' },
  { value: 'negotiable',     label: 'Negotiable' },
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
          <ChevronDown
            size={12}
            style={{ opacity: 0.45, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', marginLeft: 1 }}
          />
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
        boxShadow: active
          ? '0 0 0 1.5px rgba(168,85,247,0.4), 0 0 10px rgba(168,85,247,0.15)'
          : 'none',
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
export default function ServiceFilters({ categories = [], types = [], filters, onFilterChange, onSearch, onReset }) {
  const [searchVal, setSearchVal]   = useState(filters?.search || '');
  const [priceMin, setPriceMin]     = useState(filters?.min_price ?? '');
  const [priceMax, setPriceMax]     = useState(filters?.max_price ?? '');
  const [priceOpen, setPriceOpen]   = useState(false);
  const priceRef = useRef(null);

  // Sync external resets
  useEffect(() => { setSearchVal(filters?.search || ''); }, [filters?.search]);
  useEffect(() => { setPriceMin(filters?.min_price ?? ''); }, [filters?.min_price]);
  useEffect(() => { setPriceMax(filters?.max_price ?? ''); }, [filters?.max_price]);

  // Close price panel on outside click
  useEffect(() => {
    const handler = (e) => { if (priceRef.current && !priceRef.current.contains(e.target)) setPriceOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const activeCategory = useMemo(() =>
    categories.find((c) => c.id === filters?.category_id), [categories, filters?.category_id]);

  const activePricing = PRICING_OPTIONS.find((p) => p.value === (filters?.pricing_model || ''));

  const activeSort = useMemo(() => {
    const key = `${filters?.sort_by || 'created_at'}|${filters?.sort_order || 'desc'}`;
    return SORT_OPTIONS.find((s) => s.value === key);
  }, [filters?.sort_by, filters?.sort_order]);

  // Normalize type label
  const activeType = filters?.type
    ? (types.find(t => t === filters.type) ? filters.type.charAt(0).toUpperCase() + filters.type.slice(1).replace(/_/g, ' ') : filters.type)
    : null;

  const hasPriceFilter = !!(filters?.min_price || filters?.max_price);

  // Location toggle state — derives from requires_site_visit
  // null = any, false = remote, true = on-site
  const locationMode = filters?.requires_site_visit === true ? 'onsite'
    : filters?.requires_site_visit === false ? 'remote'
    : filters?.remote_only ? 'remote'
    : null;

  const activeCount = [
    filters?.search, filters?.category_id, filters?.type,
    filters?.pricing_model, hasPriceFilter, filters?.featured,
    locationMode,
  ].filter(Boolean).length;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const push = useCallback((patch) => onFilterChange?.(patch), [onFilterChange]);

  const applyPrice = useCallback(() => {
    push({ min_price: priceMin === '' ? null : Number(priceMin), max_price: priceMax === '' ? null : Number(priceMax) });
    setPriceOpen(false);
  }, [priceMin, priceMax, push]);

  const clearPrice = useCallback(() => {
    setPriceMin(''); setPriceMax('');
    push({ min_price: null, max_price: null });
  }, [push]);

  const handleReset = useCallback(() => {
    setSearchVal(''); setPriceMin(''); setPriceMax('');
    onReset?.();
  }, [onReset]);

  // Location cycling: null → remote → onsite → null
  const handleLocationToggle = useCallback((mode) => {
    if (locationMode === mode) {
      // deselect
      push({ remote_only: false, requires_site_visit: null });
    } else if (mode === 'remote') {
      push({ remote_only: true, requires_site_visit: false });
    } else {
      push({ remote_only: false, requires_site_visit: true });
    }
  }, [locationMode, push]);

  const priceBtnLabel = hasPriceFilter
    ? `KSh ${filters.min_price ?? '0'} – ${filters.max_price ?? '∞'}`
    : 'Price';

  const sortIsDefault = !filters?.sort_by || filters.sort_by === 'created_at';

  return (
    <div style={{ marginBottom: 16 }}>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '10px 0 8px' }}>

        {/* Search */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c084fc', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search services…"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { onSearch?.(searchVal); push({ search: searchVal }); } }}
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
            <button type="button"
              onClick={() => { setSearchVal(''); onSearch?.(''); push({ search: '' }); }}
              style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#c084fc', padding: 0, display: 'flex' }}>
              <X size={11} />
            </button>
          )}
        </div>

        <Divider />

        {/* Category */}
        <Dropdown label={activeCategory?.name || 'Category'} icon={Tag} active={!!filters?.category_id} onClear={() => push({ category_id: null })} minWidth={210}>
          <Option label="All Categories" selected={!filters?.category_id} onClick={() => push({ category_id: null })} />
          {categories.length > 0 && <div style={{ height: 1, background: '#f3e8ff', margin: '4px 0' }} />}
          {categories.map((cat) => (
            <Option key={cat.id} label={cat.name} selected={filters?.category_id === cat.id} onClick={() => push({ category_id: cat.id })} />
          ))}
        </Dropdown>

        {/* Type */}
        {types.length > 0 && (
          <Dropdown label={activeType || 'Type'} icon={Wrench} active={!!filters?.type} onClear={() => push({ type: null })} minWidth={180}>
            <Option label="All Types" selected={!filters?.type} onClick={() => push({ type: null })} />
            <div style={{ height: 1, background: '#f3e8ff', margin: '4px 0' }} />
            {types.map((t) => (
              <Option
                key={t}
                label={t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')}
                selected={filters?.type === t}
                onClick={() => push({ type: t })}
              />
            ))}
          </Dropdown>
        )}

        {/* Pricing Model */}
        <Dropdown
          label={activePricing?.value ? activePricing.label : 'Pricing'}
          icon={DollarSign}
          active={!!filters?.pricing_model}
          onClear={() => push({ pricing_model: null })}
          minWidth={190}
        >
          {PRICING_OPTIONS.map((opt) => (
            <Option
              key={opt.value} label={opt.label}
              selected={(filters?.pricing_model || '') === opt.value}
              onClick={() => push({ pricing_model: opt.value || null })}
            />
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
                  { label: 'Under 5k',   min: '',       max: '5000'  },
                  { label: '5k – 20k',   min: '5000',   max: '20000' },
                  { label: '20k – 100k', min: '20000',  max: '100000'},
                  { label: '100k+',      min: '100000', max: ''      },
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
          active={!sortIsDefault}
          onClear={() => push({ sort_by: 'created_at', sort_order: 'desc' })}
          minWidth={200}
        >
          {SORT_OPTIONS.map((opt) => (
            <Option
              key={opt.value} label={opt.label}
              selected={`${filters?.sort_by || 'created_at'}|${filters?.sort_order || 'desc'}` === opt.value}
              onClick={() => push({ sort_by: opt.sortBy, sort_order: opt.sortOrder })}
            />
          ))}
        </Dropdown>

        <Divider />

        {/* Location toggles */}
        <QuickToggle label="Remote"  icon={Wifi}    active={locationMode === 'remote'} onClick={() => handleLocationToggle('remote')} />
        <QuickToggle label="On-Site" icon={MapPin}  active={locationMode === 'onsite'} onClick={() => handleLocationToggle('onsite')} />
        <QuickToggle label="Featured" icon={Star}   active={!!filters?.featured}        onClick={() => push({ featured: !filters?.featured })} />

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
          {filters?.search     && <Chip label={`"${filters.search}"`}  onRemove={() => { setSearchVal(''); onSearch?.(''); push({ search: '' }); }} />}
          {activeCategory      && <Chip label={activeCategory.name}    onRemove={() => push({ category_id: null })} />}
          {filters?.type       && <Chip label={activeType}             onRemove={() => push({ type: null })} />}
          {filters?.pricing_model && <Chip label={activePricing?.label || filters.pricing_model} onRemove={() => push({ pricing_model: null })} />}
          {hasPriceFilter      && <Chip label={`KSh ${filters.min_price ?? '0'} – ${filters.max_price ?? '∞'}`} onRemove={clearPrice} />}
          {locationMode === 'remote' && <Chip label="Remote Only"  onRemove={() => push({ remote_only: false, requires_site_visit: null })} />}
          {locationMode === 'onsite' && <Chip label="On-Site Only" onRemove={() => push({ remote_only: false, requires_site_visit: null })} />}
          {filters?.featured   && <Chip label="Featured"             onRemove={() => push({ featured: false })} />}
        </div>
      )}
    </div>
  );
}