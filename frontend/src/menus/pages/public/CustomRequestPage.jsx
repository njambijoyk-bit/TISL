import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import menusPublicAPI from '../../../_shared/api/menusPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso) => new Date(iso).toLocaleString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
const card = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line, #e5e7eb)', padding: 18 };
const btn = { padding: '12px 20px', borderRadius: 12, border: 'none', background: 'var(--color-primary-500, #e11d48)', color: '#fff', font: 'inherit', fontWeight: 800, cursor: 'pointer' };
const HOW = { pickup: 'You collect it', delivery: 'Delivered to', serve: 'Served at' };

/** A cake or catering request, by the link we sent: the quote, accepting it, the deposit, the balance. No sign-in to look; accepting and paying need your account. */
export default function CustomRequestPage() {
  const { token } = useParams();
  const user = useAuthStore((s) => s.user);
  const customer = useAuthStore((s) => s.customer);
  const [r, setR] = useState(null);
  const [methods, setMethods] = useState([]);
  const [method, setMethod] = useState('');
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(null);   // the paid_total we are waiting to see grow
  const stop = useRef(false);

  const load = useCallback(() => menusPublicAPI.customRequest(token).then((x) => {
    setR(x.request); setMethods(x.payment_methods); setLost(false);
    setMethod((m) => m || String(x.payment_methods.find((p) => p.gateway === 'mpesa_stk')?.id ?? x.payment_methods[0]?.id ?? ''));

    return x.request;
  }).catch((e) => { if (e?.response?.status === 404) setLost(true); }), [token]);
  useEffect(() => { stop.current = false; load(); return () => { stop.current = true; }; }, [load]);

  // after a payment prompt: look again every few seconds until the money shows
  useEffect(() => {
    if (waiting === null) return undefined;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      const x = await load();
      if (stop.current) return;
      if (x && x.paid_total > waiting) { setWaiting(null); toast.success('Payment received. Thank you!'); } else if (n >= 40) { setWaiting(null); }
    }, 4000);

    return () => clearInterval(t);
  }, [waiting, load]);

  const act = async (fn) => {
    setBusy(true);
    try {
      const res = await fn();
      setR(res.request);
      if (res.redirect_url) { window.location.assign(res.redirect_url); return; }
      toast.success(res.message ?? 'Done.');
      if (res.attempt) setWaiting(res.request.paid_total);
    } catch (e) { toast.error(errMsg(e, 'Something went wrong. Please try again.'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const decline = async () => {
    if (!window.confirm('Turn this down?')) return;
    setBusy(true);
    try { const res = await menusPublicAPI.customDecline(token); setR(res.request); } catch (e) { toast.error(errMsg(e, 'Could not do that.')); } finally { setBusy(false); }
  };

  const signedIn = Boolean(user && customer);
  const picker = methods.length > 1 && (
    <select aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', font: 'inherit' }}>
      {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
  const needsMethod = r && r.deposit_amount > 0;

  return (
    <div className="min-h-screen">
      <Helmet><title>{r ? `Request ${r.number}` : 'Your request'} | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="custom-request">
        {lost && <div style={card} role="alert"><h1 style={{ margin: 0, fontSize: '1.2rem' }}>We could not find that request</h1><p style={{ color: 'var(--text-secondary)' }}>The link may be incomplete. Please use the link in your message, or call us.</p><Link to="/menu/custom">Make a new request</Link></div>}
        {r && (
          <>
            <header>
              <h1 style={{ margin: 0, fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 900 }}>{r.kind_label} · {r.number}</h1>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }} data-testid="when">{day(r.event_at)}{r.headcount ? ` · ${r.headcount} people` : ''}</p>
              <p style={{ margin: '2px 0 0', fontWeight: 800 }} data-testid="status">{r.status_label}</p>
            </header>

            {['declined', 'cancelled', 'expired'].includes(r.status) && (
              <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }} role="status"><XCircle color="#b91c1c" aria-hidden="true" /><div><strong>{r.status_label}</strong>{r.cancel_reason && <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{r.cancel_reason}</div>}{r.paid_total > 0 && r.status === 'cancelled' && <div style={{ fontSize: '0.88rem' }}>We will give your deposit back.</div>}</div></div>
            )}
            {r.status === 'requested' && <p role="status" style={{ ...card, margin: 0 }}>We have your request. We will send you a quote soon{r.can_decline ? '' : '.'}</p>}
            {['confirmed', 'preparing'].includes(r.status) && <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }} role="status"><CheckCircle2 color="#047857" aria-hidden="true" /><div><strong>You are booked.</strong> We will have it ready for {day(r.event_at)}.</div></div>}
            {r.status === 'ready' && <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }} role="status"><CheckCircle2 color="#047857" aria-hidden="true" /><strong>It is ready.</strong></div>}
            {r.status === 'completed' && <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }} role="status"><CheckCircle2 color="#047857" aria-hidden="true" /><strong>Done. Thank you!</strong></div>}

            <section style={card} aria-label="The details">
              <p style={{ margin: 0, fontSize: '0.9rem' }}>{HOW[r.fulfil]}{r.address ? `: ${r.address}` : ''}</p>
              {r.message && <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>On the cake: “{r.message}”</p>}
              {r.wishes && <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>{r.wishes}</p>}
              {r.lines.length > 0 && (
                <>
                  <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                    {r.lines.map((l) => (
                      <li key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.92rem' }}>
                        <span>{l.quantity} × {l.name}{l.options.length > 0 && <small style={{ color: 'var(--text-tertiary)' }}> · {l.options.join(', ')}</small>}</span><span>{money(l.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <hr style={{ border: 0, borderTop: '1px solid var(--line, #e5e7eb)', margin: '12px 0' }} />
                  <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', fontSize: '0.9rem' }}>
                    <dt>Tax</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(r.tax_total)}</dd>
                    <dt style={{ fontWeight: 800 }}>Total</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 800 }} data-testid="total">{money(r.total)}</dd>
                    <dt>Deposit to confirm ({r.deposit_pct}%)</dt><dd style={{ margin: 0, textAlign: 'right' }} data-testid="deposit">{money(r.deposit_amount)}</dd>
                    {r.paid_total > 0 && <><dt>Paid so far</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(r.paid_total)}</dd></>}
                    {r.paid_total > 0 && <><dt>Still to pay</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(r.balance)}</dd></>}
                  </dl>
                </>
              )}
            </section>

            {r.can_accept && (
              <section style={{ ...card, display: 'grid', gap: 10 }} aria-label="Accept the quote">
                <p style={{ margin: 0, fontSize: '0.9rem' }}>This quote is open until <strong>{r.valid_until}</strong>. Pay the deposit of <strong>{money(r.deposit_amount)}</strong> to confirm it.</p>
                {!signedIn ? (
                  <p style={{ margin: 0 }}><Link to={`/login?redirect=${encodeURIComponent(`/menu/request/${token}`)}`} style={{ fontWeight: 800 }}>Sign in</Link> to accept it (the balance is kept on your account).</p>
                ) : (
                  <>
                    {needsMethod && picker}
                    <button type="button" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy || (needsMethod && !method)} onClick={() => act(() => menusPublicAPI.customAccept(token, { payment_method_id: needsMethod ? Number(method) : undefined }))}>
                      {needsMethod ? `Accept and pay ${money(r.deposit_amount)}` : 'Accept'}
                    </button>
                  </>
                )}
                <button type="button" onClick={decline} disabled={busy} style={{ justifySelf: 'start', background: 'none', border: 'none', color: '#b91c1c', font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 0 }}>No thanks</button>
              </section>
            )}
            {r.can_decline && !r.can_accept && r.status === 'requested' && <button type="button" onClick={decline} disabled={busy} style={{ justifySelf: 'start', background: 'none', border: 'none', color: '#b91c1c', font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Withdraw this request</button>}

            {r.pay_due > 0 && !r.can_accept && (
              <section style={{ ...card, display: 'grid', gap: 10 }} aria-label="Pay">
                <p style={{ margin: 0, fontSize: '0.9rem' }}>{r.status === 'accepted' ? 'Your deposit has not arrived yet.' : 'You can pay the balance now, or when you collect it.'} <strong>{money(r.pay_due)}</strong></p>
                {picker}
                <button type="button" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy || !method} onClick={() => act(() => menusPublicAPI.customPay(token, { payment_method_id: Number(method) }))}>Pay {money(r.pay_due)}</button>
              </section>
            )}
            {waiting !== null && <p role="status" style={{ ...card, margin: 0 }}>Waiting for your payment… check your phone and enter your M-Pesa PIN.</p>}
            <Link to="/menu" style={{ fontWeight: 700 }}>Back to the menu</Link>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
