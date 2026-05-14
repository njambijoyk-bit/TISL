import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ShieldCheck, CreditCard, Star, Eye, ArrowUpDown, Gift, X,
  Building2, User, Package, Briefcase, TrendingUp, Activity,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import CustomerHealthModal from './CustomerHealthModal';
import customersAPI from '../../api/customers';
import customerTiersAPI from '../../api/customerTiers';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  active:      { bg: 'rgba(16,185,129,0.1)',  color: '#065f46', dot: '#10b981',  ring: 'rgba(16,185,129,0.25)'  },
  inactive:    { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', dot: '#9ca3af',  ring: 'rgba(107,114,128,0.2)'  },
  suspended:   { bg: 'rgba(245,158,11,0.1)',  color: '#b45309', dot: '#f59e0b',  ring: 'rgba(245,158,11,0.25)'  },
  blacklisted: { bg: 'rgba(239,68,68,0.1)',   color: '#b91c1c', dot: '#ef4444',  ring: 'rgba(239,68,68,0.25)'   },
};

const TIER_STYLES_FALLBACK = {
  bronze:   { bg: 'rgba(249,115,22,0.1)',  color: '#c2410c', ring: 'rgba(249,115,22,0.25)'  },
  silver:   { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', ring: 'rgba(107,114,128,0.2)'  },
  gold:     { bg: 'rgba(234,179,8,0.1)',   color: '#b45309', ring: 'rgba(234,179,8,0.25)'   },
  platinum: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', ring: 'rgba(168,85,247,0.25)'  },
};

function tierStyle(slug, tierOptions = []) {
  const opt = tierOptions.find(t => t.slug === slug);
  if (opt?.color) {
    return { bg: `${opt.color}18`, color: opt.color, ring: `${opt.color}40` };
  }
  return TIER_STYLES_FALLBACK[slug] ?? TIER_STYLES_FALLBACK.silver;
}
const STAT_META = [
  { key: 'total_customers',  label: 'Total customers',  icon: <Users size={18} />,        accent: '#2563eb', bg: 'rgba(37,99,235,0.08)'   },
  { key: 'active_customers', label: 'Active',           icon: <ShieldCheck size={18} />,  accent: '#059669', bg: 'rgba(5,150,105,0.08)'   },
  { key: 'vip_customers',    label: 'VIP (Gold+)',      icon: <Star size={18} />,          accent: '#d97706', bg: 'rgba(217,119,6,0.08)'   },
  { key: 'with_credit',      label: 'Credit accounts',  icon: <CreditCard size={18} />,   accent: '#7c3aed', bg: 'rgba(124,58,237,0.08)'  },
];

const TYPE_ICONS = {
  individual: <User size={11} />,
  business:   <Building2 size={11} />,
  wholesale:  <Package size={11} />,
  contractor: <Briefcase size={11} />,
};

const SORT_FIELDS = [
  { key: 'created_at',   label: 'Date joined'  },
  { key: 'first_name',   label: 'Name'          },
  { key: 'total_spent',  label: 'Total spent'   },
  { key: 'total_orders', label: 'Orders'        },
  { key: 'last_order_date', label: 'Last order' },
];

const PER_PAGE_OPTIONS = [10, 20, 50];

const fmt     = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtPts  = (n) => Number(n ?? 0).toLocaleString();

// ── Shared styles ─────────────────────────────────────────────────────────────

const card = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const selectStyle = {
  padding: '7px 11px', borderRadius: 8, fontSize: '0.8rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#374151', outline: 'none',
  fontFamily: 'inherit', cursor: 'pointer',
  transition: 'border-color 150ms, box-shadow 150ms',
};
const selectFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const selectBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const TH_LABEL = ({ children }) => (
  <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>
    {children}
  </span>
);

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent, bg }) {
  return (
    <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, color: accent,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{label}</p>
        <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a855f7', lineHeight: 1.1, margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
        {sub && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '3px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ bg, color, ring, children, style = {} }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
      textTransform: 'capitalize', background: bg, color,
      boxShadow: `0 0 0 1px ${ring}`,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  );
}

function SortButton({ field, sortBy, sortOrder, onSort, align = 'left' }) {
  const active = sortBy === field.key;
  return (
    <button
      onClick={() => onSort(field.key)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        width: '100%',
        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
        color: active ? '#a855f7' : '#9ca3af',
        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        transition: 'color 150ms',
      }}
    >
      {field.label}
      {active
        ? sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        : <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
      }
    </button>
  );
}

