import { useState, useEffect } from 'react';
import { Gavel, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorPortalAPI } from '../../../_shared/api/index';
import { card, colors } from '../../../_shared/theme/tokens';
import { TextInput } from '../../../core/components/admin/ui/Form';
import { Page, Heading, Loading, Empty, StatusBadge } from '../../components/vendor/ui';
import { mono, fmtDate, kes } from '../../components/vendor/format';

export default function VendorTenders() {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    vendorPortalAPI.tenders({ search: search || undefined })
      .then(r => setTenders(r.rows || []))
      .catch(() => toast.error('Failed to load tenders'))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <Page width={900}>
      <Heading title="Available tenders" description="Open tenders you are eligible to bid on." />
      <div style={{ marginBottom: 14 }}>
        <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenders" aria-label="Search tenders" style={{ maxWidth: 320 }} />
      </div>
      {loading ? <Loading /> : tenders.length === 0 ? <Empty icon={Gavel}>No tenders available</Empty> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {tenders.map(t => (
            <div key={t.id} style={{ ...card, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: colors.text }}>{t.title}</div>
                <StatusBadge status="published" label={t.category} />
              </div>
              <div style={{ fontSize: '0.76rem', marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap', color: colors.textMuted }}>
                <span style={mono}>{t.tender_number}</span>
                {(t.budget_min || t.budget_max) && <span>{kes(t.budget_min)} – {kes(t.budget_max)}</span>}
                {t.submission_deadline && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> Closes {fmtDate(t.submission_deadline)}</span>}
              </div>
              {t.description && <p style={{ fontSize: '0.82rem', margin: '8px 0 0', lineHeight: 1.5, color: colors.textBody }}>{t.description}</p>}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
