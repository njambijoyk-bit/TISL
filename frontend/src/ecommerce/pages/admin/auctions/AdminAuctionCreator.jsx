import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import auctionsAPI from '../../../../_shared/api/auctions';
import toast from 'react-hot-toast';
import CurrencySelect from '../../../../_shared/components/common/currency/CurrencySelect';
import useCurrencyStore from '../../../../_shared/store/currencyStore';
import { formatMoney } from '../../../../_shared/lib/money';
import { Helmet } from 'react-helmet-async';
import { Package, X, Gavel, Clock, Shield, TrendingUp, ArrowLeft } from 'lucide-react';
import AuctionChargesEditor from '../../../components/admin/auctions/AuctionChargesEditor';
import SalesAccountSelect from '../../../../core/components/admin/tax/SalesAccountSelect';
import BranchSelect from '../../../../_shared/components/common/BranchSelect';
import VariantAtBranchPicker from '../../../../core/components/admin/pickers/VariantAtBranchPicker';
import ProductSelectorModalAdmin from '../../../../core/components/admin/pickers/ProductSelectorModalAdmin';

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb',
  borderRadius: 10, fontSize: '0.875rem', color: '#111827',
  background: 'white', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 150ms ease',
};

const labelStyle = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--color-primary-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
};

const sectionStyle = {
  background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '20px 24px',
};

