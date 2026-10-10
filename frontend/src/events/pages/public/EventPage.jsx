import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, CalendarDays, ExternalLink, MapPin, Video } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import eventsPublicAPI from '../../../_shared/api/eventsPublic';
import { DetailVideo } from '../../../ecommerce/components/storefront/services/ServiceVideoPlayer';
import EventBuyBox from '../../components/public/EventBuyBox';
import { whenText } from '../../lib/eventFormat';

const block = { background: 'var(--surface-card, #fff)', borderRadius: 14, border: '1px solid var(--line)', padding: 18 };
const h = { margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 };

/** One event: pictures or video, when and where, what it is, and the box to get tickets. Anyone can open it; no sign-in is needed to buy. */
export default function EventPage() {
  const { slug } = useParams();
  const [e, setE] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let live = true;
    setState('loading');
    eventsPublicAPI.get(slug).then((d) => { if (live) { setE(d); setState('ok'); } }).catch((err) => { if (live) setState(err?.response?.status === 404 ? 'missing' : 'error'); });
    return () => { live = false; };
  }, [slug]);

  const wrap = (children) => (
    <div className="min-h-screen">
      <Helmet><title>{e ? `${e.title} | Events` : 'Events'} | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 64px' }}>{children}</main>
      <Footer />
    </div>
  );
  if (state === 'loading') return wrap(<p style={{ color: 'var(--text-secondary)' }}>Loading…</p>);
  if (state !== 'ok') return wrap(<p style={{ color: 'var(--text-secondary)' }}>{state === 'missing' ? 'We could not find that event.' : 'We could not load the event. Please try again.'} <Link to="/events" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>See all events</Link></p>);

  const live = e.sessions.filter((s) => !s.is_cancelled);

  return wrap(
    <>
      <Link to="/events" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.84rem', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 14 }}><ArrowLeft size={14} /> All events</Link>
      {e.status === 'cancelled' && <p role="alert" style={{ ...block, margin: '0 0 16px', background: 'rgba(185,28,28,0.08)', color: '#991b1b', fontWeight: 700 }}>This event has been cancelled.</p>}
      {e.status === 'postponed' && <p role="alert" style={{ ...block, margin: '0 0 16px', background: 'rgba(180,83,9,0.1)', color: '#92400e', fontWeight: 700 }}>This event has been postponed. We will tell everyone who holds a ticket the new date.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18, minWidth: 0, gridColumn: 'span 1' }}>
          {e.video ? (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
              <DetailVideo video={e.video} active poster={e.image_url ?? undefined} />
            </div>
          ) : e.image_url && <img src={e.image_url} alt="" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 14, display: 'block' }} />}
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.6rem, 4vw, 2.3rem)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{e.title}</h1>
            {e.summary && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>{e.summary}</p>}
            {e.organiser && <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: 'var(--text-tertiary)' }}>By {e.organiser}</p>}
          </div>

          <div style={{ ...block, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <CalendarDays size={18} color="var(--color-primary-500)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                {live.length <= 1
                  ? <strong>{whenText(live[0]?.starts_at ?? e.next_at)}{live[0]?.ends_at ? ` – ${live[0].ends_at.slice(11, 16)}` : ''}</strong>
                  : <><strong>{live.length} dates</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                      {live.map((s) => <li key={s.id}>{whenText(s.starts_at)}{s.ends_at ? ` – ${s.ends_at.slice(11, 16)}` : ''}{s.label ? ` · ${s.label}` : ''}</li>)}
                    </ul></>}
              </div>
            </div>
            {e.kind !== 'online' && (e.venue_name || e.venue_address) && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <MapPin size={18} color="var(--color-primary-500)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div><strong>{e.venue_name}</strong>{e.venue_address && <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{e.venue_address}</div>}
                  {e.map_url && <a href={e.map_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82rem', color: 'var(--color-primary-500)', fontWeight: 700, display: 'inline-flex', gap: 4, alignItems: 'center' }}>Open the map <ExternalLink size={12} /></a>}</div>
              </div>
            )}
            {e.has_online_link && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Video size={18} color="var(--color-primary-500)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div><strong>{e.kind === 'online' ? 'Online' : 'Also online'}</strong><div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>The link to join is shown to people who hold a ticket.</div></div>
              </div>
            )}
          </div>

          {e.description && <div><h2 style={h}>About this event</h2><p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--text-primary)' }}>{e.description}</p></div>}
          {(e.refund_policy || e.refund_until) && (
            <div>
              <h2 style={h}>Refunds</h2>
              {e.refund_until && <p style={{ margin: '0 0 4px', fontSize: '0.88rem' }}>You can ask for a refund until <strong>{whenText(e.refund_until)}</strong>.</p>}
              {e.refund_policy && <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{e.refund_policy}</p>}
            </div>
          )}
        </div>
        <div style={{ position: 'sticky', top: 90, minWidth: 0 }}><EventBuyBox event={e} /></div>
      </div>
    </>,
  );
}
