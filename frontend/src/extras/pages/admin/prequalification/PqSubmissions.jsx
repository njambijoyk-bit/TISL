import { useState, useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { prequalificationAPI } from '../../../../_shared/api/index';
import { SelectInput } from '../../../../core/components/admin/ui/Form';
import { AdminPage, Heading, Loading, Empty, Table, StatusBadge } from '../../../components/vendor/ui';
import { td, mono, fmtDate } from '../../../components/vendor/format';

export default function PqSubmissions() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    prequalificationAPI.submissions({ status: statusFilter || undefined })
      .then(r => setSubmissions(r.rows || []))
      .catch(() => toast.error('Failed to load submissions'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <AdminPage>
      <Heading title="Pre-qualification" description="Vendor applications waiting for review, and the results." />
      <div style={{ marginBottom: 14 }}>
        <SelectInput value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Status" style={{ maxWidth: 200 }}>
          <option value="">All statuses</option>
          <option value="submitted">Submitted</option><option value="under_review">Under review</option>
          <option value="qualified">Qualified</option><option value="rejected">Rejected</option>
        </SelectInput>
      </div>
      {loading ? <Loading /> : submissions.length === 0 ? <Empty icon={ClipboardCheck}>No submissions found</Empty> : (
        <Table head={['PQ', 'Vendor', 'Template', 'Status', 'Submitted']}>
          {submissions.map(s => (
            <tr key={s.id}>
              <td style={{ ...td, ...mono }}>{s.pq_number}</td>
              <td style={{ ...td, fontWeight: 600 }}>{s.vendor?.company_name || '—'}</td>
              <td style={td}>{s.template?.name || '—'}</td>
              <td style={td}><StatusBadge status={s.status} /></td>
              <td style={td}>{fmtDate(s.submitted_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </AdminPage>
  );
}
