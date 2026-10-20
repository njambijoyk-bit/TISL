import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { card, colors, btnGhost } from '../../../_shared/theme/tokens';
import { Page, Loading, Empty, StatusBadge, NoticeDetails } from '../../components/procurement/ui';
import { VISIBILITY_LABELS } from '../../components/procurement/format';
import { goToFile } from '../../components/procurement/openDocument';

export default function VendorTenderDetail() {
  const { id } = useParams();
  const [tender, setTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setLoading(true);
    vendorPortalAPI.showTender(id).then(setTender).catch(() => setMissing(true)).finally(() => setLoading(false));
  }, [id]);

  const open = async (d, inline) => {
    try { goToFile((await vendorPortalAPI.documentLink(id, d.id, inline)).url, inline); } catch { /* the link failed; nothing to open */ }
  };

  if (loading) return <Page width={900}><Loading /></Page>;
  if (missing || !tender) return <Page width={900}><Empty>This tender is not available to you.</Empty></Page>;

  return (
    <Page width={900}>
      <Link to="/vendor-portal/tenders" style={{ ...btnGhost, textDecoration: 'none', marginBottom: 16, padding: '5px 12px', fontSize: '0.75rem' }}><ArrowLeft size={13} /> All tenders</Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textMuted }}>Tender notice details</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: colors.primary, margin: '4px 0 0', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{tender.title}</h1>
        </div>
        <StatusBadge status={tender.status} />
      </div>
      <NoticeDetails tender={tender} onOpen={open} extra={[['Who can see this', VISIBILITY_LABELS[tender.visibility]]]} />
      {tender.description && (
        <div style={{ ...card, padding: 20, marginTop: 14 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: colors.textBody }}>{tender.description}</p>
        </div>
      )}
    </Page>
  );
}
