import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Gavel } from 'lucide-react';
import toast from 'react-hot-toast';
import { tendersAPI } from '../../../../_shared/api/index';
import { btnPrimary } from '../../../../_shared/theme/tokens';
import { TextInput, SelectInput } from '../../../../core/components/admin/ui/Form';
import { AdminPage, Heading, Loading, Empty, Table, StatusBadge } from '../../../components/vendor/ui';
import { td, mono, linkStyle, fmtDate } from '../../../components/vendor/format';

export default function TenderList() {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    tendersAPI.list({ search: search || undefined, status: statusFilter || undefined })
      .then(r => setTenders(r.rows || []))
      .catch(() => toast.error('Failed to load tenders'))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  return (
    <AdminPage>
      <Heading title="Tenders" description="Post tenders, receive bids from vendors and award the winner."
        action={<Link to="/admin/tenders/new" style={{ ...btnPrimary, textDecoration: 'none' }}><Plus size={14} /> New tender</Link>} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenders" aria-label="Search tenders" style={{ maxWidth: 260 }} />
        <SelectInput value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Status" style={{ maxWidth: 180 }}>
          <option value="">All statuses</option>
          {['draft', 'published', 'closed', 'awarded', 'cancelled'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </SelectInput>
      </div>

      {loading ? <Loading /> : tenders.length === 0 ? <Empty icon={Gavel}>No tenders found</Empty> : (
        <Table head={['Tender', 'Title', 'Category', 'Status', 'Deadline', 'Bids']}>
          {tenders.map(t => (
            <tr key={t.id}>
              <td style={{ ...td, ...mono }}>{t.tender_number}</td>
              <td style={td}><Link to={`/admin/tenders/${t.id}`} style={linkStyle}>{t.title}</Link></td>
              <td style={{ ...td, textTransform: 'capitalize' }}>{t.category || '—'}</td>
              <td style={td}><StatusBadge status={t.status} /></td>
              <td style={td}>{fmtDate(t.submission_deadline)}</td>
              <td style={td}>{t.bids_count ?? 0}</td>
            </tr>
          ))}
        </Table>
      )}
    </AdminPage>
  );
}
