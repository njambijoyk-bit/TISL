import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isModuleActive } from '../../_shared/navigation/modules';
import campaignsPublicAPI from '../../_shared/api/campaignsPublic';
import { storageUrl } from '../../_shared/lib/storageUrl';

/**
 * The homepage's "current world": the campaign marked for the homepage while it is live or teasing. It shows nothing at all
 * when the Campaigns module is off or no campaign is featured, so the homepage is exactly as it was.
 */
export default function CampaignHomeBlock() {
  const on = isModuleActive('campaigns');
  const [c, setC] = useState(null);
  useEffect(() => { if (on) campaignsPublicAPI.featured().then(setC).catch(() => setC(null)); }, [on]);
  if (!on || !c) return null;
  const accent = c.accent_color || 'var(--color-primary-500)';

  return (
    <section style={{ padding: '36px 0 8px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <Link to={`/campaigns/${c.slug}`} style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', minHeight: 260, borderRadius: 20, overflow: 'hidden', background: accent, textDecoration: 'none' }}>
          {c.cover_media && <img src={storageUrl(c.cover_media)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.05) 70%)' }} />
          <div style={{ position: 'relative', padding: '26px 28px', color: '#fff' }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#fff', opacity: 0.85 }}>{c.status === 'teaser' ? 'Coming soon' : 'Right now'}</div>
            <div style={{ fontSize: 'clamp(1.5rem, 4vw, 2.3rem)', fontWeight: 900, letterSpacing: '-0.02em', margin: '4px 0', color: '#fff' }}>{c.title}</div>
            {c.subtitle && <div style={{ fontSize: '1rem', opacity: 0.92, color: '#fff' }}>{c.subtitle}</div>}
            <span style={{ display: 'inline-block', marginTop: 14, padding: '9px 20px', borderRadius: 10, background: '#fff', color: '#111', fontWeight: 800, fontSize: '0.84rem' }}>Explore</span>
          </div>
        </Link>
      </div>
    </section>
  );
}
