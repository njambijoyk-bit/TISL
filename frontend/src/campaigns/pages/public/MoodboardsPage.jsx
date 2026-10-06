import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import moodboardsAPI from '../../../_shared/api/moodboards';
import Moodboard from '../../components/Moodboard';
import DownloadMoodboardButton from '../../components/DownloadMoodboardButton';
import PinGrid from '../../components/PinGrid';
import WorldTabs from '../../components/WorldTabs';

/** All approved moodboards, newest first, loading as you scroll. */
export default function MoodboardsPage() {
  const load = useCallback((after) => moodboardsAPI.publicList(after), []);

  return (
    <div className="min-h-screen">
      <Helmet><title>Moodboards | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px 64px' }}>
        <WorldTabs active="moodboards" />
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.7rem, 4vw, 2.3rem)', fontWeight: 900, color: 'var(--color-primary-500)' }}>Moodboards</h1>
        <p style={{ margin: '0 0 22px', color: 'var(--text-secondary)' }}>Looks and ideas we have put together. <Link to="/world" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Explore all pins ›</Link></p>
        <PinGrid load={load} resetKey="moodboards" empty="No moodboards yet." render={(m) => (
          <div key={m.id} style={{ position: 'relative', marginBottom: 16, breakInside: 'avoid' }}>
            <Link to={`/moodboards/${m.slug_path}`} style={{ display: 'block', textDecoration: 'none' }}>
              <Moodboard board={m} />
              <div style={{ padding: '6px 4px 0', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{m.title}{m.by && <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}> · {m.by}</span>}</div>
            </Link>
            <DownloadMoodboardButton board={m} icon style={{ top: 8, right: 8 }} />
          </div>
        )} />
      </main>
      <Footer />
    </div>
  );
}
