import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Edit, Trash2, Save, X, Package, Clock,
  Users, AlertTriangle, Gavel, Shield, TrendingUp
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


export default function AdminAuctionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [stats, setStats] = useState({});

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
    } catch (err) {
      toast.error('Failed to load auction');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAuction(); }, [id]);

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
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <button onClick={() => navigate('/admin/auctions')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: 600, fontSize: '0.875rem' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
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

        {/* ── Bid history ── */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#374151' }}>Bid History</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af' }}>{auction.bids?.length ?? 0} bids</span>
          </div>

          {auction.bids?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Bidder', 'Amount', 'Max Bid', 'Time'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.65rem', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auction.bids.map((bid, idx) => (
                    <tr key={bid.id ?? idx} style={{ borderTop: '1px solid #f3f4f6' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#faf5ff'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
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
                    </tr>
                  ))}
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

      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </>
  );
}