export default function AdminAuctionCreator() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [charges, setCharges] = useState(null);   // null until the charge accounts have loaded
  const [form, setForm] = useState({
    product_id: '', variant_id: '', location_id: '', currency_id: '', start_price: '', reserve_price: '',
    bid_increment: '50', start_time: '', end_time: '', sales_ledger_id: ''
  });

  // Bids, reserve and increment are all in this currency
  const adminCurrencies = useCurrencyStore(s => s.adminCurrencies);
  const code = adminCurrencies.find(c => String(c.id) === String(form.currency_id))?.code
    ?? adminCurrencies.find(c => c.is_base)?.code ?? 'KES';

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleProductSelect = (products) => {
    if (products?.length > 0) {
      const prod = products[0];
      setSelectedProduct({ ...prod, product_id: prod.id });
      // Start from the product's own currency — the admin can change it
      setForm(prev => ({ ...prev, product_id: String(prod.id), variant_id: '', currency_id: prod.currency_id ?? prod.currency?.id ?? prev.currency_id, sales_ledger_id: prev.sales_ledger_id || (prod.sales_ledger_id ? String(prod.sales_ledger_id) : '') }));
    }
    setShowProductModal(false);
  };

  const clearProduct = () => {
    setSelectedProduct(null);
    setForm(prev => ({ ...prev, product_id: '', variant_id: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.start_price || !form.end_time) {
      return toast.error('Please fill all required fields');
    }
    if (!form.location_id) return toast.error('Pick the branch this auction belongs to');
    if (!form.sales_ledger_id) return toast.error('Choose the sales account this auction is booked under');
    setLoading(true);
    try {
      await auctionsAPI.createAuction({ ...form, variant_id: form.variant_id || undefined, ...(charges ? { charges } : {}) });
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
            onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary-500)'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary-500)', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
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
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.color = 'var(--color-primary-500)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'none'; }}
              >
                <Package size={20} /> Click to select a product
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 12, background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)', border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)' }}>
                {selectedProduct.main_image_url || selectedProduct.main_image ? (
                  <img src={selectedProduct.main_image_url || selectedProduct.main_image} alt={selectedProduct.name}
                    style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Package size={20} style={{ color: '#d1d5db' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary-500)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProduct.name}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                    SKU: {selectedProduct.sku ?? 'N/A'} {selectedProduct.brand?.name ? `• ${selectedProduct.brand.name}` : ''} • {formatMoney(selectedProduct.price, selectedProduct.currency?.symbol || selectedProduct.currency?.code || 'KSh', { decimals: 'auto' })}
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

          <div style={sectionStyle}>
            <p style={{ ...labelStyle, marginBottom: 14 }}>Sales account *</p>
            <SalesAccountSelect kind="sales" required amount={form.start_price} currencyCode={code} value={form.sales_ledger_id}
              onChange={(v) => setForm(f => ({ ...f, sales_ledger_id: v }))}
              hint="Bids are entered and shown excluding tax. Tax is added on the winning bid from this account, with any auction charges." />
          </div>

          <div style={sectionStyle}>
            <p style={{ ...labelStyle, marginBottom: 6 }}>Charges</p>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 12px' }}>
              Added to what the winner pays, on top of the winning bid, each with its own tax. They come from the auction charge accounts; switch them on or off and change amounts for this auction.
            </p>
            <AuctionChargesEditor currencyId={form.currency_id} currencyCode={code} value={charges} onChange={setCharges} />
          </div>

          {/* ── Branch & item ── */}
          <div style={sectionStyle}>
            <p style={{ ...labelStyle, marginBottom: 14 }}>Branch &amp; item</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Branch *</label>
                <BranchSelect value={form.location_id} onChange={v => setForm(prev => ({ ...prev, location_id: v }))} />
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '6px 0 0' }}>The auction belongs to this branch; the item must be in stock there.</p>
              </div>
              <div>
                <label style={labelStyle}>Variant</label>
                {selectedProduct && form.location_id ? (
                  <VariantAtBranchPicker
                    productId={selectedProduct.id}
                    locationId={form.location_id}
                    value={form.variant_id}
                    onChange={v => setForm(prev => ({ ...prev, variant_id: v }))}
                  />
                ) : (
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Choose a product and branch first.</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Pricing ── */}
          <div style={sectionStyle}>
            <p style={{ ...labelStyle, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={12} /> Pricing
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Currency</label>
                <CurrencySelect
                  value={form.currency_id}
                  onChange={v => setForm(prev => ({ ...prev, currency_id: v }))}
                  allowEmpty
                  emptyLabel="Base currency"
                />
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '5px 0 0' }}>
                  Bidders see and bid in this currency. It can't change once someone has bid.
                </p>
              </div>
              <div>
                <label style={labelStyle}>Starting bid ({code}, excl. tax) <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="number" name="start_price" value={form.start_price} onChange={handleChange}
                  style={inputStyle} min="0" step="any" placeholder="e.g. 500"
                  onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
              <div>
                <label style={labelStyle}>Reserve price ({code}, excl. tax) <span style={{ color: '#9ca3af', textTransform: 'none', fontSize: '0.65rem' }}>(optional)</span></label>
                <input type="number" name="reserve_price" value={form.reserve_price} onChange={handleChange}
                  style={inputStyle} min="0" step="any" placeholder="Leave empty for no reserve"
                  onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '5px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Shield size={10} /> Hidden from bidders — protects your minimum sale price
                </p>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Bid Increment ({code})</label>
                <input type="number" name="bid_increment" value={form.bid_increment} onChange={handleChange}
                  style={inputStyle} min="0" step="any" placeholder="50"
                  onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
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
                  onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '5px 0 0' }}>Leave blank to go live immediately</p>
              </div>
              <div>
                <label style={labelStyle}>End Time <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="datetime-local" name="end_time" value={form.end_time} onChange={handleChange}
                  style={inputStyle} required
                  onFocus={e => e.target.style.borderColor = 'var(--color-primary-500)'}
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
              style={{ padding: '10px 24px', border: 'none', borderRadius: 10, background: loading ? '#e5e7eb' : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: loading ? '#9ca3af' : 'white', fontWeight: 800, fontSize: '0.875rem', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: loading ? 'none' : '0 4px 14px color-mix(in srgb, var(--color-primary-500) 35%, transparent)', transition: 'all 150ms ease' }}>
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