import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Gavel } from 'lucide-react';
import toast from 'react-hot-toast';
import { tendersAPI } from '../../../../_shared/api/index';
import { btnPrimary } from '../../../../_shared/theme/tokens';
import { TextInput, SelectInput } from '../../../../core/components/admin/ui/Form';
import { AdminPage, Heading, Loading, Empty, Table, StatusBadge, GroupBadge } from '../../../components/procurement/ui';
import { td, mono, linkStyle, fmtDateTime, NOTICE_TYPE_LABELS } from '../../../components/procurement/format';

const WHO = { public: 'Public', all_vendors: 'Vendors', prequalified: 'Pre-qualified', invited: 'Invited' };

export default function TenderList() {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [who, setWho] = useState('');

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      tendersAPI.list({ search: search || undefined, status: statusFilter || undefined, visibility: who || undefined })
        .then(r => setTenders(r.rows || []))
        .catch(() => toast.error('Failed to load tenders'))
        .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, statusFilter, who]);

  return (
    <AdminPage>
      <Heading title="Tenders" description="Notices and documents shown to the public or to vendors. You write the tender elsewhere and upload it here; bidding and awards happen offline."
        action={<Link to="/admin/tenders/new" style={{ ...btnPrimary, textDecoration: 'none' }}><Plus size={14} /> New tender</Link>} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenders" aria-label="Search tenders" style={{ maxWidth: 260 }} />
        <SelectInput value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Status" style={{ maxWidth: 180 }}>
          <option value="">All statuses</option>
          {['draft', 'published', 'closed', 'awarded', 'cancelled'].map(s => <option key={s} value={s}>{s === 'cancelled' ? 'Terminated' : s[0].toUpperCase() + s.slice(1)}</option>)}
        </SelectInput>
        <SelectInput value={who} onChange={e => setWho(e.target.value)} aria-label="Who sees it" style={{ maxWidth: 190 }}>
          <option value="">Everyone and vendors</option>
          {Object.entries(WHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectInput>
      </div>

      {loading ? <Loading /> : tenders.length === 0 ? <Empty icon={Gavel}>No tenders found</Empty> : (
        <Table head={['Tender', 'Title', 'Who sees it', 'Status', 'Closes', 'Files', 'Lots']}>
          {tenders.map(t => (
            <tr key={t.id}>
              <td style={{ ...td, ...mono }}>{t.tender_number}</td>
              <td style={{ ...td, whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 240 }}>
                <Link to={`/admin/tenders/${t.id}`} style={linkStyle}>{t.title}</Link>
                {t.notice_type && t.notice_type !== 'tender' && <div style={{ fontSize: '0.7rem' }}>{NOTICE_TYPE_LABELS[t.notice_type]}</div>}
              </td>
              <td style={td}>{WHO[t.visibility] || t.visibility} {t.reservation_scheme && <GroupBadge group={t.reservation_scheme} />}</td>
              <td style={td}><StatusBadge status={t.display_status || t.status} /></td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDateTime(t.submission_deadline)}</td>
              <td style={td}>{t.documents_count ?? 0}</td>
              <td style={td}>{t.lots_count ?? 0}</td>
            </tr>
          ))}
        </Table>
      )}
    </AdminPage>
  );
}
