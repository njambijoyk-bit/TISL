import { useState, useEffect } from 'react';
import { ClipboardCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { prequalificationAPI } from '../../../../_shared/api/index';
import { AdminPage, Heading, Loading, Empty, Table, StatusBadge } from '../../../components/procurement/ui';
import { td, fmtDate } from '../../../components/procurement/format';

export default function PqTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    prequalificationAPI.templates()
      .then(r => setTemplates(r.rows || []))
      .catch(() => toast.error('Failed to load PQ templates'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminPage width={1000}>
      <Heading title="PQ templates" description="The questions and documents a vendor must provide to be pre-qualified." />
      {loading ? <Loading /> : templates.length === 0 ? <Empty icon={ClipboardCheck}>No PQ templates created yet</Empty> : (
        <Table head={['Template', 'Category', 'Validity', 'Status', 'Created']}>
          {templates.map(t => (
            <tr key={t.id}>
              <td style={{ ...td, fontWeight: 600 }}>{t.name}{t.description && <div style={{ fontWeight: 400, fontSize: '0.72rem' }}>{t.description}</div>}</td>
              <td style={{ ...td, textTransform: 'capitalize' }}>{t.category || '—'}</td>
              <td style={td}>{t.validity_months ? `${t.validity_months} months` : '—'}</td>
              <td style={td}><StatusBadge status={t.is_active ? 'active' : 'inactive'} /></td>
              <td style={td}>{fmtDate(t.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </AdminPage>
  );
}
