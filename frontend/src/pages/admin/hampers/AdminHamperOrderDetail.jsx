import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Package, ShoppingBag, User, MapPin,
  Tag, Wallet, Star, Clock, FileText, CheckCircle,
  AlertTriangle, RefreshCw, ArrowRight, ExternalLink
} from 'lucide-react';
import HamperOrderGuide from './HamperOrderGuide';
import AdminLayout from '../../../components/layout/AdminLayout';
import hampersAPI from '../../../api/hampers';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Tokens ────────────────────────────────────────────────────────────────────

const card = {
  background: 'white',
  border: '1px solid #dcb6ff',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  color: '#0b080e',
};

const thStyle = {
  padding: '10px 16px', textAlign: 'left',
  fontSize: '0.68rem', fontWeight: 700,
  color: '#a855f7',
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
  color: '#111827',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--color-text-secondary)',
  display: 'block', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

// ── Atoms ─────────────────────────────────────────────────────────────────────

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

function PrimaryBtn({ onClick, disabled, loading, children, style }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
      border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
      color: 'white', cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled || loading ? 0.6 : 1, fontFamily: 'inherit', ...style,
    }}>{children}</button>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:     { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b' },
    confirmed:   { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    processing:  { bg: 'rgba(124,58,237,0.1)',  color: '#7c3aed' },
    shipped:     { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6' },
    delivered:   { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
    cancelled:   { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444' },
    refunded:    { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
  };
  const s = map[status] || { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {(status || '').toUpperCase()}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ margin: '0 0 16px', fontSize: '0.72rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.07em', paddingBottom: 10, borderBottom: '1px solid var(--color-border-tertiary)' }}>
      {children}
    </p>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AdminHamperOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusData, setStatusData] = useState({ status: '', notes: '' });

  const fetchOrder = async () => {
    try {
      const data = await hampersAPI.getAdminHamperOrder(id);
      setOrder(data);
      setStatusData({ status: data.status, notes: '' });
    } catch {
      toast.error('Failed to load hamper order');
      navigate('/admin/hampers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrder(); }, [id]);

  const handleUpdateStatus = async () => {
    setUpdating(true);
    try {
      await hampersAPI.updateHamperOrderStatus(id, statusData);
      toast.success('Status updated');
      setShowStatusModal(false);
      fetchOrder();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const handleConvert = async () => {
    if (!confirm('Convert this hamper order to a standard order? Individual product inventory will be decremented.')) return;
    setUpdating(true);
    try {
      const res = await hampersAPI.convertToStandardOrder(id);
      toast.success('Converted to standard order');
      fetchOrder();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Conversion failed');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  if (!order) return null;

  const snapshot = order.hamper_snapshot || {};
  const items = snapshot.items || [];
  const canConvert = !order.order_id && ['confirmed', 'processing'].includes(order.status);

  return (
    <AdminLayout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 0' }}>
        
        {/* Back */}
        <button onClick={() => navigate('/admin/hampers')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', alignSelf: 'flex-start' }}>
          <ChevronLeft size={15} /> Back to Hampers
        </button>

        {/* Header */}
        <div style={{ ...card, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShoppingBag size={30} style={{ color: '#a855f7' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: 'var(--color-text-primary)' }}>{order.order_number}</h1>
                <StatusBadge status={order.status} />
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                Placed {format(new Date(order.created_at), 'dd MMM yyyy, HH:mm')} · {snapshot.name || 'Bundle'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {canConvert && (
                <PrimaryBtn onClick={handleConvert} disabled={updating}>
                  <RefreshCw size={14} /> {updating ? 'Converting...' : 'Convert to Standard Order'}
                </PrimaryBtn>
              )}
              {order.order_id && (
                <Btn onClick={() => navigate(`/admin/orders/${order.order_id}`)} style={{ borderColor: '#a855f7', color: '#a855f7' }}>
                  <ExternalLink size={14} /> View Standard Order
                </Btn>
              )}
              <Btn onClick={() => setShowStatusModal(true)}>
                Update Status
              </Btn>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          
          {/* LEFT: Items & Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Hamper Items */}
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={16} /> BUNDLE CONTENTS
                </p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Product', 'Original Price', 'Qty', 'Line Total'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {item.main_image ? (
                            <img src={item.main_image} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Package size={16} style={{ opacity: 0.3 }} />
                            </div>
                          )}
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, color: '#a855f7' }}>{item.name}</p>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>{item.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>{fmt(item.price)}</td>
                      <td style={tdStyle}><span style={{ fontWeight: 700 }}>×{item.quantity}</span></td>
                      <td style={tdStyle}><span style={{ fontWeight: 600 }}>{fmt(item.price * item.quantity)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Admin Notes / Audit Log */}
            {order.notes && (
              <div style={{ ...card, padding: 20 }}>
                <SectionLabel>ORDER LOG & NOTES</SectionLabel>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, background: 'var(--color-background-secondary)', padding: 16, borderRadius: 10, border: '1px solid var(--color-border-tertiary)' }}>
                  {order.notes}
                </div>
              </div>
            )}
            <HamperOrderGuide order={order} />
          </div>

          {/* RIGHT: Financials & Customer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Summary */}
            <div style={{ ...card, padding: 20 }}>
              <SectionLabel>FINANCIAL SUMMARY</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Subtotal</span>
                  <span style={{ fontWeight: 600 }}>{fmt(order.subtotal)}</span>
                </div>
                {Number(order.discount_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#22c55e' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Tag size={14} /> Discount</span>
                    <span style={{ fontWeight: 600 }}>−{fmt(order.discount_amount)}</span>
                  </div>
                )}
                {Number(order.vat_amount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>VAT (16%)</span>
                    <span style={{ fontWeight: 600 }}>{fmt(order.vat_amount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Shipping</span>
                  <span style={{ fontWeight: 600 }}>{fmt(order.shipping_cost)}</span>
                </div>
                {Number(order.store_credit_used) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#7c3aed' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Wallet size={14} /> Store Credit</span>
                    <span style={{ fontWeight: 600 }}>−{fmt(order.store_credit_used)}</span>
                  </div>
                )}
                <div style={{ margin: '10px 0', height: 1, background: 'var(--color-border-tertiary)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 900, color: '#a855f7' }}>
                  <span>Total</span>
                  <span>{fmt(order.total)}</span>
                </div>
                {order.loyalty_points_earned > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Star size={12} fill="#7c3aed" /> POINTS EARNED
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#7c3aed' }}>+{order.loyalty_points_earned}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Customer & Shipping */}
            <div style={{ ...card, padding: 20 }}>
              <SectionLabel>CUSTOMER & DELIVERY</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={18} style={{ color: '#a855f7' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#a855f7' }}>{order.customer?.first_name} {order.customer?.last_name}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.customer?.email}</p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MapPin size={18} style={{ color: '#a855f7' }} />
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>Shipping Address</p>
                    {order.shipping_address?.line1}<br />
                    {order.shipping_address?.city}, {order.shipping_address?.country}
                  </div>
                </div>

                {order.promo_code && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px dashed #a855f7', background: 'rgba(168,85,247,0.03)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag size={14} style={{ color: '#a855f7' }} />
                    <div>
                      <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase' }}>Promo Code Used</p>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>{order.promo_code}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Update Status Modal */}
        {showStatusModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }}>
            <div style={{ ...card, width: '100%', maxWidth: 440, padding: 24 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 800, color: '#a855f7' }}>Update Order Status</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>New Status</label>
                  <select
                    value={statusData.status}
                    onChange={e => setStatusData({ ...statusData, status: e.target.value })}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="processing">Processing</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                
                <div>
                  <label style={labelStyle}>Internal Notes</label>
                  <textarea
                    value={statusData.notes}
                    onChange={e => setStatusData({ ...statusData, notes: e.target.value })}
                    placeholder="Reason for change..."
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                  <Btn onClick={() => setShowStatusModal(false)}>Cancel</Btn>
                  <PrimaryBtn onClick={handleUpdateStatus} loading={updating}>
                    Save Changes
                  </PrimaryBtn>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
