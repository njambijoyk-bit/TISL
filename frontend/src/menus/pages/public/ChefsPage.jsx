import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChefHat } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import menusPublicAPI from '../../../_shared/api/menusPublic';

/** The chefs a guest may meet: name, title, a few words about them, the stations they work and a few of their dishes. */
export default function ChefsPage() {
  const [chefs, setChefs] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { menusPublicAPI.chefs().then((r) => setChefs(r.chefs)).catch(() => setError(true)); }, []);

  return (
    <div className="min-h-screen">
      <Helmet><title>Our chefs | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px 64px' }} data-testid="chefs-page">
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', fontWeight: 900, color: 'var(--color-primary-500)', letterSpacing: '-0.02em' }}>Our chefs</h1>
        <p style={{ margin: '0 0 22px' }}><Link to="/menu" style={{ fontWeight: 700 }}>See the menu</Link></p>
        {error && <p style={{ color: 'var(--text-secondary)' }}>We could not load this page. Please try again.</p>}
        {chefs && chefs.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>Nobody to introduce yet. Please check back soon.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {(chefs ?? []).map((c) => (
            <article key={c.id} data-chef={c.name} style={{ border: '1px solid var(--line, #e5e7eb)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface-card, #fff)' }}>
              {c.photo ? <img src={c.photo} alt={c.name} loading="lazy" style={{ width: '100%', height: 220, objectFit: 'cover' }} /> : <div style={{ height: 120, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)' }}><ChefHat size={44} aria-hidden="true" /></div>}
              <div style={{ padding: 16, display: 'grid', gap: 6 }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{c.name}</h2>
                {c.title && <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-primary-600)', fontSize: '0.88rem' }}>{c.title}{c.instructor ? ' · Teaches' : ''}</p>}
                {c.bio && <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{c.bio}</p>}
                {c.stations.length > 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Works at: {c.stations.join(', ')}</p>}
                {c.dishes.length > 0 && <p style={{ margin: 0, fontSize: '0.8rem' }}><strong>Dishes:</strong> {c.dishes.join(', ')}</p>}
              </div>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
