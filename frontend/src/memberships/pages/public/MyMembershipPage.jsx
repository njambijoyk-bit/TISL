import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { IdCard } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import membershipsPublicAPI from '../../../_shared/api/membershipsPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { card, chip, field, money, primaryBtn } from '../../../courses/components/learnStyle';

const day = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const MSG = { pending: 'Waiting for your payment', trial: 'On trial', active: 'Active', past_due: 'Payment late', paused: 'Paused', lapsed: 'Lapsed', cancelled: 'Ended', ended: 'Ended' };
const link = { background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit', padding: 0, font: 'inherit' };

function PayBox({ m, methods, busy, go }) {
  const customer = useAuthStore((s) => s.customer);
  const [method, setMethod] = useState(String(methods.find((x) => x.gateway === 'mpesa_stk')?.id ?? methods[0]?.id ?? ''));
  const [phone, setPhone] = useState(customer?.phone ?? '');
  if (!methods.length) return <span style={{ fontSize: '0.86rem' }}>Please pay at our desk or contact us.</span>;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <select aria-label="Pay with" value={method} onChange={(e) => setMethod(e.target.value)} style={field}>{methods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input aria-label="M-Pesa phone" placeholder="M-Pesa phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={field} />
      <button type="button" disabled={busy || !method} style={primaryBtn} onClick={() => go(() => membershipsPublicAPI.pay(m.id, { payment_method_id: Number(method), phone: phone || undefined }))}>Pay {money(m.open.owing)}</button>
    </div>
  );
}

/** The member card: a QR to show at the door or desk. It belongs to the person, so it keeps working after a renewal or a change of plan. */
function MemberCard() {
  const [c, setC] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { membershipsPublicAPI.card().then((r) => setC(r.card)).catch(() => setC(null)); }, []);
  if (!c) return null;

  return (
    <div style={{ ...card, display: 'grid', gap: 8, justifyItems: 'center', textAlign: 'center' }} data-testid="member-card">
      <strong style={{ fontSize: '1.1rem' }}>My member card</strong>
      {open ? <>
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(c.svg)}`} alt="Member card QR code" style={{ width: 'min(260px, 70vw)', height: 'auto', background: '#fff', padding: 8, borderRadius: 12 }} />
        <span style={{ fontWeight: 800 }}>{c.name}</span>
        <span style={{ fontSize: '0.86rem' }}>{c.plan} · {c.number}{c.last_day ? ` · paid up to ${day(c.last_day)}` : ''}</span>
        {c.branches && <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Valid at {c.branches.join(', ')}</span>}
        <button type="button" style={link} onClick={() => setOpen(false)}>Hide</button>
      </> : <button type="button" style={primaryBtn} onClick={() => setOpen(true)}>Show my card at the door</button>}
    </div>
  );
}

function One({ m, methods, settings, plans, reload }) {
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState('');
  const [waiting, setWaiting] = useState(false);
  const timer = useRef(null);
  const go = async (fn) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.redirect_url) { window.location.assign(r.redirect_url); return; }
      toast.success(r.message, { duration: 8000 });
      if (r.attempt) setWaiting(true);
      await reload();
    } catch (e) { toast.error(errMsg(e, 'We could not do that. Please try again.'), { duration: 8000 }); } finally { setBusy(false); }
  };
  // after an M-Pesa prompt, look again every few seconds until the payment shows
  useEffect(() => {
    if (!waiting) return undefined;
    let n = 0;
    timer.current = setInterval(() => { n += 1; reload(); if (n >= 30) setWaiting(false); }, 4000);

    return () => clearInterval(timer.current);
  }, [waiting, reload]);
  useEffect(() => { if (waiting && !m.open) { setWaiting(false); toast.success('Payment received. Thank you!'); } }, [m.open, waiting]);
  const live = ['pending', 'trial', 'active', 'past_due', 'paused', 'lapsed'].includes(m.status);

  return (
    <article style={{ ...card, display: 'grid', gap: 10 }} data-membership={m.number}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ flex: 1, minWidth: 180, fontSize: '1.2rem' }}>{m.plan}</strong>
        <span style={{ ...chip, ...(['past_due', 'lapsed'].includes(m.status) ? { background: '#fee2e2', color: '#b91c1c' } : {}) }}>{MSG[m.status] ?? m.status_label}</span>
      </div>
      <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{m.number}{m.as_payer ? ` · you pay for ${m.member}` : ''}</span>
      {m.last_day && m.status !== 'pending' && <span>Paid up to <strong>{day(m.last_day)}</strong>{m.status === 'trial' && m.trial_ends_on ? ` · free trial until ${day(m.trial_ends_on)}` : ''}</span>}
      {m.status === 'paused' && <span>Paused until <strong>{day(m.paused_until)}</strong>. <button type="button" style={link} disabled={busy} onClick={() => go(() => membershipsPublicAPI.resume(m.id))}>Come back now</button></span>}
      {m.cancel_at_end && <span style={{ color: '#92400e' }}>It ends on {day(m.last_day)}. <button type="button" style={link} disabled={busy} onClick={() => go(() => membershipsPublicAPI.keep(m.id))}>Keep my membership</button></span>}
      {m.change_to && <span>It moves to {m.change_to} at your next renewal.</span>}
      {m.status === 'lapsed' && <span style={{ color: '#b91c1c' }}>Your benefits have stopped because the payment was not made. Pay below to start again.</span>}
      {m.open && (
        <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 8 }} data-testid="open-invoice">
          <span><strong>{m.open.label}</strong>{m.open.due_date ? ` · due ${day(m.open.due_date)}` : ''}</span>
          {waiting ? <span role="status">Waiting for your payment to arrive…</span> : <PayBox m={m} methods={methods} busy={busy} go={go} />}
        </div>
      )}
      {live && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.88rem' }}>
          {m.can_pause && !m.as_payer && <button type="button" style={link} disabled={busy} onClick={() => { const d = window.prompt(`Pause for how many days? (up to ${settings.pause_days_per_year} a year)`, '14'); if (d) go(() => membershipsPublicAPI.pause(m.id, Number(d))); }}>Pause</button>}
          {m.can_cancel && <button type="button" style={link} disabled={busy} onClick={() => { const r = window.prompt('We are sorry to see you go. Why? (optional)', ''); if (r !== null) go(() => membershipsPublicAPI.cancel(m.id, r)); }}>{m.status === 'pending' ? 'Cancel' : 'End my membership'}</button>}
        </div>
      )}
      {['trial', 'active'].includes(m.status) && !m.cancel_at_end && m.billing === 'invoice' && plans.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select aria-label="Change plan" value={plan} onChange={(e) => setPlan(e.target.value)} style={{ ...field, width: 'auto' }}><option value="">Change my plan…</option>{plans.filter((p) => p.id !== m.plan_id).map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)} {p.period_label}</option>)}</select>
          <button type="button" disabled={busy || !plan} style={{ ...primaryBtn, padding: '8px 14px' }} onClick={() => go(() => membershipsPublicAPI.changePlan(m.id, Number(plan)))}>Change</button>
        </div>
      )}
      {m.periods.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>My payments</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.84rem' }}>{m.periods.map((p) => <li key={p.id}>{p.label} · {money(p.paid_amount)} of {money(p.amount)} · {p.status}</li>)}</ul>
        </details>
      )}
    </article>
  );
}

/** My membership: where I stand, what I owe, and what I can do about it. */
export default function MyMembershipPage() {
  const user = useAuthStore((s) => s.user);
  const [d, setD] = useState(null);
  const [plans, setPlans] = useState([]);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => membershipsPublicAPI.mine().then((r) => { setD(r); setFailed(false); }).catch(() => setFailed(true)), []);
  useEffect(() => { if (user) { load(); membershipsPublicAPI.plans().then((r) => setPlans(r.plans)).catch(() => setPlans([])); } }, [user, load]);

  return (
    <div className="min-h-screen">
      <Helmet><title>My membership | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="my-membership">
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900 }}><IdCard size={24} aria-hidden="true" /> My membership</h1>
        {!user && <div style={card}><Link to="/login?redirect=%2Fmembership%2Fmy" style={{ fontWeight: 800 }}>Sign in</Link> to see your membership.</div>}
        {user && !d && !failed && <p>Loading…</p>}
        {failed && <div style={card} role="status">We could not load your membership. Please try again.</div>}
        {d && !d.ready && <div style={card} role="status">Memberships are not available yet.</div>}
        {d?.ready && d.memberships.length > 0 && <MemberCard />}
        {d?.ready && d.credits && (d.credits.balance > 0 || d.credits.held > 0 || d.credits.ledger.length > 0) && (
          <div style={{ ...card, display: 'grid', gap: 4 }} data-testid="my-credits">
            <strong>My credits: {d.credits.balance}</strong>
            {d.credits.held > 0 && <span style={{ fontSize: '0.84rem', color: '#92400e' }}>{d.credits.held} more are on hold until your membership is paid up.</span>}
            <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>Spend them on classes marked with a credit price in <Link to="/learn">Learn</Link>.</span>
            <details><summary style={{ cursor: 'pointer', fontWeight: 700 }}>History</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.82rem' }}>{d.credits.ledger.map((e) => <li key={e.id}>{new Date(e.at).toLocaleDateString()} · {e.note || e.kind} · {e.delta > 0 ? `+${e.delta}` : e.delta}{e.expires_at ? ` · use by ${new Date(e.expires_at).toLocaleDateString()}` : ''}</li>)}</ul>
            </details>
          </div>
        )}
        {d?.ready && d.memberships.length === 0 && <div style={card}>You do not have a membership yet. <Link to="/membership" style={{ fontWeight: 800 }}>See the plans</Link></div>}
        {d?.ready && d.memberships.map((m) => <One key={m.id} m={m} methods={d.payment_methods} settings={d.settings} plans={plans} reload={load} />)}
      </main>
      <Footer />
    </div>
  );
}
