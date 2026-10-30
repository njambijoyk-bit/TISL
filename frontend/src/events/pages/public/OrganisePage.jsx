import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import { eventsPlatformAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const STATUS = { pending: 'Waiting for TISL to verify you', verified: 'Verified', suspended: 'Suspended', rejected: 'Not accepted' };
const VENDOR_KINDS = [['caterer', 'Caterer'], ['decorator', 'Decorator'], ['photographer', 'Photographer or videographer'], ['entertainment', 'Entertainment (DJ, band, MC)'], ['florist', 'Florist'], ['sound_lighting', 'Sound and lighting'], ['transport', 'Transport'], ['other', 'Something else']];
const ROLES = [
  { id: 'organisers', title: 'I organise events', text: 'Put your events on TISL, sell tickets and manage your team. TISL collects the money and pays you, keeping a small commission per ticket.' },
  { id: 'vendors', title: 'I offer a service', text: 'Catering, decor, photography, music and more. Be listed for people planning events.' },
  { id: 'venues', title: 'I have a venue', text: 'Halls, gardens and spaces. Show your capacity, prices and photos.' },
];
const box = { padding: 16, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)' };
const input = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', background: 'transparent', color: 'inherit' };
const btn = { padding: '10px 18px', borderRadius: 999, border: 0, background: 'var(--color-primary-500)', color: '#fff', fontWeight: 800, cursor: 'pointer' };

/** Sign up to organise events or to be listed as a vendor or venue; see where each application stands. */
export default function OrganisePage() {
  const [mine, setMine] = useState(null);
  const [role, setRole] = useState(null);
  const [f, setF] = useState({ name: '', email: '', phone: '', description: '', category: 'caterer', county: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => Promise.all([eventsPlatformAPI.mineOrganisers(), eventsPlatformAPI.mineProviders()])
    .then(([o, p]) => setMine({ organisers: o, providers: p })).catch(() => setMine({ organisers: [], providers: [] })), []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: f.name, email: f.email || undefined, phone: f.phone || undefined, description: f.description || undefined };
      const r = role === 'organisers' ? await eventsPlatformAPI.applyOrganiser(body)
        : await eventsPlatformAPI.applyProvider(role, { ...body, ...(role === 'vendors' ? { category: f.category } : { county: f.county || undefined }) });
      toast.success(r.message, { duration: 7000 });
      setRole(null); setF({ name: '', email: '', phone: '', description: '', category: 'caterer', county: '' }); load();
    } catch (err) { toast.error(errMsg(err, 'Could not send your application'), { duration: 8000 }); } finally { setBusy(false); }
  };

  const accounts = mine ? [...mine.organisers.map((o) => ({ ...o, as: 'Organiser' })), ...mine.providers.map((p) => ({ ...p, as: p.category ? 'Vendor' : 'Venue' }))] : [];

  return (
    <div className="min-h-screen">
      <Helmet><title>Organise with TISL | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px 64px', display: 'grid', gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: 'var(--color-primary-500)' }}>Organise with TISL</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Free to start. We check who you are before you go live, so people can trust what they buy.</p>

        {accounts.length > 0 && (
          <section aria-label="Your accounts" style={{ display: 'grid', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Your accounts</h2>
            {accounts.map((a) => (
              <div key={`${a.as}${a.id}`} style={{ ...box, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span><strong>{a.name}</strong> <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>· {a.as}</span></span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{STATUS[a.status] ?? a.status}{a.status_note ? ` — ${a.status_note}` : ''}</span>
              </div>
            ))}
            {mine.organisers.length > 0 && <p style={{ margin: 0, fontSize: '0.82rem' }}>Organisers run their events from <Link to="/admin/events" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Events</Link>.</p>}
          </section>
        )}

        {!role ? (
          <section style={{ display: 'grid', gap: 10 }}>
            {ROLES.map((r) => (
              <button key={r.id} type="button" onClick={() => setRole(r.id)} style={{ ...box, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>{r.title}</strong><span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{r.text}</span>
              </button>
            ))}
          </section>
        ) : (
          <form onSubmit={send} style={{ ...box, display: 'grid', gap: 12 }}>
            <strong>{ROLES.find((r) => r.id === role).title}</strong>
            <label>Name of your business or yourself<input required maxLength={160} value={f.name} onChange={set('name')} style={input} /></label>
            {role === 'vendors' && <label>What you offer<select value={f.category} onChange={set('category')} style={input}>{VENDOR_KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
            {role === 'venues' && <label>County<input maxLength={80} value={f.county} onChange={set('county')} style={input} /></label>}
            <label>Email<input type="email" maxLength={160} value={f.email} onChange={set('email')} style={input} /></label>
            <label>Phone<input maxLength={40} value={f.phone} onChange={set('phone')} style={input} /></label>
            <label>About you<textarea rows={4} maxLength={3000} value={f.description} onChange={set('description')} style={input} /></label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={busy || !f.name.trim()} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Apply'}</button>
              <button type="button" onClick={() => setRole(null)} style={{ ...btn, background: 'transparent', color: 'inherit', border: '1px solid var(--line)' }}>Back</button>
            </div>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
