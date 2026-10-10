import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Video } from 'lucide-react';
import { priceLabel, whenText } from '../../lib/eventFormat';

/** One event in the list. */
export default function EventCard({ e }) {
  const where = e.kind === 'online' ? 'Online' : e.venue_name || '';
  const label = priceLabel(e);

  return (
    <Link to={`/events/${e.slug}`} style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', background: 'var(--surface-card, #fff)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)' }}>
        {e.image_url
          ? <img src={e.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--color-primary-500)' }}><CalendarDays size={40} /></span>}
        {e.sold_out && <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 10px', borderRadius: 999, background: '#111827', color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>Sold out</span>}
        {e.status === 'cancelled' && <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 10px', borderRadius: 999, background: '#b91c1c', color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>Cancelled</span>}
        {e.status === 'postponed' && <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 10px', borderRadius: 999, background: '#b45309', color: '#fff', fontSize: '0.72rem', fontWeight: 800 }}>Postponed</span>}
      </div>
      <div style={{ padding: 14, display: 'grid', gap: 6, flex: 1 }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--color-primary-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {whenText(e.next_at)}{e.dates > 1 ? ` · ${e.dates} dates` : ''}
        </span>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.25 }}>{e.title}</h2>
        {e.summary && <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{e.summary}</p>}
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', paddingTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            {e.kind === 'online' ? <Video size={13} /> : <MapPin size={13} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{where || 'Venue to be announced'}</span>
          </span>
          <strong style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{label}</strong>
        </div>
      </div>
    </Link>
  );
}
