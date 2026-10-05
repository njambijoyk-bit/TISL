import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import moodboardsAPI from '../../../_shared/api/moodboards';
import Moodboard from '../../components/Moodboard';

/** One approved moodboard, large, by its address (id-name). */
export default function MoodboardPage() {
  const id = parseInt(useParams().slug, 10);
  const [m, setM] = useState(null);
  const [gone, setGone] = useState(false);
  useEffect(() => { setM(null); setGone(false); moodboardsAPI.publicGet(id).then(setM).catch(() => setGone(true)); }, [id]);

  return (
    <div className="min-h-screen">
      <Helmet><title>{m ? `${m.title} | TISL` : 'Moodboard | TISL'}</title></Helmet>
      <Header />
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 64px' }}>
        <Link to="/moodboards" style={{ fontSize: '0.84rem', color: 'var(--color-primary-500)', fontWeight: 700 }}>‹ Moodboards</Link>
        {gone && <p style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>This moodboard is not available.</p>}
        {m && <><h1 style={{ margin: '14px 0 18px', fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900, color: 'var(--text-primary)' }}>{m.title}</h1><Moodboard board={m} radius={16} /></>}
      </main>
      <Footer />
    </div>
  );
}
