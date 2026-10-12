import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BookMarked } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import coursesPublicAPI from '../../../_shared/api/coursesPublic';
import { card, chip, field, money } from '../../components/learnStyle';

/** The books library on the storefront. */
export default function LearnBooksPage() {
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState(null);
  const q = params.get('q') ?? '';
  const format = params.get('format') ?? '';
  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };
  useEffect(() => { let live = true; coursesPublicAPI.books({ q, format }).then((r) => { if (live) setD(r); }).catch(() => { if (live) setD({ ready: false, books: [] }); }); return () => { live = false; }; }, [q, format]);

  return (
    <div className="min-h-screen">
      <Helmet><title>Books | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="learn-books">
        <header><h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900 }}><BookMarked size={24} aria-hidden="true" /> Books</h1><p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>Printed books and downloads. <Link to="/learn">Courses</Link></p></header>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input aria-label="Search" placeholder="Title, author or ISBN" value={q} onChange={(e) => set('q', e.target.value)} style={{ ...field, maxWidth: 280 }} />
          <select aria-label="Format" value={format} onChange={(e) => set('format', e.target.value)} style={{ ...field, maxWidth: 200 }}><option value="">Any format</option><option value="printed">Printed</option><option value="digital">Digital</option></select>
        </div>
        {!d && <p>Loading…</p>}
        {d && !d.ready && <div style={card} role="status">Books are not available yet.</div>}
        {d?.ready && d.books.length === 0 && <div style={card} role="status">No books match.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {d?.books.map((b) => (
            <Link key={b.id} to={`/learn/books/${b.slug}`} data-book={b.title} style={{ ...card, padding: 0, overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}>
              {b.cover ? <img src={b.cover} alt="" loading="lazy" style={{ width: '100%', height: 220, objectFit: 'cover' }} /> : <div aria-hidden="true" style={{ height: 220, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--color-primary-500, #6366f1) 14%, transparent)' }}><BookMarked size={40} /></div>}
              <div style={{ padding: 12, display: 'grid', gap: 4 }}><span style={chip}>{b.format_label}</span><strong>{b.title}</strong>{b.authors && <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{b.authors}</span>}<strong>{money(b.price)} <span style={{ fontWeight: 500, fontSize: '0.76rem' }}>before tax</span></strong></div>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
