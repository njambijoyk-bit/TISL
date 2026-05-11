import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { brandsAPI } from '../../api';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import {
  Plus, Search, Edit2, Eye, Trash2, X,
  Tag, CheckCircle, XCircle, TrendingUp, Globe, Star,
} from 'lucide-react';

// ─── Style tokens (mirrors Products page) ────────────────────────────────────

const card = {
  background: 'var(--color-background-primary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: '0.875rem',
  border: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const thStyle = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
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

// ─── Buttons ──────────────────────────────────────────────────────────────────

function Btn({ onClick, disabled, style, children, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
        border: '1px solid var(--color-border-tertiary)',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
        transition: 'background 150ms',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
        border: 'none', background: '#7c3aed', color: 'white',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function DangerBtn({ onClick, disabled, children, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
        border: 'none', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({ onClick, title, color, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32, borderRadius: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'transparent',
        color, cursor: 'pointer', transition: 'background 150ms',
      }}
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
        <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          {value}
        </p>
      </div>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ active }) {
  return active ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: 'var(--color-background-success)', color: 'var(--color-text-success)',
    }}>
      <CheckCircle size={11} /> ACTIVE
    </span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)',
    }}>
      <XCircle size={11} /> INACTIVE
    </span>
  );
}

// ─── Delete modal ─────────────────────────────────────────────────────────────

function Modal({ children, onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        ...card,
        background: 'white', color: '#08070a',
        width: '100%', maxWidth: 480,
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Brands() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, brand: null, loading: false });

  useEffect(() => { fetchBrands(); }, []);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const response = await brandsAPI.getAdminBrands();
      const brandsData = Array.isArray(response) ? response : (response.data || []);
      setBrands(brandsData);
    } catch {
      toast.error('Failed to load brands');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteModal(p => ({ ...p, loading: true }));
    try {
      await brandsAPI.deleteBrand(deleteModal.brand.id);
      toast.success(`"${deleteModal.brand.name}" deleted`);
      setDeleteModal({ isOpen: false, brand: null, loading: false });
      fetchBrands();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete brand');
      setDeleteModal(p => ({ ...p, loading: false }));
    }
  };

  const isActive = (b) => Boolean(b.is_active) || b.is_active === 1 || b.is_active === '1';

  const filtered = brands.filter(b =>
    !searchTerm ||
    b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.slug?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AdminLayout>
      <div style={{ padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh' }}>

        {/* ── Page heading ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Tag size={24} style={{ color: '#a855f7' }} /> Brands
            </h1>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>Manage product brands and manufacturers</p>
          </div>
          <PrimaryBtn onClick={() => navigate('/admin/brands/create')}>
            <Plus size={15} /> New Brand
          </PrimaryBtn>
        </div>

        {/* ── Stat cards ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <StatCard label="Total Brands" value={brands.length}                          icon={Tag}         iconBg="rgba(124,58,237,0.1)"  iconColor="#7c3aed" />
          <StatCard label="Active"        value={brands.filter(isActive).length}         icon={CheckCircle} iconBg="rgba(16,185,129,0.1)"  iconColor="#10b981" />
          <StatCard label="Inactive"      value={brands.filter(b => !isActive(b)).length} icon={XCircle}    iconBg="rgba(239,68,68,0.1)"   iconColor="#ef4444" />
          <StatCard label="Featured"      value={brands.filter(b => b.is_featured).length} icon={TrendingUp} iconBg="rgba(245,158,11,0.1)"  iconColor="#f59e0b" />
        </div>

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search brands by name or slug…"
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
            {searchTerm && (
              <Btn onClick={() => setSearchTerm('')} style={{ color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>
                <X size={15} /> Clear
              </Btn>
            )}
          </div>
        </div>

        {/* ── Brands table ───────────────────────────────────────────────── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
              <LoadingSpinner />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px' }}>
              <Tag size={48} style={{ color: 'var(--color-text-tertiary)', display: 'block', margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {searchTerm ? 'No brands match your search' : 'No brands yet'}
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                {searchTerm ? 'Try a different search term' : 'Get started by creating your first brand'}
              </p>
              {!searchTerm && (
                <PrimaryBtn onClick={() => navigate('/admin/brands/create')}>
                  <Plus size={15} /> Create First Brand
                </PrimaryBtn>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Brand', 'Slug', 'Website', 'Status', 'Sort', 'Featured', ''].map((h, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: i === 6 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(brand => (
                    <tr
                      key={brand.id}
                      style={{ transition: 'background 120ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Brand */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {brand.logo_url ? (
                            <img src={brand.logo_url} alt={brand.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Tag size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                              {brand.name}
                            </p>
                            {brand.description && (
                              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                                {brand.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Slug */}
                      <td style={tdStyle}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{brand.slug}</span>
                      </td>

                      {/* Website */}
                      <td style={tdStyle}>
                        {brand.website ? (
                          <a
                            href={brand.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}
                          >
                            <Globe size={13} /> Visit
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={tdStyle}><StatusBadge active={isActive(brand)} /></td>

                      {/* Sort */}
                      <td style={tdStyle}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>{brand.sort_order ?? '—'}</span>
                      </td>

                      {/* Featured */}
                      <td style={tdStyle}>
                        {brand.is_featured ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b' }}>
                            <Star size={13} fill="#f59e0b" /> Yes
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-tertiary)' }}>—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          <IconBtn onClick={() => navigate(`/admin/brands/${brand.id}/edit?mode=view`)} title="View" color="var(--color-text-info)">
                            <Eye size={15} />
                          </IconBtn>
                          <IconBtn onClick={() => navigate(`/admin/brands/${brand.id}/edit`)} title="Edit" color="#7c3aed">
                            <Edit2 size={15} />
                          </IconBtn>
                          <IconBtn onClick={() => setDeleteModal({ isOpen: true, brand, loading: false })} title="Delete" color="var(--color-text-danger)">
                            <Trash2 size={15} />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete modal ─────────────────────────────────────────────────── */}
      {deleteModal.isOpen && (
        <Modal onClose={() => setDeleteModal({ isOpen: false, brand: null, loading: false })}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--color-background-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={20} style={{ color: '#f87171' }} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 700, color: '#f87171' }}>Delete brand</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>This action cannot be undone</p>
              </div>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              Are you sure you want to delete <strong style={{ color: '#f87171' }}>"{deleteModal.brand?.name}"</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={() => setDeleteModal({ isOpen: false, brand: null, loading: false })} disabled={deleteModal.loading} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Btn>
              <DangerBtn onClick={handleDelete} disabled={deleteModal.loading} style={{ flex: 1, justifyContent: 'center', background: '#ef4444', color: 'white' }}>
                {deleteModal.loading ? <><LoadingSpinner /> Deleting…</> : 'Delete brand'}
              </DangerBtn>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}