import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Search, Eye } from 'lucide-react';
import { prequalificationAPI } from '../../../../_shared/api/index';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  draft:        { bg: '#f3f4f6', text: '#374151' },
  submitted:    { bg: '#dbeafe', text: '#1e40af' },
  under_review: { bg: '#fef3c7', text: '#92400e' },
  qualified:    { bg: '#dcfce7', text: '#166534' },
  rejected:     { bg: '#fee2e2', text: '#991b1b' },
};

export default function PqSubmissions() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    prequalificationAPI.submissions({ status: statusFilter || undefined })
      .then(r => setSubmissions(r.data || r))
      .catch(() => toast.error('Failed to load submissions'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 2 }} className="text-gray-900 dark:text-white">PQ Submissions</h1>
        <p style={{ fontSize: '0.82rem' }} className="text-gray-500 dark:text-gray-400">Review vendor pre-qualification applications</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none' }}
          className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
          <option value="">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="qualified">Qualified</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>
      ) : submissions.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <ClipboardCheck size={36} className="text-gray-300 dark:text-gray-600" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }} className="text-gray-500 dark:text-gray-400">No submissions found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" style={{ borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                {['PQ #', 'Vendor', 'Template', 'Status', 'Submitted', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => {
                const sc = STATUS_COLORS[s.status] || STATUS_COLORS.draft;
                return (
                  <tr key={s.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.78rem' }} className="text-gray-700 dark:text-gray-300">{s.pq_number}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }} className="text-gray-800 dark:text-gray-200">{s.vendor?.company_name || '—'}</td>
                    <td style={{ padding: '12px 14px' }} className="text-gray-500 dark:text-gray-400">{s.template?.name || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', background: sc.bg, color: sc.text }}>
                        {s.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '0.78rem' }} className="text-gray-500 dark:text-gray-400">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <Link to={`/admin/prequalification/submissions/${s.id}`} className="text-gray-400 hover:text-gray-600"><Eye size={15} /></Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
