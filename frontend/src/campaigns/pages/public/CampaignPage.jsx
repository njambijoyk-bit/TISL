import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import campaignsPublicAPI from '../../../_shared/api/campaignsPublic';
import CampaignView from '../../components/CampaignView';
import Discussion from '../../../extras/components/engagement/Discussion';
import { ReactionButton, ReportButton } from '../../../extras/components/engagement/Reactions';

/** One campaign's page, made of its sections. Sections that are not due yet (or any chosen audience) are already left out by the server. */
export default function CampaignPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setData(null); setMissing(false);
    campaignsPublicAPI.get(slug).then((d) => { setData(d); campaignsPublicAPI.event(slug, 'view'); }).catch(() => setMissing(true));
  }, [slug]);
  const c = data?.campaign;

  return (
    <div className="min-h-screen">
      <Helmet><title>{c ? `${c.title} | TISL` : 'Campaign | TISL'}</title>{c?.subtitle && <meta name="description" content={c.subtitle} />}</Helmet>
      <Header />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 64px' }}>
        <Link to="/campaigns" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textDecoration: 'none' }}>‹ All campaigns</Link>
        {missing && <p style={{ margin: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>We could not find that campaign. It may have ended or not started yet.</p>}
        {c && (
          <div style={{ marginTop: 14 }}>
            {c.early_access && <p style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: 10, fontSize: '0.84rem', fontWeight: 600, color: 'var(--color-primary-500)', background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' }}>You have early access. This opens to everyone later.</p>}
            {c.status === 'ended' && <p style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: 10, fontSize: '0.84rem', color: 'var(--text-secondary)', border: '1px solid var(--line)' }}>This campaign has ended. It stays here as part of our archive.</p>}
            <CampaignView campaign={c} sections={data.sections} resolved={data.resolved} track={(event, sectionId) => campaignsPublicAPI.event(slug, event, sectionId)} />
            {c.id && <div style={{ display: 'flex', gap: 18, margin: '28px 0 18px' }}><ReactionButton type="campaign" id={c.id} /><ReportButton type="campaign" id={c.id} /></div>}
            {c.id && <div style={{ maxWidth: 760 }}><Discussion type="campaign" id={c.id} kind="comment" /></div>}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
