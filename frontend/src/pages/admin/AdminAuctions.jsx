import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import {
  Search, Plus, Eye, Edit, Trash2, RefreshCw,
  Package, Clock, Gavel, Users, TrendingUp, CheckCircle,
  XCircle, AlertCircle, X, Filter,
} from 'lucide-react';
import auctionsAPI from '../../api/auctions';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';

// ─── Style tokens (matches Products page) ────────────────────────────────────
const card = {
  background: 'var(--color-background-primary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
  border: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)', outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--color-text-secondary)', display: 'block',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
};

const thStyle = {
  padding: '10px 16px', textAlign: 'left', fontSize: '0.68rem',
  fontWeight: 700, color: '#a855f7',
  textTransform: 'uppercase', letterSpacing: '0.07em',
  borderBottom: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-secondary)', whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 16px', borderBottom: '1px solid var(--color-border-tertiary)',
  fontSize: '0.875rem', color: 'var(--color-text-primary)', verticalAlign: 'middle',
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  active:    { color: '#059669', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  dot: '#10b981', pulse: true },
  scheduled: { color: '#2563eb', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',  dot: '#3b82f6', pulse: false },
  ended:     { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)', dot: '#9ca3af', pulse: false },
  cancelled: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.25)',   dot: '#ef4444', pulse: false },
  failed:    { color: '#d97706', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  dot: '#f59e0b', pulse: false },
};

function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status] ?? STATUS_CONFIG.ended;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: s.bg, border: `1px solid ${s.border}`, fontSize: '0.68rem', fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0, animation: s.pulse ? 'pulse 1.2s infinite' : 'none' }} />
      {status}
    </span>
  );
}

// ─── Reusable buttons ─────────────────────────────────────────────────────────
function Btn({ onClick, disabled, style, children, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, border: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'inherit', transition: 'background 150ms', ...style }}>
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, disabled, children, style }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(124,58,237,0.3)', ...style }}>
      {children}
    </button>
  );
}

