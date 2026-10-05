import { Link } from 'react-router-dom';
import { storageUrl } from '../../_shared/lib/storageUrl';

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const NOTE = { live: 'Live now', teaser: 'Teaser', scheduled: 'Coming soon', ended: 'Ended' };

/** One campaign in a list: cover, title, subtitle and when. */
export default function CampaignCard({ c }) {
  const accent = c.accent_color || 'var(--color-primary-500)';
  const dates = c.status === 'scheduled' || c.status === 'teaser' ? (c.starts_at ? `Starts ${when(c.starts_at)}` : '') : c.status === 'ended' ? (c.ends_at ? `Ended ${when(c.ends_at)}` : '') : (c.ends_at ? `Until ${when(c.ends_at)}` : '');

  return (
    <Link to={`/campaigns/${c.slug}`} style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: accent }}>
        {c.cover_media && <img src={storageUrl(c.cover_media)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.62)', color: '#fff', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{NOTE[c.status] ?? c.status}</span>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{c.title}</div>
        {c.subtitle && <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: 3 }}>{c.subtitle}</div>}
        {dates && <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 8 }}>{dates}</div>}
      </div>
    </Link>
  );
}
