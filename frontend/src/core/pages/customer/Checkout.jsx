import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Package, Truck, CreditCard, Tag, Loader2, Gift } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import PolicyConsentCheckbox from '../../../_shared/components/legal/shared/PolicyConsentCheckbox';
import { useCartStore, useAuthStore } from '../../../_shared/store/index';
import checkoutAPI from '../../../_shared/api/checkout';
import { toApiItem } from '../../../_shared/lib/cartItems';
import OrderBreakdown from '../../../_shared/components/common/OrderBreakdown';
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
  const [form, setForm] = useState({ customer_email: user?.email || '', customer_phone: user?.phone || '', shipping_address: '', delivery_method: '', customer_notes: '', promo_code: '', gift_voucher_code: '', phone: user?.phone || '' });
  const [mode, setMode] = useState('online');       // online | pay_later | account
  const [methodId, setMethodId] = useState(null);
  const [quote, setQuote] = useState(null);
  const [giftPicked, setGiftPicked] = useState(null);   // null = not chosen yet -> every usable voucher is ticked automatically
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
    items: items.map(toApiItem), delivery_method: form.delivery_method || undefined,
    promo_code: form.promo_code.trim() || undefined, gift_voucher_code: form.gift_voucher_code.trim() || undefined,
    gift_voucher_codes: giftPicked ?? undefined,
  }), [items, form.delivery_method, form.promo_code, form.gift_voucher_code, giftPicked]);

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
                {(quote?.available?.gift_vouchers?.length > 0) && (
                  <div style={{ marginTop: 14 }}>
                    <label style={label}><Gift size={12} style={{ verticalAlign: -2 }} /> Your gift vouchers{mode === 'pay_later' && <span style={{ fontWeight: 400, color: '#6b7280' }}> — nothing is spent now; applied when your order is paid</span>}</label>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {quote.available.gift_vouchers.map((g) => {
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
                    <label style={label}><Gift size={12} style={{ verticalAlign: -2 }} /> {quote?.available?.gift_vouchers?.length ? 'Another gift voucher code' : 'Gift voucher code'}</label>
                    <input value={form.gift_voucher_code} onChange={set('gift_voucher_code')} placeholder="Optional" style={input} />
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  <label style={label}><Tag size={12} style={{ verticalAlign: -2 }} /> Promo code</label>
                  {(quote?.available?.promo_codes?.length > 0) && (
                    <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                      {quote.available.promo_codes.map((p) => (
                        <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: form.promo_code.trim().toLowerCase() === p.code.toLowerCase() ? 'rgba(16,185,129,0.06)' : 'white', cursor: 'pointer', fontSize: '0.82rem' }}>
                          <input type="radio" name="promo" checked={form.promo_code.trim().toLowerCase() === p.code.toLowerCase()} onChange={() => setForm((f) => ({ ...f, promo_code: p.code }))} />
                          <span style={{ flex: 1 }}><strong>{p.code}</strong></span>
                          <span style={{ fontWeight: 700, color: '#059669' }}>saves {money(p.discount)}</span>
                        </label>
                      ))}
                      {form.promo_code && <button type="button" onClick={() => setForm((f) => ({ ...f, promo_code: '' }))} style={{ justifySelf: 'start', background: 'none', border: 'none', color: '#6b7280', fontSize: '0.74rem', cursor: 'pointer', padding: 0 }}>Remove promo code</button>}
                    </div>
                  )}
                  <input value={form.promo_code} onChange={set('promo_code')} placeholder="Or type a code" style={input} />
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
                  <OrderBreakdown quote={quote} />
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
