import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MapPin, Star } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import { eventsDirectoryAPI } from '../../../_shared/api/events';

const sel = { padding: '8px 12px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.84rem' };

/** The vendors (caterers, decorators, photographers…) or venues that have been checked by TISL. */
export default function DirectoryPage() {
  const { plural } = useParams();
  const vendors = plural === 'vendors';
  const [f, setF] = useState({ q: '', category: '', area: '', county: '', min_capacity: '' });
  const [res, setRes] = useState({ data: [], categories: null });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
    const t = setTimeout(() => eventsDirectoryAPI.list(plural, params).then((r) => { setRes(r); setLoaded(true); }).catch(() => setLoaded(true)), 250);
    return () => clearTimeout(t);
  }, [plural, f]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="min-h-screen">
      <Helmet><title>{vendors ? 'Event vendors' : 'Event venues'} | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px 64px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 900, color: 'var(--color-primary-500)' }}>{vendors ? 'Event vendors' : 'Event venues'}</h1>
        <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)' }}>{vendors ? 'Caterers, decorators, photographers, entertainers and more, all checked by TISL.' : 'Halls, gardens and spaces, all checked by TISL.'} <Link to="/events" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>See events</Link></p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
          <input value={f.q} onChange={set('q')} placeholder="Search" aria-label="Search" style={sel} />
          {vendors ? (
            <>
              <select value={f.category} onChange={set('category')} aria-label="Kind" style={sel}><option value="">Any kind</option>{Object.entries(res.categories ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input value={f.area} onChange={set('area')} placeholder="Place served" aria-label="Place served" style={sel} />
            </>
          ) : (
            <>
              <input value={f.county} onChange={set('county')} placeholder="County" aria-label="County" style={sel} />
              <input type="number" min="1" value={f.min_capacity} onChange={set('min_capacity')} placeholder="Guests" aria-label="Guests" style={{ ...sel, width: 110 }} />
            </>
          )}
        </div>
        {loaded && res.data.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>Nobody matches that yet.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {res.data.map((p) => (
            <Link key={p.id} to={`/event-directory/${plural}/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit', border: '1px solid var(--line)', borderRadius: 14, padding: 16, background: 'var(--surface-card, #fff)', display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: '1.05rem' }}>{p.name}</strong>
              {vendors ? <span style={{ fontSize: '0.8rem', color: 'var(--color-primary-500)', fontWeight: 700 }}>{p.category_name}</span>
                : <span style={{ fontSize: '0.8rem', display: 'inline-flex', gap: 4, alignItems: 'center', color: 'var(--text-secondary)' }}><MapPin size={13} /> {[p.town, p.county].filter(Boolean).join(', ') || 'Kenya'}{p.max_capacity ? ` · up to ${p.max_capacity}` : ''}</span>}
              {p.summary && <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{p.summary}</span>}
              {p.rating && <span style={{ fontSize: '0.8rem', display: 'inline-flex', gap: 3, alignItems: 'center' }}><Star size={13} fill="currentColor" /> {p.rating}</span>}
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
