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
  MapPin, Phone, Mail, Tag
} from 'lucide-react';
import auctionsAPI from '../../../../_shared/api/auctions';
import AuctionChargesEditor from '../../../components/admin/auctions/AuctionChargesEditor';
import SalesAccountSelect from '../../../../core/components/admin/tax/SalesAccountSelect';
import CurrencySelect from '../../../../_shared/components/common/currency/CurrencySelect';
import BranchSelect from '../../../../_shared/components/common/BranchSelect';
import VariantAtBranchPicker from '../../../components/admin/VariantAtBranchPicker';
import useCurrencyStore from '../../../../_shared/store/currencyStore';
import { formatMoney } from '../../../../_shared/lib/money';

const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #e5e7eb',
  borderRadius: 10, fontSize: '0.875rem', color: '#111827',
  background: 'white', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--color-primary-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
};

const statusConfig = {
  active:    { color: '#059669', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', dot: '#10b981' },
  scheduled: { color: '#2563eb', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', dot: '#3b82f6' },
  ended:     { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)', dot: '#9ca3af' },
  cancelled: { color: '#dc2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.25)', dot: '#ef4444' },
  failed:    { color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b' },
};

const CHARGE_KIND = {
  buyer_premium: "Buyer's premium", entry_fee: 'Entry fee', deposit: 'Deposit', delivery: 'Delivery', handling: 'Handling',
  storage: 'Storage', removal: 'Removal', payment: 'Payment fee', customs: 'Customs', other: 'Charge',
};
const CHARGE_DUE = { entry: 'To take part', deposit: 'Held as deposit', on_win: 'Added on winning', after_win: 'After winning' };
const CHARGE_TAX = { taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'No tax' };

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
    {Icon && <Icon size={14} color="var(--color-primary-500)" />}
    <p style={{
      fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase',
      letterSpacing: '0.14em', color: 'var(--color-primary-500)', margin: 0,
    }}>{children}</p>
  </div>
);

const Panel = ({ children, style = {}, accent = false }) => (
  <div style={{
    background: 'white',
    border: `1px solid ${accent ? 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)' : '#f3f4f6'}`,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: accent
      ? '0 0 0 1px color-mix(in srgb, var(--color-primary-500) 12%, transparent), 0 4px 20px color-mix(in srgb, var(--color-primary-500) 8%, transparent)'
      : '0 1px 4px rgba(0,0,0,0.04)',
    ...style,
  }}>
    {children}
  </div>
);

const ActionBtn = ({ children, onClick, variant = 'primary', icon: Icon, disabled }) => {
  const variants = {
    primary: { background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: 'white', border: 'none' },
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
      border: checked ? '2px solid var(--color-primary-500)' : '2px solid #e5e7eb',
      background: checked ? 'var(--color-primary-500)' : 'white',
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

  // Every amount on this page (bids, increment, reserve) is in the auction's own currency
  const adminCurrencies = useCurrencyStore(s => s.adminCurrencies);
  const fetchAdminCurrencies = useCurrencyStore(s => s.fetchAdminCurrencies);
  useEffect(() => { if (!adminCurrencies.length) fetchAdminCurrencies().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [stats, setStats] = useState({});
  const [registrations, setRegistrations] = useState([]);
  const [charges, setCharges] = useState([]);   // the charges this auction carries, as saved
  const [releasing, setReleasing] = useState(false);
  const [activityLogs] = useState([]);

  const fetchAuction = async () => {
    setLoading(true);
    try {
      const data = await auctionsAPI.getAdminAuction(id);
      setAuction(data.auction);
      setStats(data.stats);
      setCharges(data.charges ?? []);
      auctionsAPI.listRegistrations(id).then(setRegistrations).catch(() => setRegistrations([]));
      setForm({
        currency_id: data.auction.currency_id ?? data.auction.currency?.id ?? '',
        location_id: data.auction.location_id ?? '',
        variant_id: data.auction.variant_id ?? '',
        start_price: data.auction.start_price,
        reserve_price: data.auction.reserve_price,
        bid_increment: data.auction.bid_increment,
        start_time: data.auction.start_time?.slice(0, 16),
        end_time: data.auction.end_time?.slice(0, 16),
        status: data.auction.status,
        sales_ledger_id: data.auction.sales_ledger_id ?? '',
        charges: (data.charges ?? []).map(c => ({ ledger_id: c.ledger_id, is_enabled: Boolean(c.is_enabled), amount: c.amount })),
      });
    } catch (err) {
      toast.error('Failed to load auction');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => { fetchAuction(); }, [id]);

  const releaseDeposits = async () => {
    setReleasing(true);
    try {
      const res = await auctionsAPI.releaseDeposits(id);
      toast.success(res.message);
      fetchAuction();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not release the deposits'); }
    finally { setReleasing(false); }
  };

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      if (hasBids) delete body.charges;   // fixed once bidding starts
      await auctionsAPI.updateAuction(id, body);
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

  const handleCloseNow = async () => {
    if (!window.confirm('End this auction now? The highest bid wins (if it meets the reserve) and you can then create the winner\'s invoice.')) return;
    try {
      const res = await auctionsAPI.closeAuction(id);
      toast.success(res.message, { duration: 6000 });
      fetchAuction();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not end the auction');
    }
  };

  const handleCreateOrder = async () => {
    if (!window.confirm('Create the winner\'s invoice? It has the winning bid and the charges added on winning, is charged to their account, and their deposit is set against it.')) return;
    try {
      const res = await auctionsAPI.createOrder(id);
      toast.success(res.message);
      navigate(`/admin/books/vouchers/${res.voucher_id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not create the order', { duration: 7000 });
    }
  };

  const maxWinners = auction?.max_winners || 1;
  const auctionCode = auction?.currency?.code ?? 'KES';
  const auctionSymbol = auction?.currency?.symbol || auctionCode;
  const formatPrice = (price, cur) => formatMoney(price ?? 0, cur || auctionSymbol, { decimals: 'auto' });
  const hasBids = (auction?.bids?.length ?? 0) > 0;
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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 12 }}>
      <Gavel size={36} style={{ color: 'var(--color-primary-500)', opacity: 0.4 }} />
      <p style={{ color: '#9ca3af', fontWeight: 600 }}>Loading auction...</p>
    </div>
  );

  if (!auction) return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <AlertTriangle size={48} style={{ color: '#f59e0b', margin: '0 auto 16px' }} />
      <p style={{ color: '#6b7280', fontWeight: 600, marginBottom: 12 }}>Auction not found</p>
      <button onClick={() => navigate('/admin/auctions')} style={{ color: 'var(--color-primary-500)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>
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
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-500)'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
          >
            <ArrowLeft size={16} /> Back to Auctions
          </button>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); }} disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.825rem', cursor: 'pointer' }}>
                  <X size={14} /> Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 10, background: saving ? '#e5e7eb' : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: 'white', fontWeight: 700, fontSize: '0.825rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
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
                  <button onClick={handleCloseNow}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1.5px solid rgba(5,150,105,0.4)', borderRadius: 10, background: 'rgba(5,150,105,0.06)', color: '#059669', fontWeight: 700, fontSize: '0.825rem', cursor: 'pointer' }}>
                    End auction now
                  </button>
                )}
                {auction.status === 'active' && (
                  <button onClick={handleCancelStatus}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: '1.5px solid rgba(234,88,12,0.4)', borderRadius: 10, background: 'rgba(234,88,12,0.06)', color: '#ea580c', fontWeight: 700, fontSize: '0.825rem', cursor: 'pointer' }}>
                    Cancel Auction
                  </button>
                )}
                {auction.winner_id && (
            <button onClick={handleCreateOrder} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#059669', color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Create invoice for winner</button>
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
              <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary-500)', margin: 0 }}>{auction.product?.name}</h1>
              <StatusBadge status={auction.status} />
            </div>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 10px' }}>
              SKU: {auction.product?.sku ?? '—'} {auction.product?.brand?.name ? `• ${auction.product.brand.name}` : ''}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                <Clock size={13} style={{ color: 'var(--color-primary-500)' }} /> Ends: {formatDate(auction.end_time)}
              </span>
              {auction.reserve_price && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                  <Shield size={13} style={{ color: 'var(--color-primary-500)' }} /> Reserve: {formatPrice(auction.reserve_price)}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                <Users size={13} style={{ color: 'var(--color-primary-500)' }} /> Max Winners: {maxWinners}
              </span>
              {auction.location?.name && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
                  <MapPin size={13} style={{ color: 'var(--color-primary-500)' }} /> {auction.location.name}
                  {auction.variant?.name && auction.variant.name !== 'Standard' ? ` · ${auction.variant.name}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Stats grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {[
            { label: 'Current Price', value: formatPrice(auction.current_price), color: '#dc2626', icon: <TrendingUp size={16} /> },
            { label: 'Start Price', value: formatPrice(auction.start_price), color: 'var(--color-primary-500)', icon: <Gavel size={16} /> },
            { label: 'Total Bids', value: stats.total_bids ?? 0, color: 'var(--color-primary-500)', icon: <Gavel size={16} /> },
            { label: 'Unique Bidders', value: bidStats.uniqueBidders, color: 'var(--color-primary-500)', icon: <Users size={16} /> },
            { label: 'Highest Bid', value: bidStats.highestBid > 0 ? formatPrice(bidStats.highestBid) : '—', color: '#059669', icon: <TrendingUp size={16} /> },
            { label: 'Bid Increment', value: formatPrice(auction.bid_increment), color: 'var(--color-primary-500)', icon: <Gavel size={16} /> },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '14px 16px' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-primary-500)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>{s.label}</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Edit form ── */}
        {editing && (
          <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', padding: 24 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary-500)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 20px' }}>Edit Auction Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { name: 'start_price', label: `Start Price (${adminCurrencies.find(c => String(c.id) === String(form.currency_id))?.code ?? auctionCode})`, type: 'number' },
                { name: 'reserve_price', label: 'Reserve Price (Optional)', type: 'number' },
                { name: 'bid_increment', label: `Bid Increment (${adminCurrencies.find(c => String(c.id) === String(form.currency_id))?.code ?? auctionCode})`, type: 'number' },
                { name: 'end_time', label: 'End Time', type: 'datetime-local' },
              ].map(field => (
                <div key={field.name}>
                  <label style={labelStyle}>{field.label}</label>
                  <input type={field.type} name={field.name} value={form[field.name] || ''} onChange={handleChange}
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                    onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              ))}
              <div>
                <label style={labelStyle}>Branch</label>
                <BranchSelect value={form.location_id} onChange={v => setForm(prev => ({ ...prev, location_id: v }))} disabled={hasBids} />
              </div>
              <div>
                <label style={labelStyle}>Variant</label>
                <VariantAtBranchPicker productId={auction.product_id} locationId={form.location_id} value={form.variant_id}
                  onChange={v => setForm(prev => ({ ...prev, variant_id: v }))} />
              </div>
              <div>
                <label style={labelStyle}>Currency</label>
                <CurrencySelect
                  value={form.currency_id}
                  onChange={v => setForm(prev => ({ ...prev, currency_id: v }))}
                  disabled={hasBids}
                  style={{ padding: '10px 14px' }}
                />
                {hasBids && (
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '5px 0 0' }}>Locked — bids have been placed in {auctionCode}.</p>
                )}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <SalesAccountSelect kind="sales" required value={form.sales_ledger_id} onChange={v => setForm(prev => ({ ...prev, sales_ledger_id: v }))}
                  hint="Bids are entered and shown excluding tax. Tax comes from this account." />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Charges</label>
                <AuctionChargesEditor currencyId={form.currency_id} currencyCode={adminCurrencies.find(c => String(c.id) === String(form.currency_id))?.code ?? auctionCode}
                  value={form.charges} onChange={rows => setForm(prev => ({ ...prev, charges: rows }))} locked={hasBids} />
              </div>
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

        {/* ── Registrations & deposits ── */}
        {registrations.length > 0 && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#374151' }}>Registrations &amp; deposits</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af' }}>{registrations.length}</span>
              {registrations.some(r => r.deposit_status === 'held') && ['ended', 'cancelled'].includes(auction.status) && (
                <button onClick={releaseDeposits} disabled={releasing}
                  style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--color-primary-500)', color: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                  {releasing ? 'Releasing…' : 'Release deposits to bidders’ accounts'}
                </button>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                    {['Bidder', 'Status', 'Entry fee', 'Deposit', 'Deposit is'].map(h => <th key={h} style={{ padding: '8px 14px', fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {registrations.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 14px' }}>{[r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(' ') || r.customer?.email || `#${r.customer_id}`}</td>
                      <td style={{ padding: '8px 14px' }}>{r.status === 'registered' ? 'Paid — may bid' : r.status === 'awaiting_payment' ? 'Awaiting payment' : r.status}</td>
                      <td style={{ padding: '8px 14px' }}>{formatMoney(Number(r.entry_amount), auctionCode, { decimals: 'auto' })}</td>
                      <td style={{ padding: '8px 14px' }}>{Number(r.deposit_amount) ? formatMoney(Number(r.deposit_amount), auctionCode, { decimals: 'auto' }) : '—'}</td>
                      <td style={{ padding: '8px 14px' }}>{{ held: 'Held', released: 'Released to their account', none: '—' }[r.deposit_status] ?? r.deposit_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Charges this auction carries (the ticked ones) ── */}
        {!editing && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag size={16} style={{ color: 'var(--color-primary-500)' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#374151' }}>Charges on this auction</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af' }}>{charges.filter((c) => c.is_enabled).length} ticked</span>
            </div>
            {charges.filter((c) => c.is_enabled).length === 0 ? (
              <p style={{ margin: 0, padding: '18px 20px', fontSize: '0.8rem', color: '#9ca3af' }}>No other charges are ticked — the winner pays the winning bid{auction.tax_info ? ' plus tax' : ''} only.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {['Charge', 'Charged', 'Amount', 'Limits', 'Tax'].map((h, i) => <th key={h} style={{ padding: '8px 16px', textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {charges.filter((c) => c.is_enabled).map((c) => {
                      const kind = (c.ledger?.settings ?? {}).charge_kind;
                      const amount = Number(c.amount);
                      const how = c.basis === 'percent' ? `${amount}% of the winning bid` : c.basis === 'per_day' ? `${auctionSymbol} ${amount}/day` : `${auctionSymbol} ${amount}`;
                      const limits = [c.min_amount != null && Number(c.min_amount) > 0 ? `min ${Number(c.min_amount)}` : null, c.max_amount != null && Number(c.max_amount) > 0 ? `max ${Number(c.max_amount)}` : null, c.basis === 'per_day' && c.free_days ? `first ${c.free_days} days free` : null].filter(Boolean).join(' · ');
                      return (
                        <tr key={c.id ?? c.ledger_id} style={{ borderTop: '1px solid #f3f4f6', fontSize: '0.82rem' }}>
                          <td style={{ padding: '10px 16px' }}>
                            <strong style={{ color: '#111827' }}>{c.ledger?.name ?? `Account ${c.ledger_id}`}</strong>
                            <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{CHARGE_KIND[kind] ?? 'Charge'}{c.refundable ? ' · refundable' : ''}</div>
                          </td>
                          <td style={{ padding: '10px 16px' }}>{CHARGE_DUE[c.timing] ?? c.timing}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{how}</td>
                          <td style={{ padding: '10px 16px', color: '#6b7280' }}>{limits || '—'}</td>
                          <td style={{ padding: '10px 16px', color: '#6b7280' }}>{CHARGE_TAX[c.ledger?.tax_nature] ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Bid history ── */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} style={{ color: 'var(--color-primary-500)' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#374151' }}>Bid History</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af' }}>
              {auction.bids?.length ?? 0} bids
            </span>
          </div>

          {auction.bids?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Bidder', 'Amount', 'Max Bid', 'Time'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: 'var(--color-primary-500)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auction.bids.map((bid, idx) => {
                    return (
                      <tr key={bid.id ?? idx} style={{ borderTop: '1px solid #f3f4f6', background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 4%, var(--bg-primary))')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: idx === 0 ? 'rgba(220,38,38,0.1)' : 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: idx === 0 ? '#dc2626' : 'var(--color-primary-500)', flexShrink: 0 }}>
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