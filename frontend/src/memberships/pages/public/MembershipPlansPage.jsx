import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { Check, IdCard } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import membershipsPublicAPI from '../../../_shared/api/membershipsPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { card, chip, field, money, primaryBtn } from '../../../courses/components/learnStyle';

/** The card that takes someone through joining a plan: what it costs, how to pay, and the button. */
function JoinCard({ plan, onDone }) {
  const customer = useAuthStore((s) => s.customer);
  const [quote, setQuote] = useState(null);
  const [method, setMethod] = useState('');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    membershipsPublicAPI.quote(plan.id).then((q) => { setQuote(q); setMethod(String(q.payment_methods.find((x) => x.gateway === 'mpesa_stk')?.id ?? q.payment_methods[0]?.id ?? '')); }).catch((e) => toast.error(errMsg(e, 'Could not work out the cost.')));
  }, [plan.id]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await membershipsPublicAPI.join(plan.id, { payment_method_id: method ? Number(method) : undefined, phone: phone || undefined });
      if (r.redirect_url) { window.location.assign(r.redirect_url); return; }
      toast.success(r.message, { duration: 8000 });
      onDone(r);
    } catch (e) { toast.error(errMsg(e, 'We could not do that. Please try again.'), { duration: 8000 }); } finally { setBusy(false); }
  };
  if (!quote) return <p>Working out the cost…</p>;

  return (
    <div style={{ display: 'grid', gap: 8 }} data-testid="join-card">
      {quote.free
        ? <span style={{ fontSize: '0.88rem' }}>Nothing to pay now{quote.trial_days ? `: your first ${quote.trial_days} days are free` : ''}.</span>
        : <div style={{ fontSize: '0.86rem', display: 'grid', gap: 2 }}>
          {quote.lines.map((l, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{l.description}</span><span>{money(l.amount)}</span></div>)}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Total with tax</span><span>{money(quote.total)}</span></div>
        </div>}
      {!quote.free && quote.payment_methods.length > 0 && (
        <>
          <select aria-label="Pay with" value={method} onChange={(e) => setMethod(e.target.value)} style={field}>{quote.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <input aria-label="M-Pesa phone" placeholder="M-Pesa phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={field} />
        </>
      )}
      <button type="button" disabled={busy || (!quote.free && !method)} onClick={go} style={primaryBtn}>{busy ? 'Working…' : quote.free ? 'Join' : `Join and pay ${money(quote.total)}`}</button>
    </div>
  );
}

/** Membership plans: what each costs, what it gives, and joining. */
export default function MembershipPlansPage() {
  const signedIn = useAuthStore((s) => Boolean(s.user));
  const [plans, setPlans] = useState(null);
  const [mine, setMine] = useState(null);
  const [joining, setJoining] = useState(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    membershipsPublicAPI.plans().then((r) => setPlans(r.plans)).catch(() => setFailed(true));
    if (signedIn) membershipsPublicAPI.mine().then((r) => setMine(r.memberships.find((m) => ['pending', 'trial', 'active', 'past_due', 'paused', 'lapsed'].includes(m.status)) ?? null)).catch(() => setMine(null));
  };
  useEffect(load, [signedIn]);

  return (
    <div className="min-h-screen">
      <Helmet><title>Membership | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 18 }} data-testid="membership-plans-page">
        <header>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 900 }}><IdCard size={26} aria-hidden="true" /> Membership</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Choose a plan and enjoy what comes with it.</p>
        </header>
        {mine && <div style={card} role="status">You already have a membership ({mine.plan}). <Link to="/membership/my" style={{ fontWeight: 800 }}>Open my membership</Link></div>}
        {failed && <div style={card} role="status">We could not load the plans. Please try again.</div>}
        {!plans && !failed && <p>Loading…</p>}
        {plans && plans.length === 0 && <div style={card}>No plans are open right now.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
          {plans?.map((p) => (
            <article key={p.id} data-plan={p.name} style={{ ...card, display: 'grid', gap: 10, borderColor: p.current ? 'var(--color-primary-500, #6366f1)' : undefined }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>{p.name}</h2>
              <div><span style={{ fontSize: '1.6rem', fontWeight: 900 }}>{p.price > 0 ? money(p.price) : 'Free'}</span> {p.price > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{p.period_label}, before tax</span>}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {p.joining_fee > 0 && <span style={chip}>Joining fee {money(p.joining_fee)}</span>}
                {p.trial_days > 0 && <span style={chip}>{p.trial_days}-day free trial</span>}
                {p.places_left !== null && <span style={chip}>{p.full ? 'Full' : `${p.places_left} places left`}</span>}
              </div>
              {p.summary && <p style={{ margin: 0 }}>{p.summary}</p>}
              {p.benefits.length > 0 && <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, fontSize: '0.9rem' }}>{p.benefits.map((b, i) => <li key={i}><Check size={14} color="#16a34a" aria-hidden="true" /> {b}</li>)}</ul>}
              {p.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{p.description}</p>}
              {!signedIn && <Link to={`/login?redirect=${encodeURIComponent('/membership')}`} style={{ ...primaryBtn, textAlign: 'center', textDecoration: 'none' }}>Sign in to join</Link>}
              {signedIn && p.current && <Link to="/membership/my" style={{ ...primaryBtn, textAlign: 'center', textDecoration: 'none' }}>Your plan</Link>}
              {signedIn && !p.current && !mine && !p.full && (joining === p.id
                ? <JoinCard plan={p} onDone={() => { setJoining(null); load(); }} />
                : <button type="button" style={primaryBtn} onClick={() => setJoining(p.id)}>Join</button>)}
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
