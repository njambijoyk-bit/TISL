import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, XCircle } from 'lucide-react';
import menusPublicAPI from '../../_shared/api/menusPublic';
import checkoutAPI from '../../_shared/api/checkout';
import useAuthStore from '../../_shared/store/authStore';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { basketItems } from '../lib/basket';

const POLL_MS = 3000;
const GIVE_UP = 60;
const money = (n, sym = '') => `${sym}${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line, #e5e7eb)', background: 'var(--surface-input, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.9rem', boxSizing: 'border-box' };
const label = { display: 'grid', gap: 4, fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const when = (iso) => new Date(iso).toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** Pickup or delivery: when, who, how to pay. The price comes from the server (tax, delivery) and is shown before the order is placed. Paying now asks for the M-Pesa PIN on the phone, or sends the customer to a card page. */
export default function OrderCheckout({ basket, onClose }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const customer = useAuthStore((s) => s.customer);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [f, setF] = useState({ location_id: '', fulfil: 'asap', name: user?.name ?? '', email: user?.email ?? '', phone: customer?.phone ?? '', address: '', shipping_option_id: '', notes: '', payment_mode: 'later', payment_method_id: '' });
  const [quote, setQuote] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(null);   // null | { kind: 'waiting', message } | { kind: 'failed', reason, late }
  const stop = useRef(false);

  useEffect(() => () => { stop.current = true; }, []);
  useEffect(() => {
    menusPublicAPI.channels().then((r) => {
      setSetup(r);
      const first = r.channels[0];
      if (first) {
        setCode(first.code);
        setF((x) => ({ ...x, fulfil: first.asap ? 'asap' : first.slots[0] ?? '', payment_mode: first.payment_modes.includes('online') && r.payment_methods.length ? 'online' : 'later',
          payment_method_id: r.payment_methods.find((m) => m.gateway === 'mpesa_stk')?.id ?? r.payment_methods[0]?.id ?? '' }));
      }
    }).catch(() => setSetup({ channels: [], payment_methods: [], locations: [] }));
  }, []);

  const channel = setup?.channels.find((c) => c.code === code);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pickChannel = (c) => {
    setCode(c.code);
    setF((x) => ({ ...x, fulfil: c.asap ? 'asap' : c.slots[0] ?? '', payment_mode: c.payment_modes.includes(x.payment_mode) ? x.payment_mode : c.payment_modes[0], shipping_option_id: '' }));
  };

  const payload = useMemo(() => channel && ({
    channel: channel.code, location_id: f.location_id || undefined, fulfil: f.fulfil || undefined, address: channel.order_type === 'delivery' ? f.address : undefined,
    shipping_option_id: channel.order_type === 'delivery' && f.shipping_option_id ? Number(f.shipping_option_id) : undefined, notes: f.notes || undefined,
    name: f.name || undefined, email: f.email || undefined, phone: f.phone || undefined, payment_mode: f.payment_mode, payment_method_id: f.payment_mode === 'online' && f.payment_method_id ? Number(f.payment_method_id) : undefined,
    items: basketItems(basket.lines),
  }), [channel, f, basket.lines]);

  // the price is worked out by the server whenever the basket, the time or the delivery changes
  const forQuote = useMemo(() => payload && JSON.stringify({ ...payload, name: undefined, email: undefined, phone: undefined, notes: undefined, payment_method_id: undefined }), [payload]);
  useEffect(() => {
    if (!payload || !basket.lines.length) return undefined;
    let live = true;
    const t = setTimeout(() => {
      menusPublicAPI.quote({ ...payload, name: payload.name ?? 'x', phone: payload.phone ?? 'x', payment_mode: 'later' })
        .then((q) => { if (live) { setQuote(q); setProblem(null); } })
        .catch((e) => { if (live) { setQuote(null); setProblem(errMsg(e, 'We could not price your order.')); } });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forQuote]);

  const wait = useCallback(async (attempt, token) => {
    stop.current = false;
    for (let n = 0; n < GIVE_UP && !stop.current; n += 1) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (stop.current) return;
      try {
        const s = await checkoutAPI.paymentStatus(attempt.id, attempt.token, true);
        if (s.status === 'confirmed') { basket.clear(); navigate(`/menu/order/${token}`); return; }
        if (s.status === 'failed') { setPhase({ kind: 'failed', reason: s.failure_reason || 'The payment did not go through.' }); return; }
      } catch { /* keep asking */ }
    }
    if (!stop.current) setPhase({ kind: 'failed', late: true, reason: 'We have not heard from M-Pesa yet. If you paid, your order is confirmed shortly: you can follow it with the link we send you.', token });
  }, [basket, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await menusPublicAPI.place(payload);
      if (r.status === 'placed') { basket.clear(); navigate(`/menu/order/${r.token}`); return; }
      if (r.redirect_url) { basket.clear(); window.location.assign(r.redirect_url); return; }
      setPhase({ kind: 'waiting', message: r.message });
      wait(r.attempt, r.token);
    } catch (err) { toast.error(errMsg(err, 'We could not place your order. Please try again.'), { duration: 8000 }); } finally { setBusy(false); }
  };

  const shell = (children) => (
    <div role="dialog" aria-modal="true" aria-label="Your order" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', padding: 16 }} onClick={phase ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '92vh', overflow: 'auto', background: 'var(--surface-card, #fff)', borderRadius: 16, padding: 20 }}>{children}</div>
    </div>
  );

  if (phase?.kind === 'waiting') {
    return shell(
      <div role="status" aria-live="polite" style={{ display: 'grid', gap: 10, textAlign: 'center', justifyItems: 'center' }}>
        <Loader2 size={34} color="var(--color-primary-500)" style={{ animation: 'spin 1s linear infinite' }} />
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Waiting for your payment…</h2>
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{phase.message}</p>
      </div>,
    );
  }
  if (phase?.kind === 'failed') {
    return shell(
      <div role="alert" style={{ display: 'grid', gap: 10, textAlign: 'center', justifyItems: 'center' }}>
        <XCircle size={34} color="#b91c1c" />
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{phase.late ? 'Still waiting' : 'The payment did not go through'}</h2>
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{phase.reason}</p>
        {phase.late && phase.token ? <button type="button" onClick={() => { basket.clear(); navigate(`/menu/order/${phase.token}`); }} style={{ ...field, width: 'auto', cursor: 'pointer', fontWeight: 800 }}>Follow my order</button>
          : <button type="button" onClick={() => { setPhase(null); onClose(); }} style={{ ...field, width: 'auto', cursor: 'pointer', fontWeight: 800 }}>Back to the menu</button>}
      </div>,
    );
  }
  if (!setup) return shell(<p style={{ margin: 0 }}>Loading…</p>);
  if (!setup.channels.length) return shell(<div><h2 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>Ordering is not open</h2><p style={{ margin: 0, color: 'var(--text-secondary)' }}>We are not taking online orders right now. You are welcome to visit us.</p></div>);

  const delivery = channel?.order_type === 'delivery';
  const sym = quote?.currency?.symbol ? `${quote.currency.symbol} ` : '';

  return shell(
    <form onSubmit={submit} style={{ display: 'grid', gap: 14 }} aria-label="Place your order">
      <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Your order</h2>
      {setup.channels.length > 1 && (
        <div role="tablist" aria-label="How" style={{ display: 'flex', gap: 8 }}>
          {setup.channels.map((c) => <button key={c.code} type="button" role="tab" aria-selected={c.code === code} onClick={() => pickChannel(c)} style={{ ...field, width: 'auto', cursor: 'pointer', fontWeight: 800, borderColor: c.code === code ? 'var(--color-primary-500)' : undefined }}>{c.name}</button>)}
        </div>
      )}
      {channel?.note && <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{channel.note}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {basket.lines.map((l) => (
          <li key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
            <input aria-label={`Quantity of ${l.name}`} type="number" min={0} max={50} value={l.quantity} onChange={(e) => basket.setQuantity(l.key, Number(e.target.value))} style={{ ...field, width: 60, padding: '6px 8px' }} />
            <span style={{ flex: 1 }}>{l.name}{l.option_names.length > 0 && <small style={{ color: 'var(--text-tertiary)' }}> · {l.option_names.join(', ')}</small>}{l.note && <small style={{ color: 'var(--text-tertiary)' }}> · “{l.note}”</small>}</span>
          </li>
        ))}
      </ul>
      {setup.locations.length > 1 && (
        <label style={label}>Branch<select value={f.location_id} onChange={set('location_id')} style={field}><option value="">Nearest / default</option>{setup.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      )}
      <label style={label}>{delivery ? 'Deliver' : 'Ready'}
        <select value={f.fulfil} onChange={set('fulfil')} style={field} aria-label="When">
          {channel?.asap && <option value="asap">As soon as possible ({when(channel.asap).split(', ').pop()})</option>}
          {channel?.slots.map((t) => <option key={t} value={t}>{when(t)}</option>)}
        </select>
      </label>
      <label style={label}>Your name<input required value={f.name} onChange={set('name')} autoComplete="name" style={field} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={label}>Phone<input required value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" style={field} /></label>
        <label style={label}>Email (for updates)<input type="email" value={f.email} onChange={set('email')} autoComplete="email" style={field} /></label>
      </div>
      {delivery && (
        <>
          <label style={label}>Delivery address<textarea required rows={2} value={f.address} onChange={set('address')} style={field} /></label>
          {channel.delivery_options.length > 1 && (
            <label style={label}>Delivery method<select required value={f.shipping_option_id} onChange={set('shipping_option_id')} style={field}><option value="">Choose…</option>{channel.delivery_options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          )}
        </>
      )}
      <label style={label}>A note for the kitchen<input value={f.notes} maxLength={500} onChange={set('notes')} style={field} /></label>
      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        <legend style={{ ...label, marginBottom: 4 }}>How would you like to pay?</legend>
        {channel?.payment_modes.includes('online') && setup.payment_methods.length > 0 && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}><input type="radio" name="mode" checked={f.payment_mode === 'online'} onChange={() => setF((x) => ({ ...x, payment_mode: 'online' }))} /> Pay now</label>
        )}
        {f.payment_mode === 'online' && setup.payment_methods.length > 1 && (
          <select aria-label="Payment method" value={f.payment_method_id} onChange={set('payment_method_id')} style={field}>{setup.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        )}
        {channel?.payment_modes.includes('later') && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}><input type="radio" name="mode" checked={f.payment_mode === 'later'} onChange={() => setF((x) => ({ ...x, payment_mode: 'later' }))} /> Pay when it is {delivery ? 'delivered' : 'collected'}</label>
        )}
      </fieldset>
      {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '0.84rem' }}>{problem}</p>}
      {quote && !problem && (
        <dl data-testid="order-totals" style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', fontSize: '0.88rem' }}>
          <dt>Food</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.subtotal - quote.delivery_fee, sym)}</dd>
          {quote.delivery_fee > 0 && <><dt>Delivery</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.delivery_fee, sym)}</dd></>}
          <dt>Tax</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.tax_total, sym)}</dd>
          <dt style={{ fontWeight: 800 }}>Total</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 800 }}>{money(quote.total, sym)}</dd>
        </dl>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} style={{ ...field, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>Keep browsing</button>
        <button type="submit" disabled={busy || !quote || Boolean(problem)} style={{ padding: '11px 22px', borderRadius: 10, border: 'none', cursor: busy || !quote ? 'not-allowed' : 'pointer', opacity: busy || !quote || problem ? 0.55 : 1, fontWeight: 800, fontFamily: 'inherit', color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))' }}>
          {busy ? 'Placing…' : f.payment_mode === 'online' ? 'Place order and pay' : 'Place order'}
        </button>
      </div>
    </form>,
  );
}