// Skeleton row — must match tbody column count (10 cells)
function SkeletonRow() {
  const widths = [null, 64, 56, 72, 80, 72, 64, 80, 72, 0];
  return (
    <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.05)' }}>
      {/* Customer cell */}
      <td style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(168,85,247,0.08)', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ width: 112, height: 11, borderRadius: 6, background: 'rgba(168,85,247,0.08)' }} />
            <div style={{ width: 148, height: 9, borderRadius: 6, background: 'rgba(168,85,247,0.05)' }} />
          </div>
        </div>
      </td>
      {widths.map((w, j) => (
        <td key={j} style={{ padding: '12px 16px' }}>
          {w > 0 && <div style={{ width: w, height: 10, borderRadius: 6, background: 'rgba(168,85,247,0.06)' }} />}
        </td>
      ))}
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Customers() {
  const navigate = useNavigate();

  const [customers,    setCustomers]    = useState([]);
  const [stats,        setStats]        = useState(null);
  const [meta,         setMeta]         = useState({ current_page: 1, last_page: 1, total: 0 });
  const [search,       setSearch]       = useState('');
  const [status,       setStatus]       = useState('');
  const [type,         setType]         = useState('');
  const [tier,         setTier]         = useState('');
  const [sortBy,       setSortBy]       = useState('created_at');
  const [sortOrder,    setSortOrder]    = useState('desc');
  const [page,         setPage]         = useState(1);
  const [perPage,      setPerPage]      = useState(20);
  const [loading,      setLoading]      = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showFilters,  setShowFilters]  = useState(false);

  const [showHealthModal, setShowHealthModal] = useState(false);

  // Birthdays modal
  const [showBirthdaysModal, setShowBirthdaysModal] = useState(false);
  const [birthdays, setBirthdays]                   = useState([]);
  const [birthdaysLoading, setBirthdaysLoading]     = useState(false);
  const [birthdayDays, setBirthdayDays]             = useState(30);

  const [tierOptions, setTierOptions] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);

  useEffect(() => {
    customersAPI.getCustomerStatistics()
      .then(setStats).catch(() => {}).finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    customerTiersAPI.getActiveTiers().then(setTierOptions).catch(() => {});
    customerTiersAPI.getActiveTypes().then(setTypeOptions).catch(() => {});
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page, per_page: perPage, sort_by: sortBy, sort_order: sortOrder,
        ...(search && { search }), ...(status && { status }),
        ...(type   && { type   }), ...(tier   && { tier   }),
      };
      const data = await customersAPI.getAllCustomers(params);
      setCustomers(data.data ?? []);
      setMeta({ current_page: data.current_page, last_page: data.last_page, total: data.total });
    } catch {} finally { setLoading(false); }
  }, [page, perPage, sortBy, sortOrder, search, status, type, tier]);

  const fetchBirthdays = async (days = birthdayDays) => {
    setBirthdaysLoading(true);
    try {
      const data = await customersAPI.getUpcomingBirthdays(days);
      setBirthdays(data.data || []);
    } catch { toast.error('Failed to load birthdays'); setBirthdays([]); }
    finally { setBirthdaysLoading(false); }
  };

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);
  useEffect(() => { setPage(1); }, [search, status, type, tier, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const clearFilters = () => { setSearch(''); setStatus(''); setType(''); setTier(''); };
  const hasFilters   = search || status || type || tier;
  const activeFilterCount = [status, type, tier].filter(Boolean).length;

  return (
    <AdminLayout>
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 2px' }}>
            Customers
          </h1>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
            {meta.total.toLocaleString()} total customers
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setShowHealthModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
              background: 'rgba(168,85,247,0.06)', border: '1.5px solid rgba(168,85,247,0.2)', color: '#7c3aed',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.11)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
          >
            <Activity size={14} /> Health
          </button>
          <button
            onClick={() => { setShowBirthdaysModal(true); fetchBirthdays(30); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
              background: 'rgba(217,119,6,0.06)', border: '1.5px solid rgba(217,119,6,0.2)', color: '#b45309',
              transition: 'all 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(217,119,6,0.11)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(217,119,6,0.06)'}
          >
            <Gift size={14} /> Birthdays
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      {!statsLoading && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {STAT_META.map(({ key, label, icon, accent, bg }) => {
            const value = stats[key]?.toLocaleString() ?? '—';
            const sub   = key === 'active_customers' && stats.total_customers
              ? `${Math.round((stats.active_customers / stats.total_customers) * 100)}% of total`
              : undefined;
            return <StatCard key={key} icon={icon} label={label} value={value} sub={sub} accent={accent} bg={bg} />;
          })}
        </div>
      )}

      {/* ── Search + filters ── */}
      <div style={card}>
        <div style={{ padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#c4b5fd', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search by name, email, phone, company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 12px 7px 32px', borderRadius: 8, fontSize: '0.82rem',
                background: 'rgba(168,85,247,0.04)',
                border: '1.5px solid rgba(168,85,247,0.18)',
                color: '#111827', outline: 'none', fontFamily: 'inherit',
                boxSizing: 'border-box', transition: 'border-color 150ms, box-shadow 150ms',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          <button
            onClick={() => setShowFilters(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer', transition: 'all 150ms',
              background: showFilters || hasFilters ? 'rgba(168,85,247,0.08)' : 'transparent',
              border: `1.5px solid ${showFilters || hasFilters ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.18)'}`,
              color: showFilters || hasFilters ? '#7c3aed' : '#9ca3af',
            }}
          >
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%', fontSize: '0.6rem', fontWeight: 800,
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div style={{
            padding: '12px 16px 14px',
            borderTop: '1px solid rgba(168,85,247,0.1)',
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          }}>
            <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              <option value="">All statuses</option>
              {['active','inactive','suspended','blacklisted'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={type} onChange={e => setType(e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              <option value="">All types</option>
              {(typeOptions.length > 0 ? typeOptions : [
                { slug: 'individual', name: 'Individual' },{ slug: 'business', name: 'Business' },
                { slug: 'wholesale', name: 'Wholesale' },{ slug: 'contractor', name: 'Contractor' },
              ]).map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
            <select value={tier} onChange={e => setTier(e.target.value)} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              <option value="">All tiers</option>
              {(tierOptions.length > 0 ? tierOptions : [
                { slug: 'bronze', name: 'Bronze' },{ slug: 'silver', name: 'Silver' },
                { slug: 'gold', name: 'Gold' },{ slug: 'platinum', name: 'Platinum' },
              ]).map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
            </select>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={e => { const [f, o] = e.target.value.split(':'); setSortBy(f); setSortOrder(o); }}
              style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}
            >
              {SORT_FIELDS.flatMap(f => [
                <option key={`${f.key}:desc`} value={`${f.key}:desc`}>{f.label}: newest / highest</option>,
                <option key={`${f.key}:asc`}  value={`${f.key}:asc`}>{f.label}: oldest / lowest</option>,
              ])}
            </select>
            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} style={selectStyle} onFocus={selectFocus} onBlur={selectBlur}>
              {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} per page</option>)}
            </select>
            {hasFilters && (
              <button onClick={clearFilters} style={{
                fontSize: '0.78rem', fontWeight: 600, color: '#c4b5fd',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                padding: '0 4px', transition: 'color 150ms',
              }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.02)' }}>

                {/* Customer */}
                <th style={{ padding: '10px 20px', textAlign: 'left', minWidth: 220 }}>
                  <TH_LABEL>Customer</TH_LABEL>
                </th>

                {/* Type / Tier */}
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 120 }}>
                  <TH_LABEL>Type / Tier</TH_LABEL>
                </th>

                {/* Status */}
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 100 }}>
                  <TH_LABEL>Status</TH_LABEL>
                </th>

                {/* Orders — sortable */}
                <th style={{ padding: '10px 16px', textAlign: 'right', minWidth: 90 }}>
                  <SortButton field={SORT_FIELDS[3]} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
                </th>

                {/* Total spent — sortable */}
                <th style={{ padding: '10px 16px', textAlign: 'right', minWidth: 120 }}>
                  <SortButton field={SORT_FIELDS[2]} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
                </th>

                {/* Last order — sortable */}
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 110 }}>
                  <SortButton field={SORT_FIELDS[4]} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                </th>

                {/* Loyalty / Credit */}
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 130 }}>
                  <TH_LABEL>Loyalty / Credit</TH_LABEL>
                </th>

                {/* Sales rep */}
                <th style={{ padding: '10px 16px', textAlign: 'left', minWidth: 110 }}>
                  <TH_LABEL>Sales rep</TH_LABEL>
                </th>

                {/* Action */}
                <th style={{ padding: '10px 16px', width: 44 }} />

              </tr>
            </thead>

            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)

                : customers.length === 0
                  ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '64px 24px', textAlign: 'center' }}>
                        <Users size={36} style={{ color: 'rgba(168,85,247,0.15)', margin: '0 auto 12px', display: 'block' }} />
                        <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: '0 0 8px' }}>No customers found</p>
                        {hasFilters && (
                          <button onClick={clearFilters} style={{
                            fontSize: '0.75rem', fontWeight: 600, color: '#a855f7',
                            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                            Clear filters
                          </button>
                        )}
                      </td>
                    </tr>
                  )

                  : customers.map((c, i) => {
                      const st    = STATUS_STYLES[c.status] ?? STATUS_STYLES.inactive;
                      const tr    = tierStyle(c.tier, tierOptions);
                      const isLast = i === customers.length - 1;

                      return (
                        <tr
                          key={c.id}
                          onClick={() => navigate(`/admin/customers/${c.id}`)}
                          style={{
                            borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)',
                            cursor: 'pointer', transition: 'background 120ms',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >

                          {/* ── Customer ── */}
                          <td style={{ padding: '12px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                              <img
                                src={c.profile_image_url} alt={c.full_name}
                                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'rgba(168,85,247,0.08)', display: 'block' }}
                              />
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.full_name}
                                </p>
                                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.email}
                                </p>
                                <p style={{ fontSize: '0.65rem', color: '#c4b5fd', fontFamily: 'monospace', margin: 0 }}>
                                  {c.customer_number}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* ── Type / Tier ── */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              <Badge bg="rgba(168,85,247,0.07)" color="#7c3aed" ring="rgba(168,85,247,0.18)">
                                {TYPE_ICONS[c.customer_type]}
                                {c.customer_type}
                              </Badge>
                              <Badge bg={tr.bg} color={tr.color} ring={tr.ring}>
                                {c.tier}
                              </Badge>
                            </div>
                          </td>

                          {/* ── Status ── */}
                          <td style={{ padding: '12px 16px' }}>
                            <Badge bg={st.bg} color={st.color} ring={st.ring}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                              {c.status}
                            </Badge>
                          </td>

                          {/* ── Orders ── */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>
                              {(c.total_orders ?? 0).toLocaleString()}
                            </span>
                          </td>

                          {/* ── Total spent ── */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>
                              {fmt(c.total_spent)}
                            </span>
                            {c.average_order_value > 0 && (
                              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0', whiteSpace: 'nowrap' }}>
                                avg {fmt(c.average_order_value)}
                              </p>
                            )}
                          </td>

                          {/* ── Last order ── */}
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '0.78rem', color: c.last_order_date ? '#374151' : '#d1d5db' }}>
                              {fmtDate(c.last_order_date)}
                            </span>
                          </td>

                          {/* ── Loyalty / Credit ── */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {/* Loyalty points */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Star size={10} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e' }}>
                                  {fmtPts(c.loyalty_points)} pts
                                </span>
                              </div>
                              {/* Store credit */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CreditCard size={10} style={{ color: '#7c3aed', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#5b21b6' }}>
                                  {fmt(c.store_credit)}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* ── Sales rep ── */}
                          <td style={{ padding: '12px 16px' }}>
                            {c.sales_rep
                              ? <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{c.sales_rep.name}</span>
                              : <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>—</span>
                            }
                          </td>

                          {/* ── Action ── */}
                          <td style={{ padding: '12px 16px' }}>
                            <button
                              onClick={e => { e.stopPropagation(); navigate(`/admin/customers/${c.id}`); }}
                              style={{
                                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer',
                                color: '#c4b5fd', transition: 'background 120ms, color 120ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.color = '#a855f7'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#c4b5fd'; }}
                            >
                              <Eye size={14} />
                            </button>
                          </td>

                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!loading && customers.length > 0 && (
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(168,85,247,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(168,85,247,0.02)',
          }}>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
              Page {meta.current_page} of {meta.last_page} — {meta.total.toLocaleString()} customers
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={meta.current_page <= 1}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: meta.current_page <= 1 ? 'not-allowed' : 'pointer',
                  border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                  color: '#a855f7', opacity: meta.current_page <= 1 ? 0.3 : 1, transition: 'background 120ms',
                }}
                onMouseEnter={e => { if (meta.current_page > 1) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: Math.min(5, meta.last_page) }, (_, i) => {
                const p = meta.current_page <= 3
                  ? i + 1
                  : meta.current_page >= meta.last_page - 2
                  ? meta.last_page - 4 + i
                  : meta.current_page - 2 + i;
                if (p < 1 || p > meta.last_page) return null;
                const isActive = p === meta.current_page;
                return (
                  <button
                    key={p} onClick={() => setPage(p)}
                    style={{
                      width: 30, height: 30, borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 150ms',
                      background: isActive ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'none',
                      border: isActive ? 'none' : '1.5px solid rgba(168,85,247,0.18)',
                      color: isActive ? 'white' : '#9ca3af',
                      boxShadow: isActive ? '0 2px 8px rgba(168,85,247,0.3)' : 'none',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
                disabled={meta.current_page >= meta.last_page}
                style={{
                  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: meta.current_page >= meta.last_page ? 'not-allowed' : 'pointer',
                  border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
                  color: '#a855f7', opacity: meta.current_page >= meta.last_page ? 0.3 : 1, transition: 'background 120ms',
                }}
                onMouseEnter={e => { if (meta.current_page < meta.last_page) e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* ── Customer Birthdays Modal ── */}
      {showBirthdaysModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ ...card, width: '100%', maxWidth: 620, maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(217,119,6,0.1)' }}>
                  <Gift size={18} style={{ color: '#d97706' }} />
                </div>
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>Customer Birthdays</p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>Plan birthday promos in advance</p>
                </div>
              </div>
              <button onClick={() => setShowBirthdaysModal(false)} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <X size={16} />
              </button>
            </div>

            {/* Window toggle */}
            <div style={{ display: 'flex', gap: 6, padding: '14px 20px 0', flexShrink: 0 }}>
              {[
                { label: 'This week', days: 7 },
                { label: '30 days',   days: 30 },
                { label: '60 days',   days: 60 },
                { label: '90 days',   days: 90 },
              ].map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => { setBirthdayDays(days); fetchBirthdays(days); }}
                  style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: '0.73rem', fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', border: 'none', transition: 'all 120ms',
                    background: birthdayDays === days ? '#d97706' : 'rgba(217,119,6,0.08)',
                    color: birthdayDays === days ? 'white' : '#b45309',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
              {birthdaysLoading ? (
                <div style={{ padding: '48px 0', textAlign: 'center' }}>
                  <div style={{ width: 32, height: 32, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Loading…</p>
                </div>
              ) : birthdays.length === 0 ? (
                <div style={{ padding: '48px 0', textAlign: 'center' }}>
                  <Gift size={32} style={{ color: 'rgba(168,85,247,0.15)', margin: '0 auto 12px', display: 'block' }} />
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                    No customer birthdays in the next {birthdayDays} days
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {/* Count summary */}
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 6px' }}>
                    {birthdays.length} customer{birthdays.length !== 1 ? 's' : ''} · next {birthdayDays} days
                  </p>

                  {birthdays.map(c => {
                    const isToday  = c.days_until === 0;
                    const isSoon   = c.days_until <= 7;
                    const tr       = tierStyle(c.tier, tierOptions);
                    const accent   = isToday ? '#7c3aed' : isSoon ? '#d97706' : '#6b7280';
                    const accentBg = isToday ? 'rgba(124,58,237,0.08)' : isSoon ? 'rgba(217,119,6,0.07)' : 'rgba(107,114,128,0.06)';

                    return (
                      <div
                        key={c.id}
                        onClick={() => { setShowBirthdaysModal(false); navigate(`/admin/customers/${c.id}`); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                          border: `1px solid ${isToday ? 'rgba(124,58,237,0.2)' : 'rgba(168,85,247,0.1)'}`,
                          background: isToday ? 'rgba(124,58,237,0.03)' : 'transparent',
                          transition: 'border-color 150ms, background 150ms',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'; e.currentTarget.style.background = 'rgba(168,85,247,0.03)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = isToday ? 'rgba(124,58,237,0.2)' : 'rgba(168,85,247,0.1)'; e.currentTarget.style.background = isToday ? 'rgba(124,58,237,0.03)' : 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          {/* Avatar */}
                          <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: accentBg, color: accent, fontSize: '0.8rem', fontWeight: 800 }}>
                            {c.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
                              {/* Tier badge */}
                              <span style={{ flexShrink: 0, padding: '1px 7px', borderRadius: 20, fontSize: '0.6rem', fontWeight: 700, background: tr.bg, color: tr.color, boxShadow: `0 0 0 1px ${tr.ring}` }}>
                                {c.tier}
                              </span>
                            </div>
                            <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0 0 1px' }}>
                              {new Date(c.birthday).toLocaleDateString('en-KE', { day: 'numeric', month: 'long' })}
                              {c.turning && ` · Turning ${c.turning}`}
                            </p>
                            <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{c.email}</p>
                          </div>
                        </div>

                        {/* Days pill */}
                        <span style={{ flexShrink: 0, padding: '4px 11px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: accentBg, color: accent, whiteSpace: 'nowrap' }}>
                          {isToday ? '🎂 Today!' : c.days_until === 1 ? 'Tomorrow' : `${c.days_until} days`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}
      {showHealthModal && <CustomerHealthModal onClose={() => setShowHealthModal(false)} />}
    </div>
    </AdminLayout>
  );
}