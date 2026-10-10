import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CalendarDays } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import eventTicketsAPI from '../../../_shared/api/eventTickets';
import { whenText } from '../../lib/eventFormat';

const Row = ({ t }) => (
  <Link to={`/tickets/${t.code}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', textDecoration: 'none', color: 'inherit', opacity: t.state === 'cancelled' || t.over ? 0.65 : 1 }}>
    {t.image_url ? <img src={t.image_url} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover' }} /> : <span aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-500)' }}><CalendarDays size={24} /></span>}
    <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
      <strong>{t.event}</strong>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{whenText(t.when)}{t.venue_name ? ` · ${t.venue_name}` : ''}</span>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{t.type}{t.holder_name ? ` · ${t.holder_name}` : ''} · <code>{t.reference}</code>{t.state === 'cancelled' ? ' · cancelled' : t.event_status === 'cancelled' ? ' · event cancelled' : ''}</span>
    </span>
  </Link>
);

/** My event tickets: what is coming up, and what I have been to. Each opens its ticket with the QR code. */
export default function MyEventTickets() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { eventTicketsAPI.mine().then(setData).catch(() => setError(true)); }, []);

  return (
    <div className="min-h-screen">
      <Helmet><title>My event tickets | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 64px', display: 'grid', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 900, color: 'var(--color-primary-500)' }}>My event tickets</h1>
        {error && <p style={{ color: 'var(--text-secondary)' }}>We could not load your tickets. Please try again.</p>}
        {data && data.upcoming.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No tickets for events to come. <Link to="/events" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>See what is on</Link></p>}
        {data?.upcoming.map((t) => <Row key={t.code} t={t} />)}
        {data && data.past.length > 0 && <><h2 style={{ margin: '14px 0 0', fontSize: '1rem', fontWeight: 800 }}>Past and cancelled</h2>{data.past.map((t) => <Row key={t.code} t={t} />)}</>}
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Bought tickets without signing in? <Link to="/tickets" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Get them sent to your email</Link>.</p>
      </main>
      <Footer />
    </div>
  );
}
