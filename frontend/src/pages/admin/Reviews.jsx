import { useState, useEffect } from 'react';
import { reviewsAPI } from '../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import {
  Search, Trash2, Star, CheckCircle, XCircle, X,
  MessageSquare, Clock, ThumbsUp, ShieldCheck,
} from 'lucide-react';

// ─── Style tokens (mirrors Brands page) ──────────────────────────────────────

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

function Btn({ onClick, disabled, style, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
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

function StatusBadge({ approved }) {
  return approved ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: 'var(--color-background-success)', color: 'var(--color-text-success)',
    }}>
      <CheckCircle size={11} /> APPROVED
    </span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
    }}>
      <Clock size={11} /> PENDING
    </span>
  );
}

// ─── Star rating ──────────────────────────────────────────────────────────────

function StarRating({ rating }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={13}
          style={{ color: i <= rating ? '#f59e0b' : 'var(--color-border-tertiary)' }}
          fill={i <= rating ? '#f59e0b' : 'none'}
        />
      ))}
      <span style={{ marginLeft: 4, fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
        {rating}/5
      </span>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', padding: 16,
    }} onClick={onClose}>
      <div style={{ ...card, width: '100%', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.last_page <= 1) return null;
  const { current_page, last_page } = pagination;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--color-border-tertiary)' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
        Page {current_page} of {last_page}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={() => onPageChange(current_page - 1)} disabled={current_page === 1}>← Prev</Btn>
        <Btn onClick={() => onPageChange(current_page + 1)} disabled={current_page === last_page}>Next →</Btn>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Reviews() {
  const [reviews, setReviews]       = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [filters, setFilters]       = useState({ search: '', approved: '', rating: '' });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, review: null, loading: false });
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => { fetchReviews(1); }, [filters]);

  const fetchReviews = async (page = 1) => {
    try {
      setLoading(true);
      const response = await reviewsAPI.getAllReviews({ ...filters, page, per_page: 20 });
      setReviews(response.data);
      setPagination(response.pagination || response.meta);
    } catch {
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await reviewsAPI.approveReview(id);
      toast.success('Review approved');
      fetchReviews();
    } catch {
      toast.error('Failed to approve review');
    }
  };

  const handleReject = async (id) => {
    try {
      await reviewsAPI.rejectReview(id);
      toast.success('Review rejected');
      fetchReviews();
    } catch {
      toast.error('Failed to reject review');
    }
  };

  const handleDelete = async () => {
    setDeleteModal(d => ({ ...d, loading: true }));
    try {
      await reviewsAPI.deleteReview(deleteModal.review.id);
      toast.success('Review deleted');
      setDeleteModal({ isOpen: false, review: null, loading: false });
      fetchReviews();
    } catch {
      toast.error('Failed to delete review');
      setDeleteModal(d => ({ ...d, loading: false }));
    }
  };

  // ── derived stats ──────────────────────────────────────────────────────────
  const total    = pagination?.total ?? reviews.length;
  const approved = reviews.filter(r => r.is_approved).length;
  const pending  = reviews.filter(r => !r.is_approved).length;
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '—';

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: '#a855f7' }}>
              Reviews
            </h1>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              Moderate product reviews from customers
            </p>
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <StatCard label="Total Reviews"  value={total}      icon={MessageSquare} iconBg="rgba(124,58,237,0.1)"  iconColor="#7c3aed" />
          <StatCard label="Approved"       value={approved}   icon={CheckCircle}   iconBg="rgba(34,197,94,0.1)"   iconColor="#22c55e" />
          <StatCard label="Pending"        value={pending}    icon={Clock}         iconBg="rgba(245,158,11,0.1)"  iconColor="#f59e0b" />
          <StatCard label="Avg Rating"     value={avgRating}  icon={Star}          iconBg="rgba(245,158,11,0.08)" iconColor="#f59e0b" />
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* search */}
            <div style={{ flex: 2, minWidth: 200, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="Search by product or customer…"
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
            {/* status */}
            <select
              value={filters.approved}
              onChange={e => setFilters(f => ({ ...f, approved: e.target.value }))}
              style={{ ...inputStyle, flex: 1, minWidth: 140, cursor: 'pointer', color: '#9ca3af' }}
            >
              <option value="">All Statuses</option>
              <option value="true">Approved</option>
              <option value="false">Pending</option>
            </select>
            {/* rating */}
            <select
              value={filters.rating}
              onChange={e => setFilters(f => ({ ...f, rating: e.target.value }))}
              style={{ ...inputStyle, flex: 1, minWidth: 140, cursor: 'pointer', color: '#9ca3af' }}
            >
              <option value="">All Ratings</option>
              {[5, 4, 3, 2, 1].map(n => (
                <option key={n} value={n}>{n} Star{n > 1 ? 's' : ''}</option>
              ))}
            </select>
            {/* clear */}
            {(filters.search || filters.approved || filters.rating) && (
              <Btn
                onClick={() => setFilters({ search: '', approved: '', rating: '' })}
                style={{ color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}
              >
                <X size={15} /> Clear
              </Btn>
            )}
          </div>
        </div>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
              <LoadingSpinner />
            </div>
          ) : reviews.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px' }}>
              <MessageSquare size={48} style={{ color: 'var(--color-text-tertiary)', display: 'block', margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                No reviews found
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                Try adjusting your filters
              </p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Product', 'Customer', 'Rating', 'Review', 'Status', 'Helpful', 'Date', ''].map((h, i) => (
                        <th key={i} style={{ ...thStyle, textAlign: i === 7 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map(review => (
                      <tr
                        key={review.id}
                        style={{ transition: 'background 120ms' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >

                        {/* Product */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {(review.product?.main_image_url || review.product?.main_image) ? (
                              <img
                                src={review.product.main_image_url || review.product.main_image}
                                alt={review.product.name}
                                style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                                onError={e => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <MessageSquare size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                              </div>
                            )}
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                              {review.product?.name ?? '—'}
                            </p>
                          </div>
                        </td>

                        {/* Customer */}
                        <td style={tdStyle}>
                          <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            {review.user?.name ?? '—'}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
                            {review.user?.email}
                          </p>
                        </td>

                        {/* Rating */}
                        <td style={tdStyle}>
                          <StarRating rating={review.rating} />
                        </td>

                        {/* Review content */}
                        <td style={{ ...tdStyle, maxWidth: 260 }}>
                          {review.title && (
                            <p style={{ margin: '0 0 3px', fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {review.title}
                            </p>
                          )}
                          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {review.comment}
                          </p>
                          {review.image_urls?.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                              {review.image_urls.slice(0, 3).map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt={`Review img ${i + 1}`}
                                  onClick={() => setPreviewUrl(url)}
                                  style={{
                                    width: 32, height: 32, borderRadius: 6, objectFit: 'cover',
                                    border: '1px solid var(--color-border-tertiary)',
                                    cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = '#a855f7';
                                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(168,85,247,0.15)';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--color-border-tertiary)';
                                    e.currentTarget.style.boxShadow = 'none';
                                  }}
                                  onError={e => { e.target.style.display = 'none'; }}
                                />
                              ))}
                              {review.image_urls.length > 3 && (
                                <span
                                  onClick={() => setPreviewUrl(review.image_urls[3])}
                                  style={{
                                    fontSize: '0.68rem', color: 'var(--color-text-tertiary)',
                                    alignSelf: 'center', marginLeft: 2, cursor: 'pointer',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                                  onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
                                >
                                  +{review.image_urls.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <StatusBadge approved={review.is_approved} />
                            {review.is_verified_purchase && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '2px 6px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700,
                                background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                              }}>
                                <ShieldCheck size={10} /> VERIFIED
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Helpful */}
                        <td style={tdStyle}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                            <ThumbsUp size={13} />
                            {review.helpful_count ?? 0}
                          </span>
                        </td>

                        {/* Date */}
                        <td style={tdStyle}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                            {format(new Date(review.created_at), 'MMM d, yyyy')}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                            {!review.is_approved && (
                              <IconBtn onClick={() => handleApprove(review.id)} title="Approve" color="var(--color-text-success)">
                                <CheckCircle size={15} />
                              </IconBtn>
                            )}
                            {review.is_approved && (
                              <IconBtn onClick={() => handleReject(review.id)} title="Reject" color="var(--color-text-danger)">
                                <XCircle size={15} />
                              </IconBtn>
                            )}
                            <IconBtn onClick={() => setDeleteModal({ isOpen: true, review, loading: false })} title="Delete" color="var(--color-text-danger)">
                              <Trash2 size={15} />
                            </IconBtn>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={pagination} onPageChange={fetchReviews} />
            </>
          )}
        </div>
      </div>

      {/* ── Image preview lightbox ────────────────────────────────────────── */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24, backdropFilter: 'blur(4px)',
          }}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            style={{
              position: 'fixed', top: 16, right: 16,
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white', fontSize: '1.1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', zIndex: 10000,
            }}
          >
            <X size={18} />
          </button>
          <img
            src={previewUrl}
            alt="Preview"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '85vh',
              borderRadius: 12, objectFit: 'contain',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      )}

      {/* ── Delete modal ──────────────────────────────────────────────────── */}
      {deleteModal.isOpen && (
        <Modal onClose={() => setDeleteModal({ isOpen: false, review: null, loading: false })}>
          <div style={{ padding: 24, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--color-background-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={20} style={{ color: '#f87171' }} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 700, color: '#f87171' }}>Delete review</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>This action cannot be undone</p>
              </div>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              Are you sure you want to delete this review by{' '}
              <strong style={{ color: '#f87171' }}>{deleteModal.review?.user?.name ?? 'this customer'}</strong>?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn
                onClick={() => setDeleteModal({ isOpen: false, review: null, loading: false })}
                disabled={deleteModal.loading}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Cancel
              </Btn>
              <DangerBtn
                onClick={handleDelete}
                disabled={deleteModal.loading}
                style={{ flex: 1, justifyContent: 'center', background: '#ef4444', color: 'white' }}
              >
                {deleteModal.loading ? <><LoadingSpinner /> Deleting…</> : 'Delete review'}
              </DangerBtn>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}