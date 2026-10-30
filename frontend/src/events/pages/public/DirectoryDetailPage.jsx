import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { Star } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import eventsAPI, { eventsBookingAPI, eventsDirectoryAPI } from '../../../_shared/api/events';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const box = { padding: 16, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', display: 'grid', gap: 10 };
const input = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', background: 'transparent', color: 'inherit' };
const btn = { padding: '10px 18px', borderRadius: 999, border: 0, background: 'var(--color-primary-500)', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const UNIT = { fixed: '', per_guest: ' per guest', per_hour: ' per hour', per_day: ' per day' };

/** One vendor or venue: what they offer, pictures, reviews, and a form to ask for a booking for one of your events. */
export default function DirectoryDetailPage() {
  const { plural, slug } = useParams();
  const type = plural === 'vendors' ? 'vendor' : 'venue';
  const user = useAuthStore((s) => s.user);
  const canPlan = Boolean(user) && hasPermission(user, 'events.edit');
  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);
  const [events, setEvents] = useState([]);
  const [f, setF] = useState({ event_id: '', offer_id: '', starts_on: '', ends_on: '', guests: '', message: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { eventsDirectoryAPI.show(plural, slug).then(setP).catch(() => setMissing(true)); }, [plural, slug]);
  useEffect(() => { if (canPlan) eventsAPI.list({}).then((r) => setEvents(r.data.filter((e) => e.status !== 'cancelled'))).catch(() => {}); }, [canPlan]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const ask = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== '' && k !== 'event_id'));
      const r = await eventsBookingAPI.request(f.event_id, { provider_type: type, provider_id: p.id, ...body });
      toast.success(r.message); setF({ event_id: '', offer_id: '', starts_on: '', ends_on: '', guests: '', message: '' });
    } catch (err) { toast.error(errMsg(err, 'Could not send your enquiry'), { duration: 8000 }); } finally { setBusy(false); }
  };

  if (missing) return <div className="min-h-screen"><Header /><main style={{ padding: 32 }}>We could not find that. <Link to={`/event-directory/${plural}`}>Back to the list</Link></main><Footer /></div>;
  if (!p) return <div className="min-h-screen"><Header /><main style={{ padding: 32 }}>Loading…</main><Footer /></div>;
  const pics = p.media.filter((m) => m.kind !== 'document' && m.url);

  return (
    <div className="min-h-screen">
      <Helmet><title>{p.name} | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 64px', display: 'grid', gap: 18 }}>
        <Link to={`/event-directory/${plural}`} style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>← {type === 'vendor' ? 'Vendors' : 'Venues'}</Link>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, color: 'var(--color-primary-500)' }}>{p.name}</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          {type === 'vendor' ? p.category_name : [p.town, p.county].filter(Boolean).join(', ')}
          {p.reviews.average && <span style={{ marginLeft: 12, display: 'inline-flex', gap: 3, alignItems: 'center' }}><Star size={14} fill="currentColor" /> {p.reviews.average} ({p.reviews.count})</span>}
        </p>
        {pics.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
            {pics.map((m) => (m.kind === 'embed' ? <iframe key={m.id} src={m.url} title={m.title || 'Video'} loading="lazy" allowFullScreen style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 10 }} />
              : m.kind === 'video' ? <video key={m.id} src={m.url} controls preload="metadata" style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 10, background: '#000' }} />
                : <img key={m.id} src={m.url} alt={m.caption || m.title || ''} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 10 }} />))}
          </div>
        )}
        {(p.description || p.summary) && <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{p.description || p.summary}</p>}
        {type === 'venue' && (p.facilities ?? []).length > 0 && <p style={{ margin: 0, fontSize: '0.9rem' }}><strong>Facilities:</strong> {p.facilities.join(', ')}</p>}
        {type === 'vendor' && (p.service_areas ?? []).length > 0 && <p style={{ margin: 0, fontSize: '0.9rem' }}><strong>Serves:</strong> {p.service_areas.join(', ')}</p>}

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{type === 'vendor' ? 'Packages' : 'Spaces'}</h2>
          {p.offers.length === 0 && <p style={{ margin: 0, color: 'var(--text-tertiary)' }}>Ask for a quote.</p>}
          {p.offers.map((o) => (
            <div key={o.id} style={box}>
              <strong>{o.name}</strong>
              <span style={{ fontSize: '0.9rem' }}>{Number(o.price).toLocaleString()}{UNIT[o.price_unit] ?? ''}{o.capacity ? ` · up to ${o.capacity} guests` : ''}{o.min_guests ? ` · from ${o.min_guests} guests` : ''}{o.deposit_percent ? ` · ${o.deposit_percent}% deposit` : ''}</span>
              {o.description && <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{o.description}</span>}
              {(o.inclusions ?? []).length > 0 && <span style={{ fontSize: '0.84rem' }}>Includes: {o.inclusions.join(', ')}</span>}
            </div>
          ))}
        </section>

        {p.reviews.items.length > 0 && (
          <section style={{ display: 'grid', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>What planners say</h2>
            {p.reviews.items.map((r, i) => <div key={i} style={box}><span>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{r.by}</span></span>{r.comment && <span>{r.comment}</span>}</div>)}
          </section>
        )}

        <section style={box}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Ask for a booking</h2>
          {!user ? <p style={{ margin: 0 }}>Sign in to ask for a booking for your event.</p> : !canPlan ? <p style={{ margin: 0 }}>Bookings are made from your event's planning page. <Link to="/organise" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Become an organiser</Link> or <Link to="/plan-my-event" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>ask TISL to plan it for you</Link>.</p> : (
            <form onSubmit={ask} style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>For which event?<select required value={f.event_id} onChange={set('event_id')} style={input}><option value="">Choose…</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
              {p.offers.length > 0 && <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>{type === 'vendor' ? 'Package' : 'Space'}<select value={f.offer_id} onChange={set('offer_id')} style={input}><option value="">Not sure yet</option>{p.offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>From<input required type="date" min={new Date().toISOString().slice(0, 10)} value={f.starts_on} onChange={set('starts_on')} style={input} /></label>
                <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>To (if more than a day)<input type="date" min={f.starts_on} value={f.ends_on} onChange={set('ends_on')} style={input} /></label>
              </div>
              <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>Guests<input type="number" min="1" value={f.guests} onChange={set('guests')} style={input} /></label>
              <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>Message<textarea rows={3} maxLength={1000} value={f.message} onChange={set('message')} style={input} /></label>
              <div><button type="submit" disabled={busy || !f.event_id} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send enquiry'}</button></div>
            </form>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
