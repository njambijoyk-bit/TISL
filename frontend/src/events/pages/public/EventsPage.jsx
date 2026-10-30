import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Search } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import eventsPublicAPI from '../../../_shared/api/eventsPublic';
import { eventsAdAPI, eventsPlatformAPI } from '../../../_shared/api/events';
import { Link } from 'react-router-dom';
import EventCard from '../../components/public/EventCard';

const FILTERS = [['', 'All'], ['week', 'This week'], ['month', 'This month'], ['free', 'Free'], ['online', 'Online']];

/** What is on: every event on sale, soonest first. Anyone can browse and buy; no account is needed. */
export default function EventsPage() {
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [cats, setCats] = useState([]);
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [banners, setBanners] = useState([]);

  const params = useMemo(() => ({ q: q || undefined, when: filter === 'week' || filter === 'month' ? filter : undefined, free: filter === 'free' ? 1 : undefined, online: filter === 'online' ? 1 : undefined, category: category || undefined, location: place || undefined, max_price: maxPrice || undefined }), [q, filter, category, place, maxPrice]);
  useEffect(() => { eventsPlatformAPI.categories().then(setCats).catch(() => {}); eventsAdAPI.promoted('banner').then((b) => { setBanners(b); b.forEach((x) => eventsAdAPI.track(x.campaign_id, 'view')); }).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => { setError(false); eventsPublicAPI.list(params).then(setRows).catch(() => { setRows([]); setError(true); }); }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [params, q, place]);

  return (
    <div className="min-h-screen">
      <Helmet><title>Events | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 64px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', fontWeight: 900, color: 'var(--color-primary-500)', letterSpacing: '-0.02em' }}>Events</h1>
        <p style={{ margin: '0 0 22px', color: 'var(--text-secondary)' }}>Find something to go to. You do not need an account to get tickets.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-tertiary)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events" aria-label="Search events" style={{ padding: '9px 12px 9px 34px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.85rem', minWidth: 220 }} />
          </div>
          {FILTERS.map(([k, l]) => (
            <button key={k || 'all'} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} style={{ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: filter === k ? 800 : 600, fontSize: '0.84rem', color: filter === k ? 'var(--color-primary-500)' : 'var(--text-secondary)', border: `1.5px solid ${filter === k ? 'var(--color-primary-500)' : 'var(--line)'}`, background: filter === k ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent' }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" style={{ padding: '8px 12px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.84rem' }}>
            <option value="">Any kind of event</option>
            {cats.map((c) => (c.children?.length ? <optgroup key={c.id} label={c.name}><option value={c.id}>All of {c.name}</option>{c.children.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</optgroup> : <option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place" aria-label="Place" style={{ padding: '8px 14px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.84rem', width: 140 }} />
          <input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Most you will pay" aria-label="Most you will pay" style={{ padding: '8px 14px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.84rem', width: 160 }} />
          <span style={{ marginLeft: 'auto', fontSize: '0.84rem', display: 'flex', gap: 14 }}>
            <Link to="/plan-my-event" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Plan my event with TISL</Link>
            <Link to="/event-directory/vendors" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Vendors</Link>
            <Link to="/event-directory/venues" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Venues</Link>
          </span>
        </div>
        {banners.length > 0 && !q && !filter && (
          <div aria-label="Promoted" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 26 }}>
            {banners.map((b) => <div key={b.id} onClickCapture={() => eventsAdAPI.track(b.campaign_id, 'click')}><EventCard e={b} /></div>)}
          </div>
        )}
        {error && <p style={{ color: 'var(--text-secondary)' }}>We could not load the events. Please try again.</p>}
        {rows && !error && rows.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>{q || filter ? 'Nothing matches that.' : 'No events are on sale right now. Check back soon.'}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>{(rows ?? []).map((e) => <div key={e.slug} onClickCapture={() => e.campaign_id && eventsAdAPI.track(e.campaign_id, 'click')}><EventCard e={e} /></div>)}</div>
      </main>
      <Footer />
    </div>
  );
}
