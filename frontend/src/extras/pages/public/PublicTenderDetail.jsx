import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { publicTendersAPI } from '../../../_shared/api/index';
import { useAuthStore } from '../../../_shared/store/index';
import { card, colors, btnGhost, btnPrimary } from '../../../_shared/theme/tokens';
import { SitePage, Loading, Empty, StatusBadge, NoticeDetails } from '../../components/procurement/ui';
import { NOTICE_TYPE_LABELS } from '../../components/procurement/format';
import { goToFile } from '../../components/procurement/openDocument';

const sectionLabel = { fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.primaryDeep, marginBottom: 6 };

export default function PublicTenderDetail() {
  const { id } = useParams();
  const [tender, setTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setLoading(true);
    publicTendersAPI.show(id)
      .then(setTender)
      .catch(() => setMissing(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <SitePage width={900} crumbs={[['Home', '/'], ['Tenders', '/tenders'], ['Tender', null]]}><Loading /></SitePage>;
  if (missing || !tender) return <SitePage width={900} crumbs={[['Home', '/'], ['Tenders', '/tenders'], ['Tender', null]]}><Empty>This tender is not available.</Empty></SitePage>;

  return (
    <SitePage width={900} crumbs={[['Home', '/'], ['Tenders', '/tenders'], [tender.tender_number, null]]}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textMuted }}>{NOTICE_TYPE_LABELS[tender.notice_type] || 'Tender'} notice details</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: colors.primary, margin: '4px 0 0', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{tender.title}</h1>
        </div>
        <StatusBadge status={tender.status} />
      </div>

      <NoticeDetails tender={tender} onOpen={(d, inline) => goToFile(publicTendersAPI.documentUrl(tender.slug, d.id, inline), inline)} />

      {tender.description && (
        <div style={{ ...card, padding: 20, marginTop: 14 }}>
          <div style={sectionLabel}>Description</div>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: colors.textBody }}>{tender.description}</p>
        </div>
      )}

      {tender.status === 'open' && <HowToBid />}
    </SitePage>
  );
}

function HowToBid() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <div style={{ ...card, padding: 20, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ fontSize: '0.85rem', color: colors.textBody, flex: '1 1 260px' }}>
        Read the documents above and respond as they direct. Registered vendors also see tenders meant only for vendors.
      </div>
      {!isAuthenticated && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/login" style={{ ...btnGhost, textDecoration: 'none' }}>Sign in</Link>
          <Link to="/vendor-register" style={{ ...btnPrimary, textDecoration: 'none' }}>Register as a vendor</Link>
        </div>
      )}
    </div>
  );
}
