import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Loader2, Minus, Plus, ScanLine } from 'lucide-react';
import posSelfAPI from '../../../_shared/api/posSelf';
import checkoutAPI from '../../../_shared/api/checkout';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { printReceipt } from '../admin/pos/printReceipt';

const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const POLL_MS = 2500;
const GIVE_UP = 60;
const DONE_SECONDS = 25;
const WARN_SECONDS = 10;
const huge = (bg = '#0f172a', fg = '#fff') => ({ padding: '20px 28px', borderRadius: 18, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 900, fontSize: '1.4rem', background: bg, color: fg, touchAction: 'manipulation' });

/** The self-checkout screen: scan or pick, pay by M-Pesa on the phone, or take the basket to a cashier. Cash sales only. It starts again by itself when nobody touches it. */
export default function PosSelfPage() {
  const { token } = useParams();
  const [cfg, setCfg] = useState(null);
  const [lost, setLost] = useState(false);
  const [basket, setBasket] = useState([]);   // { variant_id, name, price, quantity }
  const [step, setStep] = useState('welcome');   // welcome | shop | review | pay | waiting | done | failed
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [quote, setQuote] = useState(null);
  const [phone, setPhone] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // { session, pay, number }
  const [warn, setWarn] = useState(null);
  const [help, setHelp] = useState(false);
  const [helpSent, setHelpSent] = useState(false);
  const last = useRef(Date.now());
  const stop = useRef(false);
  const input = useRef(null);

  useEffect(() => { posSelfAPI.config(token).then(setCfg).catch(() => setLost(true)); return () => { stop.current = true; }; }, [token]);

  const reset = useCallback(() => { stop.current = true; setBasket([]); setStep('welcome'); setPhone(''); setQuote(null); setProblem(null); setResult(null); setQ(''); setWarn(null); setHelp(false); last.current = Date.now(); }, []);
  const touch = () => { last.current = Date.now(); setWarn(null); };

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

  useEffect(() => {
    if (step !== 'shop') return undefined;
    const t = setTimeout(() => { posSelfAPI.catalogue(token, q).then((r) => setFound(r.items)).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [q, step, token]);
  useEffect(() => { if (step === 'shop') input.current?.focus(); }, [step]);

  const items = useMemo(() => basket.map((b) => ({ variant_id: b.variant_id, quantity: b.quantity })), [basket]);
  useEffect(() => {
    if (step !== 'review' && step !== 'pay') return undefined;
    let live = true;
    posSelfAPI.quote(token, items).then((r) => { if (live) { setQuote(r); setProblem(null); } }).catch((e) => { if (live) { setQuote(null); setProblem(errMsg(e, 'We could not price your basket.')); } });
    return () => { live = false; };
  }, [step, items, token]);

  const add = (it) => setBasket((b) => (b.some((x) => x.variant_id === it.variant_id) ? b.map((x) => (x.variant_id === it.variant_id ? { ...x, quantity: Math.min(20, x.quantity + 1) } : x)) : [...b, { ...it, quantity: 1 }]));
  const bump = (id, d) => setBasket((b) => b.map((x) => (x.variant_id === id ? { ...x, quantity: x.quantity + d } : x)).filter((x) => x.quantity > 0));

  const onEnter = async (e) => {   // a barcode scanner types the code then presses Enter
    if (e.key !== 'Enter' || !q.trim()) return;
    try {
      const r = await posSelfAPI.scan(token, q.trim());
      if (r.item) { add(r.item); setQ(''); } else setProblem('We could not find that item. Try searching by name, or ask for help.');
    } catch (err) { setProblem(errMsg(err, 'Scan failed')); }
  };

  const finish = (r) => { stop.current = true; setBasket([]); setResult(r); setStep('done'); last.current = Date.now(); };

  const wait = async (session, attempt) => {
    stop.current = false;
    for (let n = 0; n < GIVE_UP && !stop.current; n += 1) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (stop.current) return;
      try {
        const s = await checkoutAPI.paymentStatus(attempt.id, attempt.token, true);
        if (s.status === 'confirmed') { const st = await posSelfAPI.status(token, session); finish({ session, pay: 'screen', number: st.number }); return; }
        if (s.status === 'failed') { await posSelfAPI.cancel(token, session).catch(() => {}); setProblem(s.failure_reason || 'The payment did not go through.'); setStep('failed'); return; }
      } catch { /* keep asking */ }
    }
    if (!stop.current) { await posSelfAPI.cancel(token, session).catch(() => {}); setProblem('We did not get your payment. Nothing was charged: please try again or pay at the counter.'); setStep('failed'); }
  };

  const place = async (pay) => {
    setBusy(true); setProblem(null);
    try {
      const r = await posSelfAPI.order(token, { items, pay, payment_method_id: pay === 'screen' ? cfg.payment_methods[0]?.id : undefined, phone: pay === 'screen' ? phone : undefined });
      if (pay === 'counter') { finish({ session: r.session, pay: 'counter', number: r.number }); return; }
      setResult({ session: r.session }); setStep('waiting'); wait(r.session, r.attempt);
    } catch (e) { setProblem(errMsg(e, 'We could not take your order.')); } finally { setBusy(false); }
  };

  const slip = async () => { const r = await posSelfAPI.receipt(token, result.session); printReceipt({ ...r, paper: cfg.paper }); };

  if (lost) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontSize: '1.4rem', padding: 30, textAlign: 'center' }}>This screen is not set up. Please ask a member of staff.</main>;
  if (!cfg) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Loader2 size={48} /></main>;

  const count = basket.reduce((a, b) => a + b.quantity, 0);
  const total = basket.reduce((a, b) => a + (b.price || 0) * b.quantity, 0);
  const shell = (children) => (
    <main onPointerDown={touch} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', color: '#0f172a' }} data-testid="self-checkout" data-step={step}>
      <Helmet><title>{cfg.business}</title></Helmet>
      {children}
      {warn !== null && (
        <div role="alertdialog" aria-label="Still there?" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.8)', display: 'grid', placeItems: 'center', zIndex: 90 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: 40, textAlign: 'center', display: 'grid', gap: 18 }}>
            <h2 style={{ margin: 0, fontSize: '2rem' }}>Are you still there?</h2>
            <p style={{ margin: 0, fontSize: '1.3rem' }}>Starting again in {warn}…</p>
            <button type="button" style={huge('#059669')} onClick={touch}>Yes, keep my basket</button>
          </div>
        </div>
      )}
    </main>
  );

  if (step === 'welcome') {
    return shell(
      <button type="button" onClick={() => { last.current = Date.now(); stop.current = false; setStep('shop'); }} style={{ flex: 1, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(160deg, #0f172a, #1e293b)', color: '#fff', display: 'grid', placeContent: 'center', gap: 22, textAlign: 'center', padding: 40 }}>
        <ScanLine size={96} aria-hidden="true" style={{ justifySelf: 'center' }} />
        <span style={{ fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', fontWeight: 900 }}>{cfg.business}</span>
        <span style={{ fontSize: 'clamp(1.5rem, 4vw, 2.4rem)', opacity: 0.9 }}>Self checkout — touch to start</span>
      </button>,
    );
  }

  if (step === 'done') {
    return shell(
      <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 20, textAlign: 'center', padding: 30 }} role="status">
        <CheckCircle2 size={90} color="#047857" style={{ justifySelf: 'center' }} />
        <h1 style={{ margin: 0, fontSize: '2.2rem' }}>Thank you!</h1>
        {result.pay === 'screen'
          ? <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Paid. Receipt {result.number}.</p>
          : <><p style={{ margin: 0, fontSize: '1.4rem' }}>Take this code to the counter to pay in cash:</p><div style={{ fontSize: '6rem', fontWeight: 900, lineHeight: 1 }}>{result.number}</div></>}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
          {result.pay === 'screen' && <button type="button" style={huge('#334155')} onClick={slip}>Print my receipt</button>}
          <button type="button" style={huge('#0f172a')} onClick={reset}>Done</button>
        </div>
      </div>,
    );
  }

  if (step === 'waiting') {
    return shell(
      <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 20, textAlign: 'center', padding: 30 }} role="status">
        <Loader2 size={80} style={{ justifySelf: 'center' }} />
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Check your phone</h1>
        <p style={{ margin: 0, fontSize: '1.3rem' }}>Enter your M-Pesa PIN to pay. We will carry on as soon as it arrives.</p>
        <button type="button" style={huge('#64748b')} onClick={() => { stop.current = true; posSelfAPI.cancel(token, result.session).catch(() => {}); setStep('review'); }}>Cancel</button>
      </div>,
    );
  }

  if (step === 'failed') {
    return shell(
      <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 20, textAlign: 'center', padding: 30 }} role="alert">
        <h1 style={{ margin: 0, fontSize: '2rem' }}>That did not go through</h1>
        <p style={{ margin: 0, fontSize: '1.3rem' }}>{problem}</p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
          <button type="button" style={huge('#0f172a')} onClick={() => { setProblem(null); setStep('review'); }}>Try again</button>
          <button type="button" style={huge('#64748b')} onClick={reset}>Start over</button>
        </div>
      </div>,
    );
  }

  if (step === 'review' || step === 'pay') {
    return shell(
      <div style={{ flex: 1, display: 'grid', gap: 16, padding: 24, alignContent: 'start', maxWidth: 760, width: '100%', margin: '0 auto' }}>
        <h1 style={{ margin: 0 }}>Your basket</h1>
        {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '1.1rem' }}>{problem}</p>}
        {(quote?.lines ?? []).map((l, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}><span>{l.description} × {l.quantity}</span><span>{money(l.amount)}</span></div>)}
        {quote && (
          <div style={{ display: 'grid', gap: 4, fontSize: '1.1rem', color: '#475569', borderTop: '2px solid #e2e8f0', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(quote.subtotal)}</span></div>
            {(quote.tax_breakdown?.length ? quote.tax_breakdown : (quote.tax_total > 0 ? [{ label: 'Tax', amount: quote.tax_total }] : [])).map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t.label ?? t.name ?? 'Tax'}{t.rate != null ? ` (${t.rate}%)` : ''}</span><span>{money(t.amount ?? t.tax_amount)}</span></div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.8rem', fontWeight: 900 }}><span>Total</span><span>{money(quote?.total)}</span></div>
        {step === 'review' && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button type="button" style={huge('#64748b')} onClick={() => setStep('shop')}>Add more</button>
            <button type="button" style={huge('#059669')} disabled={!quote} onClick={() => setStep('pay')}>Pay</button>
          </div>
        )}
        {step === 'pay' && (
          <div style={{ display: 'grid', gap: 14 }}>
            {cfg.payment_methods.length > 0 && (
              <>
                <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your M-Pesa phone number" aria-label="Phone number" style={{ padding: 18, fontSize: '1.5rem', borderRadius: 14, border: '2px solid #cbd5e1' }} />
                <button type="button" style={huge('#047857')} disabled={busy || !phone.trim() || !quote} onClick={() => place('screen')}>Pay with M-Pesa</button>
              </>
            )}
            <button type="button" style={huge('#334155')} disabled={busy || !quote} onClick={() => place('counter')}>Pay cash at the counter</button>
            <button type="button" style={huge('#64748b')} onClick={() => setStep('review')}>Back</button>
          </div>
        )}
      </div>,
    );
  }

  return shell(
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16, padding: 20, alignItems: 'start' }}>
      <section style={{ display: 'grid', gap: 12 }}>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter} placeholder="Scan an item, or type its name" aria-label="Scan or search" style={{ padding: 18, fontSize: '1.4rem', borderRadius: 14, border: '2px solid #cbd5e1' }} />
        {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>{problem}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {found.map((it) => (
            <button key={it.variant_id} type="button" onClick={() => { setProblem(null); add(it); }} style={{ padding: 14, borderRadius: 14, border: '2px solid #e2e8f0', background: '#fff', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', display: 'grid', gap: 4 }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>{it.name}</span>
              <span style={{ fontWeight: 900 }}>{it.price == null ? '' : money(it.price)}</span>
            </button>
          ))}
        </div>
      </section>
      <aside style={{ display: 'grid', gap: 10, background: '#fff', borderRadius: 16, padding: 16 }}>
        <strong style={{ fontSize: '1.3rem' }}>Basket ({count})</strong>
        {basket.map((b) => (
          <div key={b.variant_id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '1.05rem' }}>{b.name}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" aria-label={`Less ${b.name}`} style={{ ...huge('#e2e8f0', '#0f172a'), padding: '8px 14px' }} onClick={() => bump(b.variant_id, -1)}><Minus size={18} /></button>
              <strong style={{ minWidth: 24, textAlign: 'center' }}>{b.quantity}</strong>
              <button type="button" aria-label={`More ${b.name}`} style={{ ...huge('#e2e8f0', '#0f172a'), padding: '8px 14px' }} onClick={() => bump(b.variant_id, 1)}><Plus size={18} /></button>
            </span>
          </div>
        ))}
        {basket.length === 0 && <p style={{ margin: 0, color: '#64748b' }}>Scan your first item.</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.4rem', fontWeight: 900 }}><span>About</span><span>{money(total)}</span></div>
        <button type="button" style={huge('#059669')} disabled={basket.length === 0} onClick={() => { setProblem(null); setStep('review'); }}>Review and pay</button>
        <button type="button" style={huge('#e2e8f0', '#0f172a')} onClick={() => { setHelp(true); setHelpSent(false); posSelfAPI.help(token).then(() => setHelpSent(true)).catch((e) => setProblem(errMsg(e, 'We could not call for help. Please wave to a member of staff.'))); }}>Call for help</button>
      </aside>
      {help && (
        <div role="dialog" aria-label="Help" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.7)', display: 'grid', placeItems: 'center', zIndex: 80 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 28, display: 'grid', gap: 14, maxWidth: 420, textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>{helpSent ? 'A member of staff has been told and will come to you.' : 'Calling a member of staff…'}</h2>
            <p style={{ margin: 0, color: '#64748b' }}>They can clear this screen or help you pay.</p>
            <button type="button" style={huge('#0f172a')} onClick={() => setHelp(false)}>OK</button>
            <button type="button" style={huge('#64748b')} onClick={reset}>Start over</button>
          </div>
        </div>
      )}
    </div>,
  );
}
