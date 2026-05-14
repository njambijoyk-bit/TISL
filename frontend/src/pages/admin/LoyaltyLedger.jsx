import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins, CreditCard, Search, ChevronLeft, ChevronRight,
  TrendingUp, Users, Filter, ChevronDown, Loader2, Settings,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import loyaltyAPI from '../../api/loyalty';
import customerTiersAPI from '../../api/customerTiers';
import { useAuthStore } from '../../store';

// ── Style tokens ──────────────────────────────────────────────────────────────

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const inputStyle = {
  padding: '7px 11px 7px 34px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 150ms, box-shadow 150ms',
};

const pill = (active) => ({
  padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600,
  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
  background: active ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.06)',
  color: active ? 'white' : '#7c3aed',
  transition: 'all 150ms',
});

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

const fmtKes  = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtPts  = (n) => Number(n ?? 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = '#a855f7' }) {
  return (
    <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: `rgba(168,85,247,0.08)`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 3px' }}>{label}</p>
        <p style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', margin: 0 }}>{value}</p>
        {sub && <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0' }}>{sub}</p>}
      </div>
    </div>
  );
}

function TierBadge({ tier }) {
  const s = tierStyle(tier, tierOptions);
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
      fontSize: '0.65rem', fontWeight: 700, textTransform: 'capitalize',
      background: s.bg, color: s.color,
    }}>
      {tier}
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LoyaltyLedger() {
  const navigate   = useNavigate();
  const { user }   = useAuthStore();

  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [tier,     setTier]     = useState('');
  const [hasPoints,setHasPoints]= useState(false);
  const [hasCredit,setHasCredit]= useState(false);
  const [sort,     setSort]     = useState('loyalty_points');

  const [tierOptions, setTierOptions] = useState([]);
  useEffect(() => { customerTiersAPI.getActiveTiers().then(setTierOptions).catch(() => {}); }, []);

  const searchRef  = useRef(null);
  const debounceRef= useRef(null);

  const canConfig = ['super_admin','admin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loyaltyAPI.index({
        page, search: search || undefined,
        tier: tier || undefined,
        has_points: hasPoints || undefined,
        has_credit: hasCredit || undefined,
        sort, dir: 'desc', per_page: 20,
      });
      setData(res);
    } catch { /* handled by interceptor */ }
    finally { setLoading(false); }
  }, [page, search, tier, hasPoints, hasCredit, sort]);

  useEffect(() => { load(); }, [load]);

  const onSearch = (v) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(v); setPage(1); }, 350);
  };

  const customers  = data?.data ?? [];
  const meta = {
    current_page: data?.current_page ?? 1,
    last_page:    data?.last_page    ?? 1,
    total:        data?.total        ?? 0,
    };
  const totalPts   = customers.reduce((s, c) => s + Number(c.loyalty_points ?? 0), 0);
  const totalCred  = customers.reduce((s, c) => s + Number(c.store_credit ?? 0), 0);

  return (
    <AdminLayout>
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            Loyalty Ledger
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
            Store credit & loyalty points across all customers
          </p>
        </div>
        {canConfig && (
          <button
            onClick={() => navigate('/admin/loyalty/settings')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
              background: 'rgba(168,85,247,0.06)', border: '1.5px solid rgba(168,85,247,0.18)',
              color: '#7c3aed', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Settings size={14} /> Settings
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard icon={<Users size={18} style={{ color: '#a855f7' }} />}   label="Total customers" value={meta.total?.toLocaleString() ?? '—'} />
        <StatCard icon={<Coins size={18} style={{ color: '#a855f7' }} />}   label="Points on this page" value={fmtPts(totalPts)} sub="sum of visible rows" />
        <StatCard icon={<CreditCard size={18} style={{ color: '#a855f7' }} />} label="Credit on this page" value={fmtKes(totalCred)} sub="sum of visible rows" />
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#c4b5fd', pointerEvents: 'none' }} />
          <input
            ref={searchRef} placeholder="Search name, email, number…"
            style={inputStyle}
            onChange={e => onSearch(e.target.value)}
            onFocus={e => { e.target.style.borderColor = '#a855f7'; e.target.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(168,85,247,0.18)'; e.target.style.boxShadow = 'none'; }}
          />
        </div>

        {/* Tier filter */}
        <select
          value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}
          style={{ ...inputStyle, paddingLeft: 10, flex: '0 0 120px', cursor: 'pointer' }}
        >
          <option value="">All tiers</option>
          {(tierOptions.length > 0 ? tierOptions : [
            { slug: 'bronze', name: 'Bronze' },{ slug: 'silver', name: 'Silver' },
            { slug: 'gold', name: 'Gold' },{ slug: 'platinum', name: 'Platinum' },
          ]).map(t => (
            <option key={t.slug} value={t.slug}>{t.name}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}
          style={{ ...inputStyle, paddingLeft: 10, flex: '0 0 160px', cursor: 'pointer' }}
        >
          <option value="loyalty_points">Sort: Points ↓</option>
          <option value="store_credit">Sort: Credit ↓</option>
          <option value="total_orders">Sort: Orders ↓</option>
          <option value="last_order_date">Sort: Last order ↓</option>
        </select>

        {/* Toggle pills */}
        <button style={pill(hasPoints)} onClick={() => { setHasPoints(p => !p); setPage(1); }}>
          Has points
        </button>
        <button style={pill(hasCredit)} onClick={() => { setHasCredit(p => !p); setPage(1); }}>
          Has credit
        </button>
      </div>

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.08)', background: 'rgba(168,85,247,0.02)' }}>
              {['Customer','Tier','Loyalty Points','Store Credit','Orders','Last Order'].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', fontSize: '0.65rem', fontWeight: 700,
                  color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em',
                  textAlign: h === 'Customer' || h === 'Tier' ? 'left' : 'right',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 0', textAlign: 'center' }}>
                  <Loader2 size={22} style={{ color: '#c4b5fd', animation: 'spin 700ms linear infinite', display: 'inline-block' }} />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No customers found</p>
                </td>
              </tr>
            ) : customers.map((c, i) => {
              const isLast = i === customers.length - 1;
              const initials = `${c.first_name?.[0] ?? ''}${c.last_name?.[0] ?? ''}`.toUpperCase();
              return (
                <tr key={c.id}
                  onClick={() => navigate(`/admin/loyalty/${c.id}`)}
                  style={{
                    borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)',
                    cursor: 'pointer', transition: 'background 120ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Customer */}
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.profile_image_url ? (
                        <img src={c.profile_image_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.68rem', fontWeight: 700, color: 'white',
                        }}>
                          {initials || '?'}
                        </div>
                      )}
                      <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>
                          {c.first_name} {c.last_name}
                        </p>
                        <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>
                          {c.customer_number}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Tier */}
                  <td style={{ padding: '11px 16px' }}>
                    <TierBadge tier={c.tier} />
                  </td>

                  {/* Points */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <Coins size={13} style={{ color: Number(c.loyalty_points) > 0 ? '#a855f7' : '#d1d5db' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: Number(c.loyalty_points) > 0 ? '#111827' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPts(c.loyalty_points)}
                      </span>
                    </div>
                  </td>

                  {/* Credit */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: Number(c.store_credit) > 0 ? '#059669' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtKes(c.store_credit)}
                    </span>
                  </td>

                  {/* Orders */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.82rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                      {c.total_orders ?? 0}
                    </span>
                  </td>

                  {/* Last order */}
                  <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {fmtDate(c.last_order_date)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && customers.length > 0 && meta.last_page > 1 && (
        <div style={{
            padding: '12px 16px', borderTop: '1px solid rgba(168,85,247,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(168,85,247,0.02)', gap: 4,
        }}>
            {/* Prev */}
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={meta.current_page <= 1} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
            color: '#a855f7', cursor: meta.current_page <= 1 ? 'not-allowed' : 'pointer',
            opacity: meta.current_page <= 1 ? 0.3 : 1,
            }}>
            <ChevronLeft size={13} />
            </button>

            {/* Page numbers */}
            {Array.from({ length: meta.last_page }, (_, i) => i + 1)
            .filter(p => p === 1 || p === meta.last_page || Math.abs(p - meta.current_page) <= 1)
            .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                acc.push(p);
                return acc;
            }, [])
            .map((p, i) => p === '...' ? (
                <span key={`ellipsis-${i}`} style={{ width: 30, textAlign: 'center', fontSize: '0.78rem', color: '#9ca3af' }}>…</span>
            ) : (
                <button key={p} onClick={() => setPage(p)} style={{
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 7, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', border: 'none',
                background: meta.current_page === p ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.06)',
                color: meta.current_page === p ? 'white' : '#7c3aed',
                }}>
                {p}
                </button>
            ))
            }

            {/* Next */}
            <button onClick={() => setPage(p => Math.min(meta.last_page, p + 1))} disabled={meta.current_page >= meta.last_page} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: '1.5px solid rgba(168,85,247,0.18)', background: 'none',
            color: '#a855f7', cursor: meta.current_page >= meta.last_page ? 'not-allowed' : 'pointer',
            opacity: meta.current_page >= meta.last_page ? 0.3 : 1,
            }}>
            <ChevronRight size={13} />
            </button>
        </div>
        )}
      </div>

    </div>
    </AdminLayout>
  );
}