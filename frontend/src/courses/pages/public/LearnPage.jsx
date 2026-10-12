import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CalendarClock, Clock, GraduationCap } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import coursesPublicAPI from '../../../_shared/api/coursesPublic';
import { card, chip, field, hours, money } from '../../components/learnStyle';

/** What is taught and sold: courses, recipes, notes and live classes. No sign-in to look. */
export default function LearnPage() {
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [failed, setFailed] = useState(false);
  const f = { q: params.get('q') ?? '', kind: params.get('kind') ?? '', category: params.get('category') ?? '', level: params.get('level') ?? '', page: Number(params.get('page') ?? 1) };
  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setParams(n, { replace: true }); };
  useEffect(() => {
    let live = true;
    coursesPublicAPI.list({ ...f, page: f.page || 1 }).then((r) => { if (live) { setD(r); setFailed(false); } }).catch(() => { if (live) setFailed(true); });

    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const pages = d ? Math.max(1, Math.ceil(d.total / d.per_page)) : 1;

  return (
    <div className="min-h-screen">
      <Helmet><title>Learn | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 18 }} data-testid="learn-page">
        <header>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900 }}><GraduationCap size={26} aria-hidden="true" /> Learn with us</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>Courses, recipes, notes and live classes.</p>
        </header>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input aria-label="Search" placeholder="Search" value={f.q} onChange={(e) => set('q', e.target.value)} style={{ ...field, maxWidth: 260 }} />
          <select aria-label="Kind" value={f.kind} onChange={(e) => set('kind', e.target.value)} style={{ ...field, maxWidth: 200 }}>
            <option value="">All kinds</option>{d && Object.entries(d.kinds).filter(([k]) => d.facets.kinds[k]).map(([k, v]) => <option key={k} value={k}>{v} ({d.facets.kinds[k]})</option>)}
          </select>
          <select aria-label="Category" value={f.category} onChange={(e) => set('category', e.target.value)} style={{ ...field, maxWidth: 200 }}>
            <option value="">All categories</option>{d && Object.entries(d.facets.categories).map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
          </select>
          <select aria-label="Level" value={f.level} onChange={(e) => set('level', e.target.value)} style={{ ...field, maxWidth: 180 }}>
            <option value="">Any level</option>{d && Object.entries(d.levels).filter(([k]) => d.facets.levels[k]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {!d && !failed && <p>Loading…</p>}
        {failed && <div style={card} role="status">We could not load the courses. Please try again.</div>}
        {d && !d.ready && <div style={card} role="status">Courses are not available yet.</div>}
        {d?.ready && d.offerings.length === 0 && <div style={card} role="status">Nothing matches. Try fewer filters.</div>}
        {d?.ready && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {d.offerings.map((o) => (
              <Link key={o.id} to={`/learn/${o.slug}`} data-offering={o.title} style={{ ...card, padding: 0, overflow: 'hidden', textDecoration: 'none', color: 'inherit', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
                {o.cover ? <img src={o.cover} alt="" loading="lazy" style={{ width: '100%', height: 150, objectFit: 'cover' }} /> : <div aria-hidden="true" style={{ height: 150, background: 'color-mix(in srgb, var(--color-primary-500, #6366f1) 14%, transparent)', display: 'grid', placeItems: 'center' }}><GraduationCap size={40} /></div>}
                <div style={{ padding: 14, display: 'grid', gap: 6, alignContent: 'start' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span style={chip}>{o.kind_label}</span>{o.skill_level !== 'all' && <span style={chip}>{o.level_label}</span>}</div>
                  <strong style={{ fontSize: '1.05rem' }}>{o.title}</strong>
                  {o.summary && <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{o.summary}</span>}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {o.teacher && <span>{o.teacher}</span>}
                    {o.lessons > 0 && <span>{o.lessons} lesson{o.lessons === 1 ? '' : 's'}</span>}
                    {o.minutes > 0 && <span><Clock size={11} aria-hidden="true" /> {hours(o.minutes)}</span>}
                    {o.next_live && <span><CalendarClock size={11} aria-hidden="true" /> {new Date(o.next_live).toLocaleDateString()}</span>}
                  </span>
                  <strong style={{ marginTop: 4 }}>{o.free ? 'Free' : `From ${money(o.price_from)}`}{!o.free && <span style={{ fontWeight: 500, fontSize: '0.78rem' }}> before tax</span>}</strong>
                </div>
              </Link>
            ))}
          </div>
        )}
        {pages > 1 && (
          <nav aria-label="Pages" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button type="button" disabled={f.page <= 1} onClick={() => set('page', String(f.page - 1))} style={{ ...field, width: 'auto' }}>Previous</button>
            <span style={{ alignSelf: 'center' }}>Page {f.page} of {pages}</span>
            <button type="button" disabled={f.page >= pages} onClick={() => set('page', String(f.page + 1))} style={{ ...field, width: 'auto' }}>Next</button>
          </nav>
        )}
      </main>
      <Footer />
    </div>
  );
}
