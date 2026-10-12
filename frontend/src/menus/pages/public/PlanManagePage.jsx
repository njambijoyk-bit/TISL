import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import menusPublicAPI from '../../../_shared/api/menusPublic';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });
const when = (iso) => new Date(iso).toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const DAYS = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
const card = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line, #e5e7eb)', padding: 18 };
const btn = { padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--color-primary-500, #16a34a)', color: '#fff', font: 'inherit', fontWeight: 800, cursor: 'pointer' };
const ghost = { padding: '7px 14px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', background: 'transparent', font: 'inherit', fontWeight: 700, cursor: 'pointer', color: 'inherit' };
const field = { padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', font: 'inherit', boxSizing: 'border-box' };

/** A subscriber's plan, by the link we sent: pay the next week, skip or put back a day, pause, change where it goes, cancel. No sign-in; the link is the key. */
export default function PlanManagePage() {
  const { token } = useParams();
  const [s, setS] = useState(null);
  const [methods, setMethods] = useState([]);
  const [method, setMethod] = useState('');
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [edit, setEdit] = useState(null);
  const [pause, setPause] = useState({ from: '', until: '' });
  const stop = useRef(false);

  const load = useCallback(() => menusPublicAPI.plan(token).then((r) => {
    setS(r.subscription); setMethods(r.payment_methods); setLost(false);
    setMethod((m) => m || String(r.payment_methods.find((p) => p.gateway === 'mpesa_stk')?.id ?? r.payment_methods[0]?.id ?? ''));

    return r.subscription;
  }).catch((e) => { if (e?.response?.status === 404) setLost(true); }), [token]);
  useEffect(() => { stop.current = false; load(); return () => { stop.current = true; }; }, [load]);
  // after a payment prompt: look again every few seconds until nothing is waiting
  useEffect(() => {
    if (!waiting) return undefined;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      const x = await load();
      if (stop.current) return;
      if (x && x.to_pay.length === 0) { setWaiting(false); toast.success('Payment received. Thank you!'); } else if (n >= 40) setWaiting(false);
    }, 4000);

    return () => clearInterval(t);
  }, [waiting, load]);

  const act = async (fn, ok) => {
    setBusy(true);
    try { const r = await fn(); if (r.subscription) setS(r.subscription); if (r.redirect_url) { window.location.assign(r.redirect_url); return; } toast.success(ok ?? r.message ?? 'Done.'); if (r.attempt?.id) setWaiting(true); } catch (e) { toast.error(errMsg(e, 'Something went wrong. Please try again.'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const cancel = () => { const reason = window.prompt('Cancel your plan? Tell us why (optional):', ''); if (reason === null) return undefined; return act(() => menusPublicAPI.planCancel(token, reason || undefined)); };

  const live = s && s.status !== 'cancelled';
  const picker = methods.length > 1 && <select aria-label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} style={field}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>;

  return (
    <div className="min-h-screen">
      <Helmet><title>{s ? `Meal plan ${s.number}` : 'Your meal plan'} | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="plan-manage">
        {lost && <div style={card} role="alert"><h1 style={{ margin: 0, fontSize: '1.2rem' }}>We could not find that plan</h1><p style={{ color: 'var(--text-secondary)' }}>The link may be incomplete. Please use the link in your message, or call us.</p></div>}
        {s && (
          <>
            <header>
              <h1 style={{ margin: 0, fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 900 }}>{s.plan.name}</h1>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>{s.number} · {s.weekdays.map((d) => DAYS[d]).join(', ')} · {s.plan.slot_from}–{s.plan.slot_to}</p>
              <p style={{ margin: '2px 0 0', fontWeight: 800 }} data-testid="status">{s.status_label}{s.paused_from ? ` (from ${day(s.paused_from)}${s.paused_until ? ` to ${day(s.paused_until)}` : ''})` : ''}</p>
            </header>
            {s.status === 'cancelled' && <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }} role="status"><XCircle color="#b91c1c" aria-hidden="true" /><div><strong>Cancelled</strong>{s.cancel_reason && <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{s.cancel_reason}</div>}</div></div>}
            {s.status === 'pending' && <p role="status" style={{ ...card, margin: 0 }}>We are waiting for the payment of your first week. Your plan starts as soon as it arrives.</p>}

            {live && s.to_pay.length > 0 && (
              <section style={{ ...card, display: 'grid', gap: 10 }} aria-label="To pay" data-testid="to-pay">
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>To pay</h2>
                {s.to_pay.map((p) => (
                  <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>Week of <strong>{day(p.week_start)}</strong>: <strong>{money(p.total)}</strong>{p.pay_by ? <small style={{ color: 'var(--text-tertiary)' }}> · pay by {when(p.pay_by)}</small> : ''}</span>
                    <span style={{ flex: 1 }} />
                    {picker}
                    <button type="button" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy || !method} onClick={() => act(() => menusPublicAPI.planPay(token, p.id, { payment_method_id: Number(method) }))}>Pay {money(p.total)}</button>
                  </div>
                ))}
                {waiting && <p role="status" style={{ margin: 0 }}>Waiting for your payment… check your phone and enter your M-Pesa PIN.</p>}
              </section>
            )}

            <section style={card} aria-label="Coming deliveries" data-testid="deliveries">
              <h2 style={{ margin: '0 0 10px', fontSize: '1.05rem', fontWeight: 800 }}>Coming deliveries</h2>
              {s.credit_days > 0 && <p style={{ margin: '0 0 10px', fontSize: '0.86rem' }}><CheckCircle2 size={14} color="#047857" aria-hidden="true" /> You have {s.credit_days} skipped day{s.credit_days === 1 ? '' : 's'} owed: that many of your next delivery days are free.</p>}
              {s.deliveries.length === 0 && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Nothing is booked yet. The next week is billed a few days ahead.</p>}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {s.deliveries.map((d) => (
                  <li key={d.id} data-delivery={d.date} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', opacity: ['skipped', 'cancelled', 'missed'].includes(d.status) ? 0.6 : 1 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <strong>{day(d.date)}</strong> <small style={{ color: 'var(--text-tertiary)' }}>{d.status_label}{d.free ? ' · free (owed)' : ''}</small>
                      <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{d.dishes.join(', ')}</div>
                    </div>
                    {d.can_skip && <button type="button" style={ghost} disabled={busy} onClick={() => act(() => menusPublicAPI.planSkip(token, d.id))}>Skip</button>}
                    {d.can_unskip && <button type="button" style={ghost} disabled={busy} onClick={() => act(() => menusPublicAPI.planUnskip(token, d.id))}>Put back</button>}
                    {d.can_skip && <small style={{ color: 'var(--text-tertiary)' }}>until {when(d.skip_until)}</small>}
                  </li>
                ))}
              </ul>
            </section>

            {live && (
              <section style={{ ...card, display: 'grid', gap: 12 }} aria-label="Manage">
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Manage your plan</h2>
                {s.status === 'paused' ? <div><button type="button" style={btn} disabled={busy} onClick={() => act(menusPublicAPI.planResume.bind(null, token))}>Start my plan again</button></div> : s.status === 'active' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
                    <label style={{ display: 'grid', gap: 3, fontSize: '0.8rem', fontWeight: 700 }}>Pause from<input type="date" value={pause.from} onChange={(e) => setPause({ ...pause, from: e.target.value })} style={field} /></label>
                    <label style={{ display: 'grid', gap: 3, fontSize: '0.8rem', fontWeight: 700 }}>until (optional)<input type="date" value={pause.until} onChange={(e) => setPause({ ...pause, until: e.target.value })} style={field} /></label>
                    <button type="button" style={ghost} disabled={busy} onClick={() => act(() => menusPublicAPI.planPause(token, { from: pause.from || undefined, until: pause.until || undefined }))}>Pause my plan</button>
                  </div>
                )}
                {edit === null ? <div><button type="button" style={ghost} onClick={() => setEdit({ address: s.address, phone: s.phone, weekdays: s.weekdays })}>Change address, phone or days</button></div> : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <textarea aria-label="Delivery address" rows={2} maxLength={500} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} style={field} />
                    <input aria-label="Phone" maxLength={40} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} style={field} />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.88rem' }}>{s.plan.delivery_weekdays.map((d) => <label key={d} style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={edit.weekdays.includes(d)} onChange={() => setEdit({ ...edit, weekdays: edit.weekdays.includes(d) ? edit.weekdays.filter((i) => i !== d) : [...edit.weekdays, d] })} /> {DAYS[d]}</label>)}</div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Weeks already billed keep their days; the next weeks follow these.</p>
                    <div style={{ display: 'flex', gap: 8 }}><button type="button" style={btn} disabled={busy} onClick={() => act(() => menusPublicAPI.planUpdate(token, edit)).then(() => setEdit(null))}>Save</button><button type="button" style={ghost} onClick={() => setEdit(null)}>Not now</button></div>
                  </div>
                )}
                <div><button type="button" onClick={cancel} disabled={busy} style={{ background: 'none', border: 'none', color: '#b91c1c', font: 'inherit', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Cancel my plan</button></div>
              </section>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
