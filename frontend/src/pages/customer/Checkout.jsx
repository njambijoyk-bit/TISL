import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, AlertTriangle, Tag, ChevronRight, Package, Truck, CreditCard, X, Wallet, Loader2 } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import PolicyConsentCheckbox from '../../components/legal/shared/PolicyConsentCheckbox';
import PromoCodeInput from '../../components/common/PromoCodeInput';
import { useCartStore, useAuthStore } from '../../store';
import useOrderStore from '../../store/orderStore';
import usePromoCodeStore from '../../store/promoCodeStore';
import api from '../../api/axios';
import shippingAPI from '../../api/shipping';
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

function RadioCard({ value, current, onChange, label, sub, icon, disabled }) {
  const active = current === value;
  return (
    <button type="button" onClick={() => !disabled && onChange(value)} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 10, textAlign: 'left',
      border: `1.5px solid ${active ? '#a855f7' : '#e5e7eb'}`,
      background: disabled ? '#fbfaf9' : active ? 'rgba(168,85,247,0.04)' : 'white',
      cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', width: '100%',
      transition: 'all 150ms', opacity: disabled ? 0.6 : 1,
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${disabled ? '#e5e7eb' : active ? '#a855f7' : '#d1d5db'}`,
        background: active ? '#a855f7' : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 150ms',
      }}>
        {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: disabled ? '#ef4444' : '#111827', margin: '0 0 1px' }}>{label}</p>
        {sub && <p style={{ fontSize: '0.72rem', color: disabled ? '#fca5a5' : '#9ca3af', margin: 0 }}>{sub}</p>}
      </div>
      {icon && <span style={{ color: active ? '#a855f7' : '#d1d5db', flexShrink: 0 }}>{icon}</span>}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Checkout() {
  const navigate = useNavigate();
  const { items, getTotal, clearCart }    = useCartStore();
  const { user, customer, fetchCustomer } = useAuthStore();
  const { createOrder }                   = useOrderStore();
  const { appliedPromo, clearPromo }      = usePromoCodeStore();
  const [loading, setLoading]             = useState(false);
  const [errors,  setErrors]              = useState({});
  
  const submittedRef = useRef(false);

  const [shippingOptions, setShippingOptions] = useState([]);

  const [storeCreditMaxPct, setStoreCreditMaxPct] = useState(50); // default 50 until loaded

  useEffect(() => {
    if (user) {
      fetchCustomer();
      api.get('/customer/loyalty').then(r => {
        setStoreCreditMaxPct(r.data.store_credit_max_pct ?? 50);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (user) fetchCustomer();// re-sync customer data when checkout opens
  }, []);

  useEffect(() => {
    shippingAPI.getActiveOptions().then(opts => {
      setShippingOptions(opts);
      // Default to first option if available
      if (opts.length > 0 && !opts.find(o => o.slug === 'standard_delivery')) {
        setForm(f => ({ ...f, delivery_method: opts[0].slug }));
      }
    }).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    customer_email:    user?.email || '',
    customer_phone:    user?.phone || '',
    shipping_address:  '',
    delivery_method:   'standard_delivery',
    payment_method:    'mpesa',
    customer_notes:    '',
    partialCredit:       false,
    creditAccountAmount: '',
  });

  const availableCredit                         = parseFloat(customer?.store_credit ?? 0);
  const [applyCredit,      setApplyCredit]      = useState(false);
  const [creditInput,      setCreditInput]      = useState('');
  const [creditCalculating,setCreditCalculating]= useState(false);

  const [policyAccepted,    setPolicyAccepted]    = useState(false);
  const [policyAcceptances, setPolicyAcceptances] = useState([]);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
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
    if (form.payment_method === 'credit') {
      if (!customer?.has_credit_account) {
        e.payment_method = 'You do not have an approved credit account. Contact Support for assistance.';
      } else if (form.partialCredit) {
        const amt = parseFloat(form.creditAccountAmount);
        const available = Math.max(0, (customer.credit_limit ?? 0) - (customer.credit_used ?? 0));
        if (!amt || amt <= 0)      e.creditAccountAmount = 'Please enter a credit amount greater than 0';
        else if (amt > available)  e.creditAccountAmount = `Amount exceeds your available credit (${fmt(available)})`;
        else if (amt > preCredit)  e.creditAccountAmount = 'Amount cannot exceed the order total';
        else if (amt > postStoreCreditTotal) e.creditAccountAmount = 'Amount cannot exceed the order total';
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) { toast.error('Please fill in all required fields'); return; }
    if (items.length === 0) { toast.error('Your cart is empty'); return; }
    try {
      setLoading(true);
      // Strip frontend-only fields from form before sending
      const { partialCredit, creditAccountAmount, ...formFields } = form;

      const creditAccountDeduction = form.payment_method === 'credit'
        ? partialCredit
          ? Math.min(
              parseFloat(creditAccountAmount) || 0,
              Math.max(0, (customer?.credit_limit ?? 0) - (customer?.credit_used ?? 0)),
              preCredit,
            )
          : preCredit
        : 0;
      const orderData = {
        ...formFields,
        items: items.map(item => ({ product_id: item.id, item_type: 'product', quantity: item.quantity })),
        ...(appliedPromo ? { promo_code: appliedPromo.code } : {}),
        ...(applyCredit && creditDeduction > 0 ? {
          apply_store_credit: true,
          store_credit_amount: creditDeduction,
        } : {}),
        // credit account
        ...(form.payment_method === 'credit' && form.partialCredit && creditAccountDeduction > 0 ? {
          apply_credit_account:  true,
          credit_account_amount: creditAccountDeduction,
        } : {}),
        // policy consent
        ...(policyAcceptances.length ? { policy_acceptances: policyAcceptances } : {}), 
      };
      const res = await createOrder(orderData);
      toast.success('Order placed successfully!');
      submittedRef.current = true;  // ← suppress the empty cart redirect
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
  const selectedShipping = shippingOptions.find(o => o.slug === form.delivery_method);
  const shipping         = !selectedShipping ? 0
                         : (selectedShipping.free_above && subtotal >= parseFloat(selectedShipping.free_above)) ? 0
                         : parseFloat(selectedShipping.cost);
  const preCredit       = subtotal - promoDiscount + tax + shipping;
  const maxStoreCredit = Math.round(preCredit * (storeCreditMaxPct / 100));
  const creditDeduction = applyCredit
    ? Math.min(parseFloat(creditInput) || 0, availableCredit, maxStoreCredit)
    : 0;

  const postStoreCreditTotal = preCredit - creditDeduction;

  const creditAccountDeductionDisplay = form.payment_method === 'credit'
    ? form.partialCredit
      ? Math.min(
          parseFloat(form.creditAccountAmount) || 0,
          Math.max(0, (customer?.credit_limit ?? 0) - (customer?.credit_used ?? 0)),
          postStoreCreditTotal,
        )
      : postStoreCreditTotal
    : 0;

  const total = postStoreCreditTotal - creditAccountDeductionDisplay;

  const fmt = (n) => Number(n).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
  
  const paymentOptions = [
    { value: 'mpesa',           label: 'M-Pesa',          sub: 'Pay via mobile money'              },
    { value: 'bank_transfer',   label: 'Bank transfer',   sub: 'EFT or RTGS payment'               },
    { value: 'pay_on_delivery', label: 'Pay on delivery', sub: 'Cash on receipt'                   },
    { value: 'request_invoice', label: 'Request invoice', sub: 'For corporate & LPO orders'        },
    ...(customer?.has_credit_account ? [{
      value: 'credit',
      label: 'Credit account',
      sub: Math.max(0, (customer.credit_limit ?? 0) - (customer.credit_used ?? 0)) < 1
        ? 'No credit balance available'
        : `Use your approved credit facility · ${fmt(Math.max(0, (customer.credit_limit ?? 0) - (customer.credit_used ?? 0)))} available`,
      disabled: Math.max(0, (customer.credit_limit ?? 0) - (customer.credit_used ?? 0)) < 1,
    }] : customer ? [{
      value: 'credit_locked',
      label: 'Credit account',
      sub: 'You do not have an approved credit account. Contact Support for assistance.',
      disabled: true,
    }] : []),
  ];

  if (items.length === 0 && !submittedRef.current) { navigate('/cart'); return null; }

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
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 340px',
            gap: 24,
            alignItems: 'start',
          }}>

            {/* ── Left: form ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, order: isMobile ? 2 : 1 }}>

              {/* Contact */}
              <div style={card}>
                <p style={sectionTitle}>
                  <CreditCard size={14} style={{ color: '#a855f7' }} /> Contact information
                </p>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 16,
                }}>
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
                  {shippingOptions.map(opt => (
                    <RadioCard
                      key={opt.slug}
                      value={opt.slug}
                      label={opt.name}
                      sub={`${opt.description || ''}${opt.description ? ' · ' : ''}${parseFloat(opt.cost) === 0 ? 'Free' : `KES ${Number(opt.cost).toLocaleString()}`}${opt.free_above ? ` (free above KES ${Number(opt.free_above).toLocaleString()})` : ''}`}
                      icon={opt.icon === 'Package' ? <Package size={16} /> : <Truck size={16} />}
                      current={form.delivery_method}
                      onChange={v => setForm(f => ({ ...f, delivery_method: v }))}
                    />
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
                  {paymentOptions.map(opt => (
                    <RadioCard key={opt.value} {...opt} current={form.payment_method} onChange={v => setForm(f => ({ ...f, payment_method: v }))} />
                  ))}
                  
                  {errors.payment_method && (
                    <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 6 }}>
                      {errors.payment_method}
                    </p>
                  )}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, order: isMobile ? 1 : 2 }}>
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
                          const max = Math.min(availableCredit, maxStoreCredit);
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
                          Amount to use (max {storeCreditMaxPct}% · {fmt(Math.min(availableCredit, maxStoreCredit))})
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{
                            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.78rem', color: '#9ca3af', pointerEvents: 'none',
                          }}>KES</span>
                          <input
                            type="number"
                            min="1"
                            max={Math.min(availableCredit, maxStoreCredit)}
                            value={creditInput}
                            onChange={e => {
                              setCreditInput(e.target.value);
                              setCreditCalculating(true);
                              clearTimeout(creditDebounce.current);
                              creditDebounce.current = setTimeout(() => setCreditCalculating(false), 350);
                            }}
                            onBlur={e => {
                              const max = Math.min(availableCredit, maxStoreCredit);
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

                {form.payment_method === 'credit' && customer?.has_credit_account && (() => {
                  const available = Math.max(0, (customer.credit_limit ?? 0) - (customer.credit_used ?? 0));
                  return (
                    <div style={{ marginTop: 16, padding: '14px', borderRadius: 10, background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.18)' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed', margin: '0 0 10px' }}>
                        Credit account — {fmt(available)} available
                      </p>

                      {/* Full vs partial toggle */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        {[
                          { val: false, label: 'Full order on credit' },
                          { val: true,  label: 'Partial credit'       },
                        ].map(({ val, label }) => (
                          <button key={String(val)} type="button"
                            onClick={() => setForm(f => ({ ...f, partialCredit: val, creditAccountAmount: '' }))}
                            style={{
                              flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700,
                              fontFamily: 'inherit', cursor: 'pointer',
                              border: `1.5px solid ${form.partialCredit === val ? '#a855f7' : '#e5e7eb'}`,
                              background: form.partialCredit === val ? 'rgba(168,85,247,0.08)' : 'white',
                              color: form.partialCredit === val ? '#7c3aed' : '#9ca3af',
                              transition: 'all 150ms',
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Partial amount input */}
                      {form.partialCredit && (
                        <div>
                          <label style={labelStyle}>
                            Amount on credit (max {fmt(Math.min(available, postStoreCreditTotal))})
                          </label>
                          <div style={{ position: 'relative' }}>
                            <span style={{
                              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                              fontSize: '0.78rem', color: '#9ca3af', pointerEvents: 'none',
                            }}>KES</span>
                            <input
                              type="number" min="1" max={Math.min(available, postStoreCreditTotal)}
                              value={form.creditAccountAmount ?? ''}
                              onChange={e => {
                                setForm(f => ({ ...f, creditAccountAmount: e.target.value }));
                                if (errors.creditAccountAmount) setErrors(er => ({ ...er, creditAccountAmount: '' }));
                              }}
                              onBlur={e => {
                                const max = Math.min(available, postStoreCreditTotal);
                                const val = Math.min(Math.max(0, parseFloat(e.target.value) || 0), max);
                                setForm(f => ({ ...f, creditAccountAmount: String(val.toFixed(0)) }));
                              }}
                              style={{
                                ...inputStyle, paddingLeft: 38,
                                borderColor: errors.creditAccountAmount ? '#ef4444' : '#e5e7eb',
                              }}
                              onFocus={inputFocus}
                            />
                          </div>
                          {errors.creditAccountAmount && (
                            <p style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3 }}>
                              {errors.creditAccountAmount}
                            </p>
                          )}
                        </div>
)}

                      {/* What remains to pay */}
                      {form.partialCredit && form.creditAccountAmount > 0 && (
                        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 8, margin: '8px 0 0' }}>
                          Remaining to pay by other means: <strong style={{ color: '#111827' }}>{fmt(Math.max(0, postStoreCreditTotal - parseFloat(form.creditAccountAmount || 0)))}</strong>
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Totals */}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Subtotal', value: fmt(subtotal) },
                    ...(promoDiscount > 0   ? [{ label: 'Promo discount',  value: `−${fmt(promoDiscount)}`,  color: '#a855f7' }] : []),
                    ...(creditDeduction > 0 ? [{ label: 'Store credit',    value: `−${fmt(creditDeduction)}`, color: '#059669' }] : []),
                    ...(creditAccountDeductionDisplay > 0 ? [{ label: 'Credit account', value: `−${fmt(creditAccountDeductionDisplay)}`, color: '#7c3aed' }] : []),
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

                {/* Policy consent — replaces the static text */}
                <PolicyConsentCheckbox
                  policyKeys={['standard_order_policy']}
                  actionContext="standard_checkout"
                  onChange={(isChecked, acceptances) => {
                    setPolicyAccepted(isChecked);
                    setPolicyAcceptances(acceptances);
                  }}
                  disabled={loading}
                />

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !policyAccepted}
                  style={{
                    width: '100%', marginTop: 12, padding: '13px',
                    borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
                    border: 'none',
                    cursor: (loading || !policyAccepted) ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    background: (loading || !policyAccepted)
                      ? 'rgba(168,85,247,0.4)'
                      : 'linear-gradient(135deg,#a855f7,#7c3aed)',
                    color: 'white',
                    boxShadow: (loading || !policyAccepted) ? 'none' : '0 4px 16px rgba(168,85,247,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'box-shadow 150ms', opacity: !policyAccepted ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!loading && policyAccepted) e.currentTarget.style.boxShadow = '0 6px 24px rgba(168,85,247,0.5)'; }}
                  onMouseLeave={e => { if (!loading && policyAccepted) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.35)'; }}
                >
                  <Lock size={15} />
                  {loading ? 'Placing order…' : 'Place order'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <Footer />
    </div>
  );
}