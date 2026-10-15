import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Loader2, Minus, Plus, ScanLine, Sun, Moon, X, LifeBuoy, RotateCcw } from 'lucide-react';
import useThemeStore from '../../../_shared/store/themeStore';
import { useTheme } from '../../../_shared/theme';
import posSelfAPI from '../../../_shared/api/posSelf';
import checkoutAPI from '../../../_shared/api/checkout';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { printReceipt } from '../admin/pos/printReceipt';
import { btnPrimary, btnGhost } from '../../../_shared/theme/tokens';
import useViewport from '../admin/pos/useViewport';
import ItemTile, { ViewToggle } from '../admin/pos/ItemTile';
import useItemView from '../admin/pos/useItemView';

const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const POLL_MS = 2500;
const GIVE_UP = 60;
const DONE_SECONDS = 25;
const WARN_SECONDS = 10;
/** Buttons use the cashier till's design (the shared tokens), sized for a finger: primary by default, the quiet one when given a neutral background. */
const huge = (bg, fg) => {
  const quiet = bg && !String(bg).includes('--color-primary');
  const own = fg && !['var(--text-inverse, #fff)', 'var(--text-primary)', '#fff'].includes(fg) ? { color: fg } : {};

  return { ...(quiet ? btnGhost : btnPrimary), minHeight: 48, padding: '12px 22px', fontSize: '1rem', touchAction: 'manipulation', ...own };
};

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
  const [helpState, setHelpState] = useState(null);   // { open, minutes, tries, max } from the server
  const [helpMsg, setHelpMsg] = useState(null);
  const [helped, setHelped] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const { narrow, tiny } = useViewport();
  const [view, setView] = useItemView('pos.self.view');
  const [added, setAdded] = useState(null);
  const { setTheme } = useThemeStore();
  const { mode, setMode } = useTheme();   // the colours come from the appearance provider: it sets the theme variables and data-theme
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    read();
    const o = new MutationObserver(read);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => o.disconnect();
  }, [mode]);
  const toggleTheme = () => { const next = dark ? 'light' : 'dark'; setMode(next); setTheme(next); };
  const last = useRef(Date.now());
  const stop = useRef(false);
  const input = useRef(null);

  useEffect(() => { posSelfAPI.config(token).then(setCfg).catch(() => setLost(true)); return () => { stop.current = true; }; }, [token]);

  const reset = useCallback(() => { stop.current = true; setBasket([]); setStep('welcome'); setPhone(''); setQuote(null); setProblem(null); setResult(null); setQ(''); setWarn(null); setHelp(false); last.current = Date.now(); }, []);
  const askHelp = async () => {
    setHelp(true); setHelpMsg(null);
    try { setHelpState(await posSelfAPI.help(token)); } catch (e) { setHelpMsg(errMsg(e, 'We could not call for help. Please wave to a member of staff.')); }
  };
  useEffect(() => {   // while someone has been called, keep checking whether they have been
    if (!cfg || !helpState?.open) return undefined;
    const t = setInterval(() => {
      posSelfAPI.helpStatus(token).then((r) => { setHelpState(r); if (!r.open) { setHelped(true); setTimeout(() => setHelped(false), 12000); } }).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [cfg, helpState?.open, token]);
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
    if (step !== 'review' && step !== 'pay' && step !== 'shop') return undefined;
    if (items.length === 0) { setQuote(null); return undefined; }
    let live = true;
    posSelfAPI.quote(token, items).then((r) => { if (live) { setQuote(r); setProblem(null); } }).catch((e) => { if (live) { setQuote(null); setProblem(errMsg(e, 'We could not price your basket.')); } });
    return () => { live = false; };
  }, [step, items, token]);   // the books price the basket every time it changes: what is shown is what will be charged

  const add = (it) => {
    if (it.stock != null && it.stock <= 0) { setProblem(`Sorry, ${it.name} is out of stock.`); return; }
    const inBasket = basket.find((x) => x.variant_id === it.variant_id)?.quantity ?? 0;
    if (it.stock != null && inBasket + 1 > it.stock) { setProblem(`Sorry, only ${it.stock} of ${it.name} ${it.stock === 1 ? 'is' : 'are'} in stock.`); return; }
    setProblem(null);
    setAdded(it.name); setTimeout(() => setAdded((a) => (a === it.name ? null : a)), 2500);
    setBasket((b) => (b.some((x) => x.variant_id === it.variant_id) ? b.map((x) => (x.variant_id === it.variant_id ? { ...x, quantity: Math.min(20, x.quantity + 1) } : x)) : [...b, { ...it, quantity: 1 }]));
  };
  const removeItem = (id) => { setBasket((b) => b.filter((x) => x.variant_id !== id)); if (basket.length <= 1 && step !== 'shop') setStep('shop'); };
  const startOver = () => { if (basket.length === 0) { reset(); return; } setConfirmClear(true); };
  const bump = (id, d) => setBasket((b) => b.map((x) => {
    if (x.variant_id !== id) return x;
    const q = x.quantity + d;
    if (d > 0 && x.stock != null && q > x.stock) { setProblem(`Sorry, only ${x.stock} of ${x.name} ${x.stock === 1 ? 'is' : 'are'} in stock.`); return x; }
    return { ...x, quantity: q };
  }).filter((x) => x.quantity > 0));

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
    if (!stop.current) setStep('unsure');   // never cancel while the customer may still be typing their PIN
  };

  const checkPaid = async (session) => {   // has the payment landed? (the server asks M-Pesa as well)
    const st = await posSelfAPI.status(token, session);
    if (st.status === 'paid') { finish({ session, pay: 'screen', number: st.number }); return true; }
    return false;
  };
  const cancelWaiting = async () => {
    stop.current = true;
    try { await posSelfAPI.cancel(token, result.session); } catch (e) { if (await checkPaid(result.session).catch(() => false)) return; setProblem(errMsg(e, 'We could not cancel.')); }
    setStep('review'); setProblem('Cancelled. If you already entered your M-Pesa PIN, please tell a member of staff: your payment will be recorded and they will help you.');
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
  const totals = quote && basket.length > 0 && (
    <div style={{ display: 'grid', gap: 4, fontSize: '1.05rem', color: 'var(--text-secondary)', borderTop: '2px solid var(--line)', paddingTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{money(quote.subtotal)}</span></div>
      {(quote.tax_breakdown?.length ? quote.tax_breakdown : (quote.tax_total > 0 ? [{ label: 'Tax', amount: quote.tax_total }] : [])).map((t, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t.label ?? 'Tax'}{t.percent != null ? ` (${t.percent}%)` : ''}</span><span>{money(t.amount)}</span></div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}><span>To pay</span><span>{money(quote.total)}</span></div>
    </div>
  );
  const helpBanner = helpState?.open ? (
    <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '12px 16px', borderRadius: 14, background: '#ecfdf5', border: '2px solid #34d399', color: '#065f46', fontSize: '1.1rem', fontWeight: 700 }}>
      <span>✔ Help is on the way. A member of staff has been told{helpState.minutes > 0 ? ` (${helpState.minutes} min ago)` : ''}. Please stay at this screen.</span>
      <span style={{ display: 'flex', gap: 10 }}>
      <button type="button" onClick={() => posSelfAPI.helpCancel(token).then(setHelpState).catch(() => {})} style={{ ...huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)'), padding: '10px 18px', fontSize: '1rem' }}>I don't need help now</button>
      <button type="button" disabled={helpState.tries >= helpState.max} onClick={askHelp} style={{ ...huge('var(--color-primary-600)'), padding: '10px 18px', fontSize: '1rem' }}>Ask again ({helpState.tries}/{helpState.max})</button>
      </span>
    </div>
  ) : helped ? (
    <div role="status" style={{ padding: '12px 16px', borderRadius: 14, background: '#eff6ff', border: '2px solid #60a5fa', color: '#1e3a8a', fontSize: '1.1rem', fontWeight: 700 }}>A member of staff has attended to you. Thank you for waiting.</div>
  ) : null;
  const themeBtn = (   // a sliding switch: sun on the left, moon on the right
    <button type="button" role="switch" aria-checked={dark} onClick={toggleTheme} aria-label="Dark theme" title={dark ? 'Dark theme on' : 'Light theme on'}
      style={{ position: 'relative', width: 64, height: 32, borderRadius: 999, border: '1.5px solid var(--line)', padding: 0, cursor: 'pointer', flexShrink: 0, background: dark ? 'var(--color-primary-500)' : 'var(--bg-tertiary, #f3f4f6)', transition: 'background 200ms ease' }}>
      <Sun size={14} aria-hidden="true" style={{ position: 'absolute', left: 9, top: 8, color: dark ? 'var(--text-inverse, #fff)' : 'var(--text-secondary)', opacity: dark ? 0.7 : 0 }} />
      <Moon size={14} aria-hidden="true" style={{ position: 'absolute', right: 9, top: 8, color: 'var(--text-secondary)', opacity: dark ? 0 : 0.8 }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 3, left: dark ? 35 : 3, width: 24, height: 24, borderRadius: '50%', background: 'var(--surface-card, #fff)', boxShadow: '0 1px 4px rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', transition: 'left 200ms ease' }}>
        {dark ? <Moon size={14} color="var(--color-primary-600)" /> : <Sun size={14} color="var(--color-primary-600)" />}
      </span>
    </button>
  );
  const shell = (children) => (
    <main onPointerDown={touch} style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary, #f9fafb)', color: 'var(--text-primary)' }} data-testid="self-checkout" data-step={step}>
      <Helmet><title>{cfg.business}</title></Helmet>
      {['shop', 'review', 'pay'].includes(step) && (
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: tiny ? '4px 10px' : '6px 16px', background: 'var(--surface-card, #fff)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 20 }}>
          <strong style={{ fontSize: tiny ? '0.95rem' : '1.05rem' }}>{cfg.business}</strong>
          <ol aria-label="Steps" style={{ display: 'flex', gap: tiny ? 4 : 8, listStyle: 'none', margin: 0, padding: 0, fontWeight: 700, order: tiny ? 3 : 0, width: tiny ? '100%' : 'auto', justifyContent: 'center', fontSize: '0.82rem' }}>
            {[['shop', '1  Scan'], ['review', '2  Check'], ['pay', '3  Pay']].map(([k, l]) => (
              <li key={k} aria-current={step === k ? 'step' : undefined} style={{ padding: tiny ? '3px 8px' : '3px 12px', flex: tiny ? 1 : 'none', textAlign: 'center', borderRadius: 999, background: step === k ? 'var(--color-primary-500)' : 'var(--bg-tertiary, #f3f4f6)', color: step === k ? 'var(--text-inverse, #fff)' : 'var(--text-secondary)' }}>{l}</li>
            ))}
          </ol>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={askHelp} style={{ ...huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)'), padding: '6px 12px', minHeight: 36, fontSize: '0.85rem', display: 'inline-flex', gap: 6, alignItems: 'center' }}><LifeBuoy size={16} />{tiny ? <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Help</span> : ' Help'}</button>
            <button type="button" onClick={startOver} style={{ ...huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)'), padding: '6px 12px', minHeight: 36, fontSize: '0.85rem', display: 'inline-flex', gap: 6, alignItems: 'center' }}><RotateCcw size={16} />{tiny ? <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Start over</span> : ' Start over'}</button>
            {themeBtn}
          </span>
        </header>
      )}
      {children}
      {confirmClear && (
        <div role="alertdialog" aria-label="Start over?" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.75)', display: 'grid', placeItems: 'center', zIndex: 95 }}>
          <div style={{ background: 'var(--surface-card, #fff)', borderRadius: 24, padding: 32, textAlign: 'center', display: 'grid', gap: 16, maxWidth: 440 }}>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>Clear your basket and start again?</h2>
            <p style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-secondary)' }}>All {count} item{count === 1 ? '' : 's'} will be removed. Nothing has been charged.</p>
            <button type="button" style={huge('var(--color-primary-500)')} onClick={() => { setConfirmClear(false); reset(); }}>Yes, clear it</button>
            <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={() => setConfirmClear(false)}>No, keep my basket</button>
          </div>
        </div>
      )}
      {warn !== null && (
        <div role="alertdialog" aria-label="Still there?" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.8)', display: 'grid', placeItems: 'center', zIndex: 90 }}>
          <div style={{ background: 'var(--surface-card, #fff)', borderRadius: 24, padding: 40, textAlign: 'center', display: 'grid', gap: 18 }}>
            <h2 style={{ margin: 0, fontSize: '2rem' }}>Are you still there?</h2>
            <p style={{ margin: 0, fontSize: '1.3rem' }}>Starting again in {warn}…</p>
            <button type="button" style={huge('var(--color-primary-500)')} onClick={touch}>Yes, keep my basket</button>
          </div>
        </div>
      )}
    </main>
  );

  if (step === 'welcome') {
    return shell(
      <>
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 5 }}>{themeBtn}</div>
      <button type="button" onClick={() => { last.current = Date.now(); stop.current = false; setStep('shop'); }} style={{ flex: 1, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(160deg, var(--color-primary-500), var(--color-primary-600))', color: 'var(--text-inverse, #fff)', display: 'grid', placeContent: 'center', gap: 22, textAlign: 'center', padding: 40 }}>
        <ScanLine size={96} aria-hidden="true" style={{ justifySelf: 'center' }} />
        <span style={{ fontSize: 'clamp(2.4rem, 7vw, 4.5rem)', fontWeight: 900 }}>{cfg.business}</span>
        <span style={{ fontSize: 'clamp(1.5rem, 4vw, 2.4rem)', opacity: 0.9 }}>Self checkout - touch to start</span>
      </button>
      </>,
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
          {result.pay === 'screen' && <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={slip}>Print my receipt</button>}
          <button type="button" style={huge('var(--color-primary-500)')} onClick={reset}>Done</button>
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
        <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={cancelWaiting}>Cancel</button>
      </div>,
    );
  }

  if (step === 'unsure') {
    return shell(
      <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 18, textAlign: 'center', padding: 30, maxWidth: 640, margin: '0 auto' }} role="status">
        <Loader2 size={64} style={{ justifySelf: 'center' }} />
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)' }}>We have not seen your payment yet</h1>
        <p style={{ margin: 0, fontSize: '1.2rem' }}>If you have already entered your M-Pesa PIN, <strong>please wait and do not pay again</strong>. Sometimes it takes a minute to arrive.</p>
        {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c' }}>{problem}</p>}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={huge('var(--color-primary-500)')} disabled={busy} onClick={async () => { setBusy(true); setProblem(null); try { if (!(await checkPaid(result.session))) setProblem('Still nothing yet. Please wait a little and check again, or call for help.'); } catch (e) { setProblem(errMsg(e, 'Could not check.')); } finally { setBusy(false); } }}>Check again</button>
          <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={askHelp}>Call for help</button>
          <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={cancelWaiting}>I did not pay: cancel</button>
        </div>
      </div>,
    );
  }

  if (step === 'failed') {
    return shell(
      <div style={{ flex: 1, display: 'grid', placeContent: 'center', gap: 20, textAlign: 'center', padding: 30 }} role="alert">
        <h1 style={{ margin: 0, fontSize: '2rem' }}>That did not go through</h1>
        <p style={{ margin: 0, fontSize: '1.3rem' }}>{problem}</p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
          <button type="button" style={huge('var(--color-primary-500)')} onClick={() => { setProblem(null); setStep('review'); }}>Try again</button>
          <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={reset}>Start over</button>
        </div>
      </div>,
    );
  }

  if (step === 'review' || step === 'pay') {
    return shell(
      <div style={{ flex: 1, display: 'grid', gap: 16, padding: tiny ? 14 : 24, alignContent: 'start', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <h1 style={{ margin: 0 }}>Your basket</h1>
        {helpBanner}
        {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '1.1rem' }}>{problem}</p>}
        {(quote?.lines ?? []).map((l, i) => {
          const b = basket[i];
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: tiny ? '1.05rem' : '1.2rem', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' }}>{l.description}</span>
              {step === 'review' && b && (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button type="button" aria-label={`Less ${b.name}`} style={{ ...huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)'), padding: '8px 12px' }} onClick={() => bump(b.variant_id, -1)}><Minus size={18} /></button>
                  <strong style={{ minWidth: 24, textAlign: 'center' }}>{l.quantity}</strong>
                  <button type="button" aria-label={`More ${b.name}`} style={{ ...huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)'), padding: '8px 12px' }} onClick={() => bump(b.variant_id, 1)}><Plus size={18} /></button>
                </span>
              )}
              {step !== 'review' && <span>× {l.quantity}</span>}
              <strong style={{ minWidth: 90, textAlign: 'right' }}>{money(l.amount)}</strong>
              {step === 'review' && b && <button type="button" aria-label={`Remove ${b.name}`} title="Remove this item" style={{ ...huge('var(--bg-tertiary, #f3f4f6)', '#b91c1c'), padding: '8px 12px' }} onClick={() => removeItem(b.variant_id)}><X size={20} /></button>}
            </div>
          );
        })}
        {totals}
        {step === 'review' && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={() => setStep('shop')}>Add more</button>
            <button type="button" style={huge('var(--color-primary-500)')} disabled={!quote} onClick={() => setStep('pay')}>Pay</button>
          </div>
        )}
        {step === 'pay' && (
          <div style={{ display: 'grid', gap: 14 }}>
            {cfg.payment_methods.length > 0 && (
              <>
                <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your M-Pesa phone number" aria-label="Phone number" style={{ padding: 18, fontSize: '1.5rem', borderRadius: 14, border: '2px solid var(--line)' }} />
                <button type="button" style={huge('var(--color-primary-600)')} disabled={busy || !phone.trim() || !quote} onClick={() => place('screen')}>Pay with M-Pesa</button>
              </>
            )}
            <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} disabled={busy || !quote} onClick={() => place('counter')}>Pay cash at the counter</button>
            <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={() => setStep('review')}>Back</button>
          </div>
        )}
      </div>,
    );
  }

  return shell(
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(0,1.3fr) minmax(0,1fr)', gap: 16, padding: tiny ? 12 : 20, alignItems: 'start', width: '100%', maxWidth: 1700, margin: '0 auto', boxSizing: 'border-box', paddingBottom: narrow && basket.length ? 96 : undefined }}>
      <section style={{ display: 'grid', gap: 12 }}>
        {helpBanner}
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter} placeholder="Scan an item, or type its name" aria-label="Scan or search" style={{ padding: tiny ? 14 : 18, fontSize: tiny ? '1.1rem' : '1.4rem', width: '100%', boxSizing: 'border-box', borderRadius: 14, border: '2px solid var(--line)' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><ViewToggle view={view} onChange={setView} big /></div>
        {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '1.1rem', fontWeight: 700 }}>{problem}</p>}
        {added && !problem && <p role="status" style={{ margin: 0, color: 'var(--color-primary-700)', fontSize: '1.1rem', fontWeight: 700 }}>✔ {added} added to your basket</p>}
        <div style={{ display: 'grid', gridTemplateColumns: view === 'list' ? '1fr' : `repeat(auto-fill, minmax(${tiny ? 140 : 190}px, 1fr))`, gap: 10 }}>
          {found.map((it) => (
            <ItemTile key={it.variant_id} item={it} view={view} big onAdd={add} price={it.price == null ? '' : money(it.price)} stockText={it.stock != null && it.stock <= 5 ? `Only ${it.stock} left` : null} stockLow />
          ))}
        </div>
      </section>
      <aside style={{ display: 'grid', gap: 10, background: 'var(--surface-card, #fff)', borderRadius: 16, padding: 16, ...(narrow ? {} : { position: 'sticky', top: 56, maxHeight: 'calc(100vh - 72px)', overflowY: 'auto' }) }}>
        <strong style={{ fontSize: '1.3rem' }}>Basket ({count})</strong>
        {basket.map((b) => (
          <div key={b.variant_id} style={{ display: 'grid', gridTemplateColumns: tiny ? '1fr' : '1fr auto', gap: 8, alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: '1.05rem' }}>{b.name}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" aria-label={`Less ${b.name}`} style={{ ...huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)'), padding: '8px 14px' }} onClick={() => bump(b.variant_id, -1)}><Minus size={18} /></button>
              <strong style={{ minWidth: 24, textAlign: 'center' }}>{b.quantity}</strong>
              <button type="button" aria-label={`More ${b.name}`} style={{ ...huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)'), padding: '8px 14px' }} onClick={() => bump(b.variant_id, 1)}><Plus size={18} /></button>
              <button type="button" aria-label={`Remove ${b.name}`} title="Remove this item" style={{ ...huge('var(--bg-tertiary, #f3f4f6)', '#b91c1c'), padding: '8px 12px' }} onClick={() => removeItem(b.variant_id)}><X size={20} /></button>
            </span>
          </div>
        ))}
        {basket.length === 0 && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Your basket is empty. Scan an item's barcode, or tap an item on the left to add it. Use the ✕ beside an item to take it out.</p>}
        {totals}
        <button type="button" style={huge('var(--color-primary-500)')} disabled={basket.length === 0} onClick={() => { setProblem(null); setStep('review'); }}>Review and pay</button>
      </aside>
      {narrow && basket.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-card, #fff)', borderTop: '2px solid var(--line)', boxShadow: '0 -6px 20px rgba(0,0,0,0.12)' }}>
          <span style={{ fontWeight: 900, fontSize: '1.15rem' }}>{count} item{count === 1 ? '' : 's'}{quote ? ` · ${money(quote.total)}` : ''}</span>
          <button type="button" style={{ ...huge('var(--color-primary-500)'), padding: '12px 20px' }} onClick={() => { setProblem(null); setStep('review'); }}>Review and pay</button>
        </div>
      )}
      {help && (
        <div role="dialog" aria-label="Help" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.7)', display: 'grid', placeItems: 'center', zIndex: 80 }}>
          <div style={{ background: 'var(--surface-card, #fff)', borderRadius: 20, padding: 28, display: 'grid', gap: 14, maxWidth: 420, textAlign: 'center' }}>
            {helpMsg
              ? <h2 style={{ margin: 0, color: '#b91c1c' }}>{helpMsg}</h2>
              : !helpState
                ? <h2 style={{ margin: 0 }}>Calling a member of staff…</h2>
                : <h2 style={{ margin: 0, color: 'var(--color-primary-700)' }}>✔ A member of staff has been told and is coming. Please stay at this screen.</h2>}
            {helpState && <p style={{ margin: 0, fontWeight: 700 }}>Request {helpState.tries} of {helpState.max} allowed this hour.</p>}
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>They can clear this screen or help you pay.</p>
            <button type="button" style={huge('var(--color-primary-500)')} onClick={() => setHelp(false)}>OK</button>
            <button type="button" style={huge('var(--bg-tertiary, #f3f4f6)', 'var(--text-primary)')} onClick={reset}>Start over</button>
          </div>
        </div>
      )}
    </div>,
  );
}
