import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { publicTendersAPI } from '../../../_shared/api/index';
import { useAuthStore } from '../../../_shared/store/index';
import { card, colors, btnGhost, btnPrimary } from '../../../_shared/theme/tokens';
import { Page, Loading, Empty, StatusBadge, NoticeDetails } from '../../components/procurement/ui';

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

  if (loading) return <Page width={900}><Loading /></Page>;
  if (missing || !tender) return <Page width={900}><Empty>This tender is not available.</Empty></Page>;

  return (
    <Page width={900}>
      <Link to="/tenders" style={{ ...btnGhost, textDecoration: 'none', marginBottom: 16, padding: '5px 12px', fontSize: '0.75rem' }}><ArrowLeft size={13} /> All tenders</Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: '1 1 400px', minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textMuted }}>Tender notice details</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: colors.primary, margin: '4px 0 0', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{tender.title}</h1>
        </div>
        <StatusBadge status={tender.is_open ? 'active' : 'closed'} label={tender.is_open ? 'Open for bids' : 'Closed'} />
      </div>

      <NoticeDetails tender={tender} documentUrl={(d) => publicTendersAPI.documentUrl(tender.id, d.id)} />

      {(tender.description || (tender.requirements || []).length > 0 || (tender.evaluation_criteria || []).length > 0) && (
        <div style={{ ...card, padding: 20, marginTop: 14, display: 'grid', gap: 16 }}>
          {tender.description && <div><div style={sectionLabel}>Description</div><p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: colors.textBody }}>{tender.description}</p></div>}
          {(tender.requirements || []).length > 0 && <div><div style={sectionLabel}>Requirements</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: colors.textBody }}>{tender.requirements.map((r, i) => <li key={i}>{r.label || r}</li>)}</ul></div>}
          {(tender.evaluation_criteria || []).length > 0 && <div><div style={sectionLabel}>Evaluation criteria</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: colors.textBody }}>{tender.evaluation_criteria.map((c, i) => <li key={i}>{c.criterion || c}</li>)}</ul></div>}
        </div>
      )}

      {tender.is_open && <BidCallout />}
    </Page>
  );
}

function BidCallout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return (
    <div style={{ ...card, padding: 20, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ fontSize: '0.85rem', color: colors.textBody, flex: '1 1 260px' }}>
        {isAuthenticated ? 'Bids are placed from your vendor portal.' : 'To bid on this tender you need a vendor account.'}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isAuthenticated
          ? <Link to="/vendor-portal/tenders" style={{ ...btnPrimary, textDecoration: 'none' }}>Open vendor portal</Link>
          : <>
              <Link to="/login" style={{ ...btnGhost, textDecoration: 'none' }}>Sign in</Link>
              <Link to="/vendor-register" style={{ ...btnPrimary, textDecoration: 'none' }}>Register as a vendor</Link>
            </>}
      </div>
    </div>
  );
}
