import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import auctionsAPI from '../../api/auctions';
import toast from 'react-hot-toast';
import { Helmet } from 'react-helmet-async';
import { Package, X, Gavel, Clock, Shield, TrendingUp, ArrowLeft } from 'lucide-react';
import ProductSelectorModalAdmin from '../../components/quotes/request-wizard/ProductSelectorModalAdmin';

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb',
  borderRadius: 10, fontSize: '0.875rem', color: '#111827',
  background: 'white', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 150ms ease',
};

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
};

const sectionStyle = {
  background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '20px 24px',
};

export default function AdminAuctionCreator() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [form, setForm] = useState({
    product_id: '', start_price: '', reserve_price: '',
    bid_increment: '50', start_time: '', end_time: ''
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleProductSelect = (products) => {
    if (products?.length > 0) {
      const prod = products[0];
      setSelectedProduct({ ...prod, product_id: prod.id });
      setForm(prev => ({ ...prev, product_id: String(prod.id) }));
    }
    setShowProductModal(false);
  };

  const clearProduct = () => {
    setSelectedProduct(null);
    setForm(prev => ({ ...prev, product_id: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.start_price || !form.end_time) {
      return toast.error('Please fill all required fields');
    }
    setLoading(true);
    try {
      await auctionsAPI.createAuction(form);
      toast.success('Auction created! 🎉');
      navigate('/admin/auctions');
    } catch (err) {
      const msg = err.response?.data?.message ||
        (err.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : 'Failed to create auction');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet><title>Create Auction | Admin</title></Helmet>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: 600, fontSize: '0.875rem' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Gavel size={22} /> Create New Auction
            </h1>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '2px 0 0' }}>Fill in the details to launch a live auction</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Product selector ── */}
          <div style={sectionStyle}>
            <p style={{ ...labelStyle, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={12} /> Product <span style={{ color: '#ef4444' }}>*</span>
            </p>

            {!selectedProduct ? (
              <button type="button" onClick={() => setShowProductModal(true)}
                style={{ width: '100%', padding: '20px', border: '2px dashed #e5e7eb', borderRadius: 12, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#9ca3af', fontWeight: 600, fontSize: '0.875rem', transition: 'all 150ms ease' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#a855f7'; e.currentTarget.style.background = 'rgba(168,85,247,0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'none'; }}
              >
                <Package size={20} /> Click to select a product
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12, background: 'rgba(168,85,247,0.04)', border: '1.5px solid rgba(168,85,247,0.2)' }}>
                {selectedProduct.main_image_url || selectedProduct.main_image ? (
                  <img src={selectedProduct.main_image_url || selectedProduct.main_image} alt={selectedProduct.name}
                    style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Package size={20} style={{ color: '#d1d5db' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a855f7', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProduct.name}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                    SKU: {selectedProduct.sku ?? 'N/A'} {selectedProduct.brand?.name ? `• ${selectedProduct.brand.name}` : ''} • KSh {Number(selectedProduct.price).toLocaleString()}
                  </p>
                </div>
                <button type="button" onClick={clearProduct}
                  style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(220,38,38,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', flexShrink: 0, transition: 'background 150ms' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(220,38,38,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(220,38,38,0.08)'}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* ── Pricing ── */}
          <div style={sectionStyle}>
            <p style={{ ...labelStyle, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={12} /> Pricing
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Start Price (KSh) <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="number" name="start_price" value={form.start_price} onChange={handleChange}
                  style={inputStyle} min="0" placeholder="e.g. 500"
                  onFocus={e => e.target.style.borderColor = '#a855f7'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
              <div>
                <label style={labelStyle}>Reserve Price <span style={{ color: '#9ca3af', textTransform: 'none', fontSize: '0.65rem' }}>(optional)</span></label>
                <input type="number" name="reserve_price" value={form.reserve_price} onChange={handleChange}
                  style={inputStyle} min="0" placeholder="Leave empty for no reserve"
                  onFocus={e => e.target.style.borderColor = '#a855f7'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Shield size={10} /> Hidden from bidders — protects your minimum sale price
                </p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Bid Increment (KSh)</label>
                <input type="number" name="bid_increment" value={form.bid_increment} onChange={handleChange}
                  style={inputStyle} min="10" placeholder="50"
                  onFocus={e => e.target.style.borderColor = '#a855f7'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '5px 0 0' }}>
                  Minimum amount each bid must exceed the current by
                </p>
              </div>
            </div>
          </div>

          {/* ── Timing ── */}
          <div style={sectionStyle}>
            <p style={{ ...labelStyle, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={12} /> Timing
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Start Time <span style={{ color: '#9ca3af', textTransform: 'none', fontSize: '0.65rem' }}>(optional)</span></label>
                <input type="datetime-local" name="start_time" value={form.start_time} onChange={handleChange}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#a855f7'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '5px 0 0' }}>Leave blank to go live immediately</p>
              </div>
              <div>
                <label style={labelStyle}>End Time <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="datetime-local" name="end_time" value={form.end_time} onChange={handleChange}
                  style={inputStyle} required
                  onFocus={e => e.target.style.borderColor = '#a855f7'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '5px 0 0' }}>Auto-extends 2 mins if a bid lands in final 2 mins</p>
              </div>
            </div>
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => navigate(-1)}
              style={{ padding: '10px 20px', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '10px 24px', border: 'none', borderRadius: 10, background: loading ? '#e5e7eb' : 'linear-gradient(135deg, #a855f7, #7c3aed)', color: loading ? '#9ca3af' : 'white', fontWeight: 800, fontSize: '0.875rem', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: loading ? 'none' : '0 4px 14px rgba(168,85,247,0.35)', transition: 'all 150ms ease' }}>
              <Gavel size={16} /> {loading ? 'Creating...' : 'Launch Auction'}
            </button>
          </div>

        </form>
      </div>

      {showProductModal && (
        <ProductSelectorModalAdmin
          onClose={() => setShowProductModal(false)}
          onSelect={handleProductSelect}
          selectedProducts={selectedProduct ? [selectedProduct] : []}
        />
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </>
  );
}