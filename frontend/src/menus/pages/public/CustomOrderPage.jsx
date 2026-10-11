import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { CakeSlice, UtensilsCrossed } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import menusPublicAPI from '../../../_shared/api/menusPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const card = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line, #e5e7eb)', padding: 18 };
const field = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', font: 'inherit', boxSizing: 'border-box' };
const label = { display: 'grid', gap: 4, fontSize: '0.82rem', fontWeight: 700 };
const stamp = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Ask for a made-to-order cake or a catering quote. No sign-in to ask. A cake is priced and quoted at once; catering waits for our quote. */
export default function CustomOrderPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const customer = useAuthStore((s) => s.customer);
  const [info, setInfo] = useState(null);
  const [kind, setKind] = useState('cake');
  const [cakeId, setCakeId] = useState('');
  const [picked, setPicked] = useState({});   // group name -> option ids
  const [qty, setQty] = useState(1);
  const [f, setF] = useState({ location_id: '', event_at: '', fulfil: 'pickup', address: '', headcount: '', message: '', wishes: '', name: user?.name ?? '', email: user?.email ?? '', phone: customer?.phone ?? '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => { menusPublicAPI.customInfo().then((r) => { setInfo(r); if (r.cakes?.length) setCakeId(String(r.cakes[0].id)); }).catch(() => setInfo({ enabled: false })); }, []);
  const cake = info?.cakes?.find((c) => String(c.id) === cakeId);
  useEffect(() => {
    if (!cake) return;
    const init = {};
    cake.groups.forEach((g) => { init[g.name] = g.options.filter((o) => o.is_default).map((o) => o.id); });
    setPicked(init);
  }, [cake]);
  const notice = kind === 'cake' ? (cake?.lead_hours ?? 0) : (info?.catering_lead_hours ?? 0);
  const earliest = useMemo(() => stamp(new Date(Date.now() + notice * 3600000)), [notice]);
  const extra = cake ? cake.groups.reduce((t, g) => t + g.options.filter((o) => (picked[g.name] ?? []).includes(o.id)).reduce((s, o) => s + o.price_delta, 0), 0) : 0;

  const choose = (g, o) => setPicked((p) => {
    const cur = p[g.name] ?? [];
    if (g.kind === 'single') return { ...p, [g.name]: [o.id] };

    return { ...p, [g.name]: cur.includes(o.id) ? cur.filter((i) => i !== o.id) : [...cur, o.id] };
  });

  const send = async (e) => {
    e.preventDefault(); setBusy(true); setProblem(null);
    try {
      const r = await menusPublicAPI.customAsk({
        kind, location_id: f.location_id ? Number(f.location_id) : undefined, event_at: f.event_at, fulfil: f.fulfil, address: f.address || undefined, headcount: f.headcount ? Number(f.headcount) : undefined,
        message: kind === 'cake' ? f.message || undefined : undefined, wishes: kind === 'catering' ? f.wishes || undefined : undefined, name: f.name || undefined, email: f.email || undefined, phone: f.phone || undefined, notes: f.notes || undefined,
        items: kind === 'cake' && cake ? [{ dish_id: cake.id, quantity: Number(qty) || 1, option_ids: Object.values(picked).flat() }] : [],
      });
      toast.success(r.message);
      navigate(`/menu/request/${r.token}`);
    } catch (x) { setProblem(errMsg(x, 'We could not send your request.')); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen">
      <Helmet><title>Cakes and catering | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="custom-order">
        <header>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900 }}>Cakes and catering</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>Tell us what you need and when. A cake is priced straight away; for catering we send you a quote.</p>
        </header>
        {!info && <p>Loading…</p>}
        {info && !info.enabled && <div style={card} role="status"><strong>We are not taking cake or catering requests online right now.</strong><p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Please call us.</p></div>}
        {info?.enabled && (
          <form onSubmit={send} style={{ display: 'grid', gap: 16 }}>
            <div role="tablist" aria-label="What do you need" style={{ display: 'flex', gap: 8 }}>
              {[['cake', 'A cake', CakeSlice], ['catering', 'Catering', UtensilsCrossed]].map(([k, t, icon]) => {
                const Icon = icon;

                return (
                  <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setF((x) => ({ ...x, fulfil: 'pickup' })); }}
                    style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: `2px solid ${kind === k ? 'var(--color-primary-500, #e11d48)' : 'var(--line, #e5e7eb)'}`, background: kind === k ? 'color-mix(in srgb, var(--color-primary-500, #e11d48) 10%, transparent)' : 'transparent', font: 'inherit', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} aria-hidden="true" /> {t}
                  </button>
                );
              })}
            </div>

            {kind === 'cake' && (
              <section style={{ ...card, display: 'grid', gap: 12 }} aria-label="The cake">
                {info.cakes.length === 0 ? <p style={{ margin: 0 }}>No cakes can be ordered online yet. Choose Catering or call us.</p> : (
                  <>
                    <label style={label}>Which cake
                      <select value={cakeId} onChange={(e) => setCakeId(e.target.value)} style={field} aria-label="Which cake">{info.cakes.map((c) => <option key={c.id} value={c.id}>{c.name} · from {money(c.price)}</option>)}</select>
                    </label>
                    {cake?.description && <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{cake.description}</p>}
                    {cake?.groups.map((g) => (
                      <fieldset key={g.name} style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                        <legend style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 4 }}>{g.name}{g.min > 0 ? ' *' : ''}</legend>
                        {g.options.map((o) => (
                          <label key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}>
                            <input type={g.kind === 'single' ? 'radio' : 'checkbox'} name={g.name} checked={(picked[g.name] ?? []).includes(o.id)} onChange={() => choose(g, o)} />
                            {o.name}{o.price_delta !== 0 && <small style={{ color: 'var(--text-tertiary)' }}> ({o.price_delta > 0 ? '+' : ''}{money(o.price_delta)})</small>}
                          </label>
                        ))}
                      </fieldset>
                    ))}
                    <label style={label}>How many
                      <input type="number" min="1" max="50" value={qty} onChange={(e) => setQty(e.target.value)} style={{ ...field, maxWidth: 110 }} />
                    </label>
                    <label style={label}>Words on the cake (optional)
                      <input maxLength={200} value={f.message} onChange={set('message')} style={field} placeholder="Happy birthday Zuri" />
                    </label>
                    {cake && <p style={{ margin: 0, fontSize: '0.88rem' }} data-testid="cake-price">About <strong>{money((cake.price + extra) * (Number(qty) || 1))}</strong> before tax. We need {cake.lead_hours >= 24 && cake.lead_hours % 24 === 0 ? `${cake.lead_hours / 24} day${cake.lead_hours === 24 ? '' : 's'}` : `${cake.lead_hours} hours`} notice.</p>}
                  </>
                )}
              </section>
            )}

            {kind === 'catering' && (
              <section style={{ ...card, display: 'grid', gap: 12 }} aria-label="The job">
                <label style={label}>How many people
                  <input type="number" required min="1" max="5000" value={f.headcount} onChange={set('headcount')} style={{ ...field, maxWidth: 140 }} />
                </label>
                <label style={label}>What are you planning? (occasion, food you have in mind, allergies)
                  <textarea rows={4} maxLength={1000} value={f.wishes} onChange={set('wishes')} style={field} placeholder="A wedding lunch, buffet style, no pork" />
                </label>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>We need at least {info.catering_lead_hours >= 24 && info.catering_lead_hours % 24 === 0 ? `${info.catering_lead_hours / 24} days` : `${info.catering_lead_hours} hours`} notice.</p>
              </section>
            )}

            <section style={{ ...card, display: 'grid', gap: 12 }} aria-label="When and where">
              <label style={label}>When do you need it
                <input type="datetime-local" required min={earliest} value={f.event_at} onChange={set('event_at')} style={field} />
              </label>
              {info.locations.length > 1 && (
                <label style={label}>Made at
                  <select value={f.location_id} onChange={set('location_id')} style={field}><option value="">Nearest to you</option>{info.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                </label>
              )}
              <label style={label}>How would you like it
                <select value={f.fulfil} onChange={set('fulfil')} style={field}>
                  <option value="pickup">I will collect it</option><option value="delivery">Deliver it</option>{kind === 'catering' && <option value="serve">Serve it at my venue</option>}
                </select>
              </label>
              {f.fulfil !== 'pickup' && <label style={label}>{f.fulfil === 'serve' ? 'Venue' : 'Delivery address'}<textarea rows={2} required maxLength={500} value={f.address} onChange={set('address')} style={field} /></label>}
            </section>

            <section style={{ ...card, display: 'grid', gap: 12 }} aria-label="About you">
              <label style={label}>Your name<input required maxLength={160} value={f.name} onChange={set('name')} style={field} autoComplete="name" /></label>
              <label style={label}>Phone<input required maxLength={40} value={f.phone} onChange={set('phone')} style={field} autoComplete="tel" /></label>
              <label style={label}>Email (for your quote link)<input type="email" maxLength={190} value={f.email} onChange={set('email')} style={field} autoComplete="email" /></label>
              <label style={label}>Anything else (optional)<input maxLength={1000} value={f.notes} onChange={set('notes')} style={field} /></label>
            </section>

            {problem && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontWeight: 700 }}>{problem}</p>}
            <button type="submit" disabled={busy || (kind === 'cake' && !cake)} style={{ padding: '14px 20px', borderRadius: 12, border: 'none', background: 'var(--color-primary-500, #e11d48)', color: '#fff', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Sending…' : kind === 'cake' ? 'Get my price' : 'Ask for a quote'}
            </button>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
