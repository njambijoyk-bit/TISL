import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Package, ShoppingBag, X, Eye, Tag, Wallet, Star, Zap, TrendingDown } from 'lucide-react';
import AdminLayout from '../../../components/layout/AdminLayout';
import hampersAPI from '../../../api/hampers';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Tokens ────────────────────────────────────────────────────────────────────

const card = {
  background: 'var(--color-background-primary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const thStyle = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: '0.68rem', fontWeight: 700,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  borderBottom: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-secondary)',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border-tertiary)',
  fontSize: '0.875rem',
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
};

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  fontSize: '0.875rem', border: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

// ── Atoms ─────────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, iconBg, iconColor }) {
  return (
    <div style={{ ...card, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
        <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{value}</p>
      </div>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active:   { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    draft:    { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
    inactive: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
  };
  const s = map[status] || map.draft;
  return (
    <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {(status || 'draft').toUpperCase()}
    </span>
  );
}

function TogglePill({ value, label, icon: Icon }) {
  return (
    <span title={label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700,
      background: value ? 'rgba(168,85,247,0.1)' : 'var(--color-background-secondary)',
      color: value ? '#7c3aed' : 'var(--color-text-tertiary)',
      opacity: value ? 1 : 0.4,
    }}>
      <Icon size={10} />
    </span>
  );
}

function Btn({ onClick, disabled, style, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
      border: '1px solid var(--color-border-tertiary)',
      background: 'var(--color-background-primary)',
      color: 'var(--color-text-primary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      fontFamily: 'inherit', transition: 'background 150ms', ...style,
    }}>{children}</button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminHampers() {
  const navigate = useNavigate();
  const [hampers, setHampers]       = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [filters, setFilters]       = useState({ search: '', status: '', eligibility_type: '' });
  const [searchInput, setSearchInput] = useState('');
  const searchDebounce = useRef(null);

  // debounced search — only update filters after 400ms of no typing
  const handleSearchChange = useCallback((value) => {
    setSearchInput(value);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setFilters(f => ({ ...f, search: value }));
    }, 400);
  }, []);

  useEffect(() => { fetchHampers(1); }, [filters]);

  const fetchHampers = async (page = 1) => {
    setLoading(true);
    try {
      const res = await hampersAPI.getAllHampers({ ...filters, page, per_page: 20 });
      setHampers(res.data ?? res);
      setPagination(res.meta ?? res.pagination ?? null);
    } catch { toast.error('Failed to load hampers'); }
    finally { setLoading(false); }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const total    = pagination?.total ?? hampers.length;
  const active   = hampers.filter(h => h.status === 'active').length;
  const soldOut  = hampers.filter(h => h.is_sold_out).length;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>Hampers</h1>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>Manage curated bundle deals for eligible customers</p>
          </div>
          <button onClick={() => navigate('/admin/hampers/create')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 9, fontSize: '0.875rem', fontWeight: 700,
            border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
            color: 'white', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 14px rgba(168,85,247,0.3)',
          }}>
            <Plus size={16} /> New Hamper
          </button>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 16 }}>
          <StatCard label="Total Hampers" value={total}   icon={Package}      iconBg="rgba(124,58,237,0.1)"  iconColor="#7c3aed" />
          <StatCard label="Active"        value={active}  icon={Zap}          iconBg="rgba(34,197,94,0.1)"   iconColor="#22c55e" />
          <StatCard label="Sold Out"      value={soldOut} icon={TrendingDown}  iconBg="rgba(239,68,68,0.1)"   iconColor="#ef4444" />
          <StatCard label="Draft"         value={hampers.filter(h => h.status === 'draft').length} icon={ShoppingBag} iconBg="rgba(107,114,128,0.1)" iconColor="#6b7280" />
        </div>

        {/* Filters */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              <input
                type="text" value={searchInput}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search by name…"
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              style={{ ...inputStyle, flex: 1, minWidth: 140, cursor: 'pointer' }}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={filters.eligibility_type} onChange={e => setFilters(f => ({ ...f, eligibility_type: e.target.value }))}
              style={{ ...inputStyle, flex: 1, minWidth: 160, cursor: 'pointer' }}>
              <option value="">All Eligibility Types</option>
              <option value="all">All Customers</option>
              <option value="tier">By Tier</option>
              <option value="customer_type">By Type</option>
              <option value="manual">Manual</option>
            </select>
            {(searchInput || filters.status || filters.eligibility_type) && (
              <Btn onClick={() => { setSearchInput(''); setFilters({ search: '', status: '', eligibility_type: '' }); }}
                style={{ color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>
                <X size={14} /> Clear
              </Btn>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
              <div style={{ width: 36, height: 36, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : hampers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px' }}>
              <Package size={48} style={{ display: 'block', margin: '0 auto 12px', color: 'var(--color-text-tertiary)', opacity: 0.25 }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>No hampers found</h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>Try adjusting your filters or create a new hamper</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Hamper', 'Price', 'Stock', 'Eligibility', 'Toggles', 'Valid Until', 'Status', ''].map((h, i) => (
                        <th key={i} style={{ ...thStyle, textAlign: i === 7 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hampers.map(hamper => (
                      <tr key={hamper.id}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        style={{ transition: 'background 120ms', cursor: 'pointer' }}
                        onClick={() => navigate(`/admin/hampers/${hamper.id}`)}
                      >
                        {/* Hamper */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: `2px solid ${hamper.accent_color}40`, background: `${hamper.accent_color}10` }}>
                              {hamper.cover_image ? (
                                <img src={hamper.cover_image} alt={hamper.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Package size={18} style={{ color: hamper.accent_color, opacity: 0.5 }} />
                                </div>
                              )}
                            </div>
                            <div>
                              <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.875rem' }}>{hamper.name}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: hamper.accent_color, boxShadow: `0 0 5px ${hamper.accent_color}` }} />
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{hamper.accent_color}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Price */}
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 700 }}>{fmt(hamper.price)}</span>
                        </td>

                        {/* Stock */}
                        <td style={tdStyle}>
                          {hamper.total_stock == null ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Unlimited</span>
                          ) : (
                            <div>
                              <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{hamper.stock_remaining}</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}> / {hamper.total_stock}</span>
                              {hamper.is_sold_out && (
                                <span style={{ display: 'block', marginTop: 2, fontSize: '0.65rem', fontWeight: 700, color: '#ef4444' }}>SOLD OUT</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Eligibility */}
                        <td style={tdStyle}>
                          <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: 'rgba(168,85,247,0.08)', color: '#7c3aed' }}>
                            {hamper.eligibility_type?.toUpperCase()}
                          </span>
                        </td>

                        {/* Toggles */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <TogglePill value={hamper.apply_vat}           label="VAT"           icon={Tag} />
                            <TogglePill value={hamper.allow_promo_codes}   label="Promos"        icon={Tag} />
                            <TogglePill value={hamper.allow_store_credit}  label="Store Credit"  icon={Wallet} />
                            <TogglePill value={hamper.earn_loyalty_points} label="Loyalty"       icon={Star} />
                          </div>
                        </td>

                        {/* Valid until */}
                        <td style={tdStyle}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                            {hamper.valid_until ? format(new Date(hamper.valid_until), 'dd MMM yyyy') : '—'}
                          </span>
                        </td>

                        {/* Status */}
                        <td style={tdStyle}><StatusBadge status={hamper.status} /></td>

                        {/* Actions */}
                        <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/admin/hampers/${hamper.id}`)}
                            title="View Detail"
                            style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: '#7c3aed', cursor: 'pointer', transition: 'background 150ms' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination && pagination.last_page > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--color-border-tertiary)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Page {pagination.current_page} of {pagination.last_page} · {pagination.total} total</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn onClick={() => fetchHampers(pagination.current_page - 1)} disabled={pagination.current_page === 1}>← Prev</Btn>
                    <Btn onClick={() => fetchHampers(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page}>Next →</Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
