import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import campaignsPublicAPI from '../../../_shared/api/campaignsPublic';
import CampaignCard from '../../components/CampaignCard';

const TABS = [['live', 'Live now'], ['coming', 'Coming soon'], ['archive', 'Archive']];

/** All campaigns: what is on now, what is coming, and what has been (the archive keeps the brand's history). */
export default function CampaignsPage() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('live');
  const [error, setError] = useState(false);
  useEffect(() => {
    campaignsPublicAPI.list().then((d) => { setData(d); if (!d.live.length) setTab(d.coming.length ? 'coming' : 'archive'); }).catch(() => setError(true));
  }, []);
  const list = data?.[tab] ?? [];

  return (
    <div className="min-h-screen">
      <Helmet><title>Campaigns | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 64px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', fontWeight: 900, color: 'var(--color-primary-500)', letterSpacing: '-0.02em' }}>Campaigns</h1>
        <p style={{ margin: '0 0 22px', color: 'var(--text-secondary)' }}>What is happening now, what is coming, and what we have done before.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {TABS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: tab === k ? 800 : 600, fontSize: '0.84rem', color: tab === k ? 'var(--color-primary-500)' : 'var(--text-secondary)', border: `1.5px solid ${tab === k ? 'var(--color-primary-500)' : 'var(--line)'}`, background: tab === k ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent' }}>
              {l}{data ? ` · ${data[k].length}` : ''}
            </button>
          ))}
        </div>
        {error && <p style={{ color: 'var(--text-secondary)' }}>We could not load the campaigns. Please try again.</p>}
        {data && list.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>{tab === 'live' ? 'Nothing is on right now.' : tab === 'coming' ? 'Nothing is scheduled yet.' : 'The archive is empty so far.'}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>{list.map((c) => <CampaignCard key={c.slug} c={c} />)}</div>
      </main>
      <Footer />
    </div>
  );
}
