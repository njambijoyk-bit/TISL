import { useState, useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { card, colors } from '../../../_shared/theme/tokens';
import { Page, Heading, Loading, Empty, Tabs, StatusBadge } from '../../components/vendor/ui';
import { mono, fmtDate } from '../../components/vendor/format';

export default function VendorPq() {
  const [pqs, setPqs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('my');

  useEffect(() => {
    Promise.all([
      vendorPortalAPI.myPqs().then(r => setPqs(r.rows || [])),
      vendorPortalAPI.pqTemplates().then(r => setTemplates(r.rows || [])),
    ])
      .catch(() => toast.error('Failed to load PQ data'))
      .finally(() => setLoading(false));
  }, []);

  const row = { ...card, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 };

  return (
    <Page width={900}>
      <Heading title="Pre-qualification" description="Get pre-qualified to see tenders that are restricted to approved suppliers." />
      <Tabs value={tab} onChange={setTab} tabs={[['my', 'My applications'], ['templates', 'Available templates']]} />
      {loading ? <Loading /> : tab === 'my' ? (
        pqs.length === 0 ? <Empty icon={ClipboardCheck}>No pre-qualification applications yet</Empty> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {pqs.map(p => (
              <div key={p.id} style={row}>
                <ClipboardCheck size={18} style={{ color: colors.primary, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: colors.text }}>{p.template?.name || 'PQ application'}</div>
                  <div style={{ fontSize: '0.74rem', color: colors.textMuted }}><span style={mono}>{p.pq_number}</span> · {p.submitted_at ? fmtDate(p.submitted_at) : 'Draft'}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        )
      ) : templates.length === 0 ? <Empty>No PQ templates available</Empty> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {templates.map(t => (
            <div key={t.id} style={{ ...card, padding: '16px 20px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: colors.text }}>{t.name}</div>
              <div style={{ fontSize: '0.76rem', marginTop: 3, color: colors.textMuted, textTransform: 'capitalize' }}>{t.category || 'General'} · valid {t.validity_months || '—'} months</div>
              {t.description && <p style={{ fontSize: '0.82rem', margin: '6px 0 0', lineHeight: 1.5, color: colors.textBody }}>{t.description}</p>}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
