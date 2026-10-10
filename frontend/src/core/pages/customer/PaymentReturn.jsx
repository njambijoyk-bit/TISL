import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle, Undo2 } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import checkoutAPI from '../../../_shared/api/checkout';

const card = { background: 'var(--surface-card, #fff)', borderRadius: 12, border: '1px solid var(--line)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', padding: 20, minWidth: 0 };
const POLL_MS = 3000;
const GIVE_UP = 40;   // ~2 minutes of asking before we say "we'll confirm it by email"

/**
 * Where the customer lands after a card provider's page (?attempt=&t=, plus &cancelled=1 when they backed out). It asks the server how the payment went, and the server asks
 * the provider, so a payment is shown as received only when it really is. It works without signing in: the code in the link proves it is theirs.
 */
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const attempt = params.get('attempt');
  const t = params.get('t');
  const cancelled = params.get('cancelled') === '1';
  const [s, setS] = useState(null);
  const [lost, setLost] = useState(false);
  const [slow, setSlow] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    if (!attempt || !t) { setLost(true); return undefined; }
    stop.current = false;
    let n = 0;
    const ask = async () => {
      if (stop.current) return;
      n += 1;
      try {
        const r = await checkoutAPI.paymentStatus(attempt, t, true);
        if (stop.current) return;
        setS(r);
        if (r.status !== 'pending') return;
      } catch (e) {
        if (e?.response?.status === 404) { setLost(true); return; }
      }
      if (n >= GIVE_UP) { setSlow(true); return; }
      setTimeout(ask, cancelled ? POLL_MS * 2 : POLL_MS);
    };
    ask();
    return () => { stop.current = true; };
  }, [attempt, t, cancelled]);

  const body = () => {
    if (lost) return <Result icon={<XCircle size={36} color="#b91c1c" />} title="We could not find that payment" text="This link is not valid. If you were charged, your order will still be confirmed: check My orders, or contact us." />;
    if (s?.status === 'confirmed') return <Result icon={<CheckCircle2 size={36} color="#047857" />} title="Payment received. Thank you!" text={`${s.order_number ? `Order ${s.order_number} is paid. ` : ''}We have emailed you a receipt.`} primary />;
    if (s?.status === 'failed') return <Result icon={<XCircle size={36} color="#b91c1c" />} title="The payment did not go through" text={`${s.failure_reason || 'It was declined or timed out.'} Your order${s.order_number ? ` ${s.order_number}` : ''} is saved: you can pay it again from My orders.`} primary />;
    if (cancelled && s?.status === 'pending') return <Result icon={<Undo2 size={36} color="#b45309" />} title="You left before paying" text={`Nothing was charged. Your order${s.order_number ? ` ${s.order_number}` : ''} is saved: you can pay it from My orders whenever you are ready.`} primary />;
    if (slow) return <Result icon={<Loader2 size={36} color="#6d28d9" />} title="Still waiting for the bank" text="We have not heard back yet. If you paid, your order is confirmed as soon as the bank tells us, and we will email you. You can close this page." primary />;
    return <Result icon={<Loader2 size={36} color="#6d28d9" style={{ animation: 'spin 1s linear infinite' }} />} title="Confirming your payment…" text="Please wait a moment. This page updates by itself." />;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, maxWidth: 520, margin: '0 auto', padding: '48px 16px', width: '100%', boxSizing: 'border-box' }}>
        <div role="status" aria-live="polite" style={{ ...card, textAlign: 'center', padding: 28 }}>{body()}</div>
      </main>
      <Footer />
    </div>
  );
}

function Result({ icon, title, text, primary }) {
  return (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
      {icon}
      <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{title}</h1>
      <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{text}</p>
      {primary && <Link to="/orders" style={{ marginTop: 6, padding: '9px 18px', borderRadius: 8, background: '#6d28d9', color: 'white', fontWeight: 700, textDecoration: 'none' }}>Go to My orders</Link>}
    </div>
  );
}
