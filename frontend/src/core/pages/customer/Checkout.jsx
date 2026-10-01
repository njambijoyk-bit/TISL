import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useCartVariantCheck from '../../../ecommerce/components/storefront/useCartVariantCheck';
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
import { creditSentence } from '../../components/admin/books/creditText';
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
  const variantCheck = useCartVariantCheck();
  const { user, fetchCustomer } = useAuthStore();
  const [opts, setOpts] = useState(null);
  const prefs = useCheckoutPrefs();               // delivery method and promo code were chosen in the cart
  const [form, setForm] = useState({ customer_email: user?.email || '', customer_phone: user?.phone || '', shipping_address: '', customer_notes: '', gift_voucher_code: '', phone: user?.phone || '' });
  const [creditPick, setCreditPick] = useState(null);   // overpayments / advances they hold: ticked unless they untick
  const giftPicked = prefs.gift_codes;
  const setGiftPicked = (fn) => prefs.set({ gift_codes: typeof fn === 'function' ? fn(useCheckoutPrefs.getState().gift_codes) : fn });
  const [mode, setMode] = useState('online');       // online | pay_later | account | ledger | credit
  const [methodId, setMethodId] = useState(null);
  const [ledgerId, setLedgerId] = useState(null);      // an offered bank / till / cash-on-delivery ledger chosen as how they will pay
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);      // { attemptId, orderId }
  // The terms that apply to what is in the cart: orders (products, services, gift vouchers), hampers, auctions — one box each
  const termKeys = useMemo(() => {
    const api = items.map(toApiItem);
    const keys = [];
    if (api.some((i) => !i.hamper_id && !i.auction_id)) keys.push(['standard_order_policy', 'standard_checkout']);
    if (api.some((i) => i.hamper_id)) keys.push(['hamper_policy', 'hamper_checkout']);
    if (api.some((i) => i.auction_id)) keys.push(['auction_terms', 'auction_bidding']);
    return keys;
  }, [items]);
  const [termState, setTermState] = useState({});   // key -> { count: how many terms were found (null = loading), agreed }
  const setTerm = (key, patch) => setTermState((t) => ({ ...t, [key]: { count: null, agreed: false, ...t[key], ...patch } }));
  const loadingTerms = termKeys.some(([k]) => (termState[k]?.count ?? null) === null);
  const missingTerms = termKeys.filter(([k]) => (termState[k]?.count ?? 0) > 0 && !termState[k]?.agreed);
  const termsOk = !loadingTerms && missingTerms.length === 0;
  const policies = termKeys.filter(([k]) => termState[k]?.agreed).map(([k]) => ({ key: k, response: 'accepted' }));
  const done = useRef(false);
  const credits = opts?.credits ?? [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => { if (user) fetchCustomer(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // an item with several variants and none chosen sends the shopper back to the cart to choose
  useEffect(() => {
    if (!variantCheck.checking && variantCheck.unresolved.length) { toast.error(`Choose an option for ${variantCheck.unresolved[0].item.name} first`); navigate('/cart'); }
  }, [variantCheck.checking, variantCheck.unresolved.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    checkoutAPI.options().then((o) => {
      setOpts(o);
      const first = o.payment_methods[0];
      if (first) setMethodId(first.id);
      else if (o.ledger_modes?.length) { setMode('ledger'); setLedgerId(o.ledger_modes[0].ledger_id); } else setMode('pay_later');
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
    if (!termsOk) { toast.error('Please tick the box to agree to the terms first.'); return; }
    if (variantCheck.blocked) { toast.error('Choose an option for every item first — go back to your cart.'); return; }
    setBusy(true);
    try {
      const res = await checkoutAPI.place({
        ...payload(), customer_email: form.customer_email, customer_phone: form.customer_phone, shipping_address: form.shipping_address,
        customer_notes: form.customer_notes || undefined, payment_mode: mode === 'ledger' ? 'pay_later' : mode, payment_method_id: mode === 'online' ? methodId : undefined, payment_ledger_id: mode === 'ledger' ? ledgerId : undefined, phone: form.phone || form.customer_phone,
        ...(policies.length ? { policy_acceptances: policies } : {}),
        ...(credits.length ? { use_credit: credits.filter((c) => (creditPick ?? credits.map((x) => x.voucher_id)).includes(c.voucher_id)).map((c) => c.voucher_id) } : {}),
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
                {(opts?.ledger_modes ?? []).map((m) => (
                  <Choice key={m.ledger_id} active={mode === 'ledger' && ledgerId === m.ledger_id} onClick={() => { setMode('ledger'); setLedgerId(m.ledger_id); }} label={m.label}
                    sub={m.kind === 'cod' ? 'Pay the driver when it arrives' : m.kind === 'bank' ? 'Pay by bank transfer — details below' : m.kind === 'mobile' ? 'Pay to our number — details below' : 'Pay in cash'} />
                ))}
                {credits.length > 0 && (() => {
                  const held = credits.filter((c) => (creditPick ?? credits.map((x) => x.voucher_id)).includes(c.voucher_id)).reduce((t, c) => t + c.amount, 0);
                  const covers = quote && held + 0.005 >= Number(quote.total);
                  return <Choice active={mode === 'credit'} onClick={() => setMode('credit')} disabled={!covers} label="Pay from money I have already paid"
                    sub={covers ? `Uses ${money(Math.min(held, Number(quote.total)))} of the ${money(held)} you paid us — nothing more to pay` : `The ticked ${money(held)} does not cover this order (${money(quote?.total ?? 0)})`} />;
                })()}
                <Choice active={mode === 'pay_later'} onClick={() => setMode('pay_later')} label="Pay later" sub="Place the order; we'll agree how you pay" />
                {opts?.account && (
                  <Choice active={mode === 'account'} onClick={() => setMode('account')} disabled={opts.account.available_base <= 0}
                    label="Charge to my account" sub={opts.account.available_base > 0 ? `Invoiced now · due in ${opts.account.terms_days} days · ${formatMoney(opts.account.available_base, opts.base_currency.code)} available` : 'No credit available'} />
                )}
              </div>
              {mode === 'ledger' && (() => {
                const m = (opts?.ledger_modes ?? []).find((x) => x.ledger_id === ledgerId);
                return m ? (
                  <div role="note" style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(99,102,241,0.06)', fontSize: '0.82rem' }}>
                    <strong>{m.label}</strong>
                    <div style={{ marginTop: 4 }}>{m.instructions}</div>
                    <div style={{ marginTop: 4, color: '#6b7280', fontSize: '0.74rem' }}>Nothing is charged now. Your order is saved with how you chose to pay, and we'll bill you when we confirm it.</div>
                  </div>
                ) : null;
              })()}
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
              {credits.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <label style={label}>Money you have paid us</label>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {credits.map((c) => (
                      <label key={c.voucher_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.82rem' }}>
                        <input type="checkbox" checked={(creditPick ?? credits.map((x) => x.voucher_id)).includes(c.voucher_id)}
                          onChange={() => setCreditPick((cur) => { const all = cur ?? credits.map((x) => x.voucher_id); return all.includes(c.voucher_id) ? all.filter((x) => x !== c.voucher_id) : [...all, c.voucher_id]; })} />
                        <span>{creditSentence(c)} — use it on this order?</span>
                      </label>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#6b7280' }}>Nothing is used now; it is taken off when your order becomes an invoice.</p>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {termKeys.map(([key, ctx]) => (
                <PolicyConsentCheckbox key={key} policyKeys={[key]} actionContext={ctx} disabled={busy}
                  onChange={(ok) => setTerm(key, { agreed: ok })} onLoaded={(n) => setTerm(key, { count: n })} />
              ))}
            </div>
            <button type="submit" disabled={busy || !quote || !!pending || !termsOk}
              style={{ width: '100%', marginTop: 14, padding: 14, borderRadius: 10, border: 'none', fontWeight: 800, fontSize: '0.9rem', color: termsOk ? 'white' : '#9ca3af', cursor: busy || !quote || !termsOk ? 'not-allowed' : 'pointer', opacity: busy || !quote ? 0.6 : 1, background: termsOk ? 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))' : '#e5e7eb', fontFamily: 'inherit' }}>
              <Lock size={14} style={{ verticalAlign: -2 }} /> {busy ? 'Placing…' : mode === 'online' ? 'Pay and place order' : mode === 'credit' ? 'Pay from my credit' : 'Place order'}
            </button>
            {!termsOk && (
              <p role="status" style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#6b7280', textAlign: 'center' }}>
                {loadingTerms ? 'Loading the terms…' : missingTerms.length > 1 ? 'Tick the boxes above to agree to the terms — then you can place your order.' : 'Tick the box above to agree to the terms — then you can place your order.'}
              </p>
            )}
            <p style={{ margin: '10px 0 0', fontSize: '0.74rem', color: '#9ca3af', textAlign: 'center' }}>Your order is saved under <Link to="/orders" style={{ color: 'var(--color-primary-500)' }}>My orders</Link> as soon as it is placed.</p>
          </div>
        </form>
      </div>
      <Footer />
    </div>
  );
}
