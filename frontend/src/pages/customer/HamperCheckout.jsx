import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, Package, Truck, Tag, Wallet, Loader2, ChevronLeft, CheckCircle, AlertCircle } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import hampersAPI from '../../api/hampers';
import { useAuthStore } from '../../store';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

// ── Accent-aware style factories ──────────────────────────────────────────────

const makeInputStyle = () => ({
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.875rem',
  border: '1.5px solid #e5e7eb', color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box', background: 'white',
});

const labelStyle = { fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 };

const cardStyle = {
  background: 'white', borderRadius: 14,
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
  padding: 24,
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
      style={{ ...makeInputStyle(), borderColor: error ? '#ef4444' : '#e5e7eb' }}
      onFocus={e => { e.currentTarget.style.borderColor = window.__hamperAccent || '#a855f7'; e.currentTarget.style.boxShadow = `0 0 0 3px ${window.__hamperAccent || '#a855f7'}18`; }}
      onBlur={e  => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
    />
  );
}

function RadioCard({ value, current, onChange, label, sub, accent }) {
  const active = current === value;
  return (
    <button type="button" onClick={() => onChange(value)} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 10, textAlign: 'left',
      border: `1.5px solid ${active ? accent : '#e5e7eb'}`,
      background: active ? `${accent}08` : 'white',
      cursor: 'pointer', fontFamily: 'inherit', width: '100%',
      transition: 'all 150ms',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${active ? accent : '#d1d5db'}`,
        background: active ? accent : 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 150ms',
      }}>
        {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 1px' }}>{label}</p>
        {sub && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{sub}</p>}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HamperCheckout() {
  const { slug }            = useParams();
  const navigate            = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [checkoutData, setCheckoutData] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [errors,       setErrors]       = useState({});
  const [blocked,      setBlocked]      = useState(null);

  // promo
  const [promoInput,    setPromoInput]   = useState('');
  const [promoLoading,  setPromoLoading] = useState(false);
  const [appliedPromo,  setAppliedPromo] = useState(null); // { code, discount, referral_code_id }
  const [promoError,    setPromoError]   = useState('');

  // store credit
  const [applyCredit,        setApplyCredit]       = useState(false);
  const [creditInput,        setCreditInput]        = useState('');
  const [creditCalculating,  setCreditCalculating]  = useState(false);
  const creditDebounce = useRef(null);

  // form
  const [form, setForm] = useState({
    shipping_option_id: '',
    line1: '', line2: '', city: '', county: '', country: 'Kenya',
    notes: '',
  });

  useEffect(() => {
    if (!isAuthenticated) { navigate(`/login?redirect=/hampers/${slug}/checkout`); return; }
    hampersAPI.loadCheckout(slug)
      .then(data => {
        setCheckoutData(data);
        // default shipping
        if (data.shipping_options?.length > 0) {
          setForm(f => ({ ...f, shipping_option_id: String(data.shipping_options[0].id) }));
        }
        // set accent as a global so Input focus can read it (simple approach)
        window.__hamperAccent = data.accent_color || '#a855f7';
      })
      .catch(err => {
        if (err?.response?.status === 403) {
          setBlocked(err.response.data.message);
        } else {
          toast.error('Failed to load checkout');
          navigate(`/hampers/${slug}`);
        }
      })
      .finally(() => setLoading(false));

    return () => { delete window.__hamperAccent; };
  }, [slug, isAuthenticated]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
      <div style={{ width: 40, height: 40, border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (blocked) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <Lock size={40} style={{ color: '#ef4444', display: 'block', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Offer Not Available</h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 24px' }}>{blocked}</p>
          <button onClick={() => navigate('/hampers')} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#111827', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem' }}>Back to Deals</button>
        </div>
      </div>
      <Footer />
    </div>
  );

  if (!checkoutData) return null;

  const { hamper, shipping_options, store_credit, promo_allowed, apply_vat, accent_color, customer } = checkoutData;
  const accent     = accent_color || '#a855f7';
  const accentFade = `${accent}10`;
  const accentMid  = `${accent}28`;

  // ── Derived totals ──────────────────────────────────────────────────────────

  const selectedShipping = shipping_options.find(o => String(o.id) === String(form.shipping_option_id));
  const shippingCost     = selectedShipping
    ? (selectedShipping.free_above && (hamper.price) >= selectedShipping.free_above ? 0 : Number(selectedShipping.cost))
    : 0;

  const subtotal       = Number(hamper.price);
  const vatAmount      = apply_vat ? Math.round(subtotal * 0.16 * 100) / 100 : 0;
  const promoDiscount  = appliedPromo?.discount ?? 0;
  const creditBalance  = store_credit.allowed ? (store_credit.balance ?? 0) : 0;
  const maxStoreCredit = store_credit.max_apply ?? 500;
  const preCredit      = subtotal + vatAmount + shippingCost - promoDiscount;
  const creditDeduction = applyCredit ? Math.min(Math.max(0, parseFloat(creditInput) || 0), Math.min(creditBalance, preCredit, maxStoreCredit)) : 0;
  const total          = Math.max(0, preCredit - creditDeduction);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.line1)              e.line1   = 'Address is required';
    if (!form.city)               e.city    = 'City is required';
    if (!form.shipping_option_id) e.shipping = 'Select a shipping method';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleValidatePromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    try {
      const res = await hampersAPI.validatePromo(slug, promoInput.trim());
      setAppliedPromo({ code: res.code, discount: res.discount, referral_code_id: res.referral_code_id });
      toast.success(`Promo applied — ${fmt(res.discount)} off`);
    } catch (err) {
      setPromoError(err?.response?.data?.message || 'Invalid promo code');
      setAppliedPromo(null);
    } finally {
      setPromoLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) { toast.error('Please fill in all required fields'); return; }
    setSubmitting(true);
    try {
      const payload = {
        shipping_option_id: Number(form.shipping_option_id),
        shipping_address: {
          line1: form.line1, line2: form.line2,
          city: form.city, county: form.county, country: form.country,
        },
        notes: form.notes || undefined,
        ...(appliedPromo ? { promo_code: appliedPromo.code } : {}),
        ...(applyCredit && creditDeduction > 0 ? { store_credit_amount: creditDeduction } : {}),
      };
      const res = await hampersAPI.placeOrder(slug, payload);
      toast.success('Order placed successfully!');
      navigate('hampers/my-orders', { state: { newOrder: res.order_number } });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const SectionTitle = ({ icon: Icon, children }) => (
    <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 18px', paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
      <Icon size={16} style={{ color: accent }} /> {children}
    </p>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      {/* Accent top bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}80)` }} />

      <div style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '32px 24px' }}>

        {/* Back */}
        <button
          onClick={() => navigate(`/hampers/${slug}`)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 24, fontFamily: 'inherit' }}
        >
          <ChevronLeft size={16} /> Back to Deal
        </button>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28, alignItems: 'start' }}>

            {/* ── Left col ────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Hamper summary */}
              <div style={{ ...cardStyle, border: `1px solid ${accentMid}` }}>
                <SectionTitle icon={Package}>Your Hamper</SectionTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', borderRadius: 12, background: accentFade, border: `1px solid ${accentMid}`, marginBottom: 14 }}>
                  {hamper.cover_image ? (
                    <img src={hamper.cover_image} alt={hamper.name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: 10, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Package size={24} style={{ color: accent, opacity: 0.4 }} />
                    </div>
                  )}
                  <div>
                    <p style={{ margin: '0 0 2px', fontWeight: 800, fontSize: '0.95rem', color: '#111827' }}>{hamper.name}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>{hamper.items?.length ?? 0} items included</p>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: '1.1rem', fontWeight: 900, color: accent }}>{fmt(hamper.price)}</span>
                </div>
                {/* Item list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(hamper.items ?? []).map((item, i) => {
                    const snap = item.snapshot || {};
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {snap.main_image && <img src={snap.main_image} alt={snap.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                        <span style={{ flex: 1, fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>{snap.name}</span>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>x{item.quantity}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Shipping address */}
              <div style={cardStyle}>
                <SectionTitle icon={Truck}>Shipping Address</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <Field label="Address Line 1 *" error={errors.line1}>
                      <Input name="line1" value={form.line1} onChange={handleChange} placeholder="Street, building, floor" error={errors.line1} />
                    </Field>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <Field label="Address Line 2">
                      <Input name="line2" value={form.line2} onChange={handleChange} placeholder="Apartment, suite (optional)" />
                    </Field>
                  </div>
                  <Field label="City / Town *" error={errors.city}>
                    <Input name="city" value={form.city} onChange={handleChange} placeholder="Nairobi" error={errors.city} />
                  </Field>
                  <Field label="County">
                    <Input name="county" value={form.county} onChange={handleChange} placeholder="Nairobi County" />
                  </Field>
                  <Field label="Country">
                    <Input name="country" value={form.country} onChange={handleChange} placeholder="Kenya" />
                  </Field>
                </div>
              </div>

              {/* Shipping method */}
              <div style={cardStyle}>
                <SectionTitle icon={Truck}>Shipping Method</SectionTitle>
                {errors.shipping && <p style={{ fontSize: '0.72rem', color: '#ef4444', margin: '0 0 10px' }}>{errors.shipping}</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shipping_options.map(opt => {
                    const cost = opt.free_above && subtotal >= opt.free_above ? 0 : Number(opt.cost);
                    return (
                      <RadioCard
                        key={opt.id}
                        value={String(opt.id)}
                        current={form.shipping_option_id}
                        onChange={v => setForm(f => ({ ...f, shipping_option_id: v }))}
                        label={opt.name}
                        sub={cost === 0 ? 'Free' : fmt(cost)}
                        accent={accent}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div style={cardStyle}>
                <Field label="Order Notes (optional)">
                  <textarea
                    name="notes" value={form.notes} onChange={handleChange}
                    placeholder="Any special instructions…"
                    rows={3}
                    style={{ ...makeInputStyle(), resize: 'vertical' }}
                    onFocus={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}18`; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </Field>
              </div>
            </div>

            {/* ── Right col (order summary) ────────────────────────────────── */}
            <div style={{ position: 'sticky', top: 96, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ ...cardStyle, border: `1.5px solid ${accentMid}` }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', margin: '0 0 16px', paddingBottom: 12, borderBottom: `1px solid ${accentFade}` }}>
                  Order Summary
                </p>

                {/* Promo code */}
                {promo_allowed && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Tag size={10} /> Promo Code
                    </p>
                    {appliedPromo ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: `${accent}08`, border: `1px solid ${accentMid}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <CheckCircle size={14} style={{ color: accent }} />
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827' }}>{appliedPromo.code}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: accent }}>−{fmt(appliedPromo.discount)}</span>
                          <button type="button" onClick={() => { setAppliedPromo(null); setPromoInput(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', fontFamily: 'inherit' }}>×</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={promoInput}
                          onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoError(''); }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleValidatePromo(); } }}
                          placeholder="Enter promo code"
                          style={{ ...makeInputStyle(), flex: 1, fontSize: '0.78rem' }}
                          onFocus={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}18`; }}
                          onBlur={e  => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                        />
                        <button
                          type="button"
                          onClick={handleValidatePromo}
                          disabled={promoLoading || !promoInput.trim()}
                          style={{ padding: '9px 14px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, border: 'none', background: accent, color: 'white', cursor: 'pointer', fontFamily: 'inherit', opacity: promoLoading || !promoInput.trim() ? 0.5 : 1 }}
                        >
                          {promoLoading ? '…' : 'Apply'}
                        </button>
                      </div>
                    )}
                    {promoError && <p style={{ fontSize: '0.7rem', color: '#ef4444', margin: '5px 0 0' }}>{promoError}</p>}
                  </div>
                )}

                {/* Store credit */}
                {store_credit.allowed && creditBalance > 0 && (
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14, marginBottom: 14 }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Wallet size={10} /> Store Credit
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !applyCredit;
                        setApplyCredit(next);
                        if (next) {
                          const max = Math.min(creditBalance, preCredit, maxStoreCredit);
                          setCreditInput(String(max.toFixed(0)));
                          setCreditCalculating(true);
                          clearTimeout(creditDebounce.current);
                          creditDebounce.current = setTimeout(() => setCreditCalculating(false), 350);
                        } else {
                          setCreditInput('');
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                        border: `1.5px solid ${applyCredit ? accent : '#e5e7eb'}`,
                        background: applyCredit ? `${accent}06` : 'white',
                        fontFamily: 'inherit', transition: 'all 150ms',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${applyCredit ? accent : '#d1d5db'}`, background: applyCredit ? accent : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 150ms' }}>
                          {applyCredit && <div style={{ width: 6, height: 6, background: 'white', borderRadius: 1 }} />}
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>Apply store credit</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>{fmt(creditBalance)} available</span>
                    </button>

                    {applyCredit && (
                      <div style={{ marginTop: 10 }}>
                        <label style={{ ...labelStyle, marginBottom: 5 }}>Amount to use (max {fmt(Math.min(creditBalance, preCredit, maxStoreCredit))})</label>
                        {maxStoreCredit < creditBalance && (
                          <p style={{ fontSize: '0.68rem', color: '#d97706', margin: '0 0 6px' }}>Hamper orders max store credit: {fmt(maxStoreCredit)}</p>
                        )}
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', color: '#9ca3af', pointerEvents: 'none' }}>KES</span>
                          <input
                            type="number" min="1" max={Math.min(creditBalance, preCredit, maxStoreCredit)}
                            value={creditInput}
                            onChange={e => { setCreditInput(e.target.value); setCreditCalculating(true); clearTimeout(creditDebounce.current); creditDebounce.current = setTimeout(() => setCreditCalculating(false), 350); }}
                            onBlur={e => { const max = Math.min(creditBalance, preCredit, maxStoreCredit); const val = Math.min(Math.max(0, parseFloat(e.target.value) || 0), max); setCreditInput(String(val.toFixed(0))); }}
                            style={{ ...makeInputStyle(), paddingLeft: 38 }}
                            onFocus={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}18`; }}
                          />
                          {creditCalculating && <Loader2 size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: accent, animation: 'spin 700ms linear infinite' }} />}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Totals */}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Subtotal',       value: fmt(subtotal) },
                    ...(apply_vat              ? [{ label: 'VAT (16%)',       value: fmt(vatAmount) }] : []),
                    { label: 'Shipping',        value: shippingCost === 0 ? 'Free' : fmt(shippingCost) },
                    ...(promoDiscount > 0      ? [{ label: 'Promo discount',  value: `−${fmt(promoDiscount)}`,   color: accent }] : []),
                    ...(creditDeduction > 0    ? [{ label: 'Store credit',    value: `−${fmt(creditDeduction)}`, color: '#059669' }] : []),
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <span style={{ color: '#6b7280' }}>{label}</span>
                      <span style={{ fontWeight: 600, color: color || '#374151' }}>{value}</span>
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, marginTop: 4, borderTop: '1px solid #e5e7eb' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827' }}>Total</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>{fmt(total)}</span>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%', marginTop: 20, padding: '13px',
                    borderRadius: 10, fontSize: '0.9rem', fontWeight: 700,
                    border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    background: submitting ? `${accent}80` : accent,
                    color: 'white', boxShadow: submitting ? 'none' : `0 4px 16px ${accent}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'box-shadow 150ms',
                  }}
                  onMouseEnter={e => { if (!submitting) e.currentTarget.style.boxShadow = `0 6px 24px ${accent}60`; }}
                  onMouseLeave={e => { if (!submitting) e.currentTarget.style.boxShadow = `0 4px 16px ${accent}40`; }}
                >
                  <Lock size={15} />
                  {submitting ? 'Placing order…' : 'Place Order'}
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}