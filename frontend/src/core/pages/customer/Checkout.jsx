import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Package, Truck, CreditCard, Tag, Loader2, Gift } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import PolicyConsentCheckbox from '../../../_shared/components/legal/shared/PolicyConsentCheckbox';
import { useCartStore, useAuthStore } from '../../../_shared/store/index';
import checkoutAPI from '../../../_shared/api/checkout';
import { toApiItem } from '../../../_shared/lib/cartItems';
import OrderBreakdown from '../../../_shared/components/common/OrderBreakdown';
import SummaryLedger from '../../../_shared/components/common/SummaryLedger';
import useCheckoutPrefs from '../../../_shared/store/checkoutPrefsStore';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const input = { width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.875rem', border: '1.5px solid #e5e7eb', fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' };
const label = { fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 };
const card = { background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 20, minWidth: 0 };
const title = { fontSize: '0.875rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px', paddingBottom: 12, borderBottom: '1px solid #f3f4f6' };

function Choice({ active, onClick, label: text, sub, disabled }) {
  return (
    <button type="button" onClick={() => !disabled && onClick()} disabled={disabled} style={{
      display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', borderRadius: 10, fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      border: `1.5px solid ${active ? 'var(--color-primary-500)' : '#e5e7eb'}`, background: active ? 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)' : 'white',
    }}>
      <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{text}</span>
      {sub && <span style={{ display: 'block', fontSize: '0.72rem', color: '#9ca3af', marginTop: 1 }}>{sub}</span>}
    </button>
  );
}

/** The cart line as the server wants it: ids and quantities only — prices are worked out by the books. */

export default function Checkout() {
  const navigate = useNavigate();
  const { items, clearCart } = useCartStore();
  const { user, fetchCustomer } = useAuthStore();
  const [opts, setOpts] = useState(null);
  const prefs = useCheckoutPrefs();               // delivery method and promo code were chosen in the cart
  const [form, setForm] = useState({ customer_email: user?.email || '', customer_phone: user?.phone || '', shipping_address: '', customer_notes: '', gift_voucher_code: '', phone: user?.phone || '' });
  const giftPicked = prefs.gift_codes;
  const setGiftPicked = (fn) => prefs.set({ gift_codes: typeof fn === 'function' ? fn(useCheckoutPrefs.getState().gift_codes) : fn });
  const [mode, setMode] = useState('online');       // online | pay_later | account
  const [methodId, setMethodId] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);      // { attemptId, orderId }
  const [policies, setPolicies] = useState([]);
  const done = useRef(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => { if (user) fetchCustomer(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    checkoutAPI.options().then((o) => {
      setOpts(o);
      const first = o.payment_methods[0];
      if (first) setMethodId(first.id); else setMode('pay_later');
      const ship = o.shipping ?? [];
      if (ship.length && !ship.some((x) => x.slug === useCheckoutPrefs.getState().delivery_method)) prefs.set({ delivery_method: ship[0].slug });
    }).catch((e) => toast.error(errMsg(e, 'Could not load checkout options')));
  }, []);

  const payload = useCallback(() => ({
    items: items.map(toApiItem), delivery_method: prefs.delivery_method || undefined,
    promo_code: prefs.promo_code.trim() || undefined, gift_voucher_code: form.gift_voucher_code.trim() || undefined,
    gift_voucher_codes: giftPicked ?? undefined,
  }), [items, prefs.delivery_method, prefs.promo_code, form.gift_voucher_code, giftPicked]);

  // the books price the cart — refresh whenever anything that changes the price changes
  useEffect(() => {
    if (!items.length) return undefined;
    const t = setTimeout(async () => {
      setQuoting(true);
      try {
        const q = await checkoutAPI.quote(payload());
        setQuote(q); setQuoteError(null);
        if (giftPicked === null && q.available?.gift_vouchers?.length) setGiftPicked(q.available.gift_vouchers.map((g) => g.code));   // ticked for them; they can untick
      }
      catch (e) { setQuote(null); setQuoteError(errMsg(e, 'Could not price your cart')); }
      finally { setQuoting(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [payload, items.length, giftPicked]);

  // after an M-Pesa prompt, wait for the confirmation
  useEffect(() => {
    if (!pending) return undefined;
    let n = 0;
    const iv = setInterval(async () => {
      n += 1;
      try {
        const a = await checkoutAPI.attempt(pending.attemptId, n % 3 === 0);
        if (a.status === 'confirmed') {
          clearInterval(iv); done.current = true; clearCart(); prefs.reset();
          toast.success('Payment received — thank you!'); navigate(`/orders/${pending.orderId}`);
        } else if (a.status === 'failed' || a.status === 'cancelled') {
          clearInterval(iv); setPending(null); toast.error(a.failure_reason || 'The payment did not go through. Your order is saved — you can pay it from My orders.', { duration: 8000 });
          done.current = true; clearCart(); prefs.reset(); navigate(`/orders/${pending.orderId}`);
        }
      } catch { /* keep polling */ }
      if (n > 40) clearInterval(iv);
    }, 4000);
    return () => clearInterval(iv);
  }, [pending, clearCart, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!items.length) { toast.error('Your cart is empty'); return; }
    setBusy(true);
    try {
      const res = await checkoutAPI.place({
        ...payload(), customer_email: form.customer_email, customer_phone: form.customer_phone, shipping_address: form.shipping_address,
        customer_notes: form.customer_notes || undefined, payment_mode: mode, payment_method_id: mode === 'online' ? methodId : undefined, phone: form.phone || form.customer_phone,
        ...(policies.length ? { policy_acceptances: policies } : {}),
      });
      if (res.status === 'awaiting_payment') { toast.success(res.message); setPending({ attemptId: res.attempt.id, orderId: res.order.id }); return; }
      toast.success(res.message);
      done.current = true; clearCart(); prefs.reset(); navigate(`/orders/${res.order.id}`);
    } catch (err) {
      toast.error(errMsg(err, 'Could not place your order'), { duration: 8000 });
    } finally { setBusy(false); }
  };

  if (!items.length && !done.current && !pending) { navigate('/cart'); return null; }
  const cur = quote?.currency;
  const money = (n) => formatMoney(n, cur);
  const method = opts?.payment_methods.find((m) => m.id === methodId);

  const ship = opts?.shipping?.find((o) => o.slug === prefs.delivery_method);
  const gifts = quote?.available?.gift_vouchers ?? [];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, maxWidth: 1000, margin: '0 auto', padding: '32px 16px', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary-500)', margin: '0 0 4px' }}>Confirm your order</h1>
        <p style={{ margin: '0 0 24px', fontSize: '0.85rem', color: '#6b7280' }}>Check everything below, choose how you will pay, and place the order. <Link to="/cart" style={{ color: 'var(--color-primary-500)' }}>Back to cart</Link></p>

        {pending && (
          <div role="status" style={{ ...card, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(16,185,129,0.06)' }}>
            <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <div>
              <strong>Waiting for your M-Pesa payment…</strong>
              <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>Enter your PIN on the prompt sent to your phone. This page updates by itself.</div>
            </div>
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'grid', gap: 20 }}>
          {/* The order, columnar like the voucher */}
          <div style={card}>
            <p style={title}><Package size={14} /> Your order</p>
            {quoteError && <p role="alert" style={{ color: '#991b1b', fontSize: '0.82rem' }}>{quoteError}</p>}
            {!quote && !quoteError && <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Pricing your cart…</p>}
            {quote && (
              <div style={{ opacity: quoting ? 0.6 : 1, display: 'grid', gap: 14 }}>
                <OrderBreakdown quote={quote} linesOnly />
                <div style={{ maxWidth: 460, marginLeft: 'auto', width: '100%' }}><SummaryLedger quote={quote} /></div>
              </div>
            )}
            <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
              <Truck size={12} style={{ verticalAlign: -2 }} /> Delivery: <strong>{ship?.name ?? 'not chosen'}</strong>
              {prefs.promo_code && <> · <Tag size={12} style={{ verticalAlign: -2 }} /> Promo: <strong>{prefs.promo_code}</strong></>}
              {' '}· <Link to="/cart" style={{ color: 'var(--color-primary-500)' }}>change in cart</Link>
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'start' }}>
            <div style={card}>
              <p style={title}><CreditCard size={14} /> Contact and delivery address</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
                <div><label style={label}>Email *</label><input required type="email" value={form.customer_email} onChange={set('customer_email')} style={input} /></div>
                <div><label style={label}>Phone *</label><input required value={form.customer_phone} onChange={set('customer_phone')} placeholder="+254…" style={input} /></div>
              </div>
              <label style={{ ...label, marginTop: 14 }}>Delivery address *</label>
              <textarea required rows={3} value={form.shipping_address} onChange={set('shipping_address')} placeholder="Street, estate, city…" style={{ ...input, resize: 'none' }} />
              <label style={{ ...label, marginTop: 14 }}>Notes (optional)</label>
              <textarea rows={2} value={form.customer_notes} onChange={set('customer_notes')} style={{ ...input, resize: 'none' }} />
            </div>

            <div style={card}>
              <p style={title}><CreditCard size={14} /> How will you pay?</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {(opts?.payment_methods ?? []).map((m) => (
                  <Choice key={m.id} active={mode === 'online' && methodId === m.id} onClick={() => { setMode('online'); setMethodId(m.id); }} label={m.name} sub={m.instructions || 'Pay now'} />
                ))}
                <Choice active={mode === 'pay_later'} onClick={() => setMode('pay_later')} label="Pay later" sub="Place the order; we'll confirm payment and delivery with you" />
                {opts?.account && (
                  <Choice active={mode === 'account'} onClick={() => setMode('account')} disabled={opts.account.available_base <= 0}
                    label="Charge to my account" sub={opts.account.available_base > 0 ? `Invoiced now · due in ${opts.account.terms_days} days · ${formatMoney(opts.account.available_base, opts.base_currency.code)} available` : 'No credit available'} />
                )}
              </div>
              {mode === 'online' && method?.gateway === 'mpesa_stk' && (
                <div style={{ marginTop: 14 }}>
                  <label style={label}>M-Pesa number</label>
                  <input value={form.phone} onChange={set('phone')} placeholder="07XX XXX XXX" style={input} />
                </div>
              )}
              {gifts.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <label style={label}><Gift size={12} style={{ verticalAlign: -2 }} /> Your gift vouchers{mode === 'pay_later' && <span style={{ fontWeight: 400, color: '#6b7280' }}> — nothing is spent now; applied when your order is paid</span>}</label>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {gifts.map((g) => {
                      const on = (giftPicked ?? []).includes(g.code);
                      const used = quote.gift?.vouchers?.find((v) => v.code === g.code)?.applied;
                      return (
                        <label key={g.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: on ? 'rgba(16,185,129,0.06)' : 'white', cursor: 'pointer', fontSize: '0.82rem' }}>
                          <input type="checkbox" checked={on} onChange={() => setGiftPicked((cur) => ((cur ?? []).includes(g.code) ? cur.filter((c) => c !== g.code) : [...(cur ?? []), g.code]))} />
                          <span style={{ flex: 1 }}><strong>{g.code}</strong> <span style={{ color: '#6b7280' }}>· balance {money(g.balance)}{g.expires_at ? ` · expires ${g.expires_at}` : ''}</span></span>
                          <span style={{ fontWeight: 700, color: on ? '#059669' : '#9ca3af' }}>{on ? `${mode === 'pay_later' ? 'will apply' : 'applies'} ${money(used ?? g.applicable)}` : `could cover ${money(g.applicable)}`}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {opts?.gift_vouchers_enabled && (
                <div style={{ marginTop: 14 }}>
                  <label style={label}><Gift size={12} style={{ verticalAlign: -2 }} /> {gifts.length ? 'Another gift voucher code' : 'Gift voucher code'}</label>
                  <input value={form.gift_voucher_code} onChange={set('gift_voucher_code')} placeholder="Optional" style={input} />
                </div>
              )}
            </div>
          </div>

          <div style={card}>
            <PolicyConsentCheckbox policyKeys={['standard_order_policy']} actionContext="standard_checkout" onChange={(_ok, acc) => setPolicies(acc)} disabled={busy} />
            <button type="submit" disabled={busy || !quote || !!pending} style={{ width: '100%', marginTop: 14, padding: 14, borderRadius: 10, border: 'none', fontWeight: 800, fontSize: '0.9rem', color: 'white', cursor: busy || !quote ? 'not-allowed' : 'pointer', opacity: busy || !quote ? 0.6 : 1, background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', fontFamily: 'inherit' }}>
              <Lock size={14} style={{ verticalAlign: -2 }} /> {busy ? 'Placing…' : mode === 'online' ? 'Pay and place order' : 'Place order'}
            </button>
            <p style={{ margin: '10px 0 0', fontSize: '0.74rem', color: '#9ca3af', textAlign: 'center' }}>Your order is saved under <Link to="/orders" style={{ color: 'var(--color-primary-500)' }}>My orders</Link> as soon as it is placed.</p>
          </div>
        </form>
      </div>
      <Footer />
    </div>
  );
}
