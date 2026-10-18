import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Loader2, Minus, Plus, ShoppingBasket, Smartphone, Store, UtensilsCrossed, ShoppingBag } from 'lucide-react';
import kioskAPI from '../../../_shared/api/kiosk';
import checkoutAPI from '../../../_shared/api/checkout';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import DishPicker from '../../components/DishPicker';
import { useBasket, lineTotal, basketItems, needsChoice, shownPrice } from '../../lib/basket';
import { printReceipt } from '../../lib/receiptPrint';

const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const POLL_MS = 2500;
const GIVE_UP = 60;
const DONE_SECONDS = 25;
const WARN_SECONDS = 10;
const huge = (bg = '#0f172a', fg = '#fff') => ({ padding: '22px 30px', borderRadius: 18, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: '1.5rem', background: bg, color: fg, touchAction: 'manipulation' });

/** The self-order screen. Large buttons, no sign-in, no keyboard but the phone number. It goes back to the welcome screen on its own when nobody touches it (and empties the basket). */
export default function KioskPage() {
  const { token } = useParams();
  const [cfg, setCfg] = useState(null);
  const [lost, setLost] = useState(false);
  const basket = useBasket(null);
  const [step, setStep] = useState('welcome');   // welcome | menu | review | pay | waiting | done | failed
  const [menuId, setMenuId] = useState(null);
  const [picking, setPicking] = useState(null);
  const [service, setService] = useState('take_out');
  const [phone, setPhone] = useState('');
  const [quote, setQuote] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // { session, number, payment }
  const [warn, setWarn] = useState(null);       // seconds left before the screen resets, while "still there?" shows
  const last = useRef(Date.now());
  const stop = useRef(false);

  useEffect(() => { kioskAPI.config(token).then((r) => { setCfg(r); setMenuId((r.menu.menus.find((m) => m.serving_now) ?? r.menu.menus[0])?.id ?? null); }).catch(() => setLost(true)); return () => { stop.current = true; }; }, [token]);

  const reset = useCallback(() => { stop.current = true; basket.clear(); setStep('welcome'); setService('take_out'); setPhone(''); setQuote(null); setProblem(null); setResult(null); setPicking(null); setWarn(null); last.current = Date.now(); }, [basket]);
  const touch = () => { last.current = Date.now(); setWarn(null); };

  // nobody is here: ask, then start again for the next guest
  useEffect(() => {
    if (!cfg || ['welcome', 'waiting'].includes(step)) return undefined;
    const t = setInterval(() => {
      const idle = (Date.now() - last.current) / 1000;
      const limit = step === 'done' ? DONE_SECONDS : cfg.idle_seconds;
      if (idle >= limit) { reset(); return; }
      if (step !== 'done' && idle >= limit - WARN_SECONDS) setWarn(Math.ceil(limit - idle)); else setWarn(null);
    }, 1000);
    return () => clearInterval(t);
  }, [cfg, step, reset]);

  const items = useMemo(() => basketItems(basket.lines), [basket.lines]);
  useEffect(() => {
    if (step !== 'review' && step !== 'pay') return undefined;
    let live = true;
    kioskAPI.quote(token, { service, items }).then((q) => { if (live) { setQuote(q); setProblem(null); } }).catch((e) => { if (live) { setQuote(null); setProblem(errMsg(e, 'We could not price your order.')); } });
    return () => { live = false; };
  }, [step, service, items, token]);

  const finish = (r) => { stop.current = true; basket.clear(); setResult(r); setStep('done'); last.current = Date.now(); };

  const wait = async (session, attempt) => {
    stop.current = false;
    for (let n = 0; n < GIVE_UP && !stop.current; n += 1) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (stop.current) return;
      try {
        const s = await checkoutAPI.paymentStatus(attempt.id, attempt.token, true);
        if (s.status === 'confirmed') { const st = await kioskAPI.status(token, session); finish({ session, number: st.number, payment: 'paid' }); return; }
        if (s.status === 'failed') { await kioskAPI.cancel(token, session).catch(() => {}); setProblem(s.failure_reason || 'The payment did not go through.'); setStep('failed'); return; }
      } catch { /* keep asking */ }
    }
    if (!stop.current) { await kioskAPI.cancel(token, session).catch(() => {}); setProblem('We did not get your payment. Nothing was charged to this order: please try again or pay at the counter.'); setStep('failed'); }
  };

  const place = async (pay) => {
    setBusy(true); setProblem(null);
    try {
      const r = await kioskAPI.order(token, { service, items, pay, payment_method_id: pay === 'screen' ? cfg.payment_methods[0]?.id : undefined, phone: pay === 'screen' ? phone : undefined });
      if (pay === 'counter') { finish({ session: r.session, number: r.number, payment: 'open' }); return; }
      setStep('waiting'); wait(r.session, r.attempt);
    } catch (e) { setProblem(errMsg(e, 'We could not take your order.')); } finally { setBusy(false); }
  };

  const slip = async () => { const r = await kioskAPI.receipt(token, result.session); printReceipt(r.text, r.width); };

  if (lost) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontSize: '1.4rem', padding: 30, textAlign: 'center' }}>This screen is not set up. Please ask a member of staff.</main>;
  if (!cfg) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Loader2 size={48} style={{ animation: 'spin 1s linear infinite' }} /></main>;

  const menu = cfg.menu.menus.find((m) => m.id === menuId);
  const empty = basket.count === 0;
  const shell = (children) => (
    <main onPointerDown={touch} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', color: '#0f172a', userSelect: 'none' }} data-testid="kiosk" data-step={step}>
      <Helmet><title>{cfg.business}</title></Helmet>
      {children}
      {warn !== null && (
        <div role="alertdialog" aria-label="Still there?" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.8)', display: 'grid', placeItems: 'center', zIndex: 90 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 40, textAlign: 'center', display: 'grid', gap: 18 }}>
            <h2 style={{ margin: 0, fontSize: '2rem' }}>Are you still there?</h2>
            <p style={{ margin: 0, fontSize: '1.3rem' }}>Starting again in {warn}…</p>
            <button type="button" style={huge('#059669')} onClick={touch}>Yes, keep my order</button>
          </div>
        </div>
      )}
    </main>
  );

  if (step === 'welcome') {
    return shell(
      <button type="button" data-testid="welcome" onClick={() => { last.current = Date.now(); stop.current = false; setStep('menu'); }} style={{ flex: 1, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(160deg, #0f172a, #1e293b)', color: '#fff', display: 'grid', placeContent: 'center', gap: 22, textAlign: 'center', padding: 40 }}>
        <UtensilsCrossed size={96} aria-hidden="true" style={{ justifySelf: 'center' }} />
        <span style={{ fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', fontWeight: 900 }}>{cfg.business}</span>
        <span style={{ fontSize: 'clamp(1.5rem, 4vw, 2.4rem)', opacity: 0.9 }}>{cfg.welcome || 'Touch to order'}</span>
      </button>,
    );
  }

  if (step === 'done') {
    return shell(
      <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 20, textAlign: 'center', padding: 30 }} role="status">
        <CheckCircle2 size={90} color="#047857" style={{ justifySelf: 'center' }} />
        <h1 style={{ margin: 0, fontSize: '2.2rem' }}>Thank you!</h1>
        <p style={{ margin: 0, fontSize: '1.4rem' }}>Your number is</p>
        <div data-testid="number" style={{ fontSize: '9rem', fontWeight: 900, lineHeight: 1 }}>{result.number}</div>
        <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>{result.payment === 'paid' ? 'Paid. We will call your number.' : 'Please take this number to the counter to pay. We start when you have paid.'}</p>
        <p style={{ margin: 0, color: '#64748b' }}>Session {result.session}</p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
          <button type="button" style={huge('#334155')} onClick={slip}>Print my slip</button>
          <button type="button" style={huge('#0f172a')} onClick={reset}>Done</button>
        </div>
      </div>,
    );
  }

  if (step === 'waiting') {
    return shell(
      <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 20, textAlign: 'center', padding: 30 }} role="status">
        <Smartphone size={90} style={{ justifySelf: 'center' }} />
        <h1 style={{ margin: 0, fontSize: '2.2rem' }}>Check your phone</h1>
        <p style={{ margin: 0, fontSize: '1.5rem' }}>Enter your M-Pesa PIN to pay {money(quote?.total)}.</p>
        <Loader2 size={48} style={{ justifySelf: 'center', animation: 'spin 1s linear infinite' }} />
      </div>,
    );
  }

  if (step === 'failed') {
    return shell(
      <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 20, textAlign: 'center', padding: 30 }} role="alert">
        <h1 style={{ margin: 0, fontSize: '2.2rem', color: '#b91c1c' }}>That did not work</h1>
        <p style={{ margin: 0, fontSize: '1.4rem' }}>{problem}</p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
          <button type="button" style={huge('#0f172a')} onClick={() => { setProblem(null); setStep('pay'); }}>Try again</button>
          <button type="button" style={huge('#64748b')} onClick={reset}>Start over</button>
        </div>
      </div>,
    );
  }

  if (step === 'review' || step === 'pay') {
    return shell(
      <div style={{ flex: 1, padding: 28, display: 'grid', gap: 18, alignContent: 'start', maxWidth: 900, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <h1 style={{ margin: 0, fontSize: '2.2rem' }}>{step === 'review' ? 'Your order' : 'How would you like to pay?'}</h1>
        {step === 'review' && (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }} data-testid="review">
              {basket.lines.map((l) => (
                <li key={l.key} style={{ background: '#fff', borderRadius: 16, padding: 16, display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, alignItems: 'center', fontSize: '1.3rem' }}>
                  <span><strong>{l.name}</strong>{l.option_names.length > 0 && <small style={{ display: 'block', color: '#64748b', fontSize: '1rem' }}>{l.option_names.join(', ')}</small>}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                    <button type="button" aria-label={`Fewer ${l.name}`} onClick={() => basket.setQuantity(l.key, l.quantity - 1)} style={{ ...huge('#e2e8f0', '#0f172a'), padding: 14 }}><Minus size={26} /></button>
                    <b style={{ minWidth: 30, textAlign: 'center' }}>{l.quantity}</b>
                    <button type="button" aria-label={`More ${l.name}`} onClick={() => basket.setQuantity(l.key, l.quantity + 1)} style={{ ...huge('#e2e8f0', '#0f172a'), padding: 14 }}><Plus size={26} /></button>
                  </span>
                  <span style={{ minWidth: 110, textAlign: 'right', fontWeight: 800 }}>{money(lineTotal(l))}</span>
                </li>
              ))}
            </ul>
            <div role="group" aria-label="Eat here or take away" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <button type="button" aria-pressed={service === 'dine_in'} onClick={() => setService('dine_in')} style={{ ...huge(service === 'dine_in' ? '#0f172a' : '#fff', service === 'dine_in' ? '#fff' : '#0f172a'), border: '3px solid #0f172a' }}><Store size={28} aria-hidden="true" style={{ verticalAlign: -5 }} /> {cfg.services.dine_in}</button>
              <button type="button" aria-pressed={service === 'take_out'} onClick={() => setService('take_out')} style={{ ...huge(service === 'take_out' ? '#0f172a' : '#fff', service === 'take_out' ? '#fff' : '#0f172a'), border: '3px solid #0f172a' }}><ShoppingBag size={28} aria-hidden="true" style={{ verticalAlign: -5 }} /> {cfg.services.take_out}</button>
            </div>
          </>
        )}
        {quote && (
          <dl data-testid="totals" style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: '1.3rem' }}>
            <dt>Food</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.subtotal)}</dd>
            <dt>Tax</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.tax_total)}</dd>
            {quote.service_charge > 0 && <><dt>Service charge</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(quote.service_charge)}</dd></>}
            <dt style={{ fontSize: '1.8rem', fontWeight: 900 }}>Total</dt><dd style={{ margin: 0, textAlign: 'right', fontSize: '1.8rem', fontWeight: 900 }}>{money(quote.total)}</dd>
          </dl>
        )}
        {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '1.2rem' }}>{problem}</p>}
        {step === 'review' ? (
          <div style={{ display: 'flex', gap: 14 }}>
            <button type="button" style={huge('#e2e8f0', '#0f172a')} onClick={() => setStep('menu')}>Add more</button>
            <button type="button" style={{ ...huge('#059669'), flex: 1, opacity: quote ? 1 : 0.5 }} disabled={!quote} onClick={() => setStep('pay')}>Pay</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {cfg.pay_at_screen && cfg.payment_methods.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 18, padding: 18, display: 'grid', gap: 12 }}>
                <label htmlFor="kiosk-phone" style={{ fontSize: '1.3rem', fontWeight: 800 }}>Pay here with M-Pesa: your phone number</label>
                <input id="kiosk-phone" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))} placeholder="07…" style={{ padding: 18, fontSize: '1.8rem', borderRadius: 14, border: '2px solid #94a3b8' }} />
                <button type="button" disabled={busy || phone.length < 9 || !quote} style={{ ...huge('#059669'), opacity: busy || phone.length < 9 || !quote ? 0.5 : 1 }} onClick={() => place('screen')}>Pay {quote ? money(quote.total) : ''} now</button>
              </div>
            )}
            {cfg.pay_at_counter && <button type="button" disabled={busy || !quote} style={{ ...huge('#d97706'), opacity: busy || !quote ? 0.5 : 1 }} onClick={() => place('counter')}>Pay at the counter</button>}
            <button type="button" style={huge('#e2e8f0', '#0f172a')} onClick={() => setStep('review')}>Back</button>
          </div>
        )}
      </div>,
    );
  }

  // the menu
  return shell(
    <>
      <header style={{ padding: '18px 24px', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: '1.6rem' }}>{cfg.business}</strong>
        <button type="button" onClick={reset} style={{ ...huge('transparent', '#cbd5e1'), padding: '8px 16px', fontSize: '1rem' }}>Start over</button>
      </header>
      <div role="tablist" aria-label="Menus" style={{ display: 'flex', gap: 12, padding: '14px 24px', overflowX: 'auto' }}>
        {cfg.menu.menus.map((m) => <button key={m.id} type="button" role="tab" aria-selected={m.id === menuId} onClick={() => setMenuId(m.id)} style={{ ...huge(m.id === menuId ? '#0f172a' : '#fff', m.id === menuId ? '#fff' : '#0f172a'), padding: '14px 22px', fontSize: '1.2rem', border: '2px solid #0f172a', whiteSpace: 'nowrap' }}>{m.name}</button>)}
      </div>
      <div style={{ flex: 1, padding: '0 24px 150px', overflowY: 'auto' }}>
        {menu && !menu.serving_now && <p role="status" style={{ fontSize: '1.2rem', color: '#b45309' }}>{menu.name} is not being served right now ({menu.serves}).</p>}
        {menu?.sections.map((s) => (
          <section key={s.id} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: '1.7rem', margin: '10px 0' }}>{s.name}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
              {s.dishes.map((d) => {
                const ok = d.available && menu.serving_now && d.price != null;

                return (
                  <button key={d.id} type="button" data-dish={d.name} disabled={!ok} onClick={() => (needsChoice(d) ? setPicking(d) : basket.add(d))}
                    style={{ border: 'none', borderRadius: 20, background: '#fff', cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.4, boxShadow: '0 2px 10px rgba(0,0,0,.12)', padding: 0, overflow: 'hidden', textAlign: 'left', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                    {d.photo && <img src={d.photo} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />}
                    <span style={{ display: 'grid', gap: 6, padding: 16 }}>
                      <strong style={{ fontSize: '1.35rem' }}>{d.name}</strong>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#047857' }}>{d.available ? `${shownPrice(d).from ? 'from ' : ''}${money(shownPrice(d).amount)}` : 'Sold out'}</span>
                      {d.allergens.length > 0 && <small style={{ color: '#b45309', fontWeight: 700 }}>Contains {d.allergens.map((a) => cfg.menu.allergens[a] ?? a).join(', ')}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {cfg.menu.note && <p style={{ color: '#64748b' }}>{cfg.menu.note}</p>}
      </div>
      {!empty && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: 16, background: '#fff', boxShadow: '0 -4px 20px rgba(0,0,0,.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }} data-testid="basket-bar">
          <span style={{ fontSize: '1.4rem', fontWeight: 800, display: 'inline-flex', gap: 10, alignItems: 'center' }}><ShoppingBasket size={30} aria-hidden="true" /> {basket.count} item{basket.count === 1 ? '' : 's'}</span>
          <button type="button" style={huge('#059669')} onClick={() => setStep('review')}>See my order</button>
        </div>
      )}
      {picking && <DishPicker dish={{ ...picking, price: picking.price }} onClose={() => setPicking(null)} onAdd={(d, o) => { basket.add(d, o); setPicking(null); }} />}
    </>,
  );
}
