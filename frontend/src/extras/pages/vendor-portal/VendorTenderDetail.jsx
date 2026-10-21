import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { card, colors, btnGhost } from '../../../_shared/theme/tokens';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { SitePage, Loading, Empty, StatusBadge, NoticeDetails, ErrorBanner } from '../../components/procurement/ui';
import { NOTICE_TYPE_LABELS } from '../../components/procurement/format';
import { goToFile } from '../../components/procurement/openDocument';

export default function VendorTenderDetail() {
  const { id } = useParams();
  const [tender, setTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    vendorPortalAPI.showTender(id).then(setTender).catch(e => { setMissing(true); setError(errMsg(e, 'This tender could not be loaded')); }).finally(() => setLoading(false));
  }, [id]);

  const open = async (d, inline) => {
    try { goToFile((await vendorPortalAPI.documentLink(id, d.id, inline)).url, inline); } catch { /* the link failed; nothing to open */ }
  };

  if (loading) return <SitePage width={900}><Loading /></SitePage>;
  if (missing || !tender) return <SitePage width={900}><ErrorBanner message={error} /><Empty>This tender is not available to you.</Empty></SitePage>;

  return (
    <SitePage width={900}>
      <Link to="/vendor-portal/tenders" style={{ ...btnGhost, textDecoration: 'none', marginBottom: 16, padding: '5px 12px', fontSize: '0.75rem' }}><ArrowLeft size={13} /> All tenders</Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textMuted }}>{NOTICE_TYPE_LABELS[tender.notice_type] || 'Tender'} notice details</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: colors.primary, margin: '4px 0 0', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{tender.title}</h1>
        </div>
        <StatusBadge status={tender.status} />
      </div>
      <NoticeDetails tender={tender} onOpen={open} />
      {tender.description && (
        <div style={{ ...card, padding: 20, marginTop: 14 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: colors.textBody }}>{tender.description}</p>
        </div>
      )}
    </SitePage>
  );
}
