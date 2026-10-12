import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import menusPublicAPI from '../../../_shared/api/menusPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAYS = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
const card = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line, #e5e7eb)', padding: 18 };
const field = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', font: 'inherit', boxSizing: 'border-box' };
const label = { display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 700 };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function Subscribe({ plan, methods, onDone }) {
  const user = useAuthStore((s) => s.user);
  const customer = useAuthStore((s) => s.customer);
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 2); return iso(d); })();
  const [f, setF] = useState({ name: user?.name ?? '', phone: customer?.phone ?? '', email: user?.email ?? '', address: '', start_date: tomorrow, payment_method_id: methods.find((m) => m.gateway === 'mpesa_stk')?.id ?? methods[0]?.id ?? '', notes: '' });
  const [days, setDays] = useState(plan.delivery_weekdays);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (d) => setDays((x) => (x.includes(d) ? x.filter((i) => i !== d) : [...x, d]));
  const week = days.length * plan.day_price;

  const send = async (e) => {
    e.preventDefault(); setBusy(true); setProblem(null);
    try {
      const r = await menusPublicAPI.planSubscribe(plan.id, { ...f, weekdays: days, payment_method_id: Number(f.payment_method_id) });
      toast.success(r.message, { duration: 8000 });
      if (r.redirect_url) { window.location.assign(r.redirect_url); return; }
      onDone(r.token);
    } catch (x) { setProblem(errMsg(x, 'We could not start your plan.')); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={send} style={{ ...card, display: 'grid', gap: 12 }} aria-label={`Subscribe to ${plan.name}`}>
      <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.9rem' }}>
        <legend style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 4 }}>Which days do you want it? (at least {plan.min_days})</legend>
        {plan.delivery_weekdays.map((d) => <label key={d} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={days.includes(d)} onChange={() => toggle(d)} /> {DAYS[d]}</label>)}
      </fieldset>
      <p style={{ margin: 0, fontSize: '0.9rem' }} data-testid="week-price">A full week of your days: <strong>{money(week)}</strong> before tax. You pay a week ahead and can skip any day up to {plan.cutoff_hours} hours before.</p>
      <label style={label}>Start on<input type="date" required min={tomorrow} value={f.start_date} onChange={set('start_date')} style={field} /></label>
      <label style={label}>Deliver to<textarea required rows={2} maxLength={500} value={f.address} onChange={set('address')} style={field} placeholder="Building, street, floor, a landmark" /></label>
      <label style={label}>Your name<input required maxLength={160} value={f.name} onChange={set('name')} style={field} autoComplete="name" /></label>
      <label style={label}>Phone (the rider calls it)<input required maxLength={40} value={f.phone} onChange={set('phone')} style={field} autoComplete="tel" /></label>
      <label style={label}>Email (optional)<input type="email" maxLength={190} value={f.email} onChange={set('email')} style={field} autoComplete="email" /></label>
      <label style={label}>Pay the first week with
        <select value={f.payment_method_id} onChange={set('payment_method_id')} style={field} aria-label="Pay the first week with">{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      </label>
      {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontWeight: 700 }}>{problem}</p>}
      <button type="submit" disabled={busy || days.length < plan.min_days || methods.length === 0} style={{ padding: '14px 20px', borderRadius: 12, border: 'none', background: 'var(--color-primary-500, #16a34a)', color: '#fff', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Starting…' : 'Subscribe and pay the first week'}
      </button>
    </form>
  );
}

/** The meal plans on offer: what each delivers, its price, the menu week by week, and a form to subscribe. No sign-in. */
export default function PlansPage() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { menusPublicAPI.plansList().then(setD).catch(() => setD({ enabled: false })); }, []);

  return (
    <div className="min-h-screen">
      <Helmet><title>Meal plans | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="plans-page">
        <header>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900 }}>Meal plans</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>Meals cooked fresh and delivered on the days you choose. Pay a week ahead, skip a day whenever you need to.</p>
        </header>
        {!d && <p>Loading…</p>}
        {d && !d.enabled && <div style={card} role="status"><strong>We are not taking meal plan subscriptions online right now.</strong><p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Please call us.</p></div>}
        {d?.enabled && d.plans.length === 0 && <div style={card}>No plans are on offer yet.</div>}
        {d?.enabled && d.plans.map((p) => (
          <section key={p.id} data-plan={p.name} style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...card, display: 'grid', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{p.name}{p.requires_membership && <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.14)' }}>Members</span>}</h2>
              {p.description && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{p.description}</p>}
              <p style={{ margin: 0, fontWeight: 800 }}>{money(p.day_price)} <span style={{ fontWeight: 500 }}>for each delivery day, before tax</span></p>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>Delivers {p.delivery_weekdays.map((x) => DAYS[x]).join(', ')}, between {p.slot_from} and {p.slot_to}.{p.cycle_weeks > 1 ? ` The menu changes each week and comes round every ${p.cycle_weeks} weeks.` : ''}</p>
              {p.menu.length > 0 && (
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>See the menu</summary>
                  <div style={{ display: 'grid', gap: 4, marginTop: 8, fontSize: '0.86rem' }}>
                    {p.menu.map((m) => <div key={`${m.week_no}-${m.weekday}`}><strong>{p.cycle_weeks > 1 ? `Week ${m.week_no} ` : ''}{DAYS[m.weekday]}:</strong> {m.dishes.map((x) => x.name).join(', ')}</div>)}
                  </div>
                </details>
              )}
              {open !== p.id && <button type="button" onClick={() => setOpen(p.id)} style={{ justifySelf: 'start', padding: '10px 20px', borderRadius: 12, border: 'none', background: 'var(--color-primary-500, #16a34a)', color: '#fff', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Choose this plan</button>}
            </div>
            {open === p.id && <Subscribe plan={p} methods={d.payment_methods} onDone={(token) => navigate(`/menu/plan/${token}`)} />}
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
}
