import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertTriangle, Tag, ChevronRight, Package, Truck, CreditCard, X, Wallet, Loader2 } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import PromoCodeInput from '../../components/common/PromoCodeInput';
import { useCartStore, useAuthStore } from '../../store';
import useOrderStore from '../../store/orderStore';
import usePromoCodeStore from '../../store/promoCodeStore';
import toast from 'react-hot-toast';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.875rem',
  border: '1.5px solid #e5e7eb', color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box', background: 'white',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; };
const inputError = (e) => { e.currentTarget.style.borderColor = '#ef4444'; };

const labelStyle = {
  fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
  padding: 24,
};

const sectionTitle = {
  fontSize: '0.875rem', fontWeight: 700, color: '#111827',
  display: 'flex', alignItems: 'center', gap: 8,
  margin: '0 0 18px', paddingBottom: 12,
  borderBottom: '1px solid #f3f4f6',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, error, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3 }}>{error}</p>}
    </div>
  );
}

function Input({ name, type = 'text', value, onChange, placeholder, error, required }) {
  return (
    <input
      type={type} name={name} value={value} onChange={onChange}
      placeholder={placeholder} required={required}
      style={{ ...inputStyle, borderColor: error ? '#ef4444' : '#e5e7eb' }}
      onFocus={inputFocus} onBlur={inputBlur}
    />
  );
}

