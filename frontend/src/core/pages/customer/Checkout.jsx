import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Package, Truck, CreditCard, Tag, Loader2, Gift } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import PolicyConsentCheckbox from '../../../_shared/components/legal/shared/PolicyConsentCheckbox';
import { useCartStore, useAuthStore } from '../../../_shared/store/index';
import useCurrencyStore from '../../../_shared/store/currencyStore';
import checkoutAPI from '../../../_shared/api/checkout';
import { toApiItem } from '../../../_shared/lib/cartItems';
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
  const displayCurrency = useCurrencyStore((s) => s.displayCurrency);
  const [opts, setOpts] = useState(null);
  const [form, setForm] = useState({ customer_email: user?.email || '', customer_phone: user?.phone || '', shipping_address: '', delivery_method: '', customer_notes: '', promo_code: '', gift_voucher_code: '', phone: user?.phone || '' });
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
      const ship = o.shipping?.[0];
      if (ship) setForm((f) => ({ ...f, delivery_method: f.delivery_method || ship.slug }));
    }).catch((e) => toast.error(errMsg(e, 'Could not load checkout options')));
  }, []);

  const payload = useCallback(() => ({
    items: items.map(toApiItem), currency: displayCurrency || undefined, delivery_method: form.delivery_method || undefined,
    promo_code: form.promo_code.trim() || undefined, gift_voucher_code: form.gift_voucher_code.trim() || undefined,
  }), [items, displayCurrency, form.delivery_method, form.promo_code, form.gift_voucher_code]);

  // the books price the cart — refresh whenever anything that changes the price changes
  useEffect(() => {
    if (!items.length) return undefined;
    const t = setTimeout(async () => {
      setQuoting(true);
      try { setQuote(await checkoutAPI.quote(payload())); setQuoteError(null); }
      catch (e) { setQuote(null); setQuoteError(errMsg(e, 'Could not price your cart')); }
      finally { setQuoting(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [payload, items.length]);

  // after an M-Pesa prompt, wait for the confirmation
  useEffect(() => {
    if (!pending) return undefined;
    let n = 0;
    const iv = setInterval(async () => {
      n += 1;
      try {
        const a = await checkoutAPI.attempt(pending.attemptId, n % 3 === 0);
        if (a.status === 'confirmed') {
          clearInterval(iv); done.current = true; clearCart();
          toast.success('Payment received — thank you!'); navigate(`/orders/${pending.orderId}`);
        } else if (a.status === 'failed' || a.status === 'cancelled') {
          clearInterval(iv); setPending(null); toast.error(a.failure_reason || 'The payment did not go through. Your order is saved — you can pay it from My orders.', { duration: 8000 });
          done.current = true; clearCart(); navigate(`/orders/${pending.orderId}`);
        }
      } catch { /* keep polling */ }
      if (n > 40) clearInterval(iv);
    }, 4000);
    return () => clearInterval(iv);
  }, [pending, clearCart, navigate]);

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
      done.current = true; clearCart(); navigate(`/orders/${res.order.id}`);
    } catch (err) {
      toast.error(errMsg(err, 'Could not place your order'), { duration: 8000 });
    } finally { setBusy(false); }
  };

  if (!items.length && !done.current && !pending) { navigate('/cart'); return null; }
  const cur = quote?.currency;
  const money = (n) => formatMoney(n, cur);
  const method = opts?.payment_methods.find((m) => m.id === methodId);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <div style={{ flex: 1, maxWidth: 1100, margin: '0 auto', padding: '32px 16px', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary-500)', margin: '0 0 24px' }}>Checkout</h1>

        {pending && (
          <div role="status" style={{ ...card, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(16,185,129,0.06)' }}>
            <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <div>
              <strong>Waiting for your M-Pesa payment…</strong>
              <div style={{ fontSize: '0.8rem', color: '#4b5563' }}>Enter your PIN on the prompt sent to your phone. This page updates by itself.</div>
            </div>
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={card}>
                <p style={title}><CreditCard size={14} /> Contact</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
                  <div><label style={label}>Email *</label><input required type="email" value={form.customer_email} onChange={set('customer_email')} style={input} /></div>
                  <div><label style={label}>Phone *</label><input required value={form.customer_phone} onChange={set('customer_phone')} placeholder="+254…" style={input} /></div>
                </div>
              </div>

              <div style={card}>
                <p style={title}><Package size={14} /> Delivery</p>
                <label style={label}>Delivery address *</label>
                <textarea required rows={3} value={form.shipping_address} onChange={set('shipping_address')} placeholder="Street, estate, city…" style={{ ...input, resize: 'none' }} />
                <p style={{ ...label, margin: '14px 0 8px' }}>Delivery method</p>
                <div style={{ display: 'grid', gap: 8 }}>
                  {(opts?.shipping ?? []).map((o) => (
                    <Choice key={o.slug} active={form.delivery_method === o.slug} onClick={() => setForm((f) => ({ ...f, delivery_method: o.slug }))}
                      label={<><Truck size={13} style={{ verticalAlign: -2 }} /> {o.name}</>}
                      sub={`${o.description ? `${o.description} · ` : ''}${Number(o.cost) === 0 ? 'Free' : o.display_cost?.formatted}${o.display_free_above ? ` · free above ${o.display_free_above.formatted}` : ''}`} />
                  ))}
                </div>
              </div>

              <div style={card}>
                <p style={title}><CreditCard size={14} /> Payment</p>
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
                {opts?.gift_vouchers_enabled && (
                  <div style={{ marginTop: 14 }}>
                    <label style={label}><Gift size={12} style={{ verticalAlign: -2 }} /> Gift voucher code</label>
                    <input value={form.gift_voucher_code} onChange={set('gift_voucher_code')} placeholder="Optional" style={input} />
                    {quote?.gift && <p style={{ fontSize: '0.72rem', color: '#059669', margin: '4px 0 0' }}>Applying {money(quote.gift.applied)} from {quote.gift.code}</p>}
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  <label style={label}><Tag size={12} style={{ verticalAlign: -2 }} /> Promo code</label>
                  <input value={form.promo_code} onChange={set('promo_code')} placeholder="Optional" style={input} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <label style={label}>Notes (optional)</label>
                  <textarea rows={2} value={form.customer_notes} onChange={set('customer_notes')} style={{ ...input, resize: 'none' }} />
                </div>
              </div>
            </div>

            <div style={card}>
              <p style={title}><Package size={14} /> Order summary</p>
              {quoteError && <p role="alert" style={{ color: '#991b1b', fontSize: '0.82rem' }}>{quoteError}</p>}
              {!quote && !quoteError && <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Pricing your cart…</p>}
              {quote && (
                <div style={{ opacity: quoting ? 0.6 : 1 }}>
                  <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                    {quote.lines.filter((l) => l.item_type !== 'charge').map((l, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.82rem' }}>
                          <span style={{ fontWeight: l.is_header ? 700 : 600 }}>{l.description}{l.variant_label && l.variant_label !== 'Standard' ? ` — ${l.variant_label}` : ''} <span style={{ color: '#9ca3af', fontWeight: 400 }}>× {l.quantity}</span></span>
                          <span>{money(l.amount)}</span>
                        </div>
                        {(l.children ?? []).map((c, j) => <div key={j} style={{ fontSize: '0.72rem', color: '#9ca3af', paddingLeft: 12 }}>└ {c.description} × {c.quantity}</div>)}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, display: 'grid', gap: 6, fontSize: '0.82rem' }}>
                    <Row k="Subtotal" v={money(quote.subtotal)} />
                    {quote.lines.filter((l) => l.item_type === 'charge').map((l, i) => <Row key={i} k={l.description} v={Number(l.amount) === 0 ? 'Free' : money(l.amount)} />)}
                    {quote.discounts.map((d, i) => <Row key={i} k={`Discount — ${d.source.replace('_', ' ')}${d.ref ? ` (${d.ref})` : ''}`} v={`−${money(d.amount)}`} color="#059669" />)}
                    {(quote.tax_breakdown ?? []).length > 0
                      ? quote.tax_breakdown.map((t, i) => <Row key={i} k={t.label} v={money(t.amount)} />)
                      : Number(quote.tax_total) > 0 && <Row k="Tax" v={money(quote.tax_total)} />}
                    {quote.gift && <Row k="Gift voucher" v={`−${money(quote.gift.applied)}`} color="#059669" />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.05rem', borderTop: '2px solid #e5e7eb', paddingTop: 10, marginTop: 4 }}>
                      <span>{mode === 'online' || quote.gift ? 'To pay now' : 'Total'}</span><span>{money(mode === 'online' || quote.gift ? quote.due_now : quote.total)}</span>
                    </div>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <PolicyConsentCheckbox policyKeys={['standard_order_policy']} actionContext="standard_checkout" onChange={(_ok, acc) => setPolicies(acc)} disabled={busy} />
              </div>
              <button type="submit" disabled={busy || !quote || !!pending} style={{ width: '100%', marginTop: 14, padding: 14, borderRadius: 10, border: 'none', fontWeight: 800, fontSize: '0.9rem', color: 'white', cursor: busy || !quote ? 'not-allowed' : 'pointer', opacity: busy || !quote ? 0.6 : 1, background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', fontFamily: 'inherit' }}>
                <Lock size={14} style={{ verticalAlign: -2 }} /> {busy ? 'Placing…' : mode === 'online' ? 'Pay and place order' : 'Place order'}
              </button>
            </div>
          </div>
        </form>
      </div>
      <Footer />
    </div>
  );
}

function Row({ k, v, color }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', color: color ?? '#4b5563' }}><span>{k}</span><span>{v}</span></div>;
}
