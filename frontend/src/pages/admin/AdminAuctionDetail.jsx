import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Edit, Trash2, Save, X, Package, Clock,
  Users, AlertTriangle, Gavel, Shield, TrendingUp,
  CreditCard, Truck, XCircle, Activity, Settings,
  CheckCircle, Plus, Minus, ShoppingCart, ChevronDown,
  ChevronUp, Ban, RotateCcw, FileText, Send, DollarSign,
  MapPin, Phone, Mail
} from 'lucide-react';
import auctionsAPI from '../../api/auctions';

const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #e5e7eb',
  borderRadius: 10, fontSize: '0.875rem', color: '#111827',
  background: 'white', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
};

const statusConfig = {
  active:    { color: '#059669', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', dot: '#10b981' },
  scheduled: { color: '#2563eb', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', dot: '#3b82f6' },
  ended:     { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)', dot: '#9ca3af' },
  cancelled: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.25)', dot: '#ef4444' },
  failed:    { color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b' },
};

const StatusBadge = ({ status }) => {
  const s = statusConfig[status] ?? statusConfig.ended;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, background: s.bg, border: `1px solid ${s.border}`, fontSize: '0.72rem', fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, animation: status === 'active' ? 'pulse 1.2s infinite' : 'none' }} />
      {status}
    </span>
  );
};

const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
    {Icon && <Icon size={14} color="#a855f7" />}
    <p style={{
      fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: '0.14em', color: '#a855f7', margin: 0,
    }}>{children}</p>
  </div>
);

const Panel = ({ children, style = {}, accent = false }) => (
  <div style={{
    background: 'white',
    border: `1px solid ${accent ? 'rgba(168,85,247,0.2)' : '#f3f4f6'}`,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: accent
      ? '0 0 0 1px rgba(168,85,247,0.12), 0 4px 20px rgba(168,85,247,0.08)'
      : '0 1px 4px rgba(0,0,0,0.04)',
    ...style,
  }}>
    {children}
  </div>
);

const ActionBtn = ({ children, onClick, variant = 'primary', icon: Icon, disabled }) => {
  const variants = {
    primary: { background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', border: 'none' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb' },
    success: { background: 'rgba(16,185,129,0.08)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.2)' },
    danger:  { background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1.5px solid rgba(239,68,68,0.2)' },
    warning: { background: 'rgba(245,158,11,0.08)', color: '#d97706', border: '1.5px solid rgba(245,158,11,0.2)' },
    ghost:   { background: 'transparent', color: '#6b7280', border: 'none' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 16px', borderRadius: 10, fontSize: '0.78rem',
      fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 150ms', whiteSpace: 'nowrap'
    }}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
};

const Modal = ({ isOpen, onClose, title, children, maxWidth = 560 }) => {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16, backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 20, width: '100%', maxWidth,
        maxHeight: '92vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111827', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
};

const Checkbox = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: '#374151', fontWeight: 600 }}>
    <div style={{
      width: 18, height: 18, borderRadius: 5,
      border: checked ? '2px solid #a855f7' : '2px solid #e5e7eb',
      background: checked ? '#a855f7' : 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 150ms', flexShrink: 0
    }}>
      {checked && <CheckCircle size={12} color="white" />}
    </div>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
    {label}
  </label>
);