function RadioCard({ value, current, onChange, label, sub, icon }) {
  const active = current === value;
  return (
    <button type="button" onClick={() => onChange(value)} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 10, textAlign: 'left',
      border: `1.5px solid ${active ? '#a855f7' : '#e5e7eb'}`,
      background: active ? 'rgba(168,85,247,0.04)' : 'white',
      cursor: 'pointer', fontFamily: 'inherit', width: '100%',
      transition: 'all 150ms',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${active ? '#a855f7' : '#d1d5db'}`,
        background: active ? '#a855f7' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 150ms',
      }}>
        {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px' }}>{label}</p>
        {sub && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{sub}</p>}
      </div>
      {icon && <span style={{ color: active ? '#a855f7' : '#d1d5db', flexShrink: 0 }}>{icon}</span>}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Checkout() {
  const navigate = useNavigate();
  const { items, getTotal, clearCart }    = useCartStore();
  const { user, customer }                = useAuthStore();
  const { createOrder }                   = useOrderStore();
  const { appliedPromo, clearPromo }      = usePromoCodeStore();
  const [loading, setLoading]             = useState(false);
  const [errors,  setErrors]              = useState({});

  const [form, setForm] = useState({
    customer_email:    user?.email || '',
    customer_phone:    user?.phone || '',
    shipping_address:  '',
    delivery_method:   'standard_delivery',
    payment_method:    'mpesa',
    customer_notes:    '',
  });

  const availableCredit                         = parseFloat(customer?.store_credit ?? 0);
  const [applyCredit,      setApplyCredit]      = useState(false);
  const [creditInput,      setCreditInput]      = useState('');
  const [creditCalculating,setCreditCalculating]= useState(false);
  const creditDebounce                          = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.customer_email)   e.customer_email   = 'Email is required';
    if (!form.customer_phone)   e.customer_phone   = 'Phone is required';
    if (!form.shipping_address) e.shipping_address = 'Address is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) { toast.error('Please fill in all required fields'); return; }
    if (items.length === 0) { toast.error('Your cart is empty'); return; }
    try {
      setLoading(true);
      const orderData = {
        ...form,
        items: items.map(item => ({ product_id: item.id, item_type: 'product', quantity: item.quantity })),
        ...(appliedPromo ? { promo_code: appliedPromo.code } : {}),
        ...(applyCredit && creditDeduction > 0 ? {
          apply_store_credit: true,
          store_credit_amount: creditDeduction,
        } : {}),
      };
      const res = await createOrder(orderData);
      toast.success('Order placed successfully!');
      clearCart(); clearPromo();
      navigate(`/orders/${res.order.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  // Backorder calc
  const backorderItems = items.reduce((acc, item) => {
    const stock = item.stock_quantity || 0;
    if (item.quantity > stock) acc.push({ name: item.name, backorderQty: item.quantity - stock, inStock: stock });
    return acc;
  }, []);

  // Totals
  const subtotal        = getTotal();
  const promoDiscount   = appliedPromo?.discount ?? 0;
  const taxable         = subtotal - promoDiscount;
  const tax             = taxable * 0.16;
  const shipping        = form.delivery_method === 'express_delivery' ? 1500
                        : form.delivery_method === 'courier'          ? 2000
                        : form.delivery_method === 'pickup'           ? 0
                        : subtotal >= 50000                           ? 0 : 500;
  const preCredit       = subtotal - promoDiscount + tax + shipping;
  const creditDeduction = applyCredit
    ? Math.min(parseFloat(creditInput) || 0, availableCredit, preCredit)
    : 0;
  const total           = preCredit - creditDeduction;

  const fmt = (n) => Number(n).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

  if (items.length === 0) { navigate('/cart'); return null; }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <div style={{ flex: 1, maxWidth: 1100, margin: '0 auto', padding: '32px 20px', width: '100%' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#9ca3af', marginBottom: 24 }}>
          <button onClick={() => navigate('/cart')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontFamily: 'inherit', fontSize: '0.75rem', transition: 'color 150ms' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          >Cart</button>
          <ChevronRight size={12} />
          <span style={{ color: '#a855f7', fontWeight: 600 }}>Checkout</span>
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 24px' }}>
          Checkout
        </h1>

        {/* Backorder notice */}
        {backorderItems.length > 0 && (
          <div style={{
            marginBottom: 20, padding: '14px 16px', borderRadius: 10,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b45309', margin: '0 0 4px' }}>
                Backorder notice
              </p>
              <p style={{ fontSize: '0.75rem', color: '#92400e', margin: '0 0 6px' }}>
                Some items in your order are on backorder and will be fulfilled within 5–7 business days after stock arrives.
              </p>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {backorderItems.map((item, i) => (
                  <li key={i} style={{ fontSize: '0.72rem', color: '#92400e', marginBottom: 2 }}>
                    <strong>{item.name}</strong>: {item.backorderQty} unit{item.backorderQty !== 1 ? 's' : ''} on backorder ({item.inStock} in stock)
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, alignItems: 'start' }}>

            {/* ── Left: form ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Contact */}
              <div style={card}>
                <p style={sectionTitle}>
                  <CreditCard size={14} style={{ color: '#a855f7' }} /> Contact information
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Email *" error={errors.customer_email}>
                    <Input name="customer_email" type="email" value={form.customer_email} onChange={handleChange} error={errors.customer_email} required />
                  </Field>
                  <Field label="Phone *" error={errors.customer_phone}>
                    <Input name="customer_phone" type="tel" value={form.customer_phone} onChange={handleChange} placeholder="+254…" error={errors.customer_phone} required />
                  </Field>
                </div>
              </div>

              {/* Shipping address */}
              <div style={card}>
                <p style={sectionTitle}>
                  <Package size={14} style={{ color: '#a855f7' }} /> Shipping information
                </p>
                <Field label="Delivery address *" error={errors.shipping_address}>
                  <textarea
                    name="shipping_address" rows={3}
                    value={form.shipping_address} onChange={handleChange}
                    placeholder="Street address, estate, city, county, postal code…"
                    style={{
                      ...inputStyle, resize: 'none',
                      borderColor: errors.shipping_address ? '#ef4444' : '#e5e7eb',
                    }}
                    onFocus={inputFocus} onBlur={inputBlur}
                  />
                  {errors.shipping_address && <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3 }}>{errors.shipping_address}</p>}
                </Field>

                <p style={{ ...labelStyle, marginTop: 16, marginBottom: 10 }}>Delivery method</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { value: 'standard_delivery', label: 'Standard delivery',  sub: '2–3 business days · KES 500',   icon: <Truck size={16} /> },
                    { value: 'express_delivery',  label: 'Express delivery',   sub: '1 business day · KES 1,500',    icon: <Truck size={16} /> },
                    { value: 'courier',           label: 'Courier service',    sub: 'Same-day in Nairobi · KES 2,000',icon: <Truck size={16} /> },
                    { value: 'pickup',            label: 'Store pickup',       sub: 'Free · Collect from our store', icon: <Package size={16} /> },
                  ].map(opt => (
                    <RadioCard key={opt.value} {...opt} current={form.delivery_method} onChange={v => setForm(f => ({ ...f, delivery_method: v }))} />
                  ))}
                </div>
              </div>

              {/* Payment */}
              <div style={card}>
                <p style={sectionTitle}>
                  <CreditCard size={14} style={{ color: '#a855f7' }} /> Payment information
                </p>
                <p style={{ ...labelStyle, marginBottom: 10 }}>Payment method</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {[
                    { value: 'mpesa',           label: 'M-Pesa',             sub: 'Pay via mobile money'              },
                    { value: 'bank_transfer',   label: 'Bank transfer',      sub: 'EFT or RTGS payment'               },
                    { value: 'pay_on_delivery', label: 'Pay on delivery',    sub: 'Cash on receipt'                   },
                    { value: 'request_invoice', label: 'Request invoice',    sub: 'For corporate & LPO orders'        },
                    { value: 'credit',          label: 'Credit account',     sub: 'Use your approved credit facility' },
                  ].map(opt => (
                    <RadioCard key={opt.value} {...opt} current={form.payment_method} onChange={v => setForm(f => ({ ...f, payment_method: v }))} />
                  ))}
                </div>

                <Field label="Special instructions (optional)">
                  <textarea
                    name="customer_notes" rows={2}
                    value={form.customer_notes} onChange={handleChange}
                    placeholder="Any delivery instructions or order notes…"
                    style={{ ...inputStyle, resize: 'none' }}
                    onFocus={inputFocus} onBlur={inputBlur}
                  />
                </Field>
              </div>
            </div>

            {/* ── Right: order summary ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={card}>
                <p style={sectionTitle}><Package size={14} style={{ color: '#a855f7' }} /> Order summary</p>

                {/* Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {items.map(item => {
                    const stock     = item.stock_quantity || 0;
                    const backorder = item.quantity > stock ? item.quantity - stock : 0;
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        {item.image_url && (
                          <img src={item.image_url} alt={item.name}
                            style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.name}
                          </p>
                          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>
                            Qty: {item.quantity}
                            {backorder > 0 && (
                              <span style={{ color: '#f59e0b', marginLeft: 4 }}>· {backorder} on backorder</span>
                            )}
                          </p>
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', flexShrink: 0 }}>
                          {fmt(item.price * item.quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Promo code */}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14, marginBottom: 14 }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Tag size={10} /> Promo code
                  </p>
                  <PromoCodeInput
                    orderValue={subtotal}
                    exchangeRateToKes={1} 
                    onApplied={() => {}}
                    onCleared={() => {}}
                    disabled={loading}
                    symbol="KES"
                  />
                </div>

                {/* Store credit */}
                {user && availableCredit > 0 && (
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14, marginBottom: 14 }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Wallet size={10} /> Store credit
                    </p>

                    {/* Checkbox row */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !applyCredit;
                        setApplyCredit(next);
                        if (next) {
                          const max = Math.min(availableCredit, preCredit);
                          setCreditInput(String(max.toFixed(0)));
                          setCreditCalculating(true);
                          clearTimeout(creditDebounce.current);
                          creditDebounce.current = setTimeout(() => setCreditCalculating(false), 350);
                        } else {
                          setCreditInput('');
                          setCreditCalculating(false);
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                        border: `1.5px solid ${applyCredit ? '#a855f7' : '#e5e7eb'}`,
                        background: applyCredit ? 'rgba(168,85,247,0.04)' : 'white',
                        fontFamily: 'inherit', transition: 'all 150ms',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, border: `2px solid ${applyCredit ? '#a855f7' : '#d1d5db'}`,
                          background: applyCredit ? '#a855f7' : 'white', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 150ms',
                        }}>
                          {applyCredit && <div style={{ width: 6, height: 6, background: 'white', borderRadius: 1 }} />}
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>
                          Apply store credit
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>
                        {fmt(availableCredit)} available
                      </span>
                    </button>

                    {/* Amount input — shown when checked */}
                    {applyCredit && (
                      <div style={{ marginTop: 10 }}>
                        <label style={{ ...labelStyle, marginBottom: 5 }}>
                          Amount to use (max {fmt(Math.min(availableCredit, preCredit))})
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{
                            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.78rem', color: '#9ca3af', pointerEvents: 'none',
                          }}>KES</span>
                          <input
                            type="number"
                            min="1"
                            max={Math.min(availableCredit, preCredit)}
                            value={creditInput}
                            onChange={e => {
                              setCreditInput(e.target.value);
                              setCreditCalculating(true);
                              clearTimeout(creditDebounce.current);
                              creditDebounce.current = setTimeout(() => setCreditCalculating(false), 350);
                            }}
                            onBlur={e => {
                              const max = Math.min(availableCredit, preCredit);
                              const val = Math.min(Math.max(0, parseFloat(e.target.value) || 0), max);
                              setCreditInput(String(val.toFixed(0)));
                            }}
                            style={{ ...inputStyle, paddingLeft: 38 }}
                            onFocus={inputFocus}
                          />
                          {creditCalculating && (
                            <Loader2 size={13} style={{
                              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                              color: '#a855f7', animation: 'spin 700ms linear infinite',
                            }} />
                          )}
                        </div>
                        <style>{`@keyframes spin{to{transform:translateY(-50%) rotate(360deg)}}`}</style>
                      </div>
                    )}
                  </div>
                )}

                {/* Totals */}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Subtotal', value: fmt(subtotal) },
                    ...(promoDiscount > 0   ? [{ label: 'Promo discount',  value: `−${fmt(promoDiscount)}`,  color: '#a855f7' }] : []),
                    ...(creditDeduction > 0 ? [{ label: 'Store credit',    value: `−${fmt(creditDeduction)}`, color: '#059669' }] : []),
                    { label: 'Tax (16%)', value: fmt(tax) },
                    { label: 'Shipping',  value: shipping === 0 ? 'Free' : fmt(shipping) },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ color: '#6b7280' }}>{label}</span>
                      <span style={{ fontWeight: 600, color: color || '#374151' }}>{value}</span>
                    </div>
                  ))}

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    paddingTop: 10, marginTop: 4, borderTop: '1px solid #e5e7eb',
                  }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827' }}>Total</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>{fmt(total)}</span>
                  </div>

                  {/* Referral note */}
                  <div style={{
                    padding: '8px 10px', borderRadius: 8, marginTop: 4,
                    background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)',
                    fontSize: '0.7rem', color: '#7c3aed',
                    display: 'flex', alignItems: 'flex-start', gap: 6,
                  }}>
                    <Tag size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                    Referral discounts are automatically applied on the server when eligible.
                  </div>
                </div>

                {/* Submit */}
                <button type="submit" disabled={loading} style={{
                  width: '100%', marginTop: 20, padding: '13px',
                  borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  background: loading ? 'rgba(168,85,247,0.5)' : 'linear-gradient(135deg,#a855f7,#7c3aed)',
                  color: 'white', boxShadow: loading ? 'none' : '0 4px 16px rgba(168,85,247,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'box-shadow 150ms',
                }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 6px 24px rgba(168,85,247,0.5)'; }}
                  onMouseLeave={e => { if (!loading) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.35)'; }}
                >
                  <Lock size={15} />
                  {loading ? 'Placing order…' : 'Place order'}
                </button>

                <p style={{ fontSize: '0.68rem', color: '#9ca3af', textAlign: 'center', margin: '10px 0 0' }}>
                  By placing your order, you agree to our Terms &amp; Conditions
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>

      <Footer />
    </div>
  );
}