function IconBtn({ onClick, title, color, children }) {
  return (
    <button onClick={onClick} title={title}
      style={{ width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color, cursor: 'pointer', transition: 'background 150ms' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminAuctions() {
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: '', search: '', sort_by: 'end_time', sort_dir: 'desc' });
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });

  const [showTrash, setShowTrash]       = useState(false);
  const [trashed, setTrashed]           = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashSearch, setTrashSearch]   = useState('');

  const fetchAuctions = async (page = pagination.current_page) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, page, per_page: pagination.per_page }).filter(([_, v]) => v !== ''));
      const result = await auctionsAPI.listAdmin(params);
      setAuctions(result.data || []);
      setPagination(p => ({
        ...p, current_page: result.current_page || 1,
        last_page: result.last_page || 1, total: result.total || 0,
      }));
    } catch { toast.error('Failed to load auctions'); setAuctions([]); }
    finally { setLoading(false); }
  };

  const fetchTrashed = async () => {
    setTrashLoading(true);
    try {
      const result = await auctionsAPI.listTrashed({ search: trashSearch, per_page: 50 });
      setTrashed(result.data || []);
    } catch { toast.error('Failed to load trash'); }
    finally { setTrashLoading(false); }
  };

  const handleRestore = async (id) => {
    try {
      await auctionsAPI.restoreAuction(id);
      toast.success('Auction restored');
      fetchTrashed();
      fetchAuctions(1);
    } catch { toast.error('Restore failed'); }
  };

  const handleForceDelete = async (id) => {
    if (!window.confirm('Permanently delete this auction? This cannot be undone.')) return;
    try {
      await auctionsAPI.forceDeleteAuction(id);
      toast.success('Permanently deleted');
      fetchTrashed();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };
  
  useEffect(() => { fetchAuctions(1); }, [filters]);
  useEffect(() => { if (showTrash) fetchTrashed(); }, [showTrash, trashSearch]);

  const handleFilterChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters({ status: '', search: '', sort_by: 'end_time', sort_dir: 'desc' });
  const hasFilters = filters.search || filters.status;

  const formatPrice = (price) => `KSh ${Number(price ?? 0).toLocaleString()}`;
  const formatDate = (date) => date ? new Date(date).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const active    = auctions.filter(a => a.status === 'active').length;
  const scheduled = auctions.filter(a => a.status === 'scheduled').length;
  const ended     = auctions.filter(a => a.status === 'ended').length;

  return (
    <AdminLayout>
      <div style={{ padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh' }}>
        <Helmet><title>Auctions | Admin</title></Helmet>

        {/* ── Page heading ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Gavel size={24} style={{ color: '#a855f7' }} /> Auctions
            </h1>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>Create, monitor and manage product auctions</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={() => setShowTrash(true)} style={{ color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)' }}>
              <Trash2 size={15} /> Trash
            </Btn>
            <Btn onClick={() => navigate('/admin/auction-orders')}>
              <Package size={15} /> Auction Orders
            </Btn>
            <PrimaryBtn onClick={() => navigate('/admin/auctions/create')}>
              <Plus size={15} /> Create Auction
            </PrimaryBtn>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <StatCard label="Total Auctions" value={pagination.total}  icon={Gavel}       iconBg="rgba(168,85,247,0.1)"  iconColor="#a855f7" />
          <StatCard label="Active"         value={active}            icon={CheckCircle} iconBg="rgba(16,185,129,0.1)"  iconColor="#10b981" />
          <StatCard label="Scheduled"      value={scheduled}         icon={Clock}       iconBg="rgba(59,130,246,0.1)"  iconColor="#3b82f6" />
          <StatCard label="Ended"          value={ended}             icon={XCircle}     iconBg="rgba(107,114,128,0.1)" iconColor="#9ca3af" />
        </div>

        {/* ── Search + filters ── */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              <input type="text" value={filters.search} placeholder="Search products, SKU…"
                onChange={e => handleFilterChange('search', e.target.value)}
                style={{ ...inputStyle, paddingLeft: 32 }} />
            </div>
            <Btn onClick={() => setShowFilters(v => !v)}
              style={showFilters ? { background: 'rgba(168,85,247,0.08)', borderColor: '#a855f7', color: '#a855f7' } : {}}>
              <Filter size={15} /> Filters
              {hasFilters && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />}
            </Btn>
            <Btn onClick={() => fetchAuctions(1)} disabled={loading} title="Refresh">
              <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </Btn>
            {hasFilters && (
              <Btn onClick={clearFilters} style={{ color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)' }}>
                <X size={15} /> Clear
              </Btn>
            )}
          </div>

          {showFilters && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border-tertiary)' }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)} style={{ ...inputStyle, cursor: 'pointer', color: '#a855f7' }}>
                  <option value="" style={{ color: '#111827' }}>All Statuses</option>
                  <option value="active" style={{ color: '#111827' }}>Active</option>
                  <option value="scheduled" style={{ color: '#111827' }}>Scheduled</option>
                  <option value="ended" style={{ color: '#111827' }}>Ended</option>
                  <option value="cancelled" style={{ color: '#111827' }}>Cancelled</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sort By</label>
                <select value={`${filters.sort_by}:${filters.sort_dir}`}
                  onChange={e => { const [by, dir] = e.target.value.split(':'); handleFilterChange('sort_by', by); handleFilterChange('sort_dir', dir); }}
                  style={{ ...inputStyle, cursor: 'pointer', color: '#a855f7' }}>
                  <option value="end_time:asc" style={{ color: '#111827' }}>End Time ↑</option>
                  <option value="end_time:desc" style={{ color: '#111827' }}>End Time ↓</option>
                  <option value="current_price:desc" style={{ color: '#111827' }}>Price ↓</option>
                  <option value="current_price:asc" style={{ color: '#111827' }}>Price ↑</option>
                  <option value="created_at:desc" style={{ color: '#111827' }}>Newest</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
              <LoadingSpinner />
            </div>
          ) : auctions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px' }}>
              <Gavel size={48} style={{ color: 'var(--color-text-tertiary)', display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>No auctions found</h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                {hasFilters ? 'Try adjusting your filters' : 'Create your first auction to get started'}
              </p>
              {!hasFilters && <PrimaryBtn onClick={() => navigate('/admin/auctions/create')}><Plus size={15} /> Create Auction</PrimaryBtn>}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Product', 'Status', 'Current Price', 'Start Price', 'Bids', 'End Time', ''].map((h, i) => (
                        <th key={i} style={{ ...thStyle, textAlign: i === 6 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auctions.map(auction => (
                      <tr key={auction.id}
                        style={{ transition: 'background 120ms' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Product */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {auction.product?.main_image_url ? (
                              <img src={auction.product.main_image_url} alt={auction.product.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Package size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                {auction.product?.name ?? 'Unknown'}
                              </p>
                              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>
                                {auction.product?.sku ?? '—'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td style={tdStyle}><StatusBadge status={auction.status} /></td>

                        {/* Current price */}
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: auction.status === 'active' ? '#dc2626' : 'var(--color-text-primary)' }}>
                            {formatPrice(auction.current_price)}
                          </span>
                        </td>

                        {/* Start price */}
                        <td style={tdStyle}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                            {formatPrice(auction.start_price)}
                          </span>
                        </td>

                        {/* Bids */}
                        <td style={tdStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            <Users size={13} style={{ color: '#a855f7' }} />
                            {auction.bids_count ?? 0}
                          </span>
                        </td>

                        {/* End time */}
                        <td style={tdStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                            <Clock size={12} style={{ color: '#a855f7', flexShrink: 0 }} />
                            {formatDate(auction.end_time)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                            <IconBtn onClick={() => navigate(`/admin/auctions/${auction.id}`)} title="View / Edit" color="#7c3aed">
                              <Edit size={15} />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.last_page > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--color-border-tertiary)', flexWrap: 'wrap', gap: 12 }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                    Showing {((pagination.current_page - 1) * pagination.per_page) + 1}–{Math.min(pagination.current_page * pagination.per_page, pagination.total)} of {pagination.total}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Btn onClick={() => fetchAuctions(pagination.current_page - 1)} disabled={pagination.current_page === 1} style={{ padding: '6px 12px' }}>← Prev</Btn>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', padding: '0 4px' }}>
                      {pagination.current_page} / {pagination.last_page}
                    </span>
                    <Btn onClick={() => fetchAuctions(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page} style={{ padding: '6px 12px' }}>Next →</Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {showTrash && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              
              {/* Modal header */}
              <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trash2 size={18} style={{ color: '#dc2626' }} />
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#a855f7' }}>Deleted Auctions</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(220,38,38,0.1)', color: '#dc2626', padding: '2px 8px', borderRadius: 99 }}>{trashed.length}</span>
                </div>
                <IconBtn onClick={() => setShowTrash(false)} title="Close" color="#dc2626">
                  <X size={16} />
                </IconBtn>
              </div>

              {/* Search */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border-tertiary)' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a855f7', pointerEvents: 'none' }} />
                  <input type="text" placeholder="Search deleted auctions…" value={trashSearch}
                    onChange={e => setTrashSearch(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 32 }} />
                </div>
              </div>

              {/* List */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {trashLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><LoadingSpinner /></div>
                ) : trashed.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 24px', color: '#dc2626' }}>
                    <Trash2 size={36} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
                    <p style={{ fontWeight: 600, margin: 0 }}>No deleted auctions</p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Product', 'Status', 'Deleted At', ''].map((h, i) => (
                          <th key={i} style={{ ...thStyle, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trashed.map(auction => (
                        <tr key={auction.id}
                          onMouseEnter={e => e.currentTarget.style.background = '#a855f7' + '20'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          style={{ transition: 'background 120ms' }}>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {auction.product?.main_image_url ? (
                                <img src={auction.product.main_image_url} alt={auction.product.name} style={{ width: 36, height: 36, borderRadius: 7, objectFit: 'cover', flexShrink: 0, opacity: 0.6 }} />
                              ) : (
                                <div style={{ width: 36, height: 36, borderRadius: 7, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Package size={16} style={{ color: '#a855f7' }} />
                                </div>
                              )}
                              <div>
                                <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.825rem', color: '#a855f7', opacity: 0.7 }}>{auction.product?.name ?? 'Unknown'}</p>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#777', fontFamily: 'monospace' }}>{auction.product?.sku ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td style={tdStyle}><StatusBadge status={auction.status} /></td>
                          <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                            {formatDate(auction.deleted_at)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                              <button onClick={() => handleRestore(auction.id)}
                                style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.08)', color: '#059669', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                Restore
                              </button>
                              <button onClick={() => handleForceDelete(auction.id)}
                                style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                                Delete Forever
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </AdminLayout>
  );
}