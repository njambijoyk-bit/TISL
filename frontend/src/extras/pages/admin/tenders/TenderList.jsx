import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter, Gavel, Eye, MoreHorizontal, Calendar } from 'lucide-react';
import { tendersAPI } from '../../../../_shared/api/index';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  draft:     { bg: '#f3f4f6', text: '#374151' },
  published: { bg: '#dbeafe', text: '#1e40af' },
  closed:    { bg: '#fef3c7', text: '#92400e' },
  awarded:   { bg: '#dcfce7', text: '#166534' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
};

function Badge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.04em', background: c.bg, color: c.text }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

export default function TenderList() {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = () => {
    setLoading(true);
    tendersAPI.list({ search, status: statusFilter || undefined })
      .then(r => setTenders(r.rows || []))
      .catch(() => toast.error('Failed to load tenders'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 2 }} className="text-gray-900 dark:text-white">Tenders</h1>
          <p style={{ fontSize: '0.82rem' }} className="text-gray-500 dark:text-gray-400">Manage and track procurement tenders</p>
        </div>
        <Link to="/admin/tenders/new"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'var(--color-primary-500)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
          <Plus size={15} /> New Tender
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} className="text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); }}
            placeholder="Search tenders…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none' }}
            className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); }}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none' }}
          className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
          <option value="awarded">Awarded</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>
      ) : tenders.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Gavel size={36} className="text-gray-300 dark:text-gray-600" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }} className="text-gray-500 dark:text-gray-400">No tenders found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" style={{ borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                {['Tender #', 'Title', 'Category', 'Status', 'Closing', 'Bids'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-gray-500 dark:text-gray-400">{h}</th>
                ))}
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {tenders.map(t => (
                <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30" style={{ transition: 'background 100ms' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.78rem' }} className="text-gray-700 dark:text-gray-300">{t.tender_number}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <Link to={`/admin/tenders/${t.id}`} style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>{t.title}</Link>
                  </td>
                  <td style={{ padding: '12px 14px' }} className="text-gray-500 dark:text-gray-400">{t.category || '—'}</td>
                  <td style={{ padding: '12px 14px' }}><Badge status={t.status} /></td>
                  <td style={{ padding: '12px 14px', fontSize: '0.78rem' }} className="text-gray-500 dark:text-gray-400">
                    {t.submission_deadline ? new Date(t.submission_deadline).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }} className="text-gray-700 dark:text-gray-300">{t.bids_count ?? 0}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <Link to={`/admin/tenders/${t.id}`} className="text-gray-400 hover:text-gray-600"><Eye size={15} /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