export default function AdminAuctionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [stats, setStats] = useState({});
  const [activityLogs] = useState([]);

  // ── Bid Approval State ──
  const [showApprovePanel, setShowApprovePanel] = useState(false);
  const [selectedBids, setSelectedBids] = useState(new Set());
  const [bidAmounts, setBidAmounts] = useState({}); // { bidId: chargedAmount }
  const [globalChargedAmount, setGlobalChargedAmount] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveForm, setApproveForm] = useState({
    currency: 'KES',
    exchange_rate_to_kes: 1,
    apply_tax: true,
    shipping_address: '',
    delivery_method: '',
    shipping_cost: '',
    payment_method: 'mpesa',
    admin_notes: '',
    customer_notes: '',
  });

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const fetchAuction = async () => {
    setLoading(true);
    try {
      const data = await auctionsAPI.getAdminAuction(id);
      setAuction(data.auction);
      setStats(data.stats);
      setForm({
        start_price: data.auction.start_price,
        reserve_price: data.auction.reserve_price,
        bid_increment: data.auction.bid_increment,
        start_time: data.auction.start_time?.slice(0, 16),
        end_time: data.auction.end_time?.slice(0, 16),
        status: data.auction.status,
      });
      // Reset approval state on refresh
      setSelectedBids(new Set());
      setBidAmounts({});
    } catch (err) {
      toast.error('Failed to load auction');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const data = await auctionsAPI.listAuctionOrders({ auction_id: id, per_page: 50 });
      setOrders(data.data || []);
    } catch { /* silent */ } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => { fetchAuction(); }, [id]);

  useEffect(() => { fetchAuction(); fetchOrders(); }, [id]);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await auctionsAPI.updateAuction(id, form);
      toast.success('Auction updated');
      setEditing(false);
      fetchAuction();
    } catch (err) {
      const msg = err.response?.data?.message ||
        (err.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : 'Update failed');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this auction? This cannot be undone.')) return;
    try {
      await auctionsAPI.deleteAuction(id);
      toast.success('Auction deleted');
      navigate('/admin/auctions');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleCancelStatus = async () => {
    if (!window.confirm('Cancel this auction? Bidders will be notified.')) return;
    try {
      await auctionsAPI.updateAuction(id, { status: 'cancelled' });
      toast.success('Auction cancelled');
      fetchAuction();
    } catch (err) {
      toast.error('Failed to cancel auction');
    }
  };

  // ── Bid Selection ──
  const toggleBidSelection = (bidId) => {
    setSelectedBids(prev => {
      const next = new Set(prev);
      if (next.has(bidId)) {
        next.delete(bidId);
        // Also clear custom amount
        setBidAmounts(a => { const na = { ...a }; delete na[bidId]; return na; });
      } else {
        next.add(bidId);
      }
      return next;
    });
  };

  const setBidChargedAmount = (bidId, amount) => {
    setBidAmounts(prev => ({ ...prev, [bidId]: amount }));
  };

  const applyGlobalAmount = () => {
    if (!globalChargedAmount) return;
    const amounts = {};
    selectedBids.forEach(bidId => {
      amounts[bidId] = globalChargedAmount;
    });
    setBidAmounts(amounts);
    toast.success(`Applied KSh ${Number(globalChargedAmount).toLocaleString()} to ${selectedBids.size} bid(s)`);
  };

  const clearAllSelections = () => {
    setSelectedBids(new Set());
    setBidAmounts({});
    setGlobalChargedAmount('');
  };

  // ── Approve Bids ──
  const handleApproveBids = async () => {
    if (selectedBids.size === 0) {
      toast.error('Select at least one bid to approve');
      return;
    }
    if (selectedBids.size > (auction?.max_winners || 1)) {
      toast.error(`This auction allows max ${auction.max_winners} winner(s). You selected ${selectedBids.size}.`);
      return;
    }

    setApproving(true);
    try {
      const bidsPayload = Array.from(selectedBids).map(bidId => ({
        bid_id: bidId,
        charged_amount: bidAmounts[bidId] ? parseFloat(bidAmounts[bidId]) : undefined,
      }));

      const payload = {
        bids: bidsPayload,
        global_charged_amount: globalChargedAmount ? parseFloat(globalChargedAmount) : undefined,
        currency: approveForm.currency,
        exchange_rate_to_kes: parseFloat(approveForm.exchange_rate_to_kes) || 1,
        apply_tax: approveForm.apply_tax,
        shipping_address: approveForm.shipping_address || undefined,
        delivery_method: approveForm.delivery_method || undefined,
        shipping_cost: approveForm.shipping_cost ? parseFloat(approveForm.shipping_cost) : undefined,
        payment_method: approveForm.payment_method || undefined,
        admin_notes: approveForm.admin_notes || undefined,
        customer_notes: approveForm.customer_notes || undefined,
      };

      const result = await auctionsAPI.approveBids(id, payload);

      const successCount = result.orders?.length || 0;
      const errorCount = result.errors?.length || 0;

      if (successCount > 0) {
        toast.success(`${successCount} order(s) created successfully!`);
      }
      if (errorCount > 0) {
        result.errors.forEach(err => toast.error(`Bid #${err.bid_id}: ${err.message}`));
      }

      // Reset and refresh
      setShowApprovePanel(false);
      setSelectedBids(new Set());
      setBidAmounts({});
      setGlobalChargedAmount('');
      fetchAuction();
    } catch (err) {
      const msg = err.response?.data?.message || 
        (err.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : 'Approval failed');
      toast.error(msg);
    } finally {
      setApproving(false);
    }
  };

  const formatPrice = (price) => `KSh ${Number(price ?? 0).toLocaleString()}`;
  const formatDate = (date) => date ? new Date(date).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const bidStats = useMemo(() => {
    if (!auction?.bids?.length) return { uniqueBidders: 0, highestBid: 0 };
    return {
      uniqueBidders: new Set(auction.bids.map(b => b.bidder_id)).size,
      highestBid: Math.max(...auction.bids.map(b => Number(b.amount)))
    };
  }, [auction?.bids]);

  const canApproveBids = auction?.status === 'ended' && auction?.bids?.length > 0;
  const maxWinners = auction?.max_winners || 1;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
      <Gavel size={36} style={{ color: '#a855f7', opacity: 0.4 }} />
      <p style={{ color: '#9ca3af', fontWeight: 600 }}>Loading auction...</p>
    </div>
  );

  if (!auction) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto 16px' }} />
      <p style={{ color: '#6b7280', fontWeight: 600, marginBottom: 12 }}>Auction not found</p>
      <button onClick={() => navigate('/admin/auctions')} style={{ color: '#a855f7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>
        ← Back to auctions
      </button>
    </div>
  );

  return (
    <>
      <Helmet><title>{auction.product?.name || 'Auction'} | Admin</title></Helmet>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <button onClick={() => navigate('/admin/auctions')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: 600, fontSize: '0.875rem' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
          >
            <ArrowLeft size={16} /> Back to Auctions
          </button>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canApproveBids && (
              <ActionBtn 
                variant="success" 
                icon={ShoppingCart}
                onClick={() => setShowApprovePanel(!showApprovePanel)}
              >
                {showApprovePanel ? 'Close Approval' : 'Approve Bids & Create Orders'}
              </ActionBtn>
            )}
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); }} disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.825rem', cursor: 'pointer' }}>
                  <X size={14} /> Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 10, background: saving ? '#e5e7eb' : 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white', fontWeight: 700, fontSize: '0.825rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.825rem', cursor: 'pointer' }}>
                  <Edit size={14} /> Edit
                </button>
                {auction.status === 'active' && (
                  <button onClick={handleCancelStatus}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1.5px solid rgba(234,88,12,0.4)', borderRadius: 10, background: 'rgba(234,88,12,0.06)', color: '#ea580c', fontWeight: 700, fontSize: '0.825rem', cursor: 'pointer' }}>
                    Cancel Auction
                  </button>
                )}
                <button onClick={handleDelete}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1.5px solid rgba(220,38,38,0.4)', borderRadius: 10, background: 'rgba(220,38,38,0.06)', color: '#dc2626', fontWeight: 700, fontSize: '0.825rem', cursor: 'pointer' }}>
                  <Trash2 size={14} /> Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Product card ── */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', padding: 20, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {auction.product?.main_image_url ? (
            <img src={auction.product.main_image_url} alt={auction.product.name}
              style={{ width: 100, height: 100, borderRadius: 12, objectFit: 'cover', flexShrink: 0, background: '#f3f4f6' }} />
          ) : (
            <div style={{ width: 100, height: 100, borderRadius: 12, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Package size={32} style={{ color: '#d1d5db' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>{auction.product?.name}</h1>
              <StatusBadge status={auction.status} />
            </div>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 10px' }}>
              SKU: {auction.product?.sku ?? '—'} {auction.product?.brand?.name ? `• ${auction.product.brand.name}` : ''}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                <Clock size={13} style={{ color: '#a855f7' }} /> Ends: {formatDate(auction.end_time)}
              </span>
              {auction.reserve_price && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                  <Shield size={13} style={{ color: '#a855f7' }} /> Reserve: {formatPrice(auction.reserve_price)}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                <Users size={13} style={{ color: '#a855f7' }} /> Max Winners: {maxWinners}
              </span>
            </div>
          </div>
        </div>

        {/* ── Stats grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: 'Current Price', value: formatPrice(auction.current_price), color: '#dc2626', icon: <TrendingUp size={16} /> },
            { label: 'Start Price', value: formatPrice(auction.start_price), color: '#a855f7', icon: <Gavel size={16} /> },
            { label: 'Total Bids', value: stats.total_bids ?? 0, color: '#a855f7', icon: <Gavel size={16} /> },
            { label: 'Unique Bidders', value: bidStats.uniqueBidders, color: '#a855f7', icon: <Users size={16} /> },
            { label: 'Highest Bid', value: bidStats.highestBid > 0 ? formatPrice(bidStats.highestBid) : '—', color: '#059669', icon: <TrendingUp size={16} /> },
            { label: 'Bid Increment', value: formatPrice(auction.bid_increment), color: '#a855f7', icon: <Gavel size={16} /> },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '14px 16px' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{s.label}</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Edit form ── */}
        {editing && (
          <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid rgba(168,85,247,0.25)', padding: 24 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 20px' }}>Edit Auction Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { name: 'start_price', label: 'Start Price (KSh)', type: 'number' },
                { name: 'reserve_price', label: 'Reserve Price (Optional)', type: 'number' },
                { name: 'bid_increment', label: 'Bid Increment (KSh)', type: 'number' },
                { name: 'end_time', label: 'End Time', type: 'datetime-local' },
              ].map(field => (
                <div key={field.name}>
                  <label style={labelStyle}>{field.label}</label>
                  <input type={field.type} name={field.name} value={form[field.name] || ''} onChange={handleChange}
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = '#a855f7'}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              ))}
              <div>
                <label style={labelStyle}>Status</label>
                <select name="status" value={form.status} onChange={handleChange} style={inputStyle}>
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="ended">Ended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            BID APPROVAL PANEL (shown when "Approve Bids" is clicked)
            ═══════════════════════════════════════════════════════════════ */}
        {showApprovePanel && (
          <Panel accent style={{ animation: 'slideDown 200ms ease-out' }}>
            <div style={{ padding: 24 }}>
              {/* Panel Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <SectionLabel icon={ShoppingCart}>Approve Bids & Create Orders</SectionLabel>
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '-10px 0 0' }}>
                    Select winning bids and configure order details. Max {maxWinners} winner(s) allowed.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {selectedBids.size > 0 && (
                    <ActionBtn variant="outline" icon={RotateCcw} onClick={clearAllSelections}>
                      Clear ({selectedBids.size})
                    </ActionBtn>
                  )}
                  <ActionBtn 
                    variant="success" 
                    icon={CheckCircle}
                    onClick={handleApproveBids}
                    disabled={approving || selectedBids.size === 0}
                  >
                    {approving ? 'Creating Orders...' : `Create ${selectedBids.size} Order(s)`}
                  </ActionBtn>
                </div>
              </div>

              {/* Global Settings Row */}
              <div style={{ 
                background: '#f9fafb', borderRadius: 14, padding: 16, 
                marginBottom: 20, border: '1px solid #f3f4f6'
              }}>
                <p style={{ fontSize: '0.68rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 14px' }}>
                  Global Order Settings
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Global Charged Amount (KSh)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        value={globalChargedAmount}
                        onChange={e => setGlobalChargedAmount(e.target.value)}
                        placeholder="Override all"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={applyGlobalAmount}
                        disabled={!globalChargedAmount || selectedBids.size === 0}
                        style={{
                          padding: '8px 14px', borderRadius: 10, border: 'none',
                          background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                          color: 'white', fontSize: '0.75rem', fontWeight: 700,
                          cursor: (!globalChargedAmount || selectedBids.size === 0) ? 'not-allowed' : 'pointer',
                          opacity: (!globalChargedAmount || selectedBids.size === 0) ? 0.5 : 1,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Apply
                      </button>
                    </div>
                    <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '4px 0 0' }}>Applied to selected bids without custom amount</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Currency</label>
                    <select 
                      value={approveForm.currency}
                      onChange={e => setApproveForm(prev => ({ ...prev, currency: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="KES">KES</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Exchange Rate to KES</label>
                    <input
                      type="number"
                      step="0.01"
                      value={approveForm.exchange_rate_to_kes}
                      onChange={e => setApproveForm(prev => ({ ...prev, exchange_rate_to_kes: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Payment Method</label>
                    <select
                      value={approveForm.payment_method}
                      onChange={e => setApproveForm(prev => ({ ...prev, payment_method: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="mpesa">M-Pesa</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cod">Cash on Delivery</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Delivery Method</label>
                    <input
                      type="text"
                      value={approveForm.delivery_method}
                      onChange={e => setApproveForm(prev => ({ ...prev, delivery_method: e.target.value }))}
                      placeholder="e.g. nairobi-cbd"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Shipping Cost (KSh)</label>
                    <input
                      type="number"
                      value={approveForm.shipping_cost}
                      onChange={e => setApproveForm(prev => ({ ...prev, shipping_cost: e.target.value }))}
                      placeholder="Auto-calculate if empty"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Checkbox 
                      checked={approveForm.apply_tax}
                      onChange={e => setApproveForm(prev => ({ ...prev, apply_tax: e.target.checked }))}
                      label="Apply 16% VAT/Tax"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Shipping Address</label>
                    <input
                      type="text"
                      value={approveForm.shipping_address}
                      onChange={e => setApproveForm(prev => ({ ...prev, shipping_address: e.target.value }))}
                      placeholder="Customer delivery address"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Admin Notes</label>
                    <input
                      type="text"
                      value={approveForm.admin_notes}
                      onChange={e => setApproveForm(prev => ({ ...prev, admin_notes: e.target.value }))}
                      placeholder="Internal notes..."
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Customer Notes</label>
                    <input
                      type="text"
                      value={approveForm.customer_notes}
                      onChange={e => setApproveForm(prev => ({ ...prev, customer_notes: e.target.value }))}
                      placeholder="Visible to customer..."
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* Selected Summary */}
              {selectedBids.size > 0 && (
                <div style={{
                  background: 'rgba(16,185,129,0.06)', borderRadius: 12,
                  padding: '12px 16px', marginBottom: 16, border: '1px solid rgba(16,185,129,0.15)',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
                }}>
                  <CheckCircle size={18} style={{ color: '#059669' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#059669' }}>
                    {selectedBids.size} of {maxWinners} winner(s) selected
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {Array.from(selectedBids).map(bidId => {
                      const bid = auction.bids.find(b => b.id === bidId);
                      const amount = bidAmounts[bidId] ? formatPrice(bidAmounts[bidId]) : formatPrice(bid?.amount);
                      return `${bid?.bidder?.name || 'Unknown'} (${amount})`;
                    }).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* ── Orders for this auction ── */}
        {(ordersLoading || orders.length > 0) && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={16} style={{ color: '#a855f7' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#374151' }}>Orders</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af' }}>
                {orders.length} order{orders.length !== 1 ? 's' : ''}
              </span>
            </div>
            {ordersLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>Loading orders...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Order #', 'Customer', 'Total', 'Status', 'Payment', 'Created'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}
                        onClick={() => navigate(`/admin/auction-orders/${o.id}`)}
                        style={{ borderTop: '1px solid #f3f4f6', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#faf5ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 16px', fontSize: '0.82rem', fontWeight: 700, color: '#a855f7' }}>{o.order_number}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: '0 0 1px' }}>
                            {o.customer?.first_name && o.customer?.last_name
                              ? `${o.customer.first_name} ${o.customer.last_name}`
                              : o.customer?.name || 'Unknown'}
                          </p>
                          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{o.customer?.email || '—'}</p>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem', fontWeight: 800, color: '#111827' }}>
                          {formatPrice(o.total)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {(() => {
                            const s = statusConfig[o.status] ?? { color: '#9ca3af', bg: '#f3f4f6', border: '#e5e7eb', dot: '#9ca3af' };
                            return (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: s.bg, border: `1px solid ${s.border}`, fontSize: '0.7rem', fontWeight: 800, color: s.color, textTransform: 'uppercase' }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }} />{o.status}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {(() => {
                            const p = { pending: '#d97706', confirmed: '#2563eb', partially_paid: '#7c3aed', paid: '#059669', overpayment: '#0891b2', refunded: '#6b7280', unpaid: '#9ca3af' };
                            const c = p[o.payment_status] || '#9ca3af';
                            return <span style={{ fontSize: '0.72rem', fontWeight: 700, color: c }}>{o.payment_status?.replace('_', ' ')}</span>;
                          })()}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#9ca3af' }}>{formatDate(o.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Bid history (with approval checkboxes when panel is open) ── */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#374151' }}>Bid History</span>
            {showApprovePanel && (
              <span style={{ 
                marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, 
                color: selectedBids.size >= maxWinners ? '#dc2626' : '#059669',
                background: selectedBids.size >= maxWinners ? 'rgba(220,38,38,0.08)' : 'rgba(16,185,129,0.08)',
                padding: '3px 10px', borderRadius: 99
              }}>
                {selectedBids.size}/{maxWinners} selected
              </span>
            )}
            {!showApprovePanel && (
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af' }}>
                {auction.bids?.length ?? 0} bids
              </span>
            )}
          </div>

          {auction.bids?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {showApprovePanel && (
                      <th style={{ padding: '10px 8px 10px 16px', width: 40 }} />
                    )}
                    {['Bidder', 'Amount', 'Max Bid', 'Time'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                    {showApprovePanel && (
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Charged Amount
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {auction.bids.map((bid, idx) => {
                    const isSelected = selectedBids.has(bid.id);
                    const isDisabled = !isSelected && selectedBids.size >= maxWinners && showApprovePanel;

                    return (
                      <tr key={bid.id ?? idx} style={{ 
                        borderTop: '1px solid #f3f4f6',
                        background: isSelected ? 'rgba(168,85,247,0.04)' : 'transparent'
                      }}
                        onMouseEnter={e => !showApprovePanel && (e.currentTarget.style.background = '#faf5ff')}
                        onMouseLeave={e => !showApprovePanel && (e.currentTarget.style.background = isSelected ? 'rgba(168,85,247,0.04)' : 'transparent')}
                      >
                        {showApprovePanel && (
                          <td style={{ padding: '12px 8px 12px 16px' }}>
                            <div 
                              onClick={() => !isDisabled && toggleBidSelection(bid.id)}
                              style={{
                                width: 20, height: 20, borderRadius: 5,
                                border: isSelected ? '2px solid #a855f7' : isDisabled ? '2px solid #e5e7eb' : '2px solid #d1d5db',
                                background: isSelected ? '#a855f7' : 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                opacity: isDisabled ? 0.4 : 1,
                                transition: 'all 150ms'
                              }}
                            >
                              {isSelected && <CheckCircle size={12} color="white" />}
                            </div>
                          </td>
                        )}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: idx === 0 ? 'rgba(220,38,38,0.1)' : 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: idx === 0 ? '#dc2626' : '#a855f7', flexShrink: 0 }}>
                              {bid.bidder?.name?.charAt(0) ?? 'U'}
                            </div>
                            <div>
                              <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#374151', margin: 0 }}>{bid.bidder?.name ?? 'Unknown'}</p>
                              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>{bid.bidder?.email ?? ''}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.875rem', fontWeight: 700, color: idx === 0 ? '#dc2626' : '#059669' }}>
                          {formatPrice(bid.amount)}
                          {idx === 0 && <span style={{ marginLeft: 6, fontSize: '0.6rem', fontWeight: 800, background: 'rgba(220,38,38,0.1)', color: '#dc2626', padding: '1px 6px', borderRadius: 99 }}>TOP</span>}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.825rem', color: '#6b7280' }}>{formatPrice(bid.max_bid)}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#9ca3af' }}>{formatDate(bid.created_at)}</td>
                        {showApprovePanel && (
                          <td style={{ padding: '12px 16px' }}>
                            <input
                              type="number"
                              value={bidAmounts[bid.id] || ''}
                              onChange={e => setBidChargedAmount(bid.id, e.target.value)}
                              placeholder={formatPrice(bid.amount).replace('KSh ', '')}
                              disabled={!isSelected}
                              style={{
                                width: 130, padding: '6px 10px', border: '1.5px solid #e5e7eb',
                                borderRadius: 8, fontSize: '0.8rem', color: '#111827',
                                background: isSelected ? 'white' : '#f9fafb',
                                outline: 'none', opacity: isSelected ? 1 : 0.5
                              }}
                              onFocus={e => e.target.style.borderColor = '#a855f7'}
                              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af' }}>
              <Gavel size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontWeight: 600, margin: 0 }}>No bids yet</p>
            </div>
          )}
        </div>

        {/* ── Activity Logs placeholder ── */}
        {activityLogs.length > 0 && (
          <Panel>
            <div style={{ padding: 20 }}>
              <SectionLabel icon={Activity}>Activity Log</SectionLabel>
              {/* Activity log content */}
            </div>
          </Panel>
        )}

      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </>
  );
}