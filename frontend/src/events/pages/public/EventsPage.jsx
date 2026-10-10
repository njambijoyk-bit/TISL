import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Search } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import eventsPublicAPI from '../../../_shared/api/eventsPublic';
import EventCard from '../../components/public/EventCard';

const FILTERS = [['', 'All'], ['week', 'This week'], ['month', 'This month'], ['free', 'Free'], ['online', 'Online']];

/** What is on: every event on sale, soonest first. Anyone can browse and buy; no account is needed. */
export default function EventsPage() {
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);

  const params = useMemo(() => ({ q: q || undefined, when: filter === 'week' || filter === 'month' ? filter : undefined, free: filter === 'free' ? 1 : undefined, online: filter === 'online' ? 1 : undefined }), [q, filter]);
  useEffect(() => {
    const t = setTimeout(() => { setError(false); eventsPublicAPI.list(params).then(setRows).catch(() => { setRows([]); setError(true); }); }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [params, q]);

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
        {error && <p style={{ color: 'var(--text-secondary)' }}>We could not load the events. Please try again.</p>}
        {rows && !error && rows.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>{q || filter ? 'Nothing matches that.' : 'No events are on sale right now. Check back soon.'}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>{(rows ?? []).map((e) => <EventCard key={e.slug} e={e} />)}</div>
      </main>
      <Footer />
    </div>
  );
}
