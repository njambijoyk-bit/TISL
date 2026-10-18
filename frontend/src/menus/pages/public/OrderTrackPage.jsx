import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import menusPublicAPI from '../../../_shared/api/menusPublic';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import LineMakeup from '../../components/LineMakeup';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const POLL_MS = 15000;
const card = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line, #e5e7eb)', padding: 18 };

/** Follow an order by the link we sent: where it stands, what was ordered, what it came to. No sign-in; the link is the key. It looks again every few seconds while the order is going. */
export default function OrderTrackPage() {
  const { token } = useParams();
  const [o, setO] = useState(null);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => menusPublicAPI.order(token).then((r) => { setO(r.order); setLost(false); }).catch((e) => { if (e?.response?.status === 404) setLost(true); }), [token]);
  useEffect(() => { load(); }, [load]);
  const open = o && !['completed', 'cancelled'].includes(o.status);
  useEffect(() => { if (!open) return undefined; const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [open, load]);

  const cancel = async () => {
    if (!window.confirm('Cancel this order?')) return;
    setBusy(true);
    try { const r = await menusPublicAPI.cancelOrder(token); setO(r.order); toast.success('Your order was cancelled.'); } catch (e) { toast.error(errMsg(e, 'We could not cancel it. Please call us.'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen">
      <Helmet><title>{o ? `Order ${o.number}` : 'Your order'} | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 620, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="order-track">
        {lost && <div style={card} role="alert"><h1 style={{ margin: 0, fontSize: '1.2rem' }}>We could not find that order</h1><p style={{ color: 'var(--text-secondary)' }}>The link may be incomplete. Please use the link in your message, or call us.</p><Link to="/menu">Back to the menu</Link></div>}
        {o && (
          <>
            <header>
              <h1 style={{ margin: 0, fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 900 }}>Order {o.number}</h1>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }} data-testid="when">
                {o.order_type === 'delivery' ? 'Delivery' : 'Pickup'} {o.asap ? 'as soon as possible' : `at ${new Date(o.fulfil_at).toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}`}
              </p>
            </header>
            {o.status === 'cancelled' ? (
              <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }} role="status"><XCircle color="#b91c1c" /><div><strong>Cancelled</strong>{o.cancel_reason && <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{o.cancel_reason}</div>}{o.payment === 'paid' && <div style={{ fontSize: '0.88rem' }}>We will give your money back.</div>}</div></div>
            ) : (
              <ol style={{ ...card, listStyle: 'none', margin: 0, display: 'grid', gap: 10 }} aria-label="Progress">
                {o.steps.map((s) => (
                  <li key={s.key} aria-current={s.current ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: s.current ? 800 : 500, color: s.done || s.current ? 'inherit' : 'var(--text-tertiary)' }}>
                    {s.done ? <CheckCircle2 size={20} color="#047857" /> : <Circle size={20} color={s.current ? 'var(--color-primary-500)' : '#cbd5e1'} />} {s.label}
                  </li>
                ))}
              </ol>
            )}
            {o.payment === 'pending' && o.status !== 'cancelled' && <p role="status" style={{ ...card, margin: 0, background: 'color-mix(in srgb, #f59e0b 12%, transparent)' }}>We are waiting for your payment. We start as soon as it arrives.</p>}
            {o.payment === 'later' && o.status !== 'cancelled' && <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>You pay when it is {o.order_type === 'delivery' ? 'delivered' : 'collected'}.</p>}
            <section style={card} aria-label="What you ordered">
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {o.lines.map((l, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.92rem' }}>
                    <span>{l.quantity} × {l.name}{l.options.length > 0 && <small style={{ color: 'var(--text-tertiary)' }}> · {l.options.join(', ')}</small>}{l.note && <small style={{ color: 'var(--text-tertiary)' }}> · “{l.note}”</small>}<LineMakeup line={l} color="var(--text-tertiary)" /></span>
                    <span>{money(l.unit_price * l.quantity)}</span>
                  </li>
                ))}
              </ul>
              <hr style={{ border: 0, borderTop: '1px solid var(--line, #e5e7eb)', margin: '12px 0' }} />
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', fontSize: '0.9rem' }}>
                {o.delivery_fee > 0 && <><dt>Delivery</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(o.delivery_fee)}</dd></>}
                <dt>Tax</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(o.tax_total)}</dd>
                <dt style={{ fontWeight: 800 }}>Total</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 800 }}>{money(o.total)}</dd>
              </dl>
              {o.delivery_address && <p style={{ margin: '12px 0 0', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>Delivering to: {o.delivery_address}</p>}
            </section>
            {o.can_cancel && <button type="button" disabled={busy} onClick={cancel} style={{ justifySelf: 'start', padding: '9px 18px', borderRadius: 10, border: '1.5px solid #fca5a5', background: 'transparent', color: '#b91c1c', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Cancel this order</button>}
            <Link to="/menu" style={{ fontWeight: 700 }}>Back to the menu</Link>